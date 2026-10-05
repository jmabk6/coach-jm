import type { Food, FoodUnit, Nutrients } from "../models";
import { unitWord } from "./journalRules";
import { nutrientsError } from "./nutritionRules";

/**
 * Bibliothèque d'aliments (phase 3A.3, 05/10/2026) — règles pures.
 *
 * - Recherche sur toute la bibliothèque active, sans accents ni casse,
 *   favoris d'abord puis ordre alphabétique.
 * - Écran Ajouter : Favoris, Récents (au plus 8, ceux du repas d'abord),
 *   Autres aliments — chaque aliment une seule fois.
 * - Unités : la nature technique (`unit`) et, pour une unité comptée, son
 *   nom (`unitLabel`, pluriel facultatif `unitLabelPlural`). Les choix
 *   proposés sont une table fixe ; aucun pluriel n'est fabriqué.
 */

export type UnitChoiceKey = "g" | "ml" | "piece" | "boite" | "barre" | "paquet" | "pot" | "tranche" | "other";

export interface UnitChoice {
  key: UnitChoiceKey;
  unit: FoodUnit;
  /** Texte de la liste déroulante. */
  text: string;
  label?: string;
  plural?: string;
}

export const UNIT_CHOICES: readonly UnitChoice[] = [
  { key: "g", unit: "g", text: "g" },
  { key: "ml", unit: "ml", text: "ml" },
  { key: "piece", unit: "piece", text: "pièce" },
  { key: "boite", unit: "piece", text: "boîte", label: "boîte", plural: "boîtes" },
  { key: "barre", unit: "piece", text: "barre", label: "barre", plural: "barres" },
  { key: "paquet", unit: "piece", text: "paquet", label: "paquet", plural: "paquets" },
  { key: "pot", unit: "piece", text: "pot", label: "pot", plural: "pots" },
  { key: "tranche", unit: "piece", text: "tranche", label: "tranche", plural: "tranches" },
  { key: "other", unit: "piece", text: "autre…" },
];

const choiceOf = (key: UnitChoiceKey) => UNIT_CHOICES.find((choice) => choice.key === key)!;

/** Valeurs « pour 100 » en g ou ml, « pour 1 » pour une unité comptée. */
export function defaultReferenceQuantity(unit: FoodUnit): number {
  return unit === "g" || unit === "ml" ? 100 : 1;
}

/** Le nom de l'unité d'un aliment pour une quantité (« g », « boîte », « boîtes »). */
export function unitText(food: Pick<Food, "unit" | "unitLabel" | "unitLabelPlural">, quantity: number): string {
  return unitWord(quantity, food.unit, food);
}

/* ——— Recherche et sections ——— */

/** « Crème BRÛLÉE » → « creme brulee ». */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

const byName = (a: Food, b: Food) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
const favoritesFirst = (a: Food, b: Food) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || byName(a, b);

/** Toute la bibliothèque active dont le nom contient la recherche ; favoris d'abord, puis par nom. */
export function searchFoods(foods: readonly Food[], query: string): Food[] {
  const wanted = normalizeSearch(query);
  return foods.filter((food) => food.status === "active" && normalizeSearch(food.name).includes(wanted)).sort(favoritesFirst);
}

export const MAX_RECENTS = 8;

export interface AddScreenSections {
  favorites: Food[];
  recents: Food[];
  others: Food[];
}

/** Favoris, Récents (dans l'ordre reçu : repas d'abord ; sans favori ; au plus 8), Autres : chaque aliment une fois. */
export function addScreenSections(foods: readonly Food[], recentFoods: readonly Food[]): AddScreenSections {
  const active = foods.filter((food) => food.status === "active");
  const activeIds = new Set(active.map((food) => food.id));
  const favorites = active.filter((food) => food.favorite).sort(byName);
  const shown = new Set(favorites.map((food) => food.id));
  const recents: Food[] = [];
  for (const food of recentFoods) {
    if (recents.length >= MAX_RECENTS) break;
    if (!activeIds.has(food.id) || shown.has(food.id)) continue;
    shown.add(food.id);
    recents.push(food);
  }
  const others = active.filter((food) => !shown.has(food.id)).sort(byName);
  return { favorites, recents, others };
}

/* ——— Formulaire d'aliment ——— */

export interface FoodFormValues {
  name: string;
  choice: UnitChoiceKey;
  otherLabel: string;
  otherPlural: string;
  referenceQuantity: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  defaultQuantity: string;
  favorite: boolean;
}

export function emptyFoodForm(name: string): FoodFormValues {
  return {
    name,
    choice: "g",
    otherLabel: "",
    otherPlural: "",
    referenceQuantity: String(defaultReferenceQuantity("g")),
    kcal: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    defaultQuantity: "",
    favorite: false,
  };
}

