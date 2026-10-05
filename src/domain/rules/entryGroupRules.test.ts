import { describe, expect, it } from "vitest";
import type { Food, FoodLogEntry } from "../models";
import { groupEntries, groupKeyOf, redistributeQuantity } from "./entryGroupRules";
import { calculateNutrients, dayTotals, entryFromFood, estimatedExtraEntry } from "./nutritionRules";

/**
 * Regroupement visuel des lignes (05/10/2026) : uniquement à l'affichage,
 * uniquement dans le même repas du même jour, seulement entre lignes
 * strictement compatibles (même aliment, nom, base, unité, libellés,
 * caractère estimé) ; les estimations jamais. Une nouvelle quantité totale
 * se répartit de la saisie la plus récente vers la plus ancienne.
 */

const THON: Food = {
  id: "f-thon", name: "Thon tomate (leader price)", unit: "g", referenceQuantity: 100,
  nutrients: { kcal: 111, proteinG: 14, carbsG: 3, fatG: 4.6 }, status: "active", createdAt: "x", updatedAt: "x",
};
const TOAST: Food = { ...THON, id: "f-toast", name: "Toasts multi-céréales", nutrients: { kcal: 385, proteinG: 15 } };

function line(food: Food, id: string, minute: number, quantity: number, extra: Partial<FoodLogEntry> = {}): FoodLogEntry {
  const at = `2026-10-05T10:${String(minute).padStart(2, "0")}:00.000Z`;
  return { ...entryFromFood(food, { id, date: "2026-10-05", slot: "lunch", quantity, now: at }), ...extra };
}

describe("regroupement visuel", () => {
  it("même aliment ×2 au même repas : une ligne, quantités et valeurs additionnées, IDs réels dans l'ordre", () => {
    const entries = [line(THON, "a", 1, 160), line(TOAST, "t1", 2, 20), line(THON, "b", 3, 160), line(TOAST, "t2", 4, 20)];
    const groups = groupEntries(entries);
    expect(groups.map((group) => [group.ids, group.quantity])).toEqual([[["a", "b"], 320], [["t1", "t2"], 40]]);
    expect(groups[0]!.nutrients).toEqual({
      kcal: entries[0]!.nutrients.kcal + entries[2]!.nutrients.kcal,
      proteinG: entries[0]!.nutrients.proteinG! + entries[2]!.nutrients.proteinG!,
      carbsG: entries[0]!.nutrients.carbsG! + entries[2]!.nutrients.carbsG!,
      fatG: entries[0]!.nutrients.fatG! + entries[2]!.nutrients.fatG!,
    });
    expect(groups[1]!.nutrients).toEqual({ kcal: entries[1]!.nutrients.kcal + entries[3]!.nutrients.kcal, proteinG: entries[1]!.nutrients.proteinG! + entries[3]!.nutrients.proteinG! });
    expect(groups[0]!.entries[0]).toBe(entries[0]);
  });

  it("jamais regroupées : repas différents, jours différents, bases différentes, nom changé, libellé d'unité, estimations", () => {
    const base = line(THON, "a", 1, 160);
    const dinner = line(THON, "d", 2, 160, { slot: "dinner" });
    const otherDay = line(THON, "o", 3, 160, { date: "2026-10-04" });
    const modified = line({ ...THON, nutrients: { ...THON.nutrients, kcal: 120 } }, "m", 4, 160);
    const renamed = line({ ...THON, name: "Thon à la tomate" }, "r", 5, 160);
    const labelled = line({ ...THON, unit: "piece", unitLabel: "boîte", referenceQuantity: 1 }, "l1", 6, 1);
    const labelledOther = line({ ...THON, unit: "piece", unitLabel: "conserve", referenceQuantity: 1 }, "l2", 7, 1);
    const flagged = line({ ...THON, estimated: true }, "e", 8, 160);
    const extra1 = estimatedExtraEntry({ id: "x1", date: "2026-10-05", slot: "lunch", name: "Restaurant", nutrients: { kcal: 650 }, now: "2026-10-05T10:09:00.000Z" });
    const extra2 = estimatedExtraEntry({ id: "x2", date: "2026-10-05", slot: "lunch", name: "Restaurant", nutrients: { kcal: 650 }, now: "2026-10-05T10:10:00.000Z" });
    const groups = groupEntries([base, dinner, otherDay, modified, renamed, labelled, labelledOther, flagged, extra1, extra2]);
    expect(groups.map((group) => group.ids)).toEqual([["a"], ["d"], ["o"], ["m"], ["r"], ["l1"], ["l2"], ["e"], ["x1"], ["x2"]]);
    expect(groupKeyOf(extra1)).toBeUndefined();
    expect(groupKeyOf(base)).toBe(groupKeyOf(line(THON, "z", 9, 50)));
  });

  it("la provenance (repas favori) n'empêche pas le regroupement ; les totaux du jour ne changent pas", () => {
    const entries = [line(THON, "a", 1, 160, { mealTemplateId: "meal-1", groupId: "g1" }), line(THON, "b", 2, 160)];
    expect(groupEntries(entries).map((group) => group.ids)).toEqual([["a", "b"]]);
    const totals = dayTotals(entries)!;
    const grouped = groupEntries(entries).reduce((sum, group) => sum + group.nutrients.kcal, 0);
    expect(grouped).toBe(totals.kcal);
  });
});

