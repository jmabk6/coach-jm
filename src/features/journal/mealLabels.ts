import type { MealSlot } from "../../domain";
import { MEAL_SLOTS } from "../../domain/rules/nutritionRules";

/** « Ajouter au déjeuner », « à la collation », « aux extras » : bouton + du Journal, titre de l'écran Ajouter. */
export const ADD_LABELS: Record<MealSlot, string> = {
  breakfast: "Ajouter au petit-déjeuner",
  lunch: "Ajouter au déjeuner",
  snack: "Ajouter à la collation",
  dinner: "Ajouter au dîner",
  extra: "Ajouter aux extras",
};

/** Le repas d'une adresse (`?repas=lunch`) ; `undefined` s'il est inconnu. */
export function mealSlotOf(value: string | null): MealSlot | undefined {
  return MEAL_SLOTS.find((slot) => slot === value);
}
