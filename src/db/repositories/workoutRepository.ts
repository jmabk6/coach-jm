import { db } from "../database";
import type { Id, WorkoutSession } from "../../domain";

/**
 * Retourne une réalisation précise.
 */
export async function getWorkout(
  id: Id,
): Promise<WorkoutSession | undefined> {
  return db.workouts.get(id);
}

/**
 * Retourne toutes les réalisations d'une date.
 */
export async function getWorkoutsByDate(
  date: string,
): Promise<WorkoutSession[]> {
  return db.workouts
    .where("date")
    .equals(date)
    .toArray();
}

/**
 * Retourne la séance en train de se faire : `in_progress` et pas encore
 * terminée. En V1, une seule à la fois. Une séance terminée mais pas
 * encore enregistrée (D20) n'en est pas une : elle n'empêche jamais d'en
 * démarrer une autre (voir `getPendingWorkout`).
 */
export async function getInProgressWorkout(): Promise<
  WorkoutSession | undefined
> {
  const open = await db.workouts.where("status").equals("in_progress").toArray();
  return open.find((workout) => workout.endedAt === undefined);
}

/**
 * La séance terminée mais pas encore enregistrée (D20, D21), la plus
 * ancienne s'il y en a plusieurs.
 */
export async function getPendingWorkout(): Promise<WorkoutSession | undefined> {
  const open = await db.workouts.where("status").equals("in_progress").toArray();
  return open
    .filter((workout) => workout.endedAt !== undefined)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
}

/**
 * Historique des séances terminées sur une période.
 */
export async function getCompletedWorkoutsBetween(
  startDate: string,
  endDate: string,
): Promise<WorkoutSession[]> {
  const workouts = await db.workouts
    .where("date")
    .between(startDate, endDate, true, true)
    .toArray();

  return workouts
    .filter((workout) => workout.status === "completed")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * Toutes les séances terminées,
 * de la plus récente à la plus ancienne.
 */
export async function getCompletedWorkouts(): Promise<WorkoutSession[]> {
  const workouts = await db.workouts
    .where("status")
    .equals("completed")
    .toArray();

  return workouts.sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

/**
 * Crée ou sauvegarde l'état courant d'une réalisation.
 *
 * Pendant une séance, cette fonction sera appelée régulièrement
 * afin de permettre une reprise exacte après fermeture de l'app.
 */
export async function saveWorkout(
  workout: WorkoutSession,
): Promise<void> {
  await db.workouts.put(workout);
}

/**
 * Mise à jour partielle d'une réalisation existante.
 */
export async function updateWorkout(
  id: Id,
  changes: Omit<Partial<WorkoutSession>, "id" | "createdAt" | "updatedAt" | "plannedSessionId">,
): Promise<void> {
  const workout = await db.workouts.get(id);

  if (!workout) {
    throw new Error("Séance réalisée introuvable");
  }

  await db.workouts.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Réalisations rattachées à une instance planifiée, toutes dates.
 */
export async function getWorkoutsByPlannedSession(
  plannedSessionId: Id,
): Promise<WorkoutSession[]> {
  return db.workouts
    .where("plannedSessionId")
    .equals(plannedSessionId)
    .toArray();
}

/**
 * Suppression physique d'une réalisation (§14) : réservée à la
 * suppression explicite d'une séance réalisée depuis son récapitulatif.
 */
export async function deleteWorkoutRecord(id: Id): Promise<void> {
  await db.workouts.delete(id);
}
