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
 * Retourne la séance actuellement en cours.
 *
 * En V1, Coach JM ne doit avoir qu'une seule séance
 * active à la fois.
 */
export async function getInProgressWorkout(): Promise<
  WorkoutSession | undefined
> {
  return db.workouts
    .where("status")
    .equals("in_progress")
    .first();
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

