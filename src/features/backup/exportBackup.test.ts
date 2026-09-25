import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATABASE_VERSION, db, STORE_NAMES, VERSION_2_STORES } from "../../db/database";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { buildEstablishedDataset } from "./fixtures/establishedDataset";
import { canonicalStringify } from "./canonicalJson";
import {
  BackupSerializationError,
  backupFileName,
  formatBytes,
  readBackup,
  readStores,
  serializeBackup,
  type BackupContext,
} from "./exportBackup";
import { parseBackup, verifyBackupIntegrity } from "./restoreBackup";
import { createTestDatabase, describeSchema, TEST_V1_STORES, WRITE_METHODS, writePrototypeOf } from "./testDatabase";

const context: BackupContext = {
  now: new Date("2026-09-19T08:42:17.512Z"),
  buildTime: "2026-09-17T17:28:03.000Z",
  userAgent: "test",
  standalone: false,
};

const dataset = buildEstablishedDataset("2026-09-10");
const opened: Dexie[] = [];

function openTest(): Dexie {
  const database = createTestDatabase();
  opened.push(database);
  return database;
}

async function populate(database: Dexie): Promise<void> {
  await database.table("exercises").bulkAdd(dataset.exercises);
  await database.table("sessionTemplates").bulkAdd(dataset.templates);
  await database.table("plannedSessions").bulkAdd(dataset.plannedSessions);
  await database.table("workouts").bulkAdd([...dataset.workouts, ...buildImportedWorkouts()]);
}

async function dump(database: Dexie): Promise<string> {
  const { stores } = await readStores(database);
  return canonicalStringify({ verno: database.verno, stores });
}

afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
  vi.restoreAllMocks();
});

describe("schéma de l'application (lot C : version 3)", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("la base déclarée par l'application est la version 3 avec ses quinze stores, et la sauvegarde les couvre tous", async () => {
    await db.delete();
    await db.open();

    expect(db.verno).toBe(DATABASE_VERSION);
    expect(DATABASE_VERSION).toBe(3);
    expect(db.tables.map((table) => table.name).sort()).toEqual([...STORE_NAMES].sort());
    expect(db.tables).toHaveLength(15);

    const envelope = await readBackup(db, context);
    expect(envelope.database.version).toBe(3);
    expect(Object.keys(envelope.stores).sort()).toEqual([...STORE_NAMES].sort());
    expect(Object.keys(envelope.counts)).toHaveLength(15);
    for (const name of STORE_NAMES) expect(envelope.counts[name], name).toBe(0);
  });

  it("la base de test v3 reflète exactement le schéma de production ; les bases de test v2 et v1 sont celles des sauvegardes existantes", async () => {
    await db.delete();
    await db.open();
    const v3 = createTestDatabase("coach-jm-test", 3);
    opened.push(v3);
    await v3.open();
    expect(describeSchema(v3)).toEqual(describeSchema(db));
    expect(v3.verno).toBe(3);

    const v2 = createTestDatabase("coach-jm-test", 2);
    opened.push(v2);
    await v2.open();
    expect(v2.verno).toBe(2);
    expect(Object.keys(describeSchema(v2)).sort()).toEqual(Object.keys(VERSION_2_STORES).sort());

    const v1 = openTest();
    await v1.open();
    expect(v1.verno).toBe(1);
    expect(Object.keys(describeSchema(v1)).sort()).toEqual(Object.keys(TEST_V1_STORES).sort());
  });
});

