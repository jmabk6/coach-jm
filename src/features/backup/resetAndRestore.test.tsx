// @vitest-environment jsdom
import "fake-indexeddb/auto";

import Dexie from "dexie";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoachJmDatabase } from "../../db/database";
import { resumeSeedsForTests, seedsSuspended } from "../seed/runSeeds";
import { canonicalStringify } from "./canonicalJson";
import { DataResetSection } from "./DataResetSection";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { buildImportedWorkouts } from "../history/fixtures/september2026";
import { readBackup, readStores, serializeBackup, type BackupContext, type BackupEnvelope } from "./exportBackup";
import { parseBackup } from "./restoreBackup";
import { eraseDatabase, resetAndRestore } from "./resetAndRestore";
import { createTestDatabase, writePrototypeOf } from "./testDatabase";

/**
 * Lot C.7 — `resetAndRestore` (SCHEMA_DEXIE_V3_MIGRATION.md § 7.4) et le
 * point d'entrée minimal de Plus. Validation, vidage, écriture et
 * relecture : un refus ou une panne ne touche à rien (T-12, T-13 et
 * C.7 bis par ce chemin).
 */

const context: BackupContext = { now: new Date("2026-09-24T11:00:00.000Z"), buildTime: "b", userAgent: "t", standalone: true };
const names: string[] = [];

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  resumeSeedsForTests();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

async function v3(): Promise<CoachJmDatabase> {
  const database = createTestDatabase("coach-jm-reset", 3);
  names.push(database.name);
  await database.open();
  return database;
}

/** La base « actuelle » : une pesée et une séance maison. */
async function currentBase(): Promise<CoachJmDatabase> {
  const database = await v3();
  await database.weightEntries.add({ id: "p-actuelle", date: "2026-09-24", kg: 80, createdAt: "x", updatedAt: "x" });
  return database;
}

async function validFile(): Promise<BackupEnvelope> {
  const source = await v3();
  await source.exercises.bulkAdd(exerciseCatalog);
  await source.workouts.bulkAdd(buildImportedWorkouts());
  return parseBackup(serializeBackup(await readBackup(source, context)));
}

function alteredText(envelope: BackupEnvelope): string {
  return serializeBackup(envelope).replace('"import-2026-09-15"', '"import-2026-09-1X"');
}

async function snapshot(database: Dexie): Promise<string> {
  return canonicalStringify((await readStores(database)).stores);
}

describe("resetAndRestore", () => {
  it("remplace entièrement la base actuelle par le fichier", async () => {
    const file = await validFile();
    const target = await currentBase();

    const result = await resetAndRestore(file, target);

    expect(result.hash).toBe(file.integrity.hash);
    expect(await target.weightEntries.get("p-actuelle")).toBeUndefined();
    const after = await readStores(target);
    for (const name of Object.keys(file.stores)) expect(canonicalStringify(after.stores[name]), name).toBe(canonicalStringify(file.stores[name]));
    /* La base n'est jamais supprimée : pas de seeds à suspendre. */
    expect(seedsSuspended()).toBe(false);
  });

  it("T-12 — empreinte altérée : refus à la validation, base NON effacée", async () => {
    const file = await validFile();
    const target = await currentBase();
    const before = await snapshot(target);

    await expect(resetAndRestore(parseBackup(alteredText(file)), target)).rejects.toThrow(/Empreinte différente pour : workouts/);
    expect(await snapshot(target)).toBe(before);
    expect(seedsSuspended()).toBe(false);
  });

  it("T-13 — test cardio dans le fichier : refus nommé, base NON effacée", async () => {
    const v2 = createTestDatabase("coach-jm-v2src", 2);
    names.push(v2.name);
    await v2.open();
    await v2.table("cardioTests").add({ id: "c1", versionId: "v", date: "2026-09-01", status: "complet" });
    const file = parseBackup(serializeBackup(await readBackup(v2, context, { formatVersion: 1 })));
    const target = await currentBase();
    const before = await snapshot(target);

    await expect(resetAndRestore(file, target)).rejects.toThrow(/cardioTests \(1\)/);
    expect(await snapshot(target)).toBe(before);
  });

  it("C.7 bis — panne pendant l'écriture : le vidage est annulé aussi, l'ancienne base reste intacte", async () => {
    const file = await validFile();
    const target = await currentBase();
    const before = await snapshot(target);
    const proto = writePrototypeOf(target);
    vi.spyOn(proto, "bulkAdd").mockImplementationOnce(() => {
      throw new Error("panne simulée");
    });

    await expect(resetAndRestore(file, target)).rejects.toThrow(/panne simulée/);
    expect(await snapshot(target)).toBe(before);
    expect(await target.weightEntries.get("p-actuelle")).toBeDefined();

    vi.restoreAllMocks();
    await resetAndRestore(file, target);
    expect(await target.workouts.count()).toBe(buildImportedWorkouts().length);
  });

  it("C.7 bis — relecture différente du fichier : tout est annulé, l'ancienne base reste intacte", async () => {
    const file = await validFile();
    const target = await currentBase();
    const before = await snapshot(target);
    let proto: object | null = Object.getPrototypeOf(target.workouts);
    while (proto && !Object.prototype.hasOwnProperty.call(proto, "toArray")) proto = Object.getPrototypeOf(proto);
    const owner = proto as Record<string, (...args: unknown[]) => unknown>;
    const original = owner.toArray!;
    vi.spyOn(owner, "toArray").mockImplementation(async function (this: { name?: string }, ...args: unknown[]) {
      const records = (await original.apply(this, args)) as Array<Record<string, unknown>>;
      return this.name === "workouts" ? records.map((record, index) => (index === 0 ? { ...record, note: "altérée" } : record)) : records;
    });

    await expect(resetAndRestore(file, target)).rejects.toThrow(/Relecture différente du fichier pour workouts/);
    vi.restoreAllMocks();
    expect(await snapshot(target)).toBe(before);
  });

  it("C.7 bis — fichier format 1 : les stores v3 absents du fichier sont vidés (les seeds les recompléteront)", async () => {
    const v1 = createTestDatabase("coach-jm-v1src", 1);
    names.push(v1.name);
    await v1.open();
    await v1.table("workouts").bulkAdd(buildImportedWorkouts());
    const file = parseBackup(serializeBackup(await readBackup(v1, context, { formatVersion: 1 })));
    const target = await currentBase();
    await target.settings.put({ key: "preferences", value: { theme: "dark", timerSound: true, freeWorkoutRestSec: 90 } });

    await resetAndRestore(file, target);

    const after = await readStores(target);
    expect(Object.entries(after.counts).filter(([name, count]) => count > 0 && !(name in file.stores))).toEqual([]);
    expect(canonicalStringify(after.stores.workouts)).toBe(canonicalStringify(file.stores.workouts));
  });

  it("T-11 par ce chemin : export → resetAndRestore dans une base peuplée → export, mêmes empreintes", async () => {
    const file = await validFile();
    const target = await currentBase();
    await resetAndRestore(file, target);
    const again = await readBackup(target, context);

    expect(again.integrity.hash).toBe(file.integrity.hash);
    expect(again.integrity.storeHashes).toEqual(file.integrity.storeHashes);
    expect(again.legacyIntegrity).toEqual(file.legacyIntegrity);
  });

  it("effacement : la base n'existe plus, seeds suspendus jusqu'au rechargement", async () => {
    const target = await currentBase();
    await eraseDatabase(target);

    expect(await Dexie.exists(target.name)).toBe(false);
    expect(seedsSuspended()).toBe(true);
  });
});

