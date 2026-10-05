import { describe, expect, it } from "vitest";
import type { Food, FoodLogEntry, NutritionDay } from "../models";
import {
  calculateNutrients,
  dayState,
  dayTotals,
  entryFromFood,
  entryIsConsistent,
  estimatedExtraEntry,
  foodError,
  formatGrams,
  formatKcal,
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  quantityError,
  usableForAnalysis,
  withQuantity,
} from "./nutritionRules";

/**
 * Alimentation, phase 3A.1 — règles pures.
 * - Une ligne du journal fige une base de calcul (`basis`) à l'ajout :
 *   `nutrients = basis.nutrients × quantité ÷ basis.referenceQuantity`,
 *   toujours depuis la base, jamais depuis les valeurs précédentes.
 * - Aucune valeur arrondie n'est enregistrée ; l'arrondi est d'affichage.
 * - Une journée sans ligne est « non renseignée », jamais 0 kcal ; seule
 *   une journée déclarée complète compte pour les analyses.
 */

const T = "2026-10-05T07:00:00.000Z";
const T2 = "2026-10-05T08:00:00.000Z";

const FROMAGE_BLANC: Food = {
  id: "food-fb", name: "Fromage blanc 0 %", unit: "g", referenceQuantity: 100,
  nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 }, favorite: true, defaultQuantity: 250,
  status: "active", createdAt: T, updatedAt: T,
};
/** Des valeurs d'étiquette qui ne tombent pas juste : 1/3, 0,1 + 0,2… */
const AVOINE: Food = {
  id: "food-av", name: "Flocons d'avoine", unit: "g", referenceQuantity: 30,
  nutrients: { kcal: 113.7, proteinG: 4.13, carbsG: 17.9, fatG: 2.1 },
  status: "active", createdAt: T, updatedAt: T,
};

function fromFood(food: Food, quantity: number, id = "e1"): FoodLogEntry {
  return entryFromFood(food, { id, date: "2026-10-05", slot: "breakfast", quantity, now: T });
}

