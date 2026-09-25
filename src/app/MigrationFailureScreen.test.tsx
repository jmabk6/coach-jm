// @vitest-environment jsdom
import "fake-indexeddb/auto";

import Dexie from "dexie";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachJmDatabase, MigrationGuardError, VERSION_2_STORES } from "../db/database";
import { canonicalStringify } from "../features/backup/canonicalJson";
import { readBackup, readStores } from "../features/backup/exportBackup";
import { verifyBackupIntegrity } from "../features/backup/restoreBackup";
import { CoachJmDatabaseV2, WRITE_METHODS, uniqueTestName, writePrototypeOf } from "../features/backup/testDatabase";
import { buildImportedWorkouts } from "../features/history/fixtures/september2026";
import { MigrationFailureScreen } from "./MigrationFailureScreen";
import { openDatabaseAsIs } from "./openDatabaseAsIs";

/**
 * Lot C.4 — échec d'ouverture au démarrage (SCHEMA_DEXIE_V3_MIGRATION.md
 * § 4.4) et export de secours (T-17).
 */

const opened: string[] = [];

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const name of opened.splice(0)) await Dexie.delete(name);
});

async function refusedBase(): Promise<{ name: string; error: unknown }> {
  const name = uniqueTestName("coach-jm-refus");
  opened.push(name);
  const legacy = new CoachJmDatabaseV2(name);
  await legacy.open();
  await legacy.workouts.bulkAdd(buildImportedWorkouts());
  await legacy.table("cardioTests").add({ id: "c1", versionId: "v", date: "2026-09-01", status: "complet" });
  legacy.close();

  const current = new CoachJmDatabase(name);
  const error = await current.open().then(
    () => undefined,
    (caught: unknown) => caught,
  );
  current.close();
  return { name, error };
}

describe("T-17 — export de secours d'une base restée en v2", () => {
  it("la garde lève MigrationGuardError, avec les comptes par store", async () => {
    const { error } = await refusedBase();
    expect(error).toBeInstanceOf(MigrationGuardError);
    expect((error as MigrationGuardError).counts).toEqual({ cardioTests: 1 });
  });

  it("la base s'ouvre telle quelle, s'exporte en format 1 valide, 19 stores, contenu égal, sans aucune écriture", async () => {
    const { name } = await refusedBase();
    const legacy = await openDatabaseAsIs(name);
    expect(legacy.verno).toBe(2);

    const proto = writePrototypeOf(legacy);
    const spies = WRITE_METHODS.map((method) => vi.spyOn(proto, method));

    const envelope = await readBackup(
      legacy,
      { now: new Date("2026-09-24T08:00:00Z"), buildTime: "t", userAgent: "t", standalone: false },
      { formatVersion: 1 },
    );
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();

    expect(envelope.formatVersion).toBe(1);
    expect(envelope.database.version).toBe(2);
    expect(Object.keys(envelope.stores).sort()).toEqual(Object.keys(VERSION_2_STORES).sort());
    expect(envelope.counts.cardioTests).toBe(1);
    expect(envelope.counts.workouts).toBe(buildImportedWorkouts().length);
    expect(await verifyBackupIntegrity(envelope)).toMatchObject({ ok: true });
    expect(canonicalStringify((await readStores(legacy)).stores)).toBe(canonicalStringify(envelope.stores));
    legacy.close();
  });
});

describe("écran d'échec de migration", () => {
  it("nomme les données en cause et propose l'export", async () => {
    const error = new MigrationGuardError({ cardioTests: 1, goals: 2 });
    const openAsIs = vi.fn(async () => {
      const name = uniqueTestName("coach-jm-ecran");
      opened.push(name);
      const legacy = new CoachJmDatabaseV2(name);
      await legacy.open();
      legacy.close();
      return openDatabaseAsIs(name);
    });

    render(<MigrationFailureScreen error={error} openAsIs={openAsIs} />);

    expect(screen.getByRole("heading", { level: 1, name: "Mise à jour des données arrêtée" })).toBeTruthy();
    expect(screen.getByText(/Rien n'a été modifié/)).toBeTruthy();
    expect(screen.getByText(/Tests cardio — 1 enregistrement$/)).toBeTruthy();
    expect(screen.getByText(/Objectifs — 2 enregistrements/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Préparer l'export" }));
    expect(await screen.findByText("Sauvegarder mes données")).toBeTruthy();
    expect(openAsIs).toHaveBeenCalledTimes(1);
  });

  it("base bloquée par un autre onglet : consigne explicite", () => {
    render(<MigrationFailureScreen blocked />);
    expect(screen.getByText(/Fermez les autres onglets/)).toBeTruthy();
  });

  it("autre échec : le message brut est montré", () => {
    render(<MigrationFailureScreen error={new Error("QuotaExceededError")} />);
    expect(screen.getByText("QuotaExceededError")).toBeTruthy();
  });
});
