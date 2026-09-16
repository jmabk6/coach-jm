import { getWorkout, saveWorkout } from "../../db/repositories/workoutRepository";
import { buildImportedWorkouts } from "./importedWorkouts";

export interface ImportHistoryResult {
  workoutsCreated: number;
  workoutsUpdated: number;
}

/**
 * Importe l'historique de septembre 2026 (feuilles SEMAINE_1/2/3).
 *
 * Idempotent : les séances portent des identifiants fixes et sont
 * réécrites à l'identique. Rien n'est supprimé. Les exercices référencés
 * font partie du catalogue officiel, semé au lancement.
 */
export async function importSeptember2026History(): Promise<ImportHistoryResult> {
  const result: ImportHistoryResult = {
    workoutsCreated: 0,
    workoutsUpdated: 0,
  };

  for (const workout of buildImportedWorkouts()) {
    const existing = await getWorkout(workout.id);

    await saveWorkout(workout);

    if (existing) result.workoutsUpdated += 1;
    else result.workoutsCreated += 1;
  }

  return result;
}
