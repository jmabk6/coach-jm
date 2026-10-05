import type { Food, FoodLogEntry, Id, MealSlot, MealTemplate, MealTemplateItem, Nutrients } from "../models";
import { groupEntries } from "./entryGroupRules";
import { normalizeSearch } from "./foodLibraryRules";
import { calculateNutrients } from "./nutritionRules";

/**
 * Repas favoris (phase 3A.4a, 05/10/2026) — règles pures.
 *
 * - Un repas favori est un modèle : des aliments de la bibliothèque et
 *   leurs quantités, jamais de total stocké. Ses valeurs s'affichent avec
 *   les valeurs actuelles des aliments.
 * - Un élément est prêt, archivé (aliment archivé) ou d'unité modifiée
 *   (l'aliment n'a plus l'unité mémorisée) : ces deux derniers ne
 *   s'ajoutent jamais, ni en silence ni par une réparation au quotidien.
 * - Créer depuis un repas consommé reprend les quantités totales affichées
 *   par aliment ; estimations, unités anciennes et aliments archivés sont
 *   exclus et cités.
 */

/** Repas habituel possible : aucun, ou l'un des quatre repas (pas Extras). */
export const TEMPLATE_DEFAULT_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

export type TemplateItemState = "ready" | "archived" | "unit_changed" | "missing";

type UnitSnapshot = Pick<MealTemplateItem, "unit" | "unitLabel">;

/** Même unité : même nature et même libellé (le pluriel n'est qu'un affichage). */
export function sameUnit(snapshot: UnitSnapshot, food: Pick<Food, "unit" | "unitLabel">): boolean {
  return snapshot.unit === food.unit && (snapshot.unitLabel ?? null) === (food.unitLabel ?? null);
}

export function templateItemState(item: MealTemplateItem, food: Food | undefined): TemplateItemState {
  if (!food) return "missing";
  if (food.status !== "active") return "archived";
  if (!sameUnit(item, food)) return "unit_changed";
  return "ready";
}

export interface TemplateLine {
  item: MealTemplateItem;
  food?: Food;
  state: TemplateItemState;
  /** Valeurs actuelles pour la quantité de l'élément, seulement s'il est prêt. */
  nutrients?: Nutrients;
}

export interface TemplateView {
  lines: TemplateLine[];
  /** Somme des éléments prêts (jamais stockée). */
  totals: Nutrients;
  readyCount: number;
}

const MACROS = ["proteinG", "carbsG", "fatG"] as const;

function sumNutrients(list: readonly Nutrients[]): Nutrients {
  const total: Nutrients = { kcal: list.reduce((sum, item) => sum + item.kcal, 0) };
  for (const macro of MACROS) {
    if (list.length > 0 && list.every((item) => item[macro] !== undefined)) total[macro] = list.reduce((sum, item) => sum + item[macro]!, 0);
  }
  return total;
}

/** Les éléments d'un repas favori avec leur état et les valeurs actuelles de leurs aliments. */
export function templateLines(template: MealTemplate, foods: ReadonlyMap<Id, Food>, quantities: Readonly<Record<Id, number>> = {}): TemplateView {
  const lines = template.items.map((item): TemplateLine => {
    const food = foods.get(item.foodId);
    const state = templateItemState(item, food);
    const quantity = quantities[item.id] ?? item.quantity;
    return { item, ...(food ? { food } : {}), state, ...(state === "ready" ? { nutrients: calculateNutrients(food!, quantity) } : {}) };
  });
  const ready = lines.filter((line) => line.nutrients !== undefined);
  return { lines, totals: sumNutrients(ready.map((line) => line.nutrients!)), readyCount: ready.length };
}

const byPosition = (a: MealTemplate, b: MealTemplate) => a.position - b.position || a.name.localeCompare(b.name, "fr", { sensitivity: "base" });

/** Écran Ajouter : ceux de ce repas, puis sans repas habituel (dans leur ordre) ; les autres repliés. Jamais d'archivés. */
export function templateSections(templates: readonly MealTemplate[], slot: MealSlot): { primary: MealTemplate[]; others: MealTemplate[] } {
  const active = templates.filter((template) => template.status === "active").sort(byPosition);
  return {
    primary: [...active.filter((template) => template.defaultSlot === slot), ...active.filter((template) => template.defaultSlot === undefined)],
    others: active.filter((template) => template.defaultSlot !== undefined && template.defaultSlot !== slot),
  };
}

/** Recherche dans les noms des repas favoris actifs (sans accents ni casse). */
export function searchTemplates(templates: readonly MealTemplate[], query: string): MealTemplate[] {
  const wanted = normalizeSearch(query);
  return templates.filter((template) => template.status === "active" && normalizeSearch(template.name).includes(wanted)).sort(byPosition);
}

export type SkipReason = "estimation" | "unit_changed" | "archived";

export interface TemplateFromMeal {
  /** Un élément par aliment, quantités additionnées, dans l'ordre du repas. */
  items: Array<{ foodId: Id; quantity: number }>;
  /** Ce qui n'est pas repris, toujours cité. */
  skipped: Array<{ name: string; reason: SkipReason }>;
}

/**
 * Le contenu d'un repas favori tiré d'un repas réellement consommé : les
 * quantités totales affichées (lignes regroupées) par aliment ; un même
 * aliment avec plusieurs bases s'additionne si son unité est celle de
 * l'aliment aujourd'hui. Estimations, lignes d'une ancienne unité et
 * aliments archivés sont exclus et cités.
 */
export function templateFromMeal(entries: readonly FoodLogEntry[], foods: ReadonlyMap<Id, Food>): TemplateFromMeal {
  const result: TemplateFromMeal = { items: [], skipped: [] };
  const skippedKeys = new Set<string>();
  const skip = (name: string, reason: SkipReason) => {
    const key = `${name}|${reason}`;
    if (skippedKeys.has(key)) return;
    skippedKeys.add(key);
    result.skipped.push({ name, reason });
  };
  for (const group of groupEntries(entries)) {
    const first = group.entries[0]!;
    if (first.estimated || first.foodId === undefined) {
      skip(first.name, "estimation");
      continue;
    }
    const food = foods.get(first.foodId);
    if (!food || food.status !== "active") {
      skip(first.name, "archived");
      continue;
    }
    if (!sameUnit(first, food)) {
      skip(first.name, "unit_changed");
      continue;
    }
    const existing = result.items.find((item) => item.foodId === food.id);
    if (existing) existing.quantity = Math.round((existing.quantity + group.quantity) * 1e6) / 1e6;
    else result.items.push({ foodId: food.id, quantity: group.quantity });
  }
  return result;
}
