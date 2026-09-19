import type { SessionCategory, WorkoutKind, WorkoutSession } from "../models";

/**
 * Nature d'une séance (conception v1.5, § 2.2 et § 11.3) — la règle unique.
 *
 * - `kind` est posé au démarrage, dérivé de la catégorie du modèle (aucun
 *   choix pour une instance planifiée) ou du choix explicite d'une séance
 *   libre ; il n'est jamais modifié après la clôture.
 * - **Absent = entraînement** : toutes les séances antérieures au lot 2
 *   gardent leur traitement statistique sans réécriture.
 * - Pour une séance **faite**, c'est `kind` qui fait foi, jamais la
 *   catégorie du modèle (modifiable après coup) ; la catégorie ne sert
 *   qu'aux instances planifiées non faites.
 */

export const ASSESSMENT_CATEGORY: SessionCategory = "Bilan de mobilité";

export function isAssessmentCategory(category: SessionCategory | undefined): boolean {
  return category === ASSESSMENT_CATEGORY;
}

export function kindForCategory(category: SessionCategory): WorkoutKind {
  return isAssessmentCategory(category) ? "mobility_assessment" : "training";
}

export function workoutKindOf(workout: Pick<WorkoutSession, "kind">): WorkoutKind {
  return workout.kind ?? "training";
}

export function isMobilityAssessment(workout: Pick<WorkoutSession, "kind">): boolean {
  return workoutKindOf(workout) === "mobility_assessment";
}
