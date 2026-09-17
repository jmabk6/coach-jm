import {
  getInProgressWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import type { SessionTemplate, WorkoutSession } from "../../domain";
import { createWorkoutSnapshot } from "./createWorkoutSnapshot";

/**
 * Démarre une réalisation libre (§10) : sans modèle, la séance part vide
 * et se construit exercice par exercice ; avec un modèle (séance
 * supplémentaire, ou modèle sans planifiée aujourd'hui), les consignes
 * sont copiées comme pour une planifiée. Dans les deux cas, aucune
 * instance n'est créée : le Programme ne bouge pas.
 */
export async function startFreeWorkout(
  date: string,
  now: string = new Date().toISOString(),
  template?: SessionTemplate,
): Promise<WorkoutSession> {
  const inProgressWorkout =
    await getInProgressWorkout();

  if (inProgressWorkout) {
    throw new Error(
      "Une séance est déjà en cours",
    );
  }

  const workout: WorkoutSession = {
    id: `free-${date}-${now}`,
    ...(template ? { sessionTemplateId: template.id } : {}),
    source: "free",
    status: "in_progress",
    date,
    startedAt: now,
    lastActionAt: now,
    activeDurationSec: 0,
    blocks: template ? createWorkoutSnapshot(template) : [],
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkout(workout);

  return workout;
}
