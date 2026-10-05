import type { Food, FoodLogEntry, FoodUnit, Id, MealSlot, NutritionBasis, NutritionDay, Nutrients } from "../models";

/**
 * Alimentation (phase 3A.1, 05/10/2026) — règles pures.
 *
 * - Une ligne du journal copie à l'ajout une **base de calcul** (`basis`),
 *   immuable. Ses valeurs sont toujours `calculateNutrients(basis,
 *   quantité)` : un changement de quantité repart de la base, **jamais**
 *   des valeurs précédentes — aucune dérive d'arrondi, et revenir à une
 *   quantité redonne exactement les mêmes valeurs.
 * - Rien n'est arrondi dans les données ; l'arrondi est une règle
 *   d'affichage (kcal à l'unité, macros au dixième).
 * - Une journée sans ligne est « non renseignée », jamais 0 kcal ; seule
 *   une journée déclarée complète compte pour les analyses.
 */

export const MEAL_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "snack", "dinner", "extra"];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit-déjeuner",
  lunch: "Déjeuner",
  snack: "Collation",
  dinner: "Dîner",
  extra: "Extras",
};

export const FOOD_UNITS: readonly FoodUnit[] = ["g", "ml", "piece", "portion"];

const MACROS = ["proteinG", "carbsG", "fatG"] as const;
type Macro = (typeof MACROS)[number];

const MACRO_LABELS: Record<Macro, string> = { proteinG: "Protéines", carbsG: "Glucides", fatG: "Lipides" };

/** Les valeurs pour `quantity` : base × quantité ÷ quantité de référence, sans arrondi ; une macro absente reste absente. */
export function calculateNutrients(basis: NutritionBasis, quantity: number): Nutrients {
  const scale = (value: number) => (value * quantity) / basis.referenceQuantity;
  const result: Nutrients = { kcal: scale(basis.nutrients.kcal) };
  for (const macro of MACROS) {
    const value = basis.nutrients[macro];
    if (value !== undefined) result[macro] = scale(value);
  }
  return result;
}

/** Une copie indépendante de la base : modifier l'aliment ensuite ne la touche jamais. */
function copyBasis(basis: NutritionBasis): NutritionBasis {
  return { referenceQuantity: basis.referenceQuantity, nutrients: { ...basis.nutrients } };
}

export interface EntryFromFoodInput {
  id: Id;
  date: string;
  slot: MealSlot;
  quantity: number;
  now: string;
  groupId?: Id;
  mealTemplateId?: Id;
}

