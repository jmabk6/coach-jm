import { db } from "../database";
import type { Exercise, Id } from "../../domain";

/**
 * Retourne tous les exercices, actifs et archivés.
 */
export async function getAllExercises(): Promise<Exercise[]> {
  return db.exercises.toArray();
}

/**
 * Retourne uniquement les exercices actifs.
 */
export async function getActiveExercises(): Promise<Exercise[]> {
  return db.exercises
    .where("status")
    .equals("active")
    .toArray();
}

/**
 * Retourne un exercice à partir de son identifiant.
 */
export async function getExercise(
  id: Id,
): Promise<Exercise | undefined> {
  return db.exercises.get(id);
}

/**
 * Crée ou remplace un exercice.
 */
export async function saveExercise(
  exercise: Exercise,
): Promise<void> {
  await db.exercises.put(exercise);
}

/**
 * Archive un exercice.
 *
 * On ne supprime pas physiquement un exercice ayant un historique :
 * la référence doit rester exploitable par les anciennes réalisations.
 */
export async function archiveExercise(
  id: Id,
): Promise<void> {
  const exercise = await db.exercises.get(id);

  if (!exercise) {
    throw new Error("Exercice introuvable");
  }

  await db.exercises.update(id, {
    status: "archived",
    updatedAt: new Date().toISOString(),
  });
}
