import "fake-indexeddb/auto";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEW_IN_V4 } from "../../db/database";
import type { BodyMeasurement, Food, FoodLogEntry, MealTemplate, NutritionDay, WeightEntry } from "../../domain";
import { calculateNutrients } from "../../domain/rules/nutritionRules";
import { canonicalStringify } from "./canonicalJson";
import { readBackup, serializeBackup } from "./exportBackup";
import { parseBackup, restoreInto } from "./restoreBackup";
import { CoachJmDatabaseV3, createTestDatabase, uniqueTestName } from "./testDatabase";

/**
 * Sauvegardes et base v4 (Corps + Alimentation, phase 1) :
 * - une ancienne sauvegarde (sans corps ni alimentation) se restaure
 *   telle quelle dans une base v4 : nouvelles tables vides ;
 * - une sauvegarde v4 contient les nouvelles tables et se restaure à
 *   l'identique (aller-retour, empreintes) ;
 * - une sauvegarde v4 qui contient des données nouvelles est refusée
 *   proprement par une base v3 (ancienne version de l'application).
 */

const opened: Dexie[] = [];
afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});
const keep = <T extends Dexie>(database: T): T => {
  opened.push(database);
  return database;
};

const T = "2026-10-05T07:00:00.000Z";
const CONTEXT = { now: new Date(T), buildTime: T, userAgent: "test", standalone: false, appVersion: "0.9.0" };
const measurement: BodyMeasurement = {
  id: "body-1", date: "2026-10-05", takenAt: "2026-10-05T04:50:00.000Z", device: "renpho", source: "manual", weightReference: true, weightKg: 91.9,
  bmi: 29.3, fatKg: 25.27, fatPct: 27.5, fatFreeKg: 66.63, muscleKg: 62.12, skeletalMuscleKg: 38.06, waterKg: 48.8, boneKg: 4.5, proteinKg: 13.33,
  visceralFat: 10, bmrKcal: 1696, metabolicAge: 60, score: 73,
  segments: { leftArm: { fatKg: 1.6, muscleKg: 3.4 }, rightArm: { fatKg: 1.6, muscleKg: 3.5 }, trunk: { fatKg: 13.1, muscleKg: 29.0 }, leftLeg: { fatKg: 4.4, muscleKg: 10.1 }, rightLeg: { fatKg: 4.5, muscleKg: 10.2 } },
  extra: { "Masse sous-cutanée (%)": 23.4 }, createdAt: T, updatedAt: T,
};
const weight: WeightEntry = { id: "weight-body-2026-10-05", date: "2026-10-05", kg: 91.9, bodyMeasurementId: "body-1", createdAt: T, updatedAt: T };
const food: Food = { id: "food-1", name: "Fromage blanc 0 %", unit: "g", referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 }, status: "active", createdAt: T, updatedAt: T };
const template: MealTemplate = { id: "meal-1", name: "Fromage blanc + fruits rouges + céréales", defaultSlot: "breakfast", items: [{ id: "i1", foodId: "food-1", quantity: 250, unit: "g" }], position: 0, status: "active", createdAt: T, updatedAt: T };
/* Phase 3A.1 : la ligne porte sa base figée ; ses valeurs en pleine précision (3,9 × 250 ÷ 100…). */
const log: FoodLogEntry = {
  id: "log-1", date: "2026-10-05", slot: "breakfast", name: "Fromage blanc 0 %", quantity: 250, unit: "g",
  basis: { referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 } },
  nutrients: calculateNutrients({ referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 } }, 250),
  foodId: "food-1", mealTemplateId: "meal-1", createdAt: T, updatedAt: T,
};
const extra: FoodLogEntry = {
  id: "log-2", date: "2026-10-05", slot: "extra", name: "6 carrés de chocolat", quantity: 1, unit: "portion",
  basis: { referenceQuantity: 1, nutrients: { kcal: 320 } }, nutrients: { kcal: 320 }, estimated: true, createdAt: T, updatedAt: T,
};
const day: NutritionDay = { date: "2026-10-05", complete: true, updatedAt: T };

async function populated() {
  const database = keep(createTestDatabase("coach-jm-v4-backup", 3));
  await database.open();
  await database.bodyMeasurements.add(measurement);
  await database.weightEntries.add(weight);
  await database.foods.add(food);
  await database.mealTemplates.add(template);
  await database.foodLogEntries.bulkAdd([log, extra]);
  await database.nutritionDays.add(day);
  return database;
}

describe("sauvegarde v4", () => {
  it("contient les cinq nouvelles tables ; aller-retour à l'identique dans une base v4 vide, empreintes comprises", async () => {
    const source = await populated();
    const envelope = await readBackup(source, CONTEXT);
    for (const store of NEW_IN_V4) expect(Array.isArray(envelope.stores[store]), store).toBe(true);
    expect(envelope.counts).toMatchObject({ bodyMeasurements: 1, foods: 1, mealTemplates: 1, foodLogEntries: 2, nutritionDays: 1, weightEntries: 1 });

    const parsed = parseBackup(serializeBackup(envelope));
    const target = keep(createTestDatabase("coach-jm-v4-target", 3));
    await target.open();
    await restoreInto(parsed, target);
    for (const store of [...NEW_IN_V4, "weightEntries"]) {
      expect(canonicalStringify(await target.table(store).toArray()), store).toBe(canonicalStringify(envelope.stores[store]));
    }
    expect(canonicalStringify((await readBackup(target, CONTEXT)).stores)).toBe(canonicalStringify(envelope.stores));
  });

  it("refusée proprement par une base v3 (ancienne application) dès qu'elle contient des données nouvelles ; rien n'est écrit", async () => {
    const envelope = await readBackup(await populated(), CONTEXT);
    const old = keep(new CoachJmDatabaseV3(uniqueTestName("coach-jm-v3-target")));
    await old.open();
    const outcome = await restoreInto(parseBackup(serializeBackup(envelope)), old as unknown as Dexie).then(
      () => "restaurée",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    expect(outcome).toBe("Le store bodyMeasurements du fichier n'existe pas dans la base cible");
    for (const table of old.tables) expect(await table.count(), table.name).toBe(0);
  });
});

/* Les sauvegardes réelles de l'utilisateur (v3) : avant la V6 et la plus récente. */
const REAL = ["C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-02-1323.json", "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-04-1806.json"].filter((path) => existsSync(path));

describe("anciennes sauvegardes dans une base v4", () => {
  it.skipIf(REAL.length === 0)("se restaurent telles quelles : stores du fichier identiques, nouvelles tables vides", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const path of REAL) {
      const envelope = parseBackup(await readFile(path, "utf8"));
      for (const store of NEW_IN_V4) expect(envelope.stores[store], `${path} ${store}`).toBeUndefined();
      const target = keep(createTestDatabase("coach-jm-v4-real", 3));
      await target.open();
      const result = await restoreInto(envelope, target);
      expect(result.written.sort()).toEqual(Object.keys(envelope.stores).sort());
      for (const [store, records] of Object.entries(envelope.stores)) {
        const key = String(target.table(store).schema.primKey.keyPath);
        const sort = (list: unknown[]) => [...list].sort((a, b) => String((a as Record<string, unknown>)[key]).localeCompare(String((b as Record<string, unknown>)[key])));
        expect(canonicalStringify(sort(await target.table(store).toArray())), `${path} ${store}`).toBe(canonicalStringify(sort(records)));
      }
      for (const store of NEW_IN_V4) expect(await target.table(store).count(), `${path} ${store}`).toBe(0);
    }
  }, 30000);
});
