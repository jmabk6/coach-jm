import { db } from "../../db/database";
import { getActiveRpeScaleVersion } from "../../db/repositories/rpeScaleRepository";
import type {
  Exercise,
  InstallMarkers,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedSeries,
  PlannedSession,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { loadDayTargetContext, withDayTargets } from "../perspectives/dayTargets";
import { loadActiveFrameVersions } from "../strength/activeFrameVersions";
import { v6SnapshotAdjustments } from "../goals/tractionV6";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { createAddedExerciseBlock } from "../workout/engine/workoutBlocks";
import { completeWorkoutSession, endWorkoutSession, skipBlock } from "../workout/engine/workoutEngine";

/**
 * Seed 49 — la Muscu A du dimanche 01/11/2026, faite sans téléphone et
 * notée sur papier (message de l'utilisateur du 01/11, sauvegarde du 01/11
 * à 22:06). Enregistrée comme une saisie normale de la séance prévue
 * `weekly-2026-11-01` : même construction qu'au démarrage (consignes,
 * cadres, objectifs du jour figés sur les séances précédentes), séries
 * notées, puis Terminer et Enregistrer ; l'instance prévue passe « Faite ».
 *
 * Écarts au programme, donnés par l'utilisateur : tirage vertical ajouté
 * après le rowing ; leg curl couché et presse à cuisses sautés. Début à
 * 19 h 15 (Paris) ; repos réels notés par l'utilisateur, durée de chaque
 * série estimée à 45 s, 3 min entre deux exercices.
 *
 * Une seule fois (marqueur `install.addWorkout20261101`), seulement dans la
 * base de l'utilisateur (reconnue à sa Muscu C du 29/10), si l'instance du
 * 01/11 est encore à faire et qu'aucune séance n'existe ce jour-là : une
 * saisie faite dans l'app entre-temps n'est jamais doublée.
 */

export const WORKOUT_20261101_DATE = "2026-11-01";
export const PLANNED_20261101_ID = "weekly-2026-11-01";
export const WORKOUT_20261101_ID = `workout-${PLANNED_20261101_ID}`;
const TEMPLATE_ID = "v2-muscu-a";
const OWNER_WORKOUT_ID = "workout-weekly-2026-10-29";
const ADDED_ID = "2026-11-01-tirage-vertical";

/** 19 h 15 à Paris (heure d'hiver). */
const START = "2026-11-01T18:15:00.000Z";
const WARMUP_SEC = 600;
const SET_SEC = 45;
const BETWEEN_EXERCISES_SEC = 180;

export const WORKOUT_20261101_NOTE = "Saisie après coup le 01/11 : séance faite sans téléphone, notée sur papier.";

interface SetSpec {
  kg: number;
  reps: number;
  rpe: number;
  /** Repos après la série, en secondes ; absent après la dernière. */
  restSec?: number;
}

/** Briques réalisées, dans l'ordre de la séance. */
const DONE: Array<{ blockId: string; sets: SetSpec[] }> = [
  {
    blockId: "workout-block-v2-muscu-a-traction",
    sets: [
      { kg: 21, reps: 2, rpe: 9, restSec: 180 },
      { kg: 28, reps: 5, rpe: 8, restSec: 180 },
      { kg: 28, reps: 5, rpe: 8, restSec: 180 },
      { kg: 21, reps: 5, rpe: 9 },
    ],
  },
  {
    blockId: "workout-block-v2-muscu-a-rowing",
    sets: [
      { kg: 55, reps: 6, rpe: 9, restSec: 150 },
      { kg: 55, reps: 6, rpe: 9, restSec: 150 },
      { kg: 50, reps: 8, rpe: 9 },
    ],
  },
  {
    blockId: `added-${ADDED_ID}`,
    sets: [
      { kg: 50, reps: 12, rpe: 8, restSec: 150 },
      { kg: 50, reps: 12, rpe: 9, restSec: 150 },
      { kg: 50, reps: 6, rpe: 10 },
    ],
  },
  {
    blockId: "workout-block-v2-muscu-a-chest-press",
    sets: [
      { kg: 50, reps: 12, rpe: 8, restSec: 150 },
      { kg: 50, reps: 12, rpe: 9 },
    ],
  },
  {
    blockId: "workout-block-v2-muscu-a-elevations",
    sets: [
      { kg: 5, reps: 15, rpe: 8, restSec: 90 },
      { kg: 5, reps: 14, rpe: 9, restSec: 90 },
      { kg: 5, reps: 13, rpe: 10 },
    ],
  },
  {
    blockId: "workout-block-v2-muscu-a-curl",
    sets: [
      { kg: 8, reps: 12, rpe: 8, restSec: 90 },
      { kg: 8, reps: 10, rpe: 8, restSec: 90 },
      { kg: 8, reps: 8, rpe: 9 },
    ],
  },
];

const SKIPPED = ["workout-block-v2-muscu-a-leg-curl", "workout-block-v2-muscu-a-presse"];

const at = (offsetSec: number) => new Date(Date.parse(START) + offsetSec * 1000).toISOString();

export interface Workout20261101Inputs {
  template: SessionTemplate;
  tirageVertical: Exercise;
  frames: Awaited<ReturnType<typeof loadActiveFrameVersions>>;
  rpeScaleVersionId?: string | undefined;
  dayTargetContext: Awaited<ReturnType<typeof loadDayTargetContext>>;
}

/** La séance enregistrée, construite comme l'app la construit, puis remplie. */
export function buildWorkout20261101(inputs: Workout20261101Inputs, now: string): WorkoutSession {
  const { template, tirageVertical, frames, rpeScaleVersionId, dayTargetContext } = inputs;

  /* Démarrage (comme `startWorkout`), objectifs du jour figés (comme l'écran de séance). */
  const started: WorkoutSession = withDayTargets(
    {
      id: WORKOUT_20261101_ID,
      plannedSessionId: PLANNED_20261101_ID,
      sessionTemplateId: template.id,
      kind: "training",
      ...(rpeScaleVersionId ? { rpeScaleVersionId } : {}),
      source: "planned",
      status: "in_progress",
      date: WORKOUT_20261101_DATE,
      startedAt: START,
      lastActionAt: START,
      activeDurationSec: 0,
      blocks: createWorkoutSnapshot(template, frames.versionIdByExercise, frames.versionById, [], v6SnapshotAdjustments(template, WORKOUT_20261101_DATE)),
      createdAt: START,
      updatedAt: START,
    },
    dayTargetContext,
    START,
  );

  /* Tirage vertical ajouté juste après le rowing. */
  const ordered = [...started.blocks].sort((a, b) => a.position - b.position);
  const rowingIndex = ordered.findIndex((block) => block.id === "workout-block-v2-muscu-a-rowing");
  if (rowingIndex < 0) throw new Error("Muscu A sans rowing : séance du 01/11 non construite");
  const added = createAddedExerciseBlock(tirageVertical, rowingIndex + 1, () => ADDED_ID, frames.versionIdByExercise.get(tirageVertical.id));
  ordered.splice(rowingIndex + 1, 0, added);

  /* Échauffement : 10 min à 5 km/h, pente 0 %, FC 76. */
  let cursor = WARMUP_SEC;
  let blocks: PerformedBlock[] = ordered.map((block, position) => {
    if (block.kind !== "exercise" || block.id !== "workout-block-v2-muscu-a-echauffement") return { ...block, position };
    const [step, ...rest] = block.cardioSteps ?? [];
    if (!step || rest.length > 0) throw new Error("Échauffement de Muscu A inattendu");
    const settings = { durationSec: WARMUP_SEC, speedKmh: 5, inclinePercent: 0 };
    const changed = JSON.stringify(step.settings) !== JSON.stringify(settings);
    return {
      ...block,
      position,
      cardioSteps: [{ ...step, status: "completed" as const, settings, ...(changed ? { originalSettings: step.settings } : {}), bpm: 76, completedAt: at(cursor) }],
    };
  });

  /* Séries notées, dans l'ordre de la séance. */
  for (const item of DONE) {
    cursor += BETWEEN_EXERCISES_SEC;
    const series: PerformedSeries[] = item.sets.map((set, index) => {
      cursor += SET_SEC;
      const completedAt = at(cursor);
      if (set.restSec !== undefined) cursor += set.restSec;
      return {
        id: `${item.blockId}-set-${index + 1}`,
        position: index,
        status: "completed",
        role: "travail",
        load: { kind: "total", kg: set.kg },
        reps: set.reps,
        rpe: set.rpe,
        sideLimited: false,
        completedAt,
        ...(set.restSec !== undefined ? { actualRestAfterSec: set.restSec, restComparable: true } : {}),
      };
    });
    blocks = blocks.map((block) => (block.id === item.blockId && block.kind === "exercise" ? ({ ...block, series } as PerformedExerciseBlock) : block));
    if (!blocks.some((block) => block.id === item.blockId)) throw new Error(`Brique ${item.blockId} absente de la Muscu A`);
  }

  const end = at(cursor + 60);
  let workout: WorkoutSession = { ...started, blocks, lastActionAt: end };
  for (const blockId of SKIPPED) workout = skipBlock(workout, blockId, end);

  /* Terminer puis Enregistrer. */
  const completed = completeWorkoutSession(endWorkoutSession(workout, end), end, { note: WORKOUT_20261101_NOTE });
  return { ...completed, createdAt: now, updatedAt: now };
}

/** Vrai si le seed doit ajouter la séance dans cette base. */
async function applies(planned: PlannedSession | undefined): Promise<boolean> {
  if (!planned || planned.status !== "upcoming" || planned.removedAt || planned.sessionTemplateId !== TEMPLATE_ID || planned.date !== WORKOUT_20261101_DATE) return false;
  const owner = await db.workouts.get(OWNER_WORKOUT_ID);
  if (owner?.status !== "completed") return false;
  return (await db.workouts.where("date").equals(WORKOUT_20261101_DATE).count()) === 0 && (await db.workouts.get(WORKOUT_20261101_ID)) === undefined;
}

export async function seedWorkout20261101(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction(
    "rw",
    [db.workouts, db.plannedSessions, db.settings, db.sessionTemplates, db.exercises, db.strengthFrames, db.strengthFrameVersions, db.rpeScaleVersions],
    async () => {
      const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
      if (install?.addWorkout20261101 !== undefined) return;

      const planned = await db.plannedSessions.get(PLANNED_20261101_ID);
      const template = await db.sessionTemplates.get(TEMPLATE_ID);
      const tirageVertical = await db.exercises.get("tirage-vertical");

      if ((await applies(planned)) && template && tirageVertical) {
        const completedBefore = (await db.workouts.toArray()).filter((workout) => workout.status === "completed" && workout.date < WORKOUT_20261101_DATE);
        const [frames, rpeScale, dayTargetContext] = await Promise.all([loadActiveFrameVersions(), getActiveRpeScaleVersion(), loadDayTargetContext(completedBefore)]);
        const workout = buildWorkout20261101({ template, tirageVertical, frames, rpeScaleVersionId: rpeScale?.id, dayTargetContext }, now);
        await db.workouts.put(workout);
        await db.plannedSessions.put({ ...planned!, status: "done", workoutId: workout.id, updatedAt: now });
      }

      await db.settings.put({ key: "install", value: { ...install, addWorkout20261101: now } });
    },
  );
}