const input = (value: number | undefined) => (value === undefined ? "" : String(value).replace(".", ","));

/** Le formulaire prérempli d'un aliment existant. */
export function foodFormOf(food: Food): FoodFormValues {
  const preset = UNIT_CHOICES.find((choice) => choice.unit === food.unit && choice.label === food.unitLabel && choice.key !== "other");
  const choice: UnitChoiceKey = food.unit === "portion" ? "other" : preset ? preset.key : food.unit === "piece" && food.unitLabel ? "other" : food.unit === "piece" ? "piece" : food.unit;
  return {
    name: food.name,
    choice,
    otherLabel: choice === "other" ? (food.unitLabel ?? "portion") : "",
    otherPlural: choice === "other" ? (food.unitLabelPlural ?? (food.unit === "portion" ? "portions" : "")) : "",
    referenceQuantity: input(food.referenceQuantity),
    kcal: input(food.nutrients.kcal),
    proteinG: input(food.nutrients.proteinG),
    carbsG: input(food.nutrients.carbsG),
    fatG: input(food.nutrients.fatG),
    defaultQuantity: input(food.defaultQuantity),
    favorite: Boolean(food.favorite),
  };
}

type ReadNumber = { ok: true; value?: number } | { ok: false; message: string };

function readNumber(text: string, label: string): ReadNumber {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return { ok: true };
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, message: `${label} : nombre illisible.` };
  return { ok: true, value: Number(normalized) };
}

export interface FoodValues {
  name: string;
  unit: FoodUnit;
  unitLabel?: string;
  unitLabelPlural?: string;
  referenceQuantity: number;
  nutrients: Nutrients;
  defaultQuantity?: number;
  favorite: boolean;
}

export type ParsedFood = { ok: true; values: FoodValues } | { ok: false; message: string };

export function parseFoodForm(form: FoodFormValues): ParsedFood {
  const name = form.name.trim();
  if (name === "") return { ok: false, message: "Nom de l'aliment : obligatoire." };

  const choice = choiceOf(form.choice);
  let unitLabel = choice.label;
  let unitLabelPlural = choice.plural;
  if (choice.key === "other") {
    unitLabel = form.otherLabel.trim();
    if (unitLabel === "") return { ok: false, message: "Unité : préciser le nom." };
    unitLabelPlural = form.otherPlural.trim() || undefined;
  }

  const reference = readNumber(form.referenceQuantity, "Quantité de référence");
  if (!reference.ok) return reference;
  if (reference.value === undefined || reference.value <= 0) return { ok: false, message: "Quantité de référence : supérieure à 0." };

  const kcal = readNumber(form.kcal, "Calories");
  if (!kcal.ok) return kcal;
  if (kcal.value === undefined) return { ok: false, message: "Calories : obligatoires." };
  const nutrients: Nutrients = { kcal: kcal.value };
  for (const [key, label] of [["proteinG", "Protéines"], ["carbsG", "Glucides"], ["fatG", "Lipides"]] as const) {
    const read = readNumber(form[key], label);
    if (!read.ok) return read;
    if (read.value !== undefined) nutrients[key] = read.value;
  }
  const nutrientsProblem = nutrientsError(nutrients);
  if (nutrientsProblem) return { ok: false, message: nutrientsProblem };

  const habitual = readNumber(form.defaultQuantity, "Quantité habituelle");
  if (!habitual.ok) return habitual;
  if (habitual.value !== undefined && habitual.value <= 0) return { ok: false, message: "Quantité habituelle : supérieure à 0." };

  return {
    ok: true,
    values: {
      name,
      unit: choice.unit,
      ...(unitLabel !== undefined ? { unitLabel } : {}),
      ...(unitLabelPlural !== undefined ? { unitLabelPlural } : {}),
      referenceQuantity: reference.value,
      nutrients,
      ...(habitual.value !== undefined ? { defaultQuantity: habitual.value } : {}),
      favorite: form.favorite,
    },
  };
}

/** La quantité à consommer proposée : l'habituelle si elle est valable, sinon la quantité de référence. */
export function suggestedQuantity(form: Pick<FoodFormValues, "referenceQuantity" | "defaultQuantity">): string {
  const habitual = readNumber(form.defaultQuantity, "");
  if (habitual.ok && habitual.value !== undefined && habitual.value > 0) return form.defaultQuantity.trim();
  return form.referenceQuantity.trim();
}

/** L'aliment à enregistrer depuis le formulaire : `favorite` seulement s'il est coché. */
export function foodFromValues(values: FoodValues, base: { id: string; createdAt: string; status?: Food["status"] }, now: string): Food {
  const { favorite, ...rest } = values;
  return { id: base.id, ...rest, ...(favorite ? { favorite: true as const } : {}), status: base.status ?? "active", createdAt: base.createdAt, updatedAt: now };
}
