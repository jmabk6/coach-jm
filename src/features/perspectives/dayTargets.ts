import { db } from "../../db/database";
import type {
  DayTarget,
  Exercise,
  Id,
  PerformedExerciseBlock,
  ProgressionTrack,
  SessionTemplate,
  StrengthFrameVersion,
  WorkoutSession,
} from "../../domain";
import {
  nextDurationTarget,
  nextLoadTarget,
  nextNegativesTarget,
  raiseTakenThisWeek,
  trackResults,
} from "../../domain/rules/progressionRules";
import { getProgressionTracks } from "./trackStore";
import { PERSPECTIVE_TEMPLATES, sourceIdsOf, trackSpecsFrom, type TrackSpec } from "./tracks";

/**
 * Objectif du jour (lot P2, 22/10/2026) : calculé sur les séances
 * précédentes quand la séance s'ouvre, puis **figé** sur la brique. Une
 * brique déjà commencée (une série notée) n'en reçoit jamais : ce qui est
 * noté pendant la séance ne déplace pas la cible. La traction garde le
 * bandeau du pari V6 (aucun second objectif).
 */

export interface DayTargetContext {
  tracks: ProgressionTrack[];
  specs: TrackSpec[];
  /** Séances enregistrées (la séance en cours n'y est pas). */
  completed: WorkoutSession[];
  exerciseById: ReadonlyMap<Id, Exercise>;
}

export function dayTargetFor(block: PerformedExerciseBlock, date: string, context: DayTargetContext, now: string): DayTarget | undefined {
  const track = context.tracks.find((item) => item.id === block.sourceBlockId && !item.closedAt);
  const spec = context.specs.find((item) => item.id === block.sourceBlockId);
  if (!track || !spec || track.engine === "v6") return undefined;
  const reference = track.references.at(-1)?.from;
  const results = trackResults(context.completed, sourceIdsOf(spec, context.specs), reference).filter((result) => result.date <= date);
  const last = results.at(-1);
  if (track.engine === "load" && spec.load) {
    return nextLoadTarget({
      prescription: spec.load,
      steps: context.exerciseById.get(spec.exerciseId)?.loadSteps,
      last,
      suspended: track.suspension ? { reason: track.suspension.reason } : undefined,
      raiseThisWeek: spec.shareGroup ? raiseTakenThisWeek(results, date) : false,
      now,
    });
  }
  if (track.engine === "duration" && spec.duration) return nextDurationTarget(spec.duration, last, now);
  if (track.engine === "negatives" && spec.negativeSets) return nextNegativesTarget(spec.negativeSets, last, now);
  return undefined;
}

/** Une brique est encore « au début » tant qu'aucune de ses séries n'est notée ni terminée. */
function notStarted(block: PerformedExerciseBlock): boolean {
  return (block.series ?? []).every((series) => series.status !== "completed" && series.endedAt === undefined);
}

/** La séance avec l'objectif figé sur chaque brique éligible qui n'en a pas encore ; inchangée sinon. */
export function withDayTargets(workout: WorkoutSession, context: DayTargetContext, now: string): WorkoutSession {
  let changed = false;
  const blocks = workout.blocks.map((block) => {
    if (block.kind !== "exercise" || block.dayTarget || !block.sourceBlockId || !notStarted(block)) return block;
    const target = dayTargetFor(block, workout.date, context, now);
    if (!target) return block;
    changed = true;
    return { ...block, dayTarget: target };
  });
  return changed ? { ...workout, blocks } : workout;
}

export async function loadDayTargetContext(completed: ReadonlyArray<WorkoutSession>): Promise<DayTargetContext> {
  const [tracks, templates, exercises, frames, versions] = await Promise.all([
    getProgressionTracks(),
    db.sessionTemplates.bulkGet(Object.values(PERSPECTIVE_TEMPLATES)),
    db.exercises.toArray(),
    db.strengthFrames.toArray(),
    db.strengthFrameVersions.where("status").equals("active").toArray(),
  ]);
  const exerciseById = new Map((exercises as Exercise[]).map((exercise) => [exercise.id, exercise]));
  const versionByExercise = new Map(
    (versions as StrengthFrameVersion[]).flatMap((version) => {
      const exerciseId = frames.find((frame) => frame.id === version.frameId)?.exerciseId;
      return exerciseId ? [[exerciseId, version] as const] : [];
    }),
  );
  const specs = trackSpecsFrom(templates.filter((template): template is SessionTemplate => template !== undefined), exerciseById, versionByExercise);
  return { tracks, specs, completed: [...completed], exerciseById };
}

/**
 * Fige les objectifs de la séance en cours (une seule fois par brique) et
 * l'enregistre. Relit la séance dans la transaction : un geste fait entre
 * deux n'est jamais écrasé.
 */
export async function freezeDayTargets(workoutId: Id, completed: ReadonlyArray<WorkoutSession>, now: string = new Date().toISOString()): Promise<WorkoutSession | undefined> {
  const context = await loadDayTargetContext(completed);
  if (context.tracks.length === 0) return undefined;
  return db.transaction("rw", db.workouts, async () => {
    const current = await db.workouts.get(workoutId);
    if (!current || current.status !== "in_progress" || current.endedAt !== undefined) return current;
    const next = withDayTargets(current, context, now);
    if (next !== current) await db.workouts.put(next);
    return next;
  });
}
