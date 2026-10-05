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
  createFoodWithEntry,
  deleteEntries,
  GROUP_CHANGED_MESSAGE,
  deleteEntry,
  deleteFood,
  EMPTY_DAY_MESSAGE,
  FOOD_IN_USE_MESSAGE,
  getDayEntries,
  getDaySummary,
  getFood,
  getFoods,
  getMealTemplates,
  reactivateFood,
  reactivateMealTemplate,
  reorderMealTemplates,
  archiveMealTemplate,
  recentFoods,
  saveFood,
  saveMealTemplate,
  setDayComplete,
  setFoodFavorite,
  updateEntryQuantity,
  updateGroupQuantity,
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

describe("bibliothèque (phase 3A.3)", () => {
  it("nouvel aliment ajouté au repas en une seule transaction : l'aliment et la ligne, ou rien", async () => {
    const thon = food("f-thon", "Thon tomate", { unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1, nutrients: { kcal: 176, proteinG: 25 }, defaultQuantity: 1 });
    const entry = await createFoodWithEntry(thon, { date: DAY, slot: "lunch", quantity: 1, now: T }, nextId);
    expect(await getFood("f-thon")).toEqual(thon);
    expect(entry).toMatchObject({ slot: "lunch", foodId: "f-thon", quantity: 1, unit: "piece", unitLabel: "boîte", nutrients: { kcal: 176, proteinG: 25 } });
    expect(await getDayEntries(DAY)).toHaveLength(1);

    /* Quantité refusée : ni l'aliment ni la ligne. */
    await expect(createFoodWithEntry(food("f-bad", "Barre"), { date: DAY, slot: "lunch", quantity: 0, now: T }, nextId)).rejects.toThrow("Quantité : supérieure à 0.");
    expect(await getFood("f-bad")).toBeUndefined();
    /* Aliment refusé : rien non plus. */
    await expect(createFoodWithEntry(food("f-bad", " "), { date: DAY, slot: "lunch", quantity: 1, now: T }, nextId)).rejects.toThrow("Nom de l'aliment : obligatoire.");
    expect(await getDayEntries(DAY)).toHaveLength(1);
  });

  it("modifier nom, valeurs, référence, unité et libellé d'un aliment ne touche aucune ancienne ligne", async () => {
    const thon = food("f-thon", "Thon tomate", { unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1, nutrients: { kcal: 176, proteinG: 25 } });
    await saveFood(thon);
    const entry = await addFoodEntry({ date: DAY, slot: "lunch", foodId: "f-thon", quantity: 2, now: T }, nextId);
    const before = (await db.foodLogEntries.get(entry.id))!;
    /* Libellé d'unité renommé, puis passage en grammes avec d'autres valeurs. */
    await saveFood({ ...thon, unitLabel: "conserve", unitLabelPlural: "conserves", updatedAt: T2 });
    expect(await db.foodLogEntries.get(entry.id)).toEqual(before);
    const { unitLabel: _label, unitLabelPlural: _plural, ...withoutLabels } = thon;
    void _label;
    void _plural;
    await saveFood({ ...withoutLabels, name: "Thon à la tomate", unit: "g", referenceQuantity: 100, nutrients: { kcal: 130, proteinG: 18 }, updatedAt: T2 });
    expect(await db.foodLogEntries.get(entry.id)).toEqual(before);
    /* Une nouvelle consommation prend les nouvelles valeurs. */
    const after = await addFoodEntry({ date: DAY, slot: "dinner", foodId: "f-thon", quantity: 100, now: T2 }, nextId);
    expect(after).toMatchObject({ name: "Thon à la tomate", unit: "g", nutrients: { kcal: 130 } });
  });

  it("libellé d'unité réservé aux unités comptées ; archiver puis réactiver", async () => {
    await expect(saveFood(food("f-g", "Riz", { unitLabel: "boîte" }))).rejects.toThrow("Libellé d'unité : seulement pour une unité comptée.");
    await saveFood(food("f-r", "Riz"));
    await archiveFood("f-r", T2);
    expect((await getFoods()).map((item) => item.id)).toEqual([]);
    await reactivateFood("f-r", T2);
    expect(await getFood("f-r")).toMatchObject({ status: "active", updatedAt: T2 });
  });
});

