import type { Id } from "./exercise";

/**
 * Alimentation (module Corps + Alimentation, phase 1, 05/10/2026).
 *
 * - `Food` : un aliment réutilisable, valeurs pour une quantité de
 *   référence (100 g, 1 pièce, 1 portion) ;
 * - `MealTemplate` : un repas favori, vraie composition d'aliments avec
 *   leurs quantités (ajustables à l'ajout) ;
 * - `FoodLogEntry` : ce qui a été mangé, un jour, à un repas — calories et
 *   macros **figées à la saisie** : modifier ensuite un aliment ou un
 *   favori ne réécrit jamais le passé (comme une séance garde sa copie du
 *   modèle) ;
 * - `NutritionDay` : la journée déclarée complète. Une journée non
 *   renseignée n'est jamais une journée à 0 kcal.
 */

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner" | "extra";

export type FoodUnit = "g" | "ml" | "piece" | "portion";

/** Calories obligatoires ; macros facultatives (un extra peut n'avoir qu'une estimation de calories). */
export interface Nutrients {
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

export interface Food {
  id: Id;
  name: string;
  unit: FoodUnit;
  /** Quantité à laquelle se rapportent `nutrients` (100 pour 100 g, 1 pour une pièce). */
  referenceQuantity: number;
  nutrients: Nutrients;
  /** Valeurs approximatives. */
  estimated?: true;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface MealTemplateItem {
  id: Id;
  foodId: Id;
  /** Dans l'unité de l'aliment. */
  quantity: number;
}

export interface MealTemplate {
  id: Id;
  name: string;
  defaultSlot?: MealSlot;
  items: MealTemplateItem[];
  position: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface FoodLogEntry {
  id: Id;
  /** Jour local : YYYY-MM-DD. */
  date: string;
  slot: MealSlot;
  name: string;
  quantity: number;
  unit: FoodUnit;
  /** Figées à la saisie. */
  nutrients: Nutrients;
  /** Valeurs estimées (extra approximatif). */
  estimated?: true;
  /** Origine, pour information : jamais relue pour recalculer. */
  foodId?: Id;
  mealTemplateId?: Id;
  /** Les lignes ajoutées ensemble depuis un même favori. */
  groupId?: Id;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionDay {
  /** Clé : le jour local, YYYY-MM-DD. */
  date: string;
  complete: boolean;
  updatedAt: string;
}

/** Bornes facultatives d'un repère : rien n'est codé en dur. */
export interface NutritionRange {
  min?: number;
  max?: number;
}

/** Repères configurables (réglage `nutritionTargets`) ; tous facultatifs. */
export interface NutritionTargets {
  kcalPerDay?: NutritionRange;
  proteinGPerDay?: NutritionRange;
  proteinGPerKg?: NutritionRange;
  carbsGPerDay?: NutritionRange;
  fatGPerDay?: NutritionRange;
  weightKgPerWeek?: NutritionRange;
  weightPctPerWeek?: NutritionRange;
}
