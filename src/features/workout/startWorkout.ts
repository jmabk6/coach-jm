import {
  getPlannedSession,
  savePlannedSession,
} from "../../db/repositories/programRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import {
  getInProgressWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import type {
  Id,
  WorkoutSession,
} from "../../domain";
import { kindForCategory } from "../../domain/rules/workoutKindRules";
import { createWorkoutSnapshot } from "./createWorkoutSnapshot";

export async function startWorkout(
  plannedSessionId: Id,
  now: string = new Date().toISOString(),
): Promise<WorkoutSession> {
  const plannedSession = await getPlannedSession(
    plannedSessionId,
  );

  if (!plannedSession) {
    throw new Error("Séance planifiée introuvable");
  }

  if (plannedSession.removedAt) {
    throw new Error(
      "Cette séance a été retirée du Programme",
    );
  }

  if (plannedSession.status === "done") {
    throw new Error(
      "Cette séance a déjà été réalisée",
    );
  }

  if (plannedSession.status === "in_progress") {
    throw new Error(
      "Cette séance est déjà en cours",
    );
  }

  const inProgressWorkout =
    await getInProgressWorkout();

  if (inProgressWorkout) {
    throw new Error(
      "Une séance est déjà en cours",
    );
  }

  const template = await getSessionTemplate(
    plannedSession.sessionTemplateId,
  );

  if (!template) {
    throw new Error(
      "Modèle de séance introuvable",
    );
  }

  const workout: WorkoutSession = {
    id: `workout-${plannedSession.id}`,
    plannedSessionId: plannedSession.id,
    sessionTemplateId: template.id,
    /* Nature posée au démarrage, dérivée du modèle, sans choix (v1.5, § 11.3). */
    kind: kindForCategory(template.category),
    source: "planned",
    status: "in_progress",
    date: plannedSession.date,
    startedAt: now,
    lastActionAt: now,
    activeDurationSec: 0,
    blocks: createWorkoutSnapshot(template),
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkout(workout);

  await savePlannedSession({
    ...plannedSession,
    status: "in_progress",
    workoutId: workout.id,
    updatedAt: now,
  });

  return workout;
}