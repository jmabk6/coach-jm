import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBackup as scriptVerify } from "../../../scripts/verify-backup.mjs";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { buildEstablishedDataset } from "../progression/fixtures/establishedDataset";
import { readBackup, readStores, serializeBackup, type BackupContext, type BackupEnvelope } from "./exportBackup";
import { BackupValidationError, parseBackup, restoreBackup, verifyBackupIntegrity } from "./restoreBackup";
import { canonicalStringify } from "./canonicalJson";
import { createTestDatabase } from "./testDatabase";

const context: BackupContext = {
  now: new Date("2026-09-19T08:42:17.512Z"),
  buildTime: "build",
  userAgent: "test",
  standalone: true,
};

const dataset = buildEstablishedDataset("2026-09-10");
const opened: Dexie[] = [];

function openTest(): Dexie {
  const database = createTestDatabase();
  opened.push(database);
  return database;
}

async function sourceEnvelope(): Promise<BackupEnvelope> {
  const source = openTest();
  /* Les séances fictives référencent les exercices fx-, les séances importées le catalogue officiel. */
  await source.table("exercises").bulkAdd([...dataset.exercises, ...exerciseCatalog]);
  await source.table("sessionTemplates").bulkAdd(dataset.templates);
  await source.table("plannedSessions").bulkAdd(dataset.plannedSessions);
  await source.table("workouts").bulkAdd([...dataset.workouts, ...buildImportedWorkouts()]);
  await source.table("weightEntries").add({ id: "w1", date: "2026-09-01", kg: 80.4, createdAt: "x", updatedAt: "x" });
  return readBackup(source, context);
}

afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