describe("calcul depuis la base", () => {
  it("valeurs = base × quantité ÷ quantité de référence, macros absentes restent absentes, rien d'arrondi", () => {
    expect(calculateNutrients({ referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 } }, 250)).toEqual({
      kcal: (46 * 250) / 100, proteinG: (8 * 250) / 100, carbsG: (3.9 * 250) / 100, fatG: (0.1 * 250) / 100,
    });
    expect(calculateNutrients({ referenceQuantity: 1, nutrients: { kcal: 320 } }, 2)).toEqual({ kcal: 640 });
    const odd = calculateNutrients(AVOINE, 47);
    expect(odd.kcal).toBe((113.7 * 47) / 30);
    expect(Number.isInteger(odd.kcal * 10)).toBe(false);
  });

  it("ligne depuis un aliment : base copiée (pas une référence), nom, unité, origine ; modifier l'aliment ensuite ne change rien", () => {
    const food: Food = structuredClone(FROMAGE_BLANC);
    const entry = fromFood(food, 250);
    expect(entry).toEqual({
      id: "e1", date: "2026-10-05", slot: "breakfast", name: "Fromage blanc 0 %", quantity: 250, unit: "g",
      basis: { referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 } },
      nutrients: calculateNutrients({ referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 } }, 250),
      foodId: "food-fb", createdAt: T, updatedAt: T,
    });
    const snapshot = structuredClone(entry);
    food.nutrients.kcal = 60;
    food.nutrients.proteinG = 10;
    food.referenceQuantity = 125;
    food.name = "Fromage blanc 3 %";
    expect(entry).toEqual(snapshot);
    expect(entryIsConsistent(entry)).toBe(true);
  });

  it("250 → 300 → 200 → 250 : exactement le résultat du calcul direct de 250 depuis la base", () => {
    const initial = fromFood(AVOINE, 250);
    let entry = initial;
    for (const quantity of [300, 200, 250]) entry = withQuantity(entry, quantity, T2);
    expect(entry.nutrients).toEqual(calculateNutrients(initial.basis, 250));
    expect(entry.nutrients).toEqual(initial.nutrients);
    expect(entry.basis).toEqual(initial.basis);
    expect({ ...entry, updatedAt: T }).toEqual(initial);
    expect(entry.updatedAt).toBe(T2);
  });

  it("invariant sur une longue suite de changements : nutrients === calcul(base, quantité courante), base immuable", () => {
    const initial = fromFood(AVOINE, 47);
    let entry = initial;
    let seed = 7;
    for (let step = 0; step < 500; step += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const quantity = 1 + (seed % 9999) / 7;
      entry = withQuantity(entry, quantity, T2);
      expect(entry.nutrients).toEqual(calculateNutrients(initial.basis, quantity));
      expect(entryIsConsistent(entry)).toBe(true);
    }
    expect(entry.basis).toEqual(initial.basis);
    expect(withQuantity(entry, 47, T2).nutrients).toEqual(initial.nutrients);
  });

  it("modifier la quantité ne relit jamais les valeurs précédentes : des nutrients faussés n'influencent pas le recalcul", () => {
    const corrupted: FoodLogEntry = { ...fromFood(FROMAGE_BLANC, 250), nutrients: { kcal: 9999, proteinG: 999 } };
    expect(entryIsConsistent(corrupted)).toBe(false);
    const next = withQuantity(corrupted, 250, T2);
    expect(next.nutrients).toEqual(calculateNutrients(FROMAGE_BLANC, 250));
    expect(entryIsConsistent(next)).toBe(true);
  });

  it("extra estimé : base = valeurs saisies pour 1 portion, explicitement estimé ; ×2 = exactement le double", () => {
    const extra = estimatedExtraEntry({ id: "x1", date: "2026-10-05", nutrients: { kcal: 320, fatG: 18.5 }, now: T });
    expect(extra).toEqual({
      id: "x1", date: "2026-10-05", slot: "extra", name: "Extra", quantity: 1, unit: "portion",
      basis: { referenceQuantity: 1, nutrients: { kcal: 320, fatG: 18.5 } },
      nutrients: { kcal: 320, fatG: 18.5 }, estimated: true, createdAt: T, updatedAt: T,
    });
    expect(withQuantity(extra, 2, T2)).toMatchObject({ nutrients: { kcal: 640, fatG: 37 }, estimated: true });
    expect(estimatedExtraEntry({ id: "x2", date: "2026-10-05", name: " 6 carrés de chocolat ", nutrients: { kcal: 320 }, now: T }).name).toBe("6 carrés de chocolat");
  });

  it("un aliment aux valeurs estimées donne des lignes estimées ; repas favori : chaque ligne a sa base", () => {
    const estimated: Food = { ...FROMAGE_BLANC, id: "food-est", estimated: true };
    expect(fromFood(estimated, 100).estimated).toBe(true);
    const a = entryFromFood(FROMAGE_BLANC, { id: "a", date: "2026-10-05", slot: "breakfast", quantity: 250, now: T, groupId: "g1", mealTemplateId: "meal-1" });
    const b = entryFromFood(AVOINE, { id: "b", date: "2026-10-05", slot: "breakfast", quantity: 60, now: T, groupId: "g1", mealTemplateId: "meal-1" });
    expect([a.basis, b.basis]).toEqual([
      { referenceQuantity: 100, nutrients: FROMAGE_BLANC.nutrients },
      { referenceQuantity: 30, nutrients: AVOINE.nutrients },
    ]);
    expect(a.basis.nutrients).not.toBe(FROMAGE_BLANC.nutrients);
    expect([a.groupId, a.mealTemplateId, b.groupId]).toEqual(["g1", "meal-1", "g1"]);
  });
});

