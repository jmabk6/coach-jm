import type { SessionCategory } from "../../domain";

/**
 * Les catégories d'un modèle (§5 ; « Bilan de mobilité » : conception v1.5,
 * § 2.2), dans l'ordre d'affichage. `Mixte` viendra plus tard ; elle
 * n'existe pas dans le modèle aujourd'hui.
 */
export const sessionCategories: SessionCategory[] = [
  "Musculation",
  "Cardio",
  "Mobilité",
  "Bilan de mobilité",
];
