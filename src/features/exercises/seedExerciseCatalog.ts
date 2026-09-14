import {
  getExercise,
  saveExercise,
} from "../../db/repositories/exerciseRepository";
import { exerciseCatalog } from "./exerciseCatalog";

/**
 * Ajoute uniquement les exercices du catalogue qui
 * n'existent pas encore dans la base locale.
 *
 * Un exercice existant n'est jamais remplacé.
 */
export async function seedExerciseCatalog(): Promise<void> {
  for (const exercise of exerciseCatalog) {
    const existing = await getExercise(exercise.id);

    if (!existing) {
      await saveExercise(exercise);
    }
  }
}