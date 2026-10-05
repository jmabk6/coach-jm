import type { Id } from "./exercise";

/**
 * Alimentation (module Corps + Alimentation, phase 1, 05/10/2026).
 *
 * - `Food` : un aliment réutilisable, valeurs pour une quantité de
 *   référence (100 g, 1 pièce, 1 portion) ;
 * - `MealTemplate` : un repas favori, vraie composition d'aliments avec
 *   leurs quantités (ajustables à l'ajout) ;
 * - `FoodLogEntry` : ce qui a été mangé, un jour, à un repas — sa base de
 *   calcul (`basis`) est **copiée à la saisie** et ne change plus ; ses
 *   valeurs se calculent toujours depuis cette base et la quantité courante
 *   (phase 3A.1), jamais arrondies à l'enregistrement : modifier ensuite un
 *   aliment ou un favori ne réécrit jamais le passé ;
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
  /**
   * Unité comptée (`piece`) seulement : son nom affiché, au singulier
   * (« boîte », « barre », « paquet »…) et, facultatif, au pluriel. Aucun
   * pluriel n'est inventé : sans `unitLabelPlural`, le singulier s'affiche.
   */
  unitLabel?: string;
  unitLabelPlural?: string;
  /** Quantité à laquelle se rapportent `nutrients` (100 pour 100 g, 1 pour une pièce). */
  referenceQuantity: number;
  nutrients: Nutrients;
  /** Valeurs approximatives. */
  estimated?: true;
  /** Aliment favori : en tête de la liste d'ajout (phase 3A). */
  favorite?: true;
  /** Quantité proposée d'office à l'ajout, dans l'unité de l'aliment (ex. 125 pour un pot). */
  defaultQuantity?: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

/**
 * Base de calcul d'une ligne du journal : les valeurs de l'aliment (ou de
 * l'extra saisi) pour une quantité de référence, copiées **une seule fois**
 * à l'ajout et immuables ensuite.
 */
export interface NutritionBasis {
  referenceQuantity: number;
  nutrients: Nutrients;
}

export interface MealTemplateItem {
  id: Id;
  foodId: Id;
  /** Dans l'unité de l'aliment. */
  quantity: number;
  /**
   * L'unité de l'aliment quand l'élément a été enregistré (phase 3A.4a) :
   * si l'aliment change d'unité ensuite, l'élément est bloqué au lieu
   * d'ajouter « 320 boîtes ». Rien d'autre n'est figé (nom, valeurs).
   */
  unit: FoodUnit;
  unitLabel?: string;
  unitLabelPlural?: string;
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
  /** Libellés d'unité copiés à l'ajout (phase 3A.3) : renommer l'unité de l'aliment ne change pas le passé. */
  unitLabel?: string;
  unitLabelPlural?: string;
  /** Copiée à l'ajout, jamais modifiée (phase 3A.1). */
  basis: NutritionBasis;
  /** Toujours `calculateNutrients(basis, quantity)`, en pleine précision : l'arrondi n'est qu'un affichage. */
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
