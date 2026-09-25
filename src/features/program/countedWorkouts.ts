import type { WorkoutSession } from "../../domain";
import { isMobilityAssessment } from "../../domain/rules/workoutKindRules";

/**
 * Une séance compte si elle est **terminée**, porte au moins une brique
 * réalisée (décision Q2 du 17/09/2026) et n'est pas un **bilan de
 * mobilité** (conception v1.5, § 3). Une séance arrêtée sans rien avoir
 * validé reste dans l'historique, hors des statistiques. Seule règle
 * gardée de l'ancien écran Progression (lot N) : le résumé du mois s'en
 * sert.
 */
export function isCountedWorkout(workout: WorkoutSession): boolean {
  return (
    workout.status === "completed" &&
    !isMobilityAssessment(workout) &&
    workout.blocks.some((block) => block.kind !== "note" && block.status === "performed")
  );
}
