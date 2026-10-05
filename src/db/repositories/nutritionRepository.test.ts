import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../database";
import type { Food } from "../../domain";
import { calculateNutrients, entryIsConsistent } from "../../domain/rules/nutritionRules";
import { canonicalStringify } from "../../features/backup/canonicalJson";
import { readBackup, readStores, serializeBackup } from "../../features/backup/exportBackup";
import { resetAndRestore } from "../../features/backup/resetAndRestore";
import { parseBackup, restoreInto } from "../../features/backup/restoreBackup";
import { createTestDatabase } from "../../features/backup/testDatabase";
import {
  addEstimatedExtra,
  addFoodEntry,
  addMealTemplateEntries,
  archiveFood,
  deleteEntry,
  deleteFood,
  EMPTY_DAY_MESSAGE,
  FOOD_IN_USE_MESSAGE,
  getDayEntries,
  getDaySummary,
  getFood,
  getFoods,
  getMealTemplates,
  recentFoods,
  saveFood,
  saveMealTemplate,
  setDayComplete,
  setFoodFavorite,
  updateEntryQuantity,
} from "./nutritionRepository";

/**
 * Alimentation, phase 3A.1 — repository des quatre tables (aliments,
 * repas favoris, journal, journées). Toute ligne du journal fige sa base
 * de calcul ; aucune valeur arrondie n'est écrite ; une journée vide ne
 * se déclare pas complète.
 */

const T = "2026-10-05T07:00:00.000Z";
const T2 = "2026-10-05T12:00:00.000Z";
const DAY = "2026-10-05";

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return {
    id, name, unit: "g", referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 },
    status: "active", createdAt: T, updatedAt: T, ...extra,
  };
}

let counter = 0;
const nextId = () => `id-${(counter += 1)}`;