describe("restauration dans une base de test indépendante", () => {
  it("export → restauration → export rend la même empreinte, les mêmes comptes, les mêmes enregistrements", async () => {
    const envelope = await sourceEnvelope();
    const text = serializeBackup(envelope);

    const target = openTest();
    const result = await restoreBackup(parseBackup(text), target);

    expect(result.counts).toEqual(envelope.counts);
    expect(result.hash).toBe(envelope.integrity.hash);

    const again = await readBackup(target, context);
    expect(again.integrity.hash).toBe(envelope.integrity.hash);
    expect(canonicalStringify(again.stores)).toBe(canonicalStringify(envelope.stores));
    expect(await target.table("workouts").get("import-2026-09-16")).toEqual(buildImportedWorkouts().at(-1));
  });

  it("le script de vérification hors appareil accepte le fichier et recalcule la même empreinte", async () => {
    const envelope = await sourceEnvelope();
    const result = scriptVerify(JSON.parse(serializeBackup(envelope)));

    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.computed).toBe(envelope.integrity.hash);
    /* Modèles et exercices référencés sont tous présents : aucune orpheline. */
    expect(result.notes).toEqual([]);

    /* Sans le catalogue, chaque brique importée pointe vers un exercice absent : signalé, pas bloquant. */
    const stripped = { ...envelope, stores: { ...envelope.stores, exercises: dataset.exercises } };
    const partial = scriptVerify(JSON.parse(JSON.stringify(stripped)));
    expect(partial.problems).toEqual([expect.stringMatching(/^empreinte DIFFÉRENTE/), "exercises : " + envelope.counts.exercises + " annoncés, " + dataset.exercises.length + " présents"]);
    expect(partial.notes.length).toBeGreaterThan(0);
    expect(partial.notes.every((note) => note.startsWith("workouts · import-"))).toBe(true);
  });

  it("un fichier altéré d'un caractère est refusé, par la fonction et par le script", async () => {
    const envelope = await sourceEnvelope();
    const text = serializeBackup(envelope).replace('"kg": 80.4', '"kg": 80.5');

    const parsed = parseBackup(text);
    expect(await verifyBackupIntegrity(parsed)).toMatchObject({ ok: false });
    await expect(restoreBackup(parsed, openTest())).rejects.toBeInstanceOf(BackupValidationError);
    await expect(restoreBackup(parsed, openTest())).rejects.toThrow(/Empreinte différente/);

    const script = scriptVerify(JSON.parse(text));
    expect(script.ok).toBe(false);
    expect(script.problems[0]).toMatch(/empreinte DIFFÉRENTE/);
  });

  it("enveloppes invalides : mauvais format, store manquant, compte faux, JSON illisible", async () => {
    const envelope = await sourceEnvelope();
    const base = JSON.parse(serializeBackup(envelope)) as Record<string, unknown>;

    expect(() => parseBackup("{")).toThrow(/pas un JSON lisible/);
    expect(() => parseBackup(JSON.stringify({ ...base, format: "autre" }))).toThrow(/Format inattendu/);
    expect(() => parseBackup(JSON.stringify({ ...base, formatVersion: 2 }))).toThrow(/Version de format inconnue/);

    const stores = { ...(base.stores as Record<string, unknown[]>) };
    delete stores.goals;
    expect(() => parseBackup(JSON.stringify({ ...base, stores }))).toThrow(/Store manquant dans le fichier : goals/);

    const counts = { ...(base.counts as Record<string, number>), workouts: 1 };
    expect(() => parseBackup(JSON.stringify({ ...base, counts }))).toThrow(/workouts : 1 annoncés/);
    expect(scriptVerify({ ...base, counts }).problems).toContain(`workouts : 1 annoncés, ${envelope.counts.workouts} présents`);
  });

  it("la base cible doit être vide : la restauration ne fusionne jamais, et n'écrit rien en cas de refus", async () => {
    const envelope = await sourceEnvelope();
    const target = openTest();
    await target.table("goals").add({ id: "g", status: "active" });

    await expect(restoreBackup(envelope, target)).rejects.toThrow(/n'est pas vide \(goals\)/);
    expect(await target.table("workouts").count()).toBe(0);
    expect(await target.table("goals").count()).toBe(1);
  });

  it("un store du fichier absent de la base cible est refusé avant toute écriture", async () => {
    const envelope = await sourceEnvelope();
    const target = openTest();
    const foreign = { ...envelope, stores: { ...envelope.stores, inconnu: [] }, counts: { ...envelope.counts, inconnu: 0 } };

    await expect(restoreBackup(foreign, target)).rejects.toThrow(/store inconnu du fichier n'existe pas/);
    const { counts } = await readStores(target);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
  });
});

describe("restauration d'une sauvegarde v1 dans une base v2 (lot 1)", () => {
  it("les sept stores du fichier sont restaurés, l'empreinte tient, les douze nouveaux stores restent vides", async () => {
    const envelope = await sourceEnvelope();
    expect(envelope.database.version).toBe(1);

    const target = createTestDatabase("coach-jm-test", 2);
    opened.push(target);
    const result = await restoreBackup(envelope, target);

    expect(target.verno).toBe(2);
    expect(result.hash).toBe(envelope.integrity.hash);
    expect(Object.keys(result.counts)).toHaveLength(19);
    for (const [name, count] of Object.entries(result.counts)) {
      expect(count, name).toBe(envelope.counts[name] ?? 0);
    }

    /* Ré-exporter depuis la base v2 : le fichier dit désormais version 2 et
       porte 19 stores ; les sept d'origine sont inchangés. */
    const again = await readBackup(target, context);
    expect(again.database.version).toBe(2);
    expect(Object.keys(again.stores)).toHaveLength(19);
    const legacyOnly = Object.fromEntries(Object.keys(envelope.stores).map((name) => [name, again.stores[name]]));
    expect(canonicalStringify(legacyOnly)).toBe(canonicalStringify(envelope.stores));
  });

  it("un fichier v2 ne se restaure pas dans une base v1 : store inconnu, aucune écriture", async () => {
    const source = createTestDatabase("coach-jm-test", 2);
    opened.push(source);
    await source.table("workouts").bulkAdd(buildImportedWorkouts());
    const envelope = await readBackup(source, context);
    expect(envelope.database.version).toBe(2);

    const legacyTarget = openTest();
    await expect(restoreBackup(envelope, legacyTarget)).rejects.toThrow(/n'existe pas dans la base cible/);
    expect(await legacyTarget.table("workouts").count()).toBe(0);
  });
});

describe("fichier réel (COACH_JM_BACKUP)", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("se restaure intégralement dans une base de test v1 et rend son empreinte", async () => {
    const text = await readFile(path!, "utf8");
    const envelope = parseBackup(text);

    expect(await verifyBackupIntegrity(envelope)).toMatchObject({ ok: true });
    const script = scriptVerify(JSON.parse(text));
    expect(script.ok).toBe(true);

    /* Un fichier v1 se restaure dans une base v1 (son schéma d'origine)… */
    if (envelope.database.version === 1) {
      const target = openTest();
      const result = await restoreBackup(envelope, target);
      expect(result.counts).toEqual(envelope.counts);
      expect(result.hash).toBe(envelope.integrity.hash);
    }

    /* …et tout fichier, v1 ou v2, dans une base v2 : le chemin que suit l'iPhone. */
    const v2 = createTestDatabase("coach-jm-test", 2);
    opened.push(v2);
    const migrated = await restoreBackup(envelope, v2);
    expect(migrated.hash).toBe(envelope.integrity.hash);
    expect(v2.verno).toBe(2);
    for (const [name, count] of Object.entries(envelope.counts)) expect(migrated.counts[name], name).toBe(count);

    console.info("[sauvegarde réelle]", envelope.exportedAt, envelope.database, envelope.counts, script.notes);
  });
});
