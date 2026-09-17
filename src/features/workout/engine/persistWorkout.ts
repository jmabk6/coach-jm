import {
  getInProgressWorkout,
  getWorkout,
  saveWorkout,
} from "../../../db/repositories/workoutRepository";
import type { Id, WorkoutSession } from "../../../domain";
import { recordPresence } from "./workoutEngine";

export type WorkoutAction = (workout: WorkoutSession, now: string) => WorkoutSession;

/**
 * Applique un geste du moteur à la séance et **sauvegarde aussitôt** :
 * une reprise après fermeture retrouve exactement l'état du dernier
 * geste (§15). Le geste est pur ; seule cette fonction touche à la base.
 */
export async function applyWorkoutAction(
  workoutId: Id,
  action: WorkoutAction,
  now: string = new Date().toISOString(),
): Promise<WorkoutSession> {
  const workout = await getWorkout(workoutId);

  if (!workout) {
    throw new Error("Séance réalisée introuvable");
  }

  if (workout.status !== "in_progress") {
    throw new Error("Cette séance est terminée");
  }

  const next = action(workout, now);

  await saveWorkout(next);

  return next;
}

/**
 * Battement de présence de la séance en cours, s'il y en a une. Ne
 * compte pas comme un geste et ne touche à aucun chrono.
 */
export async function recordWorkoutPresence(
  now: string = new Date().toISOString(),
): Promise<WorkoutSession | undefined> {
  const workout = await getInProgressWorkout();

  if (!workout) {
    return undefined;
  }

  const next = recordPresence(workout, now);

  await saveWorkout(next);

  return next;
}