describe("journée", () => {
  const day = (complete: boolean): NutritionDay => ({ date: "2026-10-05", complete, updatedAt: T });

  it("trois états : non renseignée (aucune ligne, même cochée), en cours, complète ; seule la complète compte", () => {
    const entries = [fromFood(FROMAGE_BLANC, 250)];
    expect(dayState([], undefined)).toBe("unrecorded");
    expect(dayState([], day(true))).toBe("unrecorded");
    expect(dayState(entries, undefined)).toBe("in_progress");
    expect(dayState(entries, day(false))).toBe("in_progress");
    expect(dayState(entries, day(true))).toBe("complete");
    expect(usableForAnalysis("unrecorded")).toBe(false);
    expect(usableForAnalysis("in_progress")).toBe(false);
    expect(usableForAnalysis("complete")).toBe(true);
  });

  it("totaux en pleine précision, macros manquantes comptées à part ; journée vide : aucun total (jamais 0 kcal)", () => {
    const a = fromFood(AVOINE, 47, "a");
    const b = fromFood(AVOINE, 13, "b");
    const extra = estimatedExtraEntry({ id: "x", date: "2026-10-05", nutrients: { kcal: 320 }, now: T });
    const totals = dayTotals([a, b, extra])!;
    expect(totals.kcal).toBe(a.nutrients.kcal + b.nutrients.kcal + 320);
    expect(totals.proteinG).toBe(a.nutrients.proteinG! + b.nutrients.proteinG!);
    expect(totals.entriesWithoutMacros).toEqual({ proteinG: 1, carbsG: 1, fatG: 1 });
    expect(totals.estimatedEntries).toBe(1);
    expect(dayTotals([])).toBeUndefined();
  });

  it("affichage seulement : kcal à l'unité, macros au dixième, à la française", () => {
    /* Espace fine insécable des milliers (typographie française de Intl). */
    expect(formatKcal(1449.6)).toBe("1 450 kcal");
    expect(formatKcal(115)).toBe("115 kcal");
    expect(formatGrams(112.25)).toBe("112,3 g");
    expect(formatGrams(20)).toBe("20,0 g");
    expect(formatKcal(undefined)).toBe("—");
  });

  it("les cinq repas, dans l'ordre", () => {
    expect(MEAL_SLOTS).toEqual(["breakfast", "lunch", "snack", "dinner", "extra"]);
    expect(MEAL_SLOTS.map((slot) => MEAL_SLOT_LABELS[slot])).toEqual(["Petit-déjeuner", "Déjeuner", "Collation", "Dîner", "Extras"]);
  });
});

describe("validation", () => {
  it("aliment : nom, unité, quantité de référence, kcal, macros, quantité habituelle", () => {
    expect(foodError(FROMAGE_BLANC)).toBeUndefined();
    expect(foodError(AVOINE)).toBeUndefined();
    expect(foodError({ ...FROMAGE_BLANC, name: "  " })).toBe("Nom de l'aliment : obligatoire.");
    expect(foodError({ ...FROMAGE_BLANC, unit: "kg" as never })).toBe("Unité inconnue.");
    expect(foodError({ ...FROMAGE_BLANC, referenceQuantity: 0 })).toBe("Quantité de référence : supérieure à 0.");
    expect(foodError({ ...FROMAGE_BLANC, nutrients: { kcal: -1 } })).toBe("Calories : entre 0 et 10000.");
    expect(foodError({ ...FROMAGE_BLANC, nutrients: { kcal: Number.NaN } })).toBe("Calories : entre 0 et 10000.");
    expect(foodError({ ...FROMAGE_BLANC, nutrients: { kcal: 46, proteinG: -2 } })).toBe("Protéines : entre 0 et 1000 g.");
    expect(foodError({ ...FROMAGE_BLANC, defaultQuantity: 0 })).toBe("Quantité habituelle : supérieure à 0.");
    const { defaultQuantity: _unused, favorite: _alsoUnused, ...plain } = FROMAGE_BLANC;
    void _unused;
    void _alsoUnused;
    expect(foodError(plain)).toBeUndefined();
  });

  it("quantité consommée : strictement positive, finie, raisonnable", () => {
    expect(quantityError(250)).toBeUndefined();
    expect(quantityError(0.5)).toBeUndefined();
    expect(quantityError(0)).toBe("Quantité : supérieure à 0.");
    expect(quantityError(-3)).toBe("Quantité : supérieure à 0.");
    expect(quantityError(Number.POSITIVE_INFINITY)).toBe("Quantité : supérieure à 0.");
    expect(quantityError(20000)).toBe("Quantité : au plus 10000.");
  });
});
