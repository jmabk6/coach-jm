import type { WorkoutSession } from "../../domain";

/**
 * Une séance compte si elle est **terminée** et porte au moins une brique
 * réalisée (décision Q2 du 17/09/2026). Une séance arrêtée sans rien avoir
 * validé reste dans l'historique, hors des statistiques. Seule règle
 * gardée de l'ancien écran Progression (lot N) : le résumé du mois s'en
 * sert.
 */
export function isCountedWorkout(workout: WorkoutSession): boolean {
  return (
    workout.status === "completed" &&
    workout.blocks.some((block) => block.kind !== "note" && block.status === "performed")
  );
}