describe("groupes de lignes (regroupement visuel)", () => {
  const thon = () => food("f-thon", "Thon tomate (leader price)", { nutrients: { kcal: 111, proteinG: 14, carbsG: 3, fatG: 4.6 } });

  async function twoThons() {
    await saveFood(thon());
    await saveMealTemplate({ id: "meal-1", name: "Midi", items: [{ id: "i", foodId: "f-thon", quantity: 160 }], position: 0, status: "active", createdAt: T, updatedAt: T });
    const [fromTemplate] = await addMealTemplateEntries({ date: DAY, slot: "lunch", mealTemplateId: "meal-1", now: "2026-10-05T11:00:00.000Z" }, nextId);
    const manual = await addFoodEntry({ date: DAY, slot: "lunch", foodId: "f-thon", quantity: 160, now: "2026-10-05T11:05:00.000Z" }, nextId);
    return { first: fromTemplate!, second: manual };
  }

  it("320 → 400, 250, 100 : la plus récente d'abord ; bases, IDs et provenances intacts ; chaque ligne = calcul(base, quantité)", async () => {
    const { first, second } = await twoThons();
    const ids = [first.id, second.id];

    await updateGroupQuantity(ids, 400, T2);
    expect((await db.foodLogEntries.get(first.id))!).toEqual(first);
    expect(await db.foodLogEntries.get(second.id)).toEqual({ ...second, quantity: 240, nutrients: calculateNutrients(second.basis, 240), updatedAt: T2 });

    await updateGroupQuantity(ids, 250, T2);
    expect((await db.foodLogEntries.get(second.id))!.quantity).toBe(90);
    expect((await db.foodLogEntries.get(first.id))!).toEqual(first);

    await updateGroupQuantity(ids, 100, T2);
    expect(await db.foodLogEntries.get(second.id)).toBeUndefined();
    const kept = (await db.foodLogEntries.get(first.id))!;
    expect(kept).toEqual({ ...first, quantity: 100, nutrients: calculateNutrients(first.basis, 100), updatedAt: T2 });
    /* La provenance du repas favori reste sur sa ligne, telle quelle. */
    expect([kept.mealTemplateId, kept.groupId]).toEqual([first.mealTemplateId, first.groupId]);
    expect(entryIsConsistent(kept)).toBe(true);
    expect(await db.foodLogEntries.count()).toBe(1);
  });

  it("quantité nulle refusée ; groupe changé entre ouverture et validation (ligne disparue ou incompatible) : refus sans aucune écriture", async () => {
    const { first, second } = await twoThons();
    await expect(updateGroupQuantity([first.id, second.id], 0, T2)).rejects.toThrow("Quantité : supérieure à 0.");

    await db.foodLogEntries.put({ ...second, name: "Autre thon" });
    const before = await db.foodLogEntries.toArray();
    await expect(updateGroupQuantity([first.id, second.id], 250, T2)).rejects.toThrow(GROUP_CHANGED_MESSAGE);
    await expect(deleteEntries([first.id, second.id])).rejects.toThrow(GROUP_CHANGED_MESSAGE);
    expect(await db.foodLogEntries.toArray()).toEqual(before);

    await db.foodLogEntries.delete(second.id);
    await expect(updateGroupQuantity([first.id, second.id], 250, T2)).rejects.toThrow(GROUP_CHANGED_MESSAGE);
    await expect(deleteEntries([first.id, second.id])).rejects.toThrow(GROUP_CHANGED_MESSAGE);
    expect(await db.foodLogEntries.get(first.id)).toEqual(first);
  });

  it("supprimer un groupe : toutes ses lignes en une fois ; dernière ligne du jour : journée « non renseignée »", async () => {
    const { first, second } = await twoThons();
    await setDayComplete(DAY, true, T2);
    await deleteEntries([first.id, second.id]);
    expect(await db.foodLogEntries.count()).toBe(0);
    expect(await db.nutritionDays.get(DAY)).toBeUndefined();
    expect((await getDaySummary(DAY)).state).toBe("unrecorded");
  });

  it("une ligne seule passe aussi par le groupe : comportement inchangé", async () => {
    await saveFood(thon());
    const only = await addFoodEntry({ date: DAY, slot: "dinner", foodId: "f-thon", quantity: 160, now: T }, nextId);
    await updateGroupQuantity([only.id], 200, T2);
    expect(await db.foodLogEntries.get(only.id)).toEqual({ ...only, quantity: 200, nutrients: calculateNutrients(only.basis, 200), updatedAt: T2 });
  });
});