describe("nouvelle quantité totale : de la saisie la plus récente vers la plus ancienne", () => {
  const two = () => [line(THON, "a", 1, 160), line(THON, "b", 2, 160)];

  it("320 → 400 : la plus récente porte la hausse", () => {
    expect(redistributeQuantity(two(), 400)).toEqual({ quantities: { b: 240 }, deleted: [] });
  });

  it("320 → 250 : la plus récente porte la baisse", () => {
    expect(redistributeQuantity(two(), 250)).toEqual({ quantities: { b: 90 }, deleted: [] });
  });

  it("320 → 100 : la plus récente tombe à 0 (supprimée), la précédente porte le reste", () => {
    expect(redistributeQuantity(two(), 100)).toEqual({ quantities: { a: 100 }, deleted: ["b"] });
  });

  it("320 → 160 : la plus récente supprimée, l'autre intacte ; total inchangé : rien", () => {
    expect(redistributeQuantity(two(), 160)).toEqual({ quantities: {}, deleted: ["b"] });
    expect(redistributeQuantity(two(), 320)).toEqual({ quantities: {}, deleted: [] });
  });

  it("l'ordre suit l'heure de saisie, pas l'ordre reçu ; trois saisies ; total final exact", () => {
    const entries = [line(THON, "c", 3, 100), line(THON, "a", 1, 100), line(THON, "b", 2, 100)];
    const plan = redistributeQuantity(entries, 150);
    expect(plan).toEqual({ quantities: { b: 50 }, deleted: ["c"] });
    const kept = entries.filter((entry) => !plan.deleted.includes(entry.id)).map((entry) => plan.quantities[entry.id] ?? entry.quantity);
    expect(kept.reduce((sum, quantity) => sum + quantity, 0)).toBe(150);
    const decimals = redistributeQuantity([line(THON, "a", 1, 0.1), line(THON, "b", 2, 0.2)], 0.4);
    expect(decimals.quantities.b! + 0.1).toBeCloseTo(0.4, 12);
    expect(decimals.quantities.b).toBe(0.3);
  });

  it("chaque ligne reste recalculable depuis sa base, jamais depuis ses anciennes valeurs", () => {
    const entries = two();
    const plan = redistributeQuantity(entries, 250);
    expect(calculateNutrients(entries[1]!.basis, plan.quantities.b!)).toEqual(calculateNutrients(THON, 90));
  });
});
