import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { clearDiscardedBlock } from "./engine/workoutEngine";
import { validatedCardioStepsSec } from "./engine/workoutTime";

/**
 * Seed 10 — correction ponctuelle de la Cardio A du 24/09/2026, enregistrée
 * avant que « Retirer ce bloc » soit en ligne : les blocs « principal » et
 * « retour », validés à vide à 13:43, sont retirés, et la durée devient la
 * somme des paliers du bloc réellement fait (45 min au lieu de 2 h 47).
 *
 * Ne s'applique qu'une fois (marqueur `install.fixWorkout20260924`) et
 * seulement si la séance est **exactement** dans l'état constaté dans la
 * sauvegarde du 24/09 à 22:32 ; sinon rien n'est touché.
 */

export const FIX_WORKOUT_ID = "free-2026-09-24-2026-09-24T13:35:25.745Z";

/** Les deux blocs retirés et l'heure de leur unique validation par erreur. */
const SPURIOUS: ReadonlyArray<{ blockId: string; completedAt: string }> = [
  { blockId: "workout-block-v1-cardio-a-principal", completedAt: "2026-09-24T13:43:14.296Z" },
  { blockId: "workout-block-v1-cardio-a-retour", completedAt: "2026-09-24T13:43:16.921Z" },
];

function matchesObservedState(workout: WorkoutSession): boolean {
  if (workout.status !== "completed" || workout.activeDurationSec !== 10053) return false;
  return SPURIOUS.every(({ blockId, completedAt }) => {
    const block = workout.blocks.find((item) => item.id === blockId);
    if (block?.kind !== "exercise" || block.status !== "performed") return false;
    const done = (block.cardioSteps ?? []).filter((step) => step.status === "completed");
    return done.length === 1 && done[0]!.completedAt === completedAt;
  });
}

/** La séance corrigée, ou `undefined` si elle n'est pas dans l'état attendu. */
export function fixWorkout20260924(workout: WorkoutSession, now: string): WorkoutSession | undefined {
  if (!matchesObservedState(workout)) return undefined;

  const discarded = new Set(SPURIOUS.map((item) => item.blockId));
  const fixed: WorkoutSession = {
    ...workout,
    blocks: workout.blocks.map((block) =>
      discarded.has(block.id) ? (clearDiscardedBlock(block, "not_performed") as PerformedExerciseBlock) : block,
    ),
    updatedAt: now,
  };
  const durationSec = validatedCardioStepsSec(fixed);
  if (durationSec === undefined) return undefined;
  fixed.activeDurationSec = durationSec;
  return fixed;
}

export async function seedFixWorkout20260924(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.workouts, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.fixWorkout20260924 !== undefined) return;

    const workout = await db.workouts.get(FIX_WORKOUT_ID);
    const fixed = workout ? fixWorkout20260924(workout, now) : undefined;
    if (fixed) await db.workouts.put(fixed);

    await db.settings.put({ key: "install", value: { ...install, fixWorkout20260924: now } });
  });
}