describe("repas favoris (phase 3A.4a)", () => {
  const thon = () => food("f-thon", "Thon tomate (leader price)", { nutrients: { kcal: 111, proteinG: 14, carbsG: 3, fatG: 4.6 } });
  const toast = () => food("f-toast", "Toasts multi-céréales", { nutrients: { kcal: 385, proteinG: 15 } });
  const draft = (extra: Partial<Parameters<typeof saveMealTemplate>[0]> = {}) => ({
    id: "m-thon", name: "Déjeuner thon", defaultSlot: "lunch" as const, position: 0, status: "active" as const, createdAt: T, updatedAt: T,
    items: [{ id: "i1", foodId: "f-thon", quantity: 320 }, { id: "i2", foodId: "f-toast", quantity: 40 }],
    ...extra,
  });

  it("l'unité de chaque aliment est mémorisée à l'enregistrement ; aucun total stocké ; repas habituel Extras refusé", async () => {
    await saveFood(thon());
    await saveFood(toast());
    await saveMealTemplate(draft());
    const saved = (await getMealTemplates())[0]!;
    expect(saved.items).toEqual([
      { id: "i1", foodId: "f-thon", quantity: 320, unit: "g" },
      { id: "i2", foodId: "f-toast", quantity: 40, unit: "g" },
    ]);
    expect(JSON.stringify(saved)).not.toMatch(/kcal|nutrients/);
    await expect(saveMealTemplate(draft({ id: "m-x", defaultSlot: "extra" }))).rejects.toThrow("Repas habituel : petit-déjeuner, déjeuner, collation ou dîner.");
  });

  it("nouvel élément d'un aliment archivé refusé ; un élément déjà présent dont l'aliment est archivé depuis reste enregistrable", async () => {
    await saveFood(thon());
    await saveFood(toast());
    await saveMealTemplate(draft());
    await archiveFood("f-toast", T2);
    await saveMealTemplate(draft({ name: "Déjeuner thon (midi)" }));
    expect((await getMealTemplates())[0]).toMatchObject({ name: "Déjeuner thon (midi)" });
    await saveFood(food("f-old", "Ancien", { status: "archived" }));
    await expect(saveMealTemplate(draft({ id: "m-2", items: [{ id: "a", foodId: "f-old", quantity: 10 }] }))).rejects.toThrow("Aliment archivé : Ancien");
  });

  it("ajout : base ACTUELLE des aliments ; anciennes lignes jamais réécrites ; le favori ne change pas ; provenance sur chaque ligne", async () => {
    await saveFood(thon());
    await saveFood(toast());
    await saveMealTemplate(draft());
    const template = (await getMealTemplates())[0]!;
    const first = await addMealTemplateEntries({ date: "2026-10-04", slot: "lunch", mealTemplateId: "m-thon", now: T }, nextId);
    const firstStored = await db.foodLogEntries.bulkGet(first.map((entry) => entry.id));

    await saveFood({ ...thon(), nutrients: { kcal: 100, proteinG: 15 }, updatedAt: T2 });
    const second = await addMealTemplateEntries({ date: DAY, slot: "lunch", mealTemplateId: "m-thon", now: T2 }, nextId);
    expect(second[0]).toMatchObject({ foodId: "f-thon", quantity: 320, basis: { referenceQuantity: 100, nutrients: { kcal: 100, proteinG: 15 } }, mealTemplateId: "m-thon" });
    expect(second[0]!.groupId).toBe(second[1]!.groupId);
    expect(second[0]!.groupId).not.toBe(first[0]!.groupId);
    expect(await db.foodLogEntries.bulkGet(first.map((entry) => entry.id))).toEqual(firstStored);
    expect((await getMealTemplates())[0]).toEqual(template);
  });

  it("élément archivé ou d'unité modifiée non décoché : refus sans aucune écriture ; décoché : le reste est ajouté", async () => {
    await saveFood(thon());
    await saveFood(toast());
    await saveMealTemplate(draft());
    await archiveFood("f-toast", T2);
    await expect(addMealTemplateEntries({ date: DAY, slot: "lunch", mealTemplateId: "m-thon", now: T2 }, nextId)).rejects.toThrow("Aliment archivé : Toasts multi-céréales");
    expect(await db.foodLogEntries.count()).toBe(0);
    expect(await addMealTemplateEntries({ date: DAY, slot: "lunch", mealTemplateId: "m-thon", excluded: ["i2"], now: T2 }, nextId)).toHaveLength(1);

    await saveFood({ ...thon(), unit: "piece", unitLabel: "boîte", referenceQuantity: 1, updatedAt: T2 });
    await expect(
      addMealTemplateEntries({ date: DAY, slot: "lunch", mealTemplateId: "m-thon", excluded: ["i2"], quantities: { i1: 1 }, now: T2 }, nextId),
    ).rejects.toThrow("Unité modifiée — corriger le repas favori : Thon tomate (leader price)");
    expect(await db.foodLogEntries.count()).toBe(1);
  });
});

