import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOVED_IN_V3, type CoachJmDatabase } from "../../db/database";
import type { WorkoutSession } from "../../domain";
import { canonicalStringify } from "./canonicalJson";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { readBackup, readStores, serializeBackup, type BackupContext, type BackupEnvelope } from "./exportBackup";
import { BackupValidationError, parseBackup, restoreInto } from "./restoreBackup";
import { createTestDatabase } from "./testDatabase";

/**
 * Lot C.6 — matrice de restauration (SCHEMA_DEXIE_V3_MIGRATION.md § 7) :
 * T-9, T-10, T-12 à T-16. Aucune base n'est jamais laissée à moitié
 * restaurée.
 */

const context: BackupContext = { now: new Date("2026-09-24T10:00:00.000Z"), buildTime: "b", userAgent: "t", standalone: true };
const opened: Dexie[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

async function emptyV3(): Promise<CoachJmDatabase> {
  const database = createTestDatabase("coach-jm-restore", 3);
  opened.push(database);
  await database.open();
  return database;
}

async function counts(database: Dexie): Promise<Record<string, number>> {
  return (await readStores(database)).counts;
}

function allZero(values: Record<string, number>): boolean {
  return Object.values(values).every((count) => count === 0);
}

async function format2File(): Promise<BackupEnvelope> {
  const source = await emptyV3();
  await source.exercises.bulkAdd(exerciseCatalog);
  await source.workouts.bulkAdd(buildImportedWorkouts());
  return parseBackup(serializeBackup(await readBackup(source, context)));
}

async function format1FromV2(extra?: (database: Dexie) => Promise<void>): Promise<BackupEnvelope> {
  const v2 = createTestDatabase("coach-jm-v2src", 2);
  opened.push(v2);
  await v2.open();
  await v2.table("exercises").bulkAdd(exerciseCatalog);
  await v2.table("workouts").bulkAdd(buildImportedWorkouts());
  if (extra) await extra(v2);
  return parseBackup(serializeBackup(await readBackup(v2, context, { formatVersion: 1 })));
}

/** Le prototype Dexie qui porte une méthode de table (pour les espions). */
function prototypeOwning(database: Dexie, method: string): Record<string, (...args: unknown[]) => unknown> {
  let proto: object | null = Object.getPrototypeOf(database.tables[0]);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, method)) proto = Object.getPrototypeOf(proto);
  if (!proto) throw new Error(`méthode ${method} introuvable`);
  return proto as Record<string, (...args: unknown[]) => unknown>;
}

