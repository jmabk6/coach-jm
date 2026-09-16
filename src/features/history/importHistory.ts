import { getExercise, saveExercise } from "../../db/repositories/exerciseRepository";
import { getWorkout, saveWorkout } from "../../db/repositories/workoutRepository";
import { buildImportedWorkouts, importedExercises } from "./importedWorkouts";

export interface ImportHistoryResult {
  workoutsCreated: number;
  workoutsUpdated: number;
  exercisesCreated: number;
}

/**
 * Importe l'historique de septembre 2026 (feuilles SEMAINE_1/2/3).
 *
 * Idempotent : les séances portent des identifiants fixes et sont
 * réécrites à l'identique ; les exercices ajoutés ne sont créés que
 * s'ils n'existent pas encore, pour ne jamais écraser une modification
 * faite depuis l'application. Rien n'est supprimé.
 */
export async function importSeptember2026History(): Promise<ImportHistoryResult> {
  const result: ImportHistoryResult = {
    workoutsCreated: 0,
    workoutsUpdated: 0,
    exercisesCreated: 0,
  };

  for (const exercise of importedExercises) {
    if (!(await getExercise(exercise.id))) {
      await saveExercise(exercise);
      result.exercisesCreated += 1;
    }
  }

  for (const workout of buildImportedWorkouts()) {
    const existing = await getWorkout(workout.id);

    await saveWorkout(workout);

    if (existing) result.workoutsUpdated += 1;
    else result.workoutsCreated += 1;
  }

  return result;
}