describe("Plus — Importer une sauvegarde / Effacer", () => {
  function chooseFile(text: string, name = "coach-jm-sauvegarde.json") {
    const file = new File([text], name, { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Fichier de sauvegarde"), { target: { files: [file] } });
  }

  it("fichier refusé : message nommant la cause, aucune question, rien de modifié", async () => {
    const file = await validFile();
    const target = await currentBase();
    const before = await snapshot(target);
    const reload = vi.fn();
    render(<DataResetSection database={target} reload={reload} />);

    chooseFile(alteredText(file));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringMatching(/Fichier refusé, rien n'a été modifié.*workouts/));
    expect(screen.queryByRole("button", { name: "Continuer" })).toBeNull();
    expect(await snapshot(target)).toBe(before);
    expect(reload).not.toHaveBeenCalled();
  });

  it("fichier valide : résumé, export de sécurité proposé, deux confirmations, puis remplacement et rechargement", async () => {
    const file = await validFile();
    const target = await currentBase();
    const reload = vi.fn();
    render(<DataResetSection database={target} reload={reload} />);

    chooseFile(serializeBackup(file));

    const sessions = buildImportedWorkouts().length;
    expect(await screen.findByText(new RegExp(`est valide : export du .*, ${sessions} séances\\. Toutes les données actuelles seront remplacées`))).toBeTruthy();
    expect(screen.getByText("Sauvegarder mes données")).toBeTruthy();
    expect(await target.weightEntries.count()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText("Remplacer toutes les données ?")).toBeTruthy();
    expect(await target.weightEntries.count()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /^Remplacer/ }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    expect(await target.weightEntries.count()).toBe(0);
    expect(canonicalStringify((await readStores(target)).stores.workouts)).toBe(canonicalStringify(file.stores.workouts));
  });

  it("Annuler à chaque étape : rien de modifié", async () => {
    const file = await validFile();
    const target = await currentBase();
    const before = await snapshot(target);
    const reload = vi.fn();
    render(<DataResetSection database={target} reload={reload} />);

    chooseFile(serializeBackup(file));
    fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    expect(screen.queryByText(/est valide/)).toBeNull();

    chooseFile(serializeBackup(file));
    fireEvent.click(await screen.findByRole("button", { name: "Continuer" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByText("Remplacer toutes les données ?")).toBeNull();

    expect(await snapshot(target)).toBe(before);
    expect(reload).not.toHaveBeenCalled();
  });

  it("Effacer : export proposé, deux confirmations, base supprimée, rechargement", async () => {
    const target = await currentBase();
    const reload = vi.fn();
    render(<DataResetSection database={target} reload={reload} />);

    fireEvent.click(screen.getByRole("button", { name: /Effacer toutes les données/ }));
    expect(screen.getByText("Toutes les données de Coach JM seront effacées.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.click(screen.getByRole("button", { name: /^Effacer\s*La base est effacée/ }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(await Dexie.exists(target.name)).toBe(false);
  });
});
