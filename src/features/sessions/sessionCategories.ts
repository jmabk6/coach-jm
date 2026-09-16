import type { SessionCategory } from "../../domain";

/**
 * Les trois catégories explicites d'un modèle (§5), dans l'ordre d'affichage.
 * `Mixte` viendra plus tard ; elle n'existe pas dans le modèle aujourd'hui.
 */
export const sessionCategories: SessionCategory[] = [
  "Musculation",
  "Cardio",
  "Mobilité",
];
