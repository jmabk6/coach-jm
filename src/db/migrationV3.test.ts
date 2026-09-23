import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import Dexie, { type Transaction } from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkoutSession } from "../domain";
import { canonicalStringify } from "../features/backup/canonicalJson";
import { parseBackup, restoreBackup } from "../features/backup/restoreBackup";
import { CoachJmDatabaseV2, describeSchema, uniqueTestName } from "../features/backup/testDatabase";
import { exerciseCatalog } from "../features/exercises/exerciseCatalog";
import { buildImportedWorkouts } from "../features/history/importedWorkouts";
import { rpeScaleV1 } from "../domain/rules/strengthRules";
import {
  CoachJmDatabase,
  DATABASE_VERSION,
  REMOVED_IN_V3,
  STORE_NAMES,
  VERSION_1_STORES,
  VERSION_2_STORES,
  VERSION_3_STORES,
  guardV3Migration,
} from "./database";

/**
 * Migration v2 → v3 (SCHEMA_DEXIE_V3_MIGRATION.md § 4 et § 9, T-1 à T-7).
 * Chaque test crée une base v2 (ou v1) authentique sous un nom unique, la
 * peuple, la ferme, puis la rouvre avec la vraie classe v3.
 */

const opened: string[] = [];

function track(name: string): string {
  opened.push(name);
  return name;
}

afterEach(async () => {
  for (const name of opened.splice(0)) await Dexie.delete(name);
});

/** Les stores que la v3 conserve de la v2 : tout sauf les huit supprimés. */
const KEPT_STORES = Object.keys(VERSION_2_STORES).filter((name) => !REMOVED_IN_V3.includes(name));
const NEW_V3_STORES = ["testProtocols", "testProtocolVersions", "testResults", "settings"];

