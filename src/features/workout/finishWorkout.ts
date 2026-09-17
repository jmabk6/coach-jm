import {
  getPlannedSession,
  savePlannedSession,
} from "../../db/repositories/programRepository";
import {
  getWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import type { Id, WorkoutSession } from "../../domain";
import { completeWorkoutSession } from "./engine/workoutEngine";
import { calculateActiveDurationSec } from "./engine/workoutTime";

export { completeWorkoutSession };

/**
 * Durée active d'une séance à l'instant `now` (§12) : amplitude moins
 * pauses pour une séance en cours, valeur figée pour une séance terminée.
 */
export function currentActiveDurationSec(
  workout: WorkoutSession,
  now: string,
): number {
  return workout.status === "completed"
    ? workout.activeDurationSec
    : calculateActiveDurationSec(workout, now);
}

/**
 * Termine la séance en cours (`Terminer` comme `Arrêter`, §14 et §15) et,
 * si elle était planifiée, passe l'instance `Faite`. Une séance libre
 * ne touche pas au Programme.
 */
export async function finishWorkout(
  workoutId: Id,
  now: string = new Date().toISOString(),
): Promise<WorkoutSession> {
  const workout = await getWorkout(workoutId);

  if (!workout) {
    throw new Error("Séance réalisée introuvable");
  }

  if (workout.status !== "in_progress") {
    throw new Error("Cette séance est déjà terminée");
  }

  const completed = completeWorkoutSession(workout, now);

  await saveWorkout(completed);

  if (workout.plannedSessionId) {
    const plannedSession = await getPlannedSession(workout.plannedSessionId);

    if (plannedSession) {
      await savePlannedSession({
        ...plannedSession,
        status: "done",
        workoutId: completed.id,
        updatedAt: now,
      });
    }
  }

  return completed;
}