describe("lecture en vue de sauvegarde — non-modification", () => {
  let database: Dexie;

  beforeEach(async () => {
    database = openTest();
    await populate(database);
  });

  it("barrière 1 : la lecture se fait dans une transaction où toute écriture est rejetée", async () => {
    await expect(
      database.transaction("r", database.tables, async () => {
        await database.table("goals").add({ id: "g", status: "active" });
      }),
    ).rejects.toMatchObject({ name: "ReadOnlyError" });
    expect(await database.table("goals").count()).toBe(0);
  });

  it("barrière 2 : aucune méthode d'écriture de Dexie n'est appelée pendant un export", async () => {
    const proto = writePrototypeOf(database);
    const spies = WRITE_METHODS.map((method) => vi.spyOn(proto, method));

    await readBackup(database, context);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("barrière 3 : la base est identique avant et après, version comprise", async () => {
    const before = await dump(database);
    await readBackup(database, context);
    await readBackup(database, context);
    expect(await dump(database)).toBe(before);
    expect(database.verno).toBe(1);
  });
});

describe("lecture en vue de sauvegarde — enveloppe", () => {
  it("décrit la base telle qu'elle est lue : version du schéma, comptes, tous les stores même vides, empreinte", async () => {
    const database = openTest();
    await populate(database);

    const envelope = await readBackup(database, context);

    expect(envelope.format).toBe("coach-jm-backup");
    /* Lot C : format 2 par défaut (empreinte par store et des sept stores d'origine). */
    expect(envelope.formatVersion).toBe(2);
    expect(envelope.exportedAt).toBe("2026-09-19T08:42:17.512Z");
    expect(envelope.app.buildTime).toBe(context.buildTime);
    expect(envelope.database).toEqual({ name: database.name, version: 1 });
    expect(Object.keys(envelope.stores).sort()).toEqual(Object.keys(TEST_V1_STORES).sort());
    expect(envelope.counts).toEqual({
      exercises: dataset.exercises.length,
      sessionTemplates: dataset.templates.length,
      weeklyPrograms: 0,
      plannedSessions: dataset.plannedSessions.length,
      workouts: dataset.workouts.length + 10,
      goals: 0,
      weightEntries: 0,
    });
    expect(envelope.stores.goals).toEqual([]);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.integrity).toEqual({
      algorithm: "SHA-256",
      canonical: "sorted-keys-json-v1",
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      storeHashes: Object.fromEntries(Object.keys(TEST_V1_STORES).map((name) => [name, expect.stringMatching(/^[0-9a-f]{64}$/)])),
    });
    expect(envelope.legacyIntegrity).toEqual({ hash7: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect((envelope.stores.workouts as Array<{ id: string }>).map((w) => w.id)).toEqual(
      [...(envelope.stores.workouts as Array<{ id: string }>)].map((w) => w.id).sort((a, b) => (a < b ? -1 : 1)),
    );
  });

  it("deux lectures donnent la même empreinte ; l'ordre d'insertion ne compte pas ; une donnée changée la change", async () => {
    const a = openTest();
    await populate(a);
    const b = openTest();
    await b.table("workouts").bulkAdd([...buildImportedWorkouts()].reverse());
    await b.table("plannedSessions").bulkAdd([...dataset.plannedSessions].reverse());
    await b.table("sessionTemplates").bulkAdd(dataset.templates);
    await b.table("exercises").bulkAdd([...dataset.exercises].reverse());
    await b.table("workouts").bulkAdd(dataset.workouts);

    const first = await readBackup(a, context);
    const second = await readBackup(a, { ...context, now: new Date() });
    const other = await readBackup(b, context);
    expect(second.integrity.hash).toBe(first.integrity.hash);
    expect(other.integrity.hash).toBe(first.integrity.hash);

    await b.table("workouts").update("import-2026-09-01", { activeDurationSec: 1 });
    expect((await readBackup(b, context)).integrity.hash).not.toBe(first.integrity.hash);
  });

  it("le fichier se relit : parse, comptes, empreinte recalculée égale", async () => {
    const database = openTest();
    await populate(database);
    const envelope = await readBackup(database, context);
    const text = serializeBackup(envelope);

    const parsed = parseBackup(text);
    expect(parsed.counts).toEqual(envelope.counts);
    expect(await verifyBackupIntegrity(parsed)).toMatchObject({ ok: true });
    expect(canonicalStringify(parsed.stores)).toBe(canonicalStringify(envelope.stores));
  });

  it("le catalogue officiel semé passe l'audit sans avertissement", async () => {
    const database = openTest();
    await database.table("exercises").bulkAdd(exerciseCatalog);
    const envelope = await readBackup(database, context);
    expect(envelope.counts.exercises).toBe(exerciseCatalog.length);
    expect(envelope.warnings).toEqual([]);
  });
});

describe("lecture en vue de sauvegarde — anciens enregistrements", () => {
  it("une propriété indéfinie est détectée et signalée, l'export continue et le fichier reste vérifiable", async () => {
    const database = openTest();
    const [workout] = buildImportedWorkouts();
    await database.table("workouts").add({ ...workout, currentBlockId: undefined, pauses: [undefined] });

    const envelope = await readBackup(database, context);

    expect(envelope.warnings.map((issue) => [issue.id, issue.path, issue.kind])).toEqual([
      [workout!.id, "currentBlockId", "undefined_property"],
      [workout!.id, "pauses[0]", "undefined_in_array"],
    ]);
    const parsed = parseBackup(serializeBackup(envelope));
    expect(await verifyBackupIntegrity(parsed)).toMatchObject({ ok: true });
    expect("currentBlockId" in (parsed.stores.workouts![0] as object)).toBe(false);
  });

  it("une valeur sans forme JSON fidèle refuse l'export en nommant l'enregistrement et le chemin", async () => {
    const database = openTest();
    const [workout] = buildImportedWorkouts();
    await database.table("workouts").add({ ...workout, blocks: [{ ...workout!.blocks[0], startedOn: new Date("2026-09-01T16:00:00Z") }] });
    await database.table("weightEntries").add({ id: "w", date: "2026-09-01", kg: NaN, createdAt: "x", updatedAt: "x" });

    const attempt = readBackup(database, context);
    await expect(attempt).rejects.toBeInstanceOf(BackupSerializationError);
    await expect(attempt).rejects.toThrow(/workouts · import-2026-09-01 · blocks\[0\]\.startedOn : objet Date/);
    await expect(attempt).rejects.toThrow(/weightEntries · w · kg : nombre non fini/);
  });
});

describe("utilitaires", () => {
  it("nomme le fichier en heure locale et formate les tailles", () => {
    expect(backupFileName(new Date(2026, 8, 19, 10, 42))).toBe("coach-jm-sauvegarde-2026-09-19-1042.json");
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(300 * 1024)).toBe("300 Ko");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 Mo");
  });

  it("le seed du lancement n'écrit rien quand le catalogue est déjà à jour (contrôle séparé du démarrage)", async () => {
    await db.delete();
    await db.open();
    await seedExerciseCatalog();
    const before = await dump(db);

    const proto = writePrototypeOf(db);
    const spies = WRITE_METHODS.map((method) => vi.spyOn(proto, method));
    await seedExerciseCatalog();

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await dump(db)).toBe(before);
    db.close();
    await db.delete();
  });
});
