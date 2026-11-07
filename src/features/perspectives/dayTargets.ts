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
import { workSetsOf } from "../../domain/rules/progressionRules";
import { nextRoutineTarget } from "../../domain/rules/routineProgressionRules";
import { ROUTINE_RPE_MAX, ROUTINE_V4_BLOCKS } from "../program/programRoutinesV4";
import { routineProgressionOf, ROUTINE_V5_BLOCKS } from "../program/programV5";
import { getWeekStartDate } from "../../domain/rules/programRules";
import { PROGRAM_V4_START } from "../program/programV4";
import { LOCKED_LABELS, practiceLockOf } from "../../domain/rules/exerciseClearanceRules";
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
  if (!block.sourceBlockId) return undefined;
  return ROUTINE_BLOCKS.has(block.sourceBlockId) ? routineDayTarget(block.sourceBlockId, date, context, now) : dayTargetForTrack(block.sourceBlockId, date, context, now);
}

const PAIN_NOTE = /douleur|mal au|mal à/i;

/** Les briques de routine suivies : routines V4 et routine dos V5. */
const ROUTINE_BLOCKS: ReadonlyMap<string, { exerciseId: string; sets: number; start: number }> = new Map([...ROUTINE_V4_BLOCKS, ...ROUTINE_V5_BLOCKS]);

/**
 * Programme V4 (lot L5) : l'objectif d'une brique de routine, d'après la
 * dernière séance du **même exercice** dans n'importe quelle routine V4
 * (suivi partagé : le dead bug de A et celui de C progressent ensemble).
 * Un exercice « À valider » ou « Suspendu » n'en reçoit pas.
 */
export function routineDayTarget(sourceBlockId: Id, date: string, context: DayTargetContext, now: string): DayTarget | undefined {
  const spec = ROUTINE_BLOCKS.get(sourceBlockId);
  const rule = spec ? routineProgressionOf(spec.exerciseId) : undefined;
  if (!spec || !rule) return undefined;
  if (practiceLockOf(context.exerciseById.get(spec.exerciseId))) return undefined;
  const history = context.completed
    .filter((workout) => workout.status === "completed" && workout.date >= PROGRAM_V4_START && workout.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? "").localeCompare(b.startedAt ?? ""))
    .flatMap((workout) =>
      workout.blocks.flatMap((block) => {
        if (block.kind !== "exercise" || block.status !== "performed" || !block.sourceBlockId) return [];
        const source = ROUTINE_BLOCKS.get(block.sourceBlockId);
        return source && source.exerciseId === spec.exerciseId ? [{ workout, block, source }] : [];
      }),
    );
  /*
   * Routine dos V5, faite tous les jours : la cible ne change qu'une fois par
   * semaine. Déjà faite cette semaine : on garde la cible de la semaine ;
   * sinon, elle se décide sur la dernière séance des semaines d'avant.
   */
  if (ROUTINE_V5_BLOCKS.has(sourceBlockId)) {
    const week = getWeekStartDate(date);
    const thisWeek = history.filter((item) => item.workout.date >= week).at(-1);
    const weekTarget = thisWeek?.block.dayTarget?.sets[0];
    const value = rule.measure === "reps" ? weekTarget?.reps : weekTarget?.durationSec;
    if (thisWeek && value !== undefined) {
      return {
        computedAt: now,
        rpeMax: ROUTINE_RPE_MAX,
        routine: true,
        basisWorkoutId: thisWeek.workout.id,
        kind: "consolidate",
        sets: Array.from({ length: spec.sets }, () => (rule.measure === "reps" ? { reps: value } : { durationSec: value })),
        reason: "Cible de la semaine : elle ne change qu'une fois par semaine.",
      };
    }
    const before = history.filter((item) => item.workout.date < week);
    return nextFromLatest(before.at(-1), spec, rule, now);
  }
  return nextFromLatest(history.at(-1), spec, rule, now);
}

function nextFromLatest(
  latest: { workout: WorkoutSession; block: PerformedExerciseBlock; source: { exerciseId: string; sets: number; start: number } } | undefined,
  spec: { exerciseId: string; sets: number; start: number },
  rule: NonNullable<ReturnType<typeof routineProgressionOf>>,
  now: string,
): DayTarget {
  const frozen = latest?.block.dayTarget?.sets[0];
  const last = latest
    ? {
        workoutId: latest.workout.id,
        target: (rule.measure === "reps" ? frozen?.reps : frozen?.durationSec) ?? latest.source.start,
        sets: latest.block.dayTarget?.sets.length || latest.source.sets,
        done: workSetsOf(latest.block),
        pain: (latest.block.series ?? []).some((series) => series.note !== undefined && PAIN_NOTE.test(series.note)),
      }
    : undefined;
  return nextRoutineTarget({ rule: { ...rule, rpeMax: ROUTINE_RPE_MAX }, sets: spec.sets, start: spec.start, last, now });
}

/** L'objectif de la prochaine séance d'une piste, à une date donnée (séances enregistrées jusqu'à cette date). */
export function dayTargetForTrack(trackId: Id, date: string, context: DayTargetContext, now: string): DayTarget | undefined {
  const track = context.tracks.find((item) => item.id === trackId && !item.closedAt);
  const spec = context.specs.find((item) => item.id === trackId);
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
  return { tracks: withPracticeSuspensions(tracks, exerciseById), specs, completed: [...completed], exerciseById };
}

/**
 * Lot L2 : une piste dont l'exercice est « À valider » ou « Suspendu » se lit
 * comme une piste suspendue (mécanisme existant : pas d'objectif du jour,
 * pas de trajectoire qui avance, pas de « retard »). Calculé à la lecture,
 * jamais enregistré ; une suspension déjà posée (douleur) l'emporte.
 */
export function withPracticeSuspensions(tracks: ReadonlyArray<ProgressionTrack>, exerciseById: ReadonlyMap<Id, Exercise>): ProgressionTrack[] {
  return tracks.map((track) => {
    if (track.suspension || track.closedAt) return track;
    const exercise = exerciseById.get(track.exerciseId);
    const lock = practiceLockOf(exercise);
    if (!lock) return track;
    return { ...track, suspension: { from: exercise!.clearance!.since.slice(0, 10), reason: LOCKED_LABELS[lock] } };
  });
}

/**
 * Fige les objectifs de la séance en cours (une seule fois par brique) et
 * l'enregistre. Relit la séance dans la transaction : un geste fait entre
 * deux n'est jamais écrasé.
 */
export async function freezeDayTargets(workoutId: Id, completed: ReadonlyArray<WorkoutSession>, now: string = new Date().toISOString()): Promise<WorkoutSession | undefined> {
  const context = await loadDayTargetContext(completed);
  return db.transaction("rw", db.workouts, async () => {
    const current = await db.workouts.get(workoutId);
    if (!current || current.status !== "in_progress" || current.endedAt !== undefined) return current;
    const next = withDayTargets(current, context, now);
    if (next !== current) await db.workouts.put(next);
    return next;
  });
}
