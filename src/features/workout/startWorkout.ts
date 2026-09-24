import {
  getPlannedSession,
  savePlannedSession,
} from "../../db/repositories/programRepository";
import { getActiveRpeScaleVersion } from "../../db/repositories/rpeScaleRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import {
  getInProgressWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import { getTestProtocol } from "../../db/repositories/testRepository";
import type {
  Id,
  WorkoutSession,
} from "../../domain";
import { assertRoutineStartable } from "../../domain/rules/sessionTemplateRules";
import { kindForCategory } from "../../domain/rules/workoutKindRules";
import { loadActiveFrameVersions } from "../strength/activeFrameVersions";
import { createWorkoutSnapshot, type SnapshotTest } from "./createWorkoutSnapshot";

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
      "Cette séance a été retirée du Planning",
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

  /* Tests attachés (lot G.3) : la version active de chaque protocole est
     capturée au démarrage ; un test replanifié ailleurs, ou d'un protocole
     disparu ou en pause, n'entre pas dans la séance. */
  const tests: SnapshotTest[] = [];
  for (const test of plannedSession.tests ?? []) {
    if (test.rescheduledToPlannedSessionId !== undefined) continue;
    const protocol = await getTestProtocol(test.protocolId);
    if (!protocol || protocol.status !== "active") continue;
    tests.push({ test, protocolVersionId: protocol.activeVersionId });
  }

  /* Une routine vide ne démarre pas, sauf si ses tests en sont le contenu
     (Souplesse et Tronc le lundi soir de la semaine de tests). */
  if (tests.length === 0) assertRoutineStartable(template);

  /* Échelle de RPE en vigueur et versions de cadre actives, capturées au
     démarrage (v1.6, § 4.3 et § 4.5) ; l'échelle est absente seulement si
     aucune version n'existe encore. */
  const [rpeScale, frames] = await Promise.all([getActiveRpeScaleVersion(), loadActiveFrameVersions()]);

  const workout: WorkoutSession = {
    id: `workout-${plannedSession.id}`,
    plannedSessionId: plannedSession.id,
    sessionTemplateId: template.id,
    /* Nature posée au démarrage, dérivée du modèle, sans choix (v1.5, § 11.3). */
    kind: kindForCategory(template.category),
    ...(rpeScale ? { rpeScaleVersionId: rpeScale.id } : {}),
    source: "planned",
    status: "in_progress",
    date: plannedSession.date,
    startedAt: now,
    lastActionAt: now,
    activeDurationSec: 0,
    blocks: createWorkoutSnapshot(template, frames.versionIdByExercise, frames.versionById, tests),
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