beforeEach(async () => {
  counter = 0;
  db.close();
  await db.delete();
  await db.open();
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("aliments", () => {
  it("création validée, favori et quantité habituelle, liste triée par nom (archivés à part)", async () => {
    await saveFood(food("f-b", "Fromage blanc 0 %", { favorite: true, defaultQuantity: 250 }));
    await saveFood(food("f-a", "Avoine", { unit: "g", referenceQuantity: 30, nutrients: { kcal: 113.7, proteinG: 4.13 } }));
    await saveFood(food("f-c", "Œuf", { unit: "piece", referenceQuantity: 1, nutrients: { kcal: 72, proteinG: 6.3 } }));
    expect((await getFoods()).map((item) => item.name)).toEqual(["Avoine", "Fromage blanc 0 %", "Œuf"]);
    expect(await getFood("f-b")).toMatchObject({ favorite: true, defaultQuantity: 250 });

    await setFoodFavorite("f-a", true, T2);
    expect(await getFood("f-a")).toMatchObject({ favorite: true, updatedAt: T2 });
    await setFoodFavorite("f-b", false, T2);
    expect(await getFood("f-b")).not.toHaveProperty("favorite");

    await expect(saveFood(food("f-x", " "))).rejects.toThrow("Nom de l'aliment : obligatoire.");
    expect(await getFood("f-x")).toBeUndefined();
  });

  it("archiver : hors de la liste active ; supprimer : seulement un aliment jamais utilisé", async () => {
    await saveFood(food("f-1", "Fromage blanc"));
    await saveFood(food("f-2", "Banane"));
    await saveFood(food("f-3", "Jamais utilisé"));
    await addFoodEntry({ date: DAY, slot: "breakfast", foodId: "f-1", quantity: 250, now: T }, nextId);
    await saveMealTemplate({ id: "m-1", name: "Collation", items: [{ id: "i", foodId: "f-2", quantity: 120 }], position: 0, status: "active", createdAt: T, updatedAt: T });

    await expect(deleteFood("f-1")).rejects.toThrow(FOOD_IN_USE_MESSAGE);
    await expect(deleteFood("f-2")).rejects.toThrow(FOOD_IN_USE_MESSAGE);
    await deleteFood("f-3");
    expect(await getFood("f-3")).toBeUndefined();

    await archiveFood("f-1", T2);
    expect((await getFoods()).map((item) => item.id)).toEqual(["f-2"]);
    expect((await getFoods({ includeArchived: true })).map((item) => item.id).sort()).toEqual(["f-1", "f-2"]);
  });
});

describe("journal", () => {
  it("ajout d'un aliment : base figée, valeurs pleine précision ; modifier l'aliment ensuite ne réécrit rien", async () => {
    await saveFood(food("f-av", "Avoine", { referenceQuantity: 30, nutrients: { kcal: 113.7, proteinG: 4.13, carbsG: 17.9, fatG: 2.1 } }));
    const entry = await addFoodEntry({ date: DAY, slot: "breakfast", foodId: "f-av", quantity: 47, now: T }, nextId);
    const stored = (await db.foodLogEntries.get(entry.id))!;
    expect(stored.basis).toEqual({ referenceQuantity: 30, nutrients: { kcal: 113.7, proteinG: 4.13, carbsG: 17.9, fatG: 2.1 } });
    expect(stored.nutrients).toEqual(calculateNutrients(stored.basis, 47));
    expect(stored.nutrients.kcal).toBe((113.7 * 47) / 30);

    await saveFood(food("f-av", "Avoine bio", { referenceQuantity: 40, nutrients: { kcal: 150 } }));
    expect(await db.foodLogEntries.get(entry.id)).toEqual(stored);
  });

  it("250 → 300 → 200 → 250 g en base : identique au calcul direct de 250 g ; la base ne change jamais", async () => {
    await saveFood(food("f-av", "Avoine", { referenceQuantity: 30, nutrients: { kcal: 113.7, proteinG: 4.13, carbsG: 17.9, fatG: 2.1 } }));
    const entry = await addFoodEntry({ date: DAY, slot: "breakfast", foodId: "f-av", quantity: 250, now: T }, nextId);
    const initial = (await db.foodLogEntries.get(entry.id))!;
    for (const quantity of [300, 200, 250]) await updateEntryQuantity(entry.id, quantity, T2);
    const final = (await db.foodLogEntries.get(entry.id))!;
    expect(final.nutrients).toEqual(calculateNutrients(initial.basis, 250));
    expect(final.basis).toEqual(initial.basis);
    expect({ ...final, updatedAt: T }).toEqual(initial);
    expect(entryIsConsistent(final)).toBe(true);

    await expect(updateEntryQuantity(entry.id, 0, T2)).rejects.toThrow("Quantité : supérieure à 0.");
    expect(await db.foodLogEntries.get(entry.id)).toEqual(final);
  });

  it("repas favori : une ligne par aliment, chacune avec sa base, regroupées ; quantités ajustées et aliment retiré pour ce jour", async () => {
    await saveFood(food("f-fb", "Fromage blanc 0 %"));
    await saveFood(food("f-av", "Avoine", { referenceQuantity: 30, nutrients: { kcal: 113.7, proteinG: 4.13 } }));
    await saveFood(food("f-fr", "Fruits rouges", { nutrients: { kcal: 43, carbsG: 7.6 } }));
    await saveMealTemplate({
      id: "m-pdj", name: "Petit-déj habituel", defaultSlot: "breakfast", position: 0, status: "active", createdAt: T, updatedAt: T,
      items: [{ id: "i1", foodId: "f-fb", quantity: 250 }, { id: "i2", foodId: "f-av", quantity: 60 }, { id: "i3", foodId: "f-fr", quantity: 80 }],
    });
    const added = await addMealTemplateEntries(
      { date: DAY, slot: "breakfast", mealTemplateId: "m-pdj", quantities: { i2: 45 }, excluded: ["i3"], now: T },
      nextId,
    );
    expect(added.map((entry) => [entry.name, entry.quantity, entry.basis.referenceQuantity])).toEqual([["Fromage blanc 0 %", 250, 100], ["Avoine", 45, 30]]);
    expect(new Set(added.map((entry) => entry.groupId)).size).toBe(1);
    expect(added.every((entry) => entry.mealTemplateId === "m-pdj" && entryIsConsistent(entry))).toBe(true);
    /* Le favori lui-même ne change pas. */
    expect((await getMealTemplates())[0]!.items.map((item) => item.quantity)).toEqual([250, 60, 80]);
  });

  it("repas favori invalide : refusé sans rien écrire (aucun aliment, aliment inconnu, quantité nulle)", async () => {
    await saveFood(food("f-fb", "Fromage blanc"));
    const base = { id: "m", name: "Repas", position: 0, status: "active" as const, createdAt: T, updatedAt: T };
    await expect(saveMealTemplate({ ...base, items: [] })).rejects.toThrow("Repas favori : au moins un aliment.");
    await expect(saveMealTemplate({ ...base, name: "", items: [{ id: "i", foodId: "f-fb", quantity: 100 }] })).rejects.toThrow("Nom du repas : obligatoire.");
    await expect(saveMealTemplate({ ...base, items: [{ id: "i", foodId: "inconnu", quantity: 100 }] })).rejects.toThrow("Aliment introuvable");
    await expect(saveMealTemplate({ ...base, items: [{ id: "i", foodId: "f-fb", quantity: 0 }] })).rejects.toThrow("Quantité : supérieure à 0.");
    expect(await db.mealTemplates.count()).toBe(0);
  });

  it("extra estimé dans Extras ; lignes du jour dans l'ordre des repas puis de saisie ; suppression", async () => {
    await saveFood(food("f-fb", "Fromage blanc"));
    await addEstimatedExtra({ date: DAY, name: "Chocolat", nutrients: { kcal: 320 }, now: T }, nextId);
    await addFoodEntry({ date: DAY, slot: "dinner", foodId: "f-fb", quantity: 100, now: T }, nextId);
    const breakfast = await addFoodEntry({ date: DAY, slot: "breakfast", foodId: "f-fb", quantity: 250, now: T2 }, nextId);
    await addFoodEntry({ date: "2026-10-06", slot: "breakfast", foodId: "f-fb", quantity: 250, now: T }, nextId);
    expect((await getDayEntries(DAY)).map((entry) => [entry.slot, entry.name])).toEqual([
      ["breakfast", "Fromage blanc"], ["dinner", "Fromage blanc"], ["extra", "Chocolat"],
    ]);
    await expect(addEstimatedExtra({ date: DAY, nutrients: { kcal: 0 }, now: T }, nextId)).rejects.toThrow("Calories estimées : supérieures à 0.");
    await deleteEntry(breakfast.id);
    expect(await getDayEntries(DAY)).toHaveLength(2);
  });

  it("récents : ceux du repas concerné d'abord, du plus récent au plus ancien, sans doublon ni aliment archivé", async () => {
    for (const [id, name] of [["f-1", "Fromage blanc"], ["f-2", "Avoine"], ["f-3", "Poulet"], ["f-4", "Riz"]]) await saveFood(food(id!, name!));
    await addFoodEntry({ date: "2026-10-03", slot: "breakfast", foodId: "f-1", quantity: 250, now: "2026-10-03T07:00:00.000Z" }, nextId);
    await addFoodEntry({ date: "2026-10-04", slot: "breakfast", foodId: "f-2", quantity: 60, now: "2026-10-04T07:00:00.000Z" }, nextId);
    await addFoodEntry({ date: "2026-10-04", slot: "lunch", foodId: "f-3", quantity: 150, now: "2026-10-04T12:00:00.000Z" }, nextId);
    await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-1", quantity: 200, now: T }, nextId);
    await addFoodEntry({ date: "2026-10-05", slot: "lunch", foodId: "f-4", quantity: 80, now: T2 }, nextId);
    expect((await recentFoods("breakfast")).map((item) => item.id)).toEqual(["f-1", "f-2", "f-4", "f-3"]);
    expect((await recentFoods("lunch")).map((item) => item.id)).toEqual(["f-4", "f-3", "f-1", "f-2"]);
    await archiveFood("f-2", T2);
    expect((await recentFoods("breakfast")).map((item) => item.id)).toEqual(["f-1", "f-4", "f-3"]);
  });
});

describe("journée complète", () => {
  it("non renseignée : aucun total, jamais 0 kcal ; ne se déclare pas complète", async () => {
    expect(await getDaySummary(DAY)).toEqual({ date: DAY, state: "unrecorded", entries: [] });
    await expect(setDayComplete(DAY, true, T)).rejects.toThrow(EMPTY_DAY_MESSAGE);
    expect(await db.nutritionDays.count()).toBe(0);
  });

  it("en cours puis complète ; décocher ; supprimer la dernière ligne remet la journée à « non renseignée »", async () => {
    await saveFood(food("f-fb", "Fromage blanc"));
    const entry = await addFoodEntry({ date: DAY, slot: "breakfast", foodId: "f-fb", quantity: 250, now: T }, nextId);
    expect(await getDaySummary(DAY)).toMatchObject({ state: "in_progress", totals: { kcal: 115 } });

    await setDayComplete(DAY, true, T2);
    expect(await getDaySummary(DAY)).toMatchObject({ state: "complete" });
    expect(await db.nutritionDays.get(DAY)).toEqual({ date: DAY, complete: true, updatedAt: T2 });

    await setDayComplete(DAY, false, T2);
    expect((await getDaySummary(DAY)).state).toBe("in_progress");

    await setDayComplete(DAY, true, T2);
    await deleteEntry(entry.id);
    expect(await getDaySummary(DAY)).toEqual({ date: DAY, state: "unrecorded", entries: [] });
    expect(await db.nutritionDays.get(DAY)).toBeUndefined();
    /* Une nouvelle ligne ne ressuscite pas une ancienne déclaration « complète ». */
    await addFoodEntry({ date: DAY, slot: "breakfast", foodId: "f-fb", quantity: 100, now: T2 }, nextId);
    expect((await getDaySummary(DAY)).state).toBe("in_progress");
  });
});

describe("sauvegarde", () => {
  it("aller-retour à l'identique : aliments, favoris, lignes (base et pleine précision), journées", async () => {
    await saveFood(food("f-av", "Avoine", { referenceQuantity: 30, nutrients: { kcal: 113.7, proteinG: 4.13 }, favorite: true, defaultQuantity: 60 }));
    await saveMealTemplate({ id: "m", name: "Pdj", items: [{ id: "i", foodId: "f-av", quantity: 60 }], position: 0, status: "active", createdAt: T, updatedAt: T });
    await addMealTemplateEntries({ date: DAY, slot: "breakfast", mealTemplateId: "m", now: T }, nextId);
    const entry = await addFoodEntry({ date: DAY, slot: "snack", foodId: "f-av", quantity: 47, now: T }, nextId);
    await updateEntryQuantity(entry.id, 33.3, T2);
    await addEstimatedExtra({ date: DAY, nutrients: { kcal: 320 }, now: T }, nextId);
    await setDayComplete(DAY, true, T2);

    const file = parseBackup(serializeBackup(await readBackup(db, { now: new Date(T2), buildTime: "b", userAgent: "t", standalone: true })));
    const target = createTestDatabase("coach-jm-alimentation", 3);
    await target.open();
    await restoreInto(file, target);
    const restored = (await readStores(target)).stores;
    for (const store of ["foods", "mealTemplates", "foodLogEntries", "nutritionDays"]) {
      expect(canonicalStringify(restored[store]), store).toBe(canonicalStringify(file.stores[store]));
      expect((file.stores[store] as unknown[]).length, store).toBeGreaterThan(0);
    }
    expect((restored.foodLogEntries as Array<{ nutrients: { kcal: number } }>).some((row) => !Number.isInteger(row.nutrients.kcal * 100))).toBe(true);
    target.close();
    await Dexie.delete(target.name);
  });

  const path = process.env.COACH_JM_BACKUP;
  it.skipIf(!path)("sauvegarde réelle : restaurée sans erreur ; tables d'alimentation lues sans erreur ; un jour sans saisie reste « non renseigné »", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const file = parseBackup(await readFile(path!, "utf8"));
    await resetAndRestore(file, db);
    expect(await db.foodLogEntries.count()).toBe((file.stores.foodLogEntries ?? []).length);
    expect((await getFoods({ includeArchived: true })).length).toBe((file.stores.foods ?? []).length);
    if ((file.stores.foodLogEntries ?? []).length === 0) expect((await getDaySummary(DAY)).state).toBe("unrecorded");
  });
});
