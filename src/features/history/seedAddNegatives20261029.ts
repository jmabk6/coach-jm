import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, PerformedSeries, WorkoutSession } from "../../domain";
import { NEGATIVES_NOTE } from "../program/programV2";

/**
 * Seed 48 — ajout ponctuel à la Muscu C du 29/10/2026 (message de
 * l'utilisateur du 30/10, sauvegarde du 30/10 à 12:48) : des tractions
 * négatives ont été faites, mais la brique n'était pas dans la séance
 * (programmée à partir du 01/11/2026), elles n'ont donc pas pu être notées.
 * Faites : **2 séries de 2**, descente d'environ **5 s**, **RPE 9**.
 *
 * Brique ajoutée à sa place du programme (juste après l'échauffement), au
 * format d'une saisie normale (répétitions, durée de chaque descente, la
 * plus lente en `durationSec`) ; heures estimées entre l'échauffement et
 * la suspension, repos non mesuré ; chaque série porte la mention de la
 * saisie après coup.
 *
 * Une seule fois (marqueur `install.addNegatives20261029`), et seulement si
 * la séance est enregistrée et n'a encore aucune négative ; sinon rien.
 */

export const ADD_NEGATIVES_20261029_WORKOUT_ID = "workout-weekly-2026-10-29";
const BLOCK_ID = "workout-block-v2-muscu-c-negatives";
const SOURCE_BLOCK_ID = "v2-muscu-c-negatives";
const NOTE = "Saisie après coup le 30/10 (séance faite sans la brique).";
const COMPLETED_AT = ["2026-10-29T16:59:00.000Z", "2026-10-29T17:01:30.000Z"] as const;

function series(index: number): PerformedSeries {
  return {
    id: `${BLOCK_ID}-set-${index + 1}`,
    position: index,
    status: "completed",
    role: "travail",
    reps: 2,
    repDurationsSec: [5, 5],
    durationSec: 5,
    rpe: 9,
    sideLimited: false,
    note: NOTE,
    completedAt: COMPLETED_AT[index]!,
    restUnmeasured: true,
    restComparable: false,
  } as PerformedSeries;
}

/** La séance complétée, ou `undefined` si elle n'est pas dans l'état attendu. */
export function addNegatives20261029(workout: WorkoutSession, now: string): WorkoutSession | undefined {
  if (
    workout.id !== ADD_NEGATIVES_20261029_WORKOUT_ID ||
    workout.status !== "completed" ||
    workout.sessionTemplateId !== "v2-muscu-c" ||
    workout.blocks.some((block) => block.kind === "exercise" && block.exerciseId === "traction-negative") ||
    workout.blocks.some((block) => block.position === 1)
  ) {
    return undefined;
  }

  const block: PerformedExerciseBlock = {
    id: BLOCK_ID,
    sourceBlockId: SOURCE_BLOCK_ID,
    kind: "exercise",
    position: 1,
    addedDuringWorkout: false,
    exerciseId: "traction-negative",
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 2, max: 2 }, restBetweenSetsSec: 150 },
    note: NEGATIVES_NOTE,
    series: [series(0), series(1)],
  };

  return { ...workout, blocks: [...workout.blocks, block].sort((a, b) => a.position - b.position), updatedAt: now };
}

export async function seedAddNegatives20261029(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.workouts, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.addNegatives20261029 !== undefined) return;

    const workout = await db.workouts.get(ADD_NEGATIVES_20261029_WORKOUT_ID);
    const fixed = workout ? addNegatives20261029(workout, now) : undefined;
    if (fixed) await db.workouts.put(fixed);

    await db.settings.put({ key: "install", value: { ...install, addNegatives20261029: now } });
  });
}
