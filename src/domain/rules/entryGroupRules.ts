import type { FoodLogEntry, Id, Nutrients } from "../models";

/**
 * Regroupement visuel des lignes du journal (05/10/2026) — règles pures.
 *
 * - Uniquement à l'affichage : les lignes restent séparées en base, avec
 *   leurs IDs, leurs bases et leurs provenances ; aucun ID de groupe.
 * - Uniquement entre lignes strictement compatibles : même jour, même
 *   repas, même aliment, même nom enregistré, même base de calcul, même
 *   unité et mêmes libellés, non estimées. Les estimations ne sont jamais
 *   regroupées. La provenance (repas favori) n'entre pas dans la clé.
 * - Une nouvelle quantité totale se répartit de la saisie la plus récente
 *   vers la plus ancienne ; chaque ligne se recalcule ensuite depuis sa
 *   propre base.
 */

const NUTRIENT_KEYS = ["kcal", "proteinG", "carbsG", "fatG"] as const;

/** La clé de regroupement d'une ligne ; `undefined` si elle ne se regroupe jamais (estimation, sans aliment). */
export function groupKeyOf(entry: FoodLogEntry): string | undefined {
  if (entry.estimated || entry.foodId === undefined) return undefined;
  const basis = NUTRIENT_KEYS.map((key) => (entry.basis.nutrients[key] === undefined ? null : entry.basis.nutrients[key]));
  return JSON.stringify([
    entry.date,
    entry.slot,
    entry.foodId,
    entry.name,
    entry.unit,
    entry.unitLabel ?? null,
    entry.unitLabelPlural ?? null,
    entry.basis.referenceQuantity,
    basis,
  ]);
}

/** De la plus ancienne à la plus récente : heure de saisie, puis identifiant. */
export function byEntryAge(a: FoodLogEntry, b: FoodLogEntry): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export interface EntryGroup {
  /** Les IDs réels des lignes, de la plus ancienne à la plus récente. */
  ids: Id[];
  entries: FoodLogEntry[];
  quantity: number;
  nutrients: Nutrients;
}

/** Les groupes d'une liste de lignes, dans l'ordre de leur première ligne ; une ligne non regroupable forme son propre groupe. */
export function groupEntries(entries: readonly FoodLogEntry[]): EntryGroup[] {
  const groups: FoodLogEntry[][] = [];
  const byKey = new Map<string, FoodLogEntry[]>();
  for (const entry of entries) {
    const key = groupKeyOf(entry);
    const existing = key === undefined ? undefined : byKey.get(key);
    if (existing) {
      existing.push(entry);
      continue;
    }
    const group = [entry];
    groups.push(group);
    if (key !== undefined) byKey.set(key, group);
  }
  return groups.map((group) => {
    const ordered = [...group].sort(byEntryAge);
    const nutrients: Nutrients = { kcal: 0 };
    for (const key of NUTRIENT_KEYS) {
      if (ordered.every((entry) => entry.nutrients[key] !== undefined)) nutrients[key] = ordered.reduce((sum, entry) => sum + entry.nutrients[key]!, 0);
    }
    return { ids: ordered.map((entry) => entry.id), entries: ordered, quantity: roundQuantity(ordered.reduce((sum, entry) => sum + entry.quantity, 0)), nutrients };
  });
}

/** Arrondi au millionième : supprime le bruit des additions décimales (0,1 + 0,2), jamais une vraie quantité. */
function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export interface QuantityPlan {
  /** Nouvelles quantités des lignes modifiées. */
  quantities: Record<Id, number>;
  /** Lignes tombées à 0 : supprimées. */
  deleted: Id[];
}

/**
 * Répartit une nouvelle quantité totale (> 0) : une hausse va sur la saisie
 * la plus récente ; une baisse retire d'abord sur la plus récente, qui est
 * supprimée si elle tombe à 0, puis sur la précédente. Les autres lignes ne
 * changent pas. Le total final vaut exactement la quantité demandée.
 */
export function redistributeQuantity(entries: readonly FoodLogEntry[], total: number): QuantityPlan {
  const ordered = [...entries].sort(byEntryAge);
  const current = roundQuantity(ordered.reduce((sum, entry) => sum + entry.quantity, 0));
  const plan: QuantityPlan = { quantities: {}, deleted: [] };
  if (total === current) return plan;

  const newest = ordered[ordered.length - 1]!;
  if (total > current) {
    plan.quantities[newest.id] = roundQuantity(newest.quantity + (total - current));
    return plan;
  }

  let toRemove = roundQuantity(current - total);
  for (let index = ordered.length - 1; index >= 0 && toRemove > 0; index -= 1) {
    const entry = ordered[index]!;
    if (entry.quantity <= toRemove) {
      plan.deleted.push(entry.id);
      toRemove = roundQuantity(toRemove - entry.quantity);
    } else {
      plan.quantities[entry.id] = roundQuantity(entry.quantity - toRemove);
      toRemove = 0;
    }
  }
  return plan;
}