describe("Plus › Repas favoris (phase 3A.4b)", () => {
  const thon = () => food("f-thon", "Thon tomate (leader price)", { nutrients: { kcal: 111, proteinG: 14 } });
  const toast = () => food("f-toast", "Toasts multi-céréales", { nutrients: { kcal: 385, proteinG: 15 } });
  const draft = (id: string, extra: Partial<Parameters<typeof saveMealTemplate>[0]> = {}) => ({
    id, name: id, position: 0, status: "active" as const, createdAt: T, updatedAt: T,
    items: [{ id: `${id}-1`, foodId: "f-thon", quantity: 320 }, { id: `${id}-2`, foodId: "f-toast", quantity: 40 }],
    ...extra,
  });

  it("un même aliment une seule fois par repas favori, garanti par la couche données", async () => {
    await saveFood(thon());
    await saveFood(toast());
    await expect(saveMealTemplate(draft("m", { items: [{ id: "a", foodId: "f-thon", quantity: 1 }, { id: "b", foodId: "f-thon", quantity: 1 }] }))).rejects.toThrow(
      "Un aliment ne peut figurer qu'une fois : Thon tomate (leader price)",
    );
    expect(await db.mealTemplates.count()).toBe(0);
  });

  it("unité modifiée : enregistrement refusé tant que l'élément n'est pas corrigé ; corrigé : nouvelle unité mémorisée, l'ajout au Journal repasse", async () => {
    await saveFood(thon());
    await saveFood(toast());
    await saveMealTemplate(draft("m"));
    await saveFood({ ...thon(), unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1, updatedAt: T2 });
    await expect(saveMealTemplate(draft("m", { name: "Renommé" }))).rejects.toThrow("Corrige ou retire : Thon tomate (leader price)");
    expect((await getMealTemplates())[0]!.name).toBe("m");

    await saveMealTemplate(draft("m", { items: [{ id: "m-1", foodId: "f-thon", quantity: 2, resetUnit: true }, { id: "m-2", foodId: "f-toast", quantity: 40 }] }));
    expect((await getMealTemplates())[0]!.items[0]).toEqual({ id: "m-1", foodId: "f-thon", quantity: 2, unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes" });
    const added = await addMealTemplateEntries({ date: DAY, slot: "lunch", mealTemplateId: "m", now: T2 }, nextId);
    expect(added[0]).toMatchObject({ quantity: 2, unit: "piece", unitLabel: "boîte" });
  });

  it("archivé : lecture seule ; réactivé : actif et en fin de liste", async () => {
    await saveFood(thon());
    await saveFood(toast());
    await saveMealTemplate(draft("a", { position: 0 }));
    await saveMealTemplate(draft("b", { position: 1 }));
    await saveMealTemplate(draft("c", { position: 2 }));
    await archiveMealTemplate("a", T2);
    const archived = (await getMealTemplates({ includeArchived: true })).find((item) => item.id === "a")!;
    await expect(saveMealTemplate({ ...archived, name: "Autre" })).rejects.toThrow("Repas favori archivé : réactive-le avant de le modifier.");
    /* « Annuler » : sa place d'avant. */
    await reactivateMealTemplate("a", T2, { keepPosition: true });
    expect((await getMealTemplates()).map((item) => item.id)).toEqual(["a", "b", "c"]);
    await archiveMealTemplate("a", T2);
    /* Réactivation depuis les archivés : en fin de liste. */
    await reactivateMealTemplate("a", T2);
    expect((await getMealTemplates()).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("réordonner : toutes les positions en une transaction ; liste différente des actifs : refus sans écriture", async () => {
    await saveFood(thon());
    await saveFood(toast());
    for (const [index, id] of ["a", "b", "c"].entries()) await saveMealTemplate(draft(id, { position: index }));
    await reorderMealTemplates(["c", "a", "b"], T2);
    expect((await getMealTemplates()).map((item) => [item.id, item.position])).toEqual([["c", 0], ["a", 1], ["b", 2]]);
    const before = await db.mealTemplates.toArray();
    await expect(reorderMealTemplates(["a", "b"], T2)).rejects.toThrow("La liste a changé : réessaie.");
    expect(await db.mealTemplates.toArray()).toEqual(before);
  });
});
