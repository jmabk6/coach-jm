import type { Id } from "../../domain";
import { confirmWorkout, endWorkout, type ConfirmWorkoutInput, type ConfirmWorkoutResult } from "./finishWorkout";

/**
 * Pour les tests : `Terminer` puis `Enregistrer` d'un seul geste, là où
 * l'ancien `finishWorkout` faisait les deux (lot E.1). L'application, elle,
 * les sépare toujours.
 */
export async function endAndConfirm(
  workoutId: Id,
  now: string = new Date().toISOString(),
  input: ConfirmWorkoutInput = {},
): Promise<ConfirmWorkoutResult> {
  await endWorkout(workoutId, now);
  return confirmWorkout(workoutId, input, now);
}