/** Une ligne du journal depuis un aliment : nom, unité et base copiés à cet instant. */
export function entryFromFood(food: Food, input: EntryFromFoodInput): FoodLogEntry {
  const basis = copyBasis({ referenceQuantity: food.referenceQuantity, nutrients: food.nutrients });
  return {
    id: input.id,
    date: input.date,
    slot: input.slot,
    name: food.name,
    quantity: input.quantity,
    unit: food.unit,
    ...(food.unitLabel !== undefined ? { unitLabel: food.unitLabel } : {}),
    ...(food.unitLabelPlural !== undefined ? { unitLabelPlural: food.unitLabelPlural } : {}),
    basis,
    nutrients: calculateNutrients(basis, input.quantity),
    ...(food.estimated ? { estimated: true as const } : {}),
    foodId: food.id,
    ...(input.mealTemplateId !== undefined ? { mealTemplateId: input.mealTemplateId } : {}),
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export interface EstimatedExtraInput {
  id: Id;
  date: string;
  slot?: MealSlot;
  name?: string;
  /** Les valeurs estimées pour une portion ; kcal seules suffisent. */
  nutrients: Nutrients;
  now: string;
}

/** Un extra estimé : base = les valeurs saisies pour 1 portion, explicitement « estimé ». */
export function estimatedExtraEntry(input: EstimatedExtraInput): FoodLogEntry {
  const basis = copyBasis({ referenceQuantity: 1, nutrients: input.nutrients });
  return {
    id: input.id,
    date: input.date,
    slot: input.slot ?? "extra",
    name: input.name?.trim() || "Extra",
    quantity: 1,
    unit: "portion",
    basis,
    nutrients: calculateNutrients(basis, 1),
    estimated: true,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** La ligne à une autre quantité : recalculée depuis sa base, jamais depuis ses valeurs précédentes. */
export function withQuantity(entry: FoodLogEntry, quantity: number, now: string): FoodLogEntry {
  return { ...entry, quantity, nutrients: calculateNutrients(entry.basis, quantity), updatedAt: now };
}

/** Invariant : les valeurs enregistrées sont exactement le calcul depuis la base et la quantité courante. */
export function entryIsConsistent(entry: FoodLogEntry): boolean {
  const expected = calculateNutrients(entry.basis, entry.quantity);
  const keys = (nutrients: Nutrients) => Object.keys(nutrients).sort().join(",");
  if (keys(expected) !== keys(entry.nutrients)) return false;
  return (Object.keys(expected) as Array<keyof Nutrients>).every((key) => Object.is(expected[key], entry.nutrients[key]));
}

export type NutritionDayState = "unrecorded" | "in_progress" | "complete";

/** Non renseignée sans ligne (même déclarée complète) ; complète seulement si déclarée et non vide. */
export function dayState(entries: readonly FoodLogEntry[], day: NutritionDay | undefined): NutritionDayState {
  if (entries.length === 0) return "unrecorded";
  return day?.complete ? "complete" : "in_progress";
}

/** Seules les journées explicitement complètes servent aux moyennes et analyses. */
export function usableForAnalysis(state: NutritionDayState): boolean {
  return state === "complete";
}

export interface DayTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Lignes sans cette macro (extras estimés en kcal seules…) : le total de la macro est partiel. */
  entriesWithoutMacros: Record<Macro, number>;
  estimatedEntries: number;
}

/** Totaux en pleine précision ; `undefined` sans aucune ligne (jamais 0 kcal). */
export function dayTotals(entries: readonly FoodLogEntry[]): DayTotals | undefined {
  if (entries.length === 0) return undefined;
  const totals: DayTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, entriesWithoutMacros: { proteinG: 0, carbsG: 0, fatG: 0 }, estimatedEntries: 0 };
  for (const entry of entries) {
    totals.kcal += entry.nutrients.kcal;
    for (const macro of MACROS) {
      const value = entry.nutrients[macro];
      if (value === undefined) totals.entriesWithoutMacros[macro] += 1;
      else totals[macro] += value;
    }
    if (entry.estimated) totals.estimatedEntries += 1;
  }
  return totals;
}

const kcalFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const gramsFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Affichage : kcal à l'unité (« 1 450 kcal »), « — » sans valeur. */
export function formatKcal(value: number | undefined): string {
  return value === undefined ? "—" : `${kcalFormat.format(value)} kcal`;
}

/** Affichage : macros au dixième (« 112,3 g »). */
export function formatGrams(value: number | undefined): string {
  return value === undefined ? "—" : `${gramsFormat.format(value)} g`;
}

const MAX_QUANTITY = 10000;
const MAX_KCAL = 10000;
const MAX_MACRO_G = 1000;

const positive = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value > 0;

/** Quantité consommée (ou d'un repas favori) : strictement positive, au plus 10000. */
export function quantityError(quantity: number): string | undefined {
  if (!positive(quantity)) return "Quantité : supérieure à 0.";
  if (quantity > MAX_QUANTITY) return `Quantité : au plus ${MAX_QUANTITY}.`;
  return undefined;
}

/** Valeurs nutritionnelles : kcal obligatoires, macros facultatives, bornes raisonnables. */
export function nutrientsError(nutrients: Nutrients): string | undefined {
  if (!Number.isFinite(nutrients.kcal) || nutrients.kcal < 0 || nutrients.kcal > MAX_KCAL) return `Calories : entre 0 et ${MAX_KCAL}.`;
  for (const macro of MACROS) {
    const value = nutrients[macro];
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > MAX_MACRO_G)) return `${MACRO_LABELS[macro]} : entre 0 et ${MAX_MACRO_G} g.`;
  }
  return undefined;
}

/** Un aliment de la bibliothèque : le premier défaut, ou `undefined`. */
export function foodError(food: Food): string | undefined {
  if (typeof food.name !== "string" || food.name.trim() === "") return "Nom de l'aliment : obligatoire.";
  if (!FOOD_UNITS.includes(food.unit)) return "Unité inconnue.";
  for (const label of [food.unitLabel, food.unitLabelPlural]) {
    if (label === undefined) continue;
    if (food.unit !== "piece") return "Libellé d'unité : seulement pour une unité comptée.";
    if (label.trim() === "" || label.length > 30) return "Libellé d'unité : 1 à 30 caractères.";
  }
  if (!positive(food.referenceQuantity) || food.referenceQuantity > MAX_QUANTITY) return "Quantité de référence : supérieure à 0.";
  const nutrients = nutrientsError(food.nutrients);
  if (nutrients) return nutrients;
  if (food.defaultQuantity !== undefined && (!positive(food.defaultQuantity) || food.defaultQuantity > MAX_QUANTITY)) return "Quantité habituelle : supérieure à 0.";
  return undefined;
}
