import {
  getPlannedSession,
  savePlannedSession,
} from "../../db/repositories/programRepository";
import {
  getWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import type { Id, WorkoutSession } from "../../domain";

/**
 * Clôture d'une réalisation (§14) : la séance passe `Faite` avec ses
 * briques dans l'état où elles sont — réalisées, sautées, ou jamais
 * abordées (`Non réalisé`). Rien n'est supprimé, rien n'est complété.
 *
 * La durée active est celle accumulée par le moteur de séance ; tant
 * qu'il n'existe pas (Étape 6), elle vaut le temps écoulé depuis le
 * démarrage.
 */
export function elapsedActiveDurationSec(
  workout: WorkoutSession,
  now: string,
): number {
  if (workout.activeDurationSec > 0) {
    return workout.activeDurationSec;
  }

  return Math.max(
    0,
    Math.round(
      (new Date(now).getTime() - new Date(workout.startedAt).getTime()) / 1000,
    ),
  );
}

export function completeWorkoutSession(
  workout: WorkoutSession,
  now: string,
): WorkoutSession {
  const completed: WorkoutSession = {
    ...workout,
    status: "completed",
    completedAt: now,
    lastActionAt: now,
    activeDurationSec: elapsedActiveDurationSec(workout, now),
    updatedAt: now,
  };

  delete completed.activeRest;
  delete completed.currentBlockId;
  delete completed.currentEntryId;

  return completed;
}

/**
 * Termine la séance en cours et, si elle était planifiée, passe
 * l'instance `Faite`. Une séance libre ne touche pas au Programme.
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
