import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalStringify } from "../features/backup/canonicalJson";
import { CoachJmDatabaseV3, describeSchema, uniqueTestName } from "../features/backup/testDatabase";
import { CoachJmDatabase, DATABASE_VERSION, NEW_IN_V4, STORE_NAMES, VERSION_3_STORES, VERSION_4_STORES } from "./database";

/**
 * Migration v3 → v4 (Corps + Alimentation, phase 1, 05/10/2026) :
 * uniquement des tables nouvelles et vides ; aucune donnée existante n'est
 * lue, transformée ni réécrite. Une base v3 authentique (avec données) est
 * créée sous un nom unique, fermée, puis rouverte avec la vraie classe.
 */

const opened: string[] = [];
const track = (name: string) => {
  opened.push(name);
  return name;
};

afterEach(async () => {
  for (const name of opened.splice(0)) await Dexie.delete(name);
});

const V3_STORES = Object.entries(VERSION_3_STORES).filter(([, schema]) => schema !== null).map(([name]) => name);

/** Contenu canonique des stores ; type minimal, pour ne pas faire comparer les classes Dexie au compilateur. */
interface Readable {
  table(name: string): { toArray(): Promise<unknown[]> };
}

async function dump(database: Readable, stores: readonly string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const store of stores) result[store] = canonicalStringify(await database.table(store).toArray());
  return result;
}

describe("migration v3 → v4", () => {
  it("version 4 : les quinze stores v3 plus cinq nouveaux (corps, aliments, favoris, journal, journées)", () => {
    expect(DATABASE_VERSION).toBe(4);
    expect([...NEW_IN_V4]).toEqual(["bodyMeasurements", "foods", "mealTemplates", "foodLogEntries", "nutritionDays"]);
    expect(STORE_NAMES).toHaveLength(20);
    expect([...STORE_NAMES].sort()).toEqual([...V3_STORES, ...NEW_IN_V4].sort());
    /* Les index des stores v3 ne changent pas. */
    for (const name of V3_STORES) expect(VERSION_4_STORES[name as keyof typeof VERSION_4_STORES], name).toBe(VERSION_3_STORES[name as keyof typeof VERSION_3_STORES]);
  });

  it("base v3 remplie : ouverture en v4, toutes les données identiques, cinq tables nouvelles et vides, index attendus ; réouverture sans changement", async () => {
    const name = track(uniqueTestName("coach-jm-v4"));
    const legacy = new CoachJmDatabaseV3(name);
    await legacy.open();
    expect(legacy.verno).toBe(3);
    await legacy.table("weightEntries").bulkAdd([
      { id: "w1", date: "2026-09-27", kg: 92.4, fatPct: 27.9, muscleKg: 63.0, createdAt: "x", updatedAt: "x" },
      { id: "w2", date: "2026-10-04", kg: 91.6, createdAt: "x", updatedAt: "x" },
    ]);
    await legacy.table("workouts").add({ id: "workout-1", date: "2026-10-04", status: "completed", sessionTemplateId: "v2-muscu-a", blocks: [] });
    await legacy.table("settings").add({ key: "install", value: { tractionV620261004: "x" } });
    const before = await dump(legacy as unknown as Readable, V3_STORES);
    legacy.close();

    const database = new CoachJmDatabase(name);
    await database.open();
    expect(database.verno).toBe(4);
    expect(database.tables.map((table) => table.name).sort()).toEqual([...STORE_NAMES].sort());
    expect(await dump(database as unknown as Readable, V3_STORES)).toEqual(before);
    for (const store of NEW_IN_V4) expect(await database.table(store).count(), store).toBe(0);
    const schema = describeSchema(database);
    expect(schema.bodyMeasurements).toEqual(["pk:id", "date", "device", "takenAt", "updatedAt"]);
    expect(schema.foods).toEqual(["pk:id", "name", "status", "updatedAt"]);
    expect(schema.mealTemplates).toEqual(["pk:id", "name", "position", "status", "updatedAt"]);
    expect(schema.foodLogEntries).toEqual(["pk:id", "date", "date,slot", "foodId", "mealTemplateId", "slot", "updatedAt"]);
    expect(schema.nutritionDays).toEqual(["pk:date", "updatedAt"]);
    expect(schema.weightEntries).toEqual(["pk:id", "&date", "kg", "updatedAt"]);
    database.close();

    const again = new CoachJmDatabase(name);
    await again.open();
    expect(await dump(again as unknown as Readable, V3_STORES)).toEqual(before);
    again.close();
  });
});
