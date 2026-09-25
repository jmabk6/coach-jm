import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { compareBackups, verifyBackup as scriptVerify } from "../../../scripts/verify-backup.mjs";
import type { SettingsRecord, WorkoutSession } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { buildImportedWorkouts } from "../history/fixtures/september2026";
import { legacyHash7, readBackup, serializeBackup, storeHashesOf, type BackupContext } from "./exportBackup";
import { parseBackup, restoreBackup, verifyBackupIntegrity } from "./restoreBackup";
import { createTestDatabase } from "./testDatabase";

/**
 * Lot C.5 — format de sauvegarde 2 (SCHEMA_DEXIE_V3_MIGRATION.md § 6) :
 * T-11 (aller-retour, empreintes égales) et T-20 (script hors appareil).
 */

const context: BackupContext = {
  now: new Date("2026-09-24T09:00:00.000Z"),
  buildTime: "build",
  userAgent: "test",
  standalone: true,
  appVersion: "0.0.0",
};

const opened: Dexie[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

const preferences: SettingsRecord = { key: "preferences", value: { theme: "auto", timerSound: true, freeWorkoutRestSec: 90 } };

async function populatedV3() {
  const database = createTestDatabase("coach-jm-f2", 3);
  opened.push(database);
  await database.open();
  await database.exercises.bulkAdd(exerciseCatalog);
  await database.workouts.bulkAdd(buildImportedWorkouts());
  await database.settings.put(preferences);
  return database;
}

describe("T-11 — format 2 : export → restauration → export", () => {
  it("rend le même hash, les mêmes empreintes par store et le même hash7", async () => {
    const source = await populatedV3();
    const first = await readBackup(source, context);

    expect(first.formatVersion).toBe(2);
    expect(first.database.version).toBe(3);
    expect(first.app).toEqual({ buildTime: "build", version: "0.0.0" });
    expect(Object.keys(first.integrity.storeHashes ?? {}).sort()).toEqual(Object.keys(first.stores).sort());
    expect(first.integrity.storeHashes).toEqual(await storeHashesOf(first.stores));
    expect(first.legacyIntegrity?.hash7).toBe(await legacyHash7(first.stores));
    expect(await verifyBackupIntegrity(first)).toMatchObject({ ok: true, mismatchedStores: [] });

    const target = createTestDatabase("coach-jm-f2", 3);
    opened.push(target);
    await target.open();
    await restoreBackup(parseBackup(serializeBackup(first)), target);
    const second = await readBackup(target, context);

    expect(second.integrity.hash).toBe(first.integrity.hash);
    expect(second.integrity.storeHashes).toEqual(first.integrity.storeHashes);
    expect(second.legacyIntegrity).toEqual(first.legacyIntegrity);
  });

  it("une empreinte de store altérée est nommée", async () => {
    const source = await populatedV3();
    const envelope = await readBackup(source, context);
    const altered = { ...envelope, integrity: { ...envelope.integrity, storeHashes: { ...envelope.integrity.storeHashes, workouts: "0".repeat(64) } } };

    expect(await verifyBackupIntegrity(altered)).toMatchObject({ ok: false, mismatchedStores: ["workouts"] });
  });
});

describe("T-20 — script de vérification hors appareil", () => {
  it("accepte un fichier format 1 (base v1) et un fichier format 2 (base v3)", async () => {
    const v1 = createTestDatabase("coach-jm-f1", 1);
    opened.push(v1);
    await v1.open();
    await v1.table("workouts").bulkAdd(buildImportedWorkouts());
    const format1 = await readBackup(v1, context, { formatVersion: 1 });
    expect(format1.formatVersion).toBe(1);
    expect(scriptVerify(JSON.parse(serializeBackup(format1)))).toMatchObject({ ok: true, problems: [] });

    const format2 = await readBackup(await populatedV3(), context);
    const result = scriptVerify(JSON.parse(serializeBackup(format2)));
    expect(result).toMatchObject({ ok: true, problems: [] });
    expect(result.legacyHash).toBe(format2.legacyIntegrity?.hash7);
  });

  it("le store settings (clé « key ») n'est pas signalé « sans identifiant »", async () => {
    const envelope = await readBackup(await populatedV3(), context);
    const result = scriptVerify(JSON.parse(serializeBackup(envelope)));
    expect(result.problems.filter((problem: string) => problem.startsWith("settings"))).toEqual([]);
    expect(envelope.stores.settings).toEqual([preferences]);
  });

  it("compare deux fichiers store par store : identiques, ajoutés, retirés, modifiés", async () => {
    const before = await readBackup(await populatedV3(), context);
    const workouts = (before.stores.workouts as WorkoutSession[]).map((workout, index) =>
      index === 0 ? { ...workout, note: "modifiée" } : workout,
    );
    const after = {
      ...before,
      stores: {
        ...before.stores,
        workouts: [...workouts.slice(0, -1)],
        weightEntries: [{ id: "p1", date: "2026-09-24", kg: 81, createdAt: "x", updatedAt: "x" }],
      },
    };

    const rows = compareBackups(before, after) as Array<{ store: string; identical: boolean; added: string[]; removed: string[]; modified: string[] }>;
    const byStore = Object.fromEntries(rows.map((row) => [row.store, row]));

    expect(byStore.exercises?.identical).toBe(true);
    expect(byStore.settings?.identical).toBe(true);
    expect(byStore.weightEntries).toMatchObject({ identical: false, added: ["p1"] });
    expect(byStore.workouts?.identical).toBe(false);
    expect(byStore.workouts?.modified).toEqual([workouts[0]?.id]);
    expect(byStore.workouts?.removed).toEqual([(before.stores.workouts as WorkoutSession[]).at(-1)?.id]);
  });
});