describe("matrice de restauration", () => {
  it("T-10 — format 1, base v1 (7 stores) → base v3 : stores identiques, nouveaux stores vides", async () => {
    const v1 = createTestDatabase("coach-jm-v1src", 1);
    opened.push(v1);
    await v1.open();
    await v1.table("workouts").bulkAdd(buildImportedWorkouts());
    const file = parseBackup(serializeBackup(await readBackup(v1, context, { formatVersion: 1 })));

    const target = await emptyV3();
    const result = await restoreInto(file, target);

    expect(result.hash).toBe(file.integrity.hash);
    expect(result.skipped).toEqual([]);
    const after = await readStores(target);
    for (const name of Object.keys(file.stores)) expect(canonicalStringify(after.stores[name]), name).toBe(canonicalStringify(file.stores[name]));
    for (const name of ["testProtocols", "testProtocolVersions", "testResults", "settings", "strengthFrames"]) expect(after.counts[name], name).toBe(0);
  });

  it("cas B — format 1, base v2 : les huit stores anciens, vides, sont ignorés ; le reste est écrit à l'identique", async () => {
    const file = await format1FromV2();
    const target = await emptyV3();
    const result = await restoreInto(file, target);

    expect(result.skipped.sort()).toEqual([...REMOVED_IN_V3].sort());
    expect(result.hash).toBe(file.integrity.hash);
    expect(canonicalStringify((await readStores(target)).stores.workouts)).toBe(canonicalStringify(file.stores.workouts));
  });

  it("T-12 — format 2 avec un caractère modifié dans workouts : refus nommé, rien d'écrit", async () => {
    const file = await format2File();
    const text = serializeBackup(file).replace('"import-2026-09-15"', '"import-2026-09-1X"');
    const target = await emptyV3();

    await expect(restoreInto(parseBackup(text), target)).rejects.toThrow(/Empreinte différente pour : workouts/);
    expect(allZero(await counts(target))).toBe(true);
  });

  it("T-13 — format 1 v2 contenant un test cardio : refus nommé, rien d'écrit", async () => {
    const file = await format1FromV2(async (v2) => {
      await v2.table("cardioTests").add({ id: "c1", versionId: "v", date: "2026-09-01", status: "complet" });
    });
    const target = await emptyV3();

    await expect(restoreInto(file, target)).rejects.toThrow(/cardioTests \(1\)/);
    expect(allZero(await counts(target))).toBe(true);
  });

  it("cas F — objectif de l'ancienne forme dans un fichier : refus nommé", async () => {
    const file = await format1FromV2(async (v2) => {
      await v2.table("goals").add({ id: "g1", name: "Presse", target: { kind: "weight", targetKg: 75, direction: "lose" }, status: "active", createdAt: "x", updatedAt: "x" });
    });
    const target = await emptyV3();

    await expect(restoreInto(file, target)).rejects.toThrow(/goals \(1, ancienne forme\)/);
    expect(allZero(await counts(target))).toBe(true);
  });

  it("cas D — store inconnu : refus avant toute écriture", async () => {
    const file = await format2File();
    const altered = { ...file, stores: { ...file.stores, inconnu: [] }, counts: { ...file.counts, inconnu: 0 } };
    const target = await emptyV3();

    await expect(restoreInto(altered, target)).rejects.toThrow(/inconnu du fichier n'existe pas/);
    expect(allZero(await counts(target))).toBe(true);
  });

  it("T-14 — panne pendant l'écriture (au deuxième store non vide) : tout est annulé, la base reste vide", async () => {
    const file = await format2File();
    const target = await emptyV3();

    const proto = prototypeOwning(target, "bulkAdd");
    const original = proto.bulkAdd!;
    let calls = 0;
    vi.spyOn(proto, "bulkAdd").mockImplementation(function (this: unknown, ...args: unknown[]) {
      calls += 1;
      if (calls === 2) throw new Error("panne simulée pendant l'écriture");
      return original.apply(this, args);
    });

    await expect(restoreInto(file, target)).rejects.toThrow(/panne simulée/);
    expect(calls).toBe(2);
    expect(allZero(await counts(target))).toBe(true);
  });

  it("T-15 — relecture différente du fichier : la transaction est annulée, la base reste vide", async () => {
    const file = await format2File();
    const target = await emptyV3();

    const proto = prototypeOwning(target, "toArray");
    const original = proto.toArray!;
    vi.spyOn(proto, "toArray").mockImplementation(async function (this: { name?: string }, ...args: unknown[]) {
      const records = (await original.apply(this, args)) as WorkoutSession[];
      return this.name === "workouts" ? records.map((workout, index) => (index === 0 ? { ...workout, note: "altérée" } : workout)) : records;
    });

    await expect(restoreInto(file, target)).rejects.toThrow(/Relecture différente du fichier pour workouts/);
    vi.restoreAllMocks();
    expect(allZero(await counts(target))).toBe(true);
  });

  it("T-16 — base cible non vide : refus, rien d'écrit", async () => {
    const file = await format2File();
    const target = await emptyV3();
    await target.weightEntries.add({ id: "p1", date: "2026-09-24", kg: 81, createdAt: "x", updatedAt: "x" });

    await expect(restoreInto(file, target)).rejects.toThrow(BackupValidationError);
    expect((await counts(target)).workouts).toBe(0);
    expect((await counts(target)).weightEntries).toBe(1);
  });

  it("un fichier valide se restaure une fois, et une seconde tentative sur la même base est refusée", async () => {
    const file = await format2File();
    const target = await emptyV3();
    await restoreInto(file, target);
    await expect(restoreInto(file, target)).rejects.toThrow(/n'est pas vide/);
    expect((await counts(target)).workouts).toBe(buildImportedWorkouts().length);
  });
});

describe("T-9 (R) — sauvegarde réelle (COACH_JM_BACKUP) restaurée dans une base v3", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("les stores communs sont relus identiques au fichier, toutes les séances comprises", async () => {
    const file = parseBackup(await readFile(path!, "utf8"));
    const target = await emptyV3();
    const result = await restoreInto(file, target);

    expect(result.hash).toBe(file.integrity.hash);
    const after = await readStores(target);
    for (const name of result.written) expect(canonicalStringify(after.stores[name]), name).toBe(canonicalStringify(file.stores[name]));
    expect(after.counts.workouts).toBe((file.stores.workouts ?? []).length);
    for (const name of ["testProtocols", "testProtocolVersions", "testResults", "settings"]) expect(after.counts[name], name).toBe(0);
  });
});
