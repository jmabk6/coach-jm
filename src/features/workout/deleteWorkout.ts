import {
  getPlannedSession,
  savePlannedSession,
} from "../../db/repositories/programRepository";
import {
  deleteWorkoutRecord,
  getWorkout,
  getWorkoutsByPlannedSession,
} from "../../db/repositories/workoutRepository";
import type { Id, PlannedSession } from "../../domain";

export interface DeleteWorkoutResult {
  deletedId: Id;
  /**
   * État de l'instance planifiée après la suppression, si la séance y
   * était rattachée : `À venir` de nouveau, ou toujours `Faite` parce
   * qu'une autre réalisation lui reste rattachée.
   */
  plannedSession?: PlannedSession;
}

/**
 * Supprime une séance réalisée (§14, v2.9) : la seule suppression d'une
 * réalisation, depuis son récapitulatif, derrière une confirmation.
 * Rien d'autre n'est touché — ni le modèle, ni les autres séances ;
 * l'historique, la progression et `Dernière fois` se recalculent sur ce
 * qui reste, car rien n'est mis en cache. Une séance en cours ne se
 * supprime pas : elle se termine ou s'arrête.
 */
export async function deleteWorkout(
  workoutId: Id,
  now: string = new Date().toISOString(),
): Promise<DeleteWorkoutResult> {
  const workout = await getWorkout(workoutId);

  if (!workout) {
    throw new Error("Séance réalisée introuvable");
  }

  if (workout.status !== "completed") {
    throw new Error("Une séance en cours ne se supprime pas : terminez-la ou arrêtez-la");
  }

  await deleteWorkoutRecord(workoutId);

  if (!workout.plannedSessionId) {
    return { deletedId: workoutId };
  }

  const plannedSession = await getPlannedSession(workout.plannedSessionId);

  if (!plannedSession) {
    return { deletedId: workoutId };
  }

  /* D'autres réalisations rattachées à la même instance ? La plus
     récente devient sa référence ; sinon l'instance redevient À venir. */
  const remaining = (await getWorkoutsByPlannedSession(plannedSession.id))
    .filter((item) => item.status === "completed")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const next: PlannedSession = remaining[0]
    ? { ...plannedSession, status: "done", workoutId: remaining[0].id, updatedAt: now }
    : (() => {
        const reset: PlannedSession = { ...plannedSession, status: "upcoming", updatedAt: now };
        delete reset.workoutId;
        return reset;
      })();

  await savePlannedSession(next);

  return { deletedId: workoutId, plannedSession: next };
}
