import {
  getExercise,
  saveExercise,
} from "../../db/repositories/exerciseRepository";
import { exerciseCatalog } from "./exerciseCatalog";

/**
 * Synchronise le catalogue officiel avec la base locale.
 *
 * - un exercice absent est ajouté ;
 * - un exercice existant n'est jamais remplacé ;
 * - seuls les champs éditoriaux encore absents sont complétés.
 *
 * Ainsi, les personnalisations de l'utilisateur sont conservées.
 */
export async function seedExerciseCatalog(): Promise<void> {
  for (const exercise of exerciseCatalog) {
    const existing = await getExercise(exercise.id);

    if (!existing) {
      await saveExercise(exercise);
      continue;
    }

    const needsMetadataUpgrade =
      (existing.technique === undefined &&
        exercise.technique !== undefined) ||
      (existing.description === undefined &&
        exercise.description !== undefined) ||
      (existing.advice === undefined &&
        exercise.advice !== undefined) ||
      (existing.muscles === undefined &&
        exercise.muscles !== undefined);

    if (!needsMetadataUpgrade) {
      continue;
    }

    const upgraded = {
      ...existing,

      ...(existing.technique === undefined &&
      exercise.technique !== undefined
        ? { technique: exercise.technique }
        : {}),

      ...(existing.description === undefined &&
      exercise.description !== undefined
        ? { description: exercise.description }
        : {}),

      ...(existing.advice === undefined &&
      exercise.advice !== undefined
        ? { advice: exercise.advice }
        : {}),

      ...(existing.muscles === undefined &&
      exercise.muscles !== undefined
        ? { muscles: exercise.muscles }
        : {}),
    };

    await saveExercise(upgraded);
  }
}