function sortByKey(records: unknown[], key: string): unknown[] {
  return [...records].sort((a, b) => {
    const left = String((a as Record<string, unknown>)[key]);
    const right = String((b as Record<string, unknown>)[key]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

async function dump(database: Dexie, stores: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const store of stores) {
    const table = database.table(store);
    result[store] = canonicalStringify(sortByKey(await table.toArray(), String(table.schema.primKey.keyPath)));
  }
  return result;
}

async function createV2(populate: (database: CoachJmDatabaseV2) => Promise<void>): Promise<string> {
  const name = track(uniqueTestName("coach-jm-v3"));
  const legacy = new CoachJmDatabaseV2(name);
  await legacy.open();
  expect(legacy.verno).toBe(2);
  await populate(legacy);
  legacy.close();
  return name;
}

async function openV3(name: string, upgradeGuard?: (tx: Transaction) => Promise<void>): Promise<CoachJmDatabase> {
  const database = new CoachJmDatabase(name, upgradeGuard ? { upgradeGuard } : {});
  await database.open();
  return database;
}

/** Ouverture dynamique, sans déclarer de version : la base telle qu'elle est. */
async function inspect(name: string) {
  const database = new Dexie(name);
  await database.open();
  const result = { verno: database.verno, tables: database.tables.map((table) => table.name).sort() };
  database.close();
  return result;
}

const frame = {
  id: "frame-tv",
  exerciseId: "tirage-vertical",
  activeVersionId: "frame-tv-v1",
  createdAt: "2026-09-22T10:12:04.435Z",
  updatedAt: "2026-09-22T10:12:04.435Z",
};
const frameVersion = {
  id: "frame-tv-v1",
  frameId: "frame-tv",
  number: 1,
  status: "active" as const,
  progressionType: "charge_croissante" as const,
  workSets: 3,
  repRange: { min: 10, max: 12 },
  rpeTarget: 8,
  restSec: 90,
  increment: { unit: "kg" as const, value: 2.5 },
  currentTarget: { value: 40, unit: "kg" as const, acceptedAt: "2026-09-22T10:12:04.435Z" },
  createdAt: "2026-09-22T10:12:04.435Z",
  updatedAt: "2026-09-22T10:12:04.435Z",
};

async function populateRealistic(database: CoachJmDatabaseV2): Promise<void> {
  await database.exercises.bulkAdd(exerciseCatalog);
  await database.workouts.bulkAdd(buildImportedWorkouts());
  await database.rpeScaleVersions.add(rpeScaleV1("2026-09-22", "2026-09-22T10:05:03.053Z"));
  await database.strengthFrames.add(frame);
  await database.strengthFrameVersions.add(frameVersion);
  await database.weightEntries.add({ id: "p1", date: "2026-09-21", kg: 81.2, createdAt: "x", updatedAt: "x" });
}

describe("migration v2 → v3", () => {
  it("T-1 — première ouverture : version 3, quinze stores, tous vides", async () => {
    const name = track(uniqueTestName("coach-jm-v3"));
    const database = await openV3(name);

    expect(database.verno).toBe(DATABASE_VERSION);
    expect(DATABASE_VERSION).toBe(3);
    expect(database.tables.map((table) => table.name).sort()).toEqual([...STORE_NAMES].sort());
    expect(STORE_NAMES).toHaveLength(15);
    for (const table of database.tables) expect(await table.count(), table.name).toBe(0);
    database.close();
  });

  it("T-2 — base v2 vide : le schéma obtenu est exactement VERSION_3_STORES", async () => {
    const name = await createV2(async () => undefined);
    const migrated = await openV3(name);
    const schema = describeSchema(migrated);
    migrated.close();

    const reference = new Dexie(track(uniqueTestName("coach-jm-v3-ref")));
    reference.version(1).stores(
      Object.fromEntries(Object.entries(VERSION_3_STORES).filter(([, value]) => value !== null)) as Record<string, string>,
    );
    await reference.open();
    expect(schema).toEqual(describeSchema(reference));
    reference.close();

    expect(Object.keys(schema).sort()).toEqual([...STORE_NAMES].sort());
    for (const removed of REMOVED_IN_V3) expect(schema).not.toHaveProperty(removed);
    expect(schema.goals).toEqual(["pk:id", "&key", "position", "updatedAt"]);
  });

  it("T-3 — base v2 réaliste (catalogue, séances importées, cadre, échelle, pesée) : tout est relu à l'identique", async () => {
    const name = await createV2(populateRealistic);
    const legacy = new CoachJmDatabaseV2(name);
    await legacy.open();
    const before = await dump(legacy, KEPT_STORES);
    legacy.close();

    const migrated = await openV3(name);
    const after = await dump(migrated, KEPT_STORES);
    for (const store of KEPT_STORES) expect(after[store], store).toBe(before[store]);
    for (const store of NEW_V3_STORES) expect(await migrated.table(store).count(), store).toBe(0);

    const tractions = (await migrated.workouts.get("import-2026-09-15"))?.blocks.find(
      (block) => block.kind === "exercise" && block.exerciseId === "traction-assistee",
    );
    expect(tractions && "series" in tractions ? tractions.series?.map((s) => [s.load, s.reps]) : undefined).toEqual([
      [{ kind: "total", kg: 49 }, 10],
      [{ kind: "total", kg: 49 }, 6],
      [{ kind: "total", kg: 56 }, 10],
    ]);
    expect(await migrated.strengthFrameVersions.get("frame-tv-v1")).toEqual(frameVersion);
    migrated.close();
  });

  it.each([
    ["T-4a", "cardioTests", { id: "c1", versionId: "v", date: "2026-09-01", time: "18:00", status: "complet", endReason: "critere_atteint", conditionsRespected: true, createdAt: "x", updatedAt: "x" }],
    ["T-4b", "mobilityMeasures", { id: "m1", assessmentId: "a", key: "jambes_doigts_orteils", conforme: true, measureRef: { blockId: "b", field: "distanceCm" } }],
    ["T-4c", "goals", { id: "g1", name: "Presse 120", target: { kind: "weight", targetKg: 75, direction: "lose" }, status: "active", createdAt: "x", updatedAt: "x" }],
  ])("%s — garde : un enregistrement dans %s refuse la migration, la base reste v2 et intacte", async (_label, store, record) => {
    const name = await createV2(async (database) => {
      await populateRealistic(database);
      await database.table(store).add(record);
    });
    const legacy = new CoachJmDatabaseV2(name);
    await legacy.open();
    const before = await dump(legacy, Object.keys(VERSION_2_STORES));
    legacy.close();

    const database = new CoachJmDatabase(name);
    await expect(database.open()).rejects.toThrow(new RegExp(`${store} \\(1\\)`));
    database.close();

    expect(await inspect(name)).toEqual({ verno: 2, tables: Object.keys(VERSION_2_STORES).sort() });
    const reopened = new CoachJmDatabaseV2(name);
    await reopened.open();
    expect(await dump(reopened, Object.keys(VERSION_2_STORES))).toEqual(before);
    expect(describeSchema(reopened).goals).toContain("status");
    reopened.close();
  });

  it("T-4d — garde : les neuf stores gardés non vides sont tous nommés", async () => {
    const name = await createV2(async (database) => {
      for (const store of [...REMOVED_IN_V3, "goals"]) {
        await database.table(store).add({ id: `${store}-1`, key: "k", assessmentId: "a", testId: "t", status: "x" });
      }
    });

    const database = new CoachJmDatabase(name);
    const error = await database.open().then(
      () => undefined,
      (caught: unknown) => caught as Error,
    );
    database.close();

    expect(error).toBeDefined();
    for (const store of [...REMOVED_IN_V3, "goals"]) expect(error?.message, store).toContain(`${store} (1)`);
    expect((await inspect(name)).verno).toBe(2);
  });

  it("T-5 — panne pendant la migration (après une lecture) : base restée v2, intacte", async () => {
    const name = await createV2(populateRealistic);
    const legacy = new CoachJmDatabaseV2(name);
    await legacy.open();
    const before = await dump(legacy, Object.keys(VERSION_2_STORES));
    legacy.close();

    await expect(
      openV3(name, async (tx) => {
        await tx.table("workouts").count();
        throw new Error("panne simulée pendant la migration");
      }),
    ).rejects.toThrow(/panne simulée/);

    expect((await inspect(name)).verno).toBe(2);
    const reopened = new CoachJmDatabaseV2(name);
    await reopened.open();
    expect(await dump(reopened, Object.keys(VERSION_2_STORES))).toEqual(before);
    reopened.close();
  });

  it("T-6 — base v1 : passage v1 → v2 → v3 dans la même ouverture, contenus identiques", async () => {
    const name = track(uniqueTestName("coach-jm-v1"));
    const legacy = new Dexie(name);
    legacy.version(1).stores(VERSION_1_STORES);
    await legacy.open();
    await legacy.table("exercises").bulkAdd(exerciseCatalog);
    await legacy.table("workouts").bulkAdd(buildImportedWorkouts());
    const v1Stores = Object.keys(VERSION_1_STORES).filter((store) => store !== "goals");
    const before = await dump(legacy, v1Stores);
    legacy.close();

    const migrated = await openV3(name);
    expect(migrated.verno).toBe(3);
    expect(await dump(migrated, v1Stores)).toEqual(before);
    expect(migrated.tables.map((table) => table.name).sort()).toEqual([...STORE_NAMES].sort());
    migrated.close();
  });

  it("T-7 — réouvertures : la garde ne s'exécute qu'une fois, les contenus ne bougent pas", async () => {
    const name = await createV2(populateRealistic);
    let calls = 0;
    const counting = async (tx: Transaction) => {
      calls += 1;
      await guardV3Migration(tx);
    };

    const first = await openV3(name, counting);
    const reference = await dump(first, STORE_NAMES);
    first.close();

    for (let i = 0; i < 3; i++) {
      const again = await openV3(name, counting);
      expect(await dump(again, STORE_NAMES)).toEqual(reference);
      again.close();
    }
    expect(calls).toBe(1);
  });
});

describe("migration v2 → v3 sur la sauvegarde réelle (COACH_JM_BACKUP) — T-3 (R)", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("toutes les séances du fichier, quel que soit leur nombre, et tous les stores conservés restent identiques", async () => {
    const envelope = parseBackup(await readFile(path!, "utf8"));
    const name = track(uniqueTestName("coach-jm-v3-reel"));

    /* Le fichier dans une base v2 (son schéma d'origine), puis la v3. */
    const legacy = new CoachJmDatabaseV2(name);
    await legacy.open();
    if (envelope.database.version === 2) {
      await restoreBackup(envelope, legacy);
    } else {
      for (const [store, records] of Object.entries(envelope.stores)) {
        if (records.length > 0) await legacy.table(store).bulkAdd(records as object[]);
      }
    }
    const before = await dump(legacy, KEPT_STORES);
    legacy.close();

    const migrated = await openV3(name);
    expect(migrated.verno).toBe(3);
    const after = await dump(migrated, KEPT_STORES);
    for (const store of KEPT_STORES) expect(after[store], store).toBe(before[store]);

    /* Séances : même nombre que le fichier, chacune identique à celle du fichier. */
    const fileWorkouts = envelope.stores.workouts as WorkoutSession[];
    const stored = await migrated.workouts.toArray();
    expect(stored).toHaveLength(fileWorkouts.length);
    const byId = new Map(fileWorkouts.map((workout) => [workout.id, workout]));
    for (const workout of stored) expect(canonicalStringify(workout), workout.id).toBe(canonicalStringify(byId.get(workout.id)));

    /* Cadres éventuels du fichier (23/09 : tirage vertical, cible 40 kg) : identiques. */
    expect(canonicalStringify(sortByKey(await migrated.strengthFrameVersions.toArray(), "id"))).toBe(
      canonicalStringify(sortByKey(envelope.stores.strengthFrameVersions ?? [], "id")),
    );
    migrated.close();

    console.info("[migration réelle]", envelope.exportedAt, { séances: stored.length, cadres: (envelope.stores.strengthFrames ?? []).length });
  });
});
