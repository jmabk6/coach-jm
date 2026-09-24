import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { SettingsRecord } from "../../domain";
import { canonicalStringify } from "../backup/canonicalJson";
import { readStores } from "../backup/exportBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { WRITE_METHODS, writePrototypeOf } from "../backup/testDatabase";
import { DEFAULT_PREFERENCES, DEFAULT_TEST_CYCLE } from "./seedSettingsDefaults";

/* Médias du catalogue préfixés comme en production (voir
   seedRealBackup.test.ts) : sans cela, le seed du catalogue
   resynchroniserait les médias d'une sauvegarde réelle. */
vi.stubEnv("BASE_URL", "/coach-jm/");
const { runSeeds, suspendSeeds, resumeSeedsForTests, SEEDS } = await import("./runSeeds");
const { seedSettingsDefaults } = await import("./seedSettingsDefaults");

/**
 * Lot C.7 — seeds du lancement (SCHEMA_DEXIE_V3_MIGRATION.md § 5), dont
 * T-8 (R) : deux passages, le second sans aucune écriture.
 */

beforeEach(async () => {
  resumeSeedsForTests();
  db.close();
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.restoreAllMocks();
  resumeSeedsForTests();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  db.close();
  await db.delete();
});

function spyWrites() {
  const proto = writePrototypeOf(db);
  return WRITE_METHODS.map((method) => vi.spyOn(proto, method));
}

async function settingsByKey(): Promise<Record<string, SettingsRecord["value"]>> {
  return Object.fromEntries((await db.settings.toArray()).map((record) => [record.key, record.value]));
}

describe("runSeeds", () => {
  it("ordre du § 5.2 : settingsDefaults avant tout", () => {
    expect(SEEDS.map((seed) => seed.name)).toEqual(["settingsDefaults", "exerciseCatalog", "rpeScale"]);
  });

  it("base neuve : crée les réglages par défaut, le catalogue et l'échelle ; second passage sans écriture", async () => {
    const first = await runSeeds();
    expect(first).toMatchObject({ ran: ["settingsDefaults", "exerciseCatalog", "rpeScale"], failed: [], skipped: [] });

    const settings = await settingsByKey();
    expect(Object.keys(settings).sort()).toEqual(["install", "preferences", "testCycle"]);
    expect(settings.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(settings.testCycle).toEqual({ anchorWeekStart: "2026-09-27", everyWeeks: 4 });
    expect(settings.install).toEqual({ settingsDefaults: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    expect(await db.exercises.count()).toBeGreaterThan(0);
    expect(await db.rpeScaleVersions.count()).toBe(1);

    const before = canonicalStringify((await readStores(db)).stores);
    const spies = spyWrites();
    await runSeeds();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(canonicalStringify((await readStores(db)).stores)).toBe(before);
  });

  it("un réglage présent n'est jamais réécrit ; seuls les manquants sont créés", async () => {
    const mine: SettingsRecord = { key: "preferences", value: { theme: "dark", timerSound: false, freeWorkoutRestSec: 60 } };
    await db.settings.put(mine);

    await seedSettingsDefaults(new Date("2026-09-24T10:00:00Z"));

    expect(await settingsByKey()).toEqual({
      preferences: mine.value,
      testCycle: DEFAULT_TEST_CYCLE,
      install: { settingsDefaults: "2026-09-24T10:00:00.000Z" },
    });
  });

  it("marqueur posé : rien n'est recréé, même si l'utilisateur a depuis supprimé un réglage", async () => {
    await seedSettingsDefaults();
    await db.settings.delete("testCycle");
    const spies = spyWrites();

    await seedSettingsDefaults();

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await db.settings.get("testCycle")).toBeUndefined();
  });

  it("atomicité : une panne à l'écriture du marqueur n'écrit aucun réglage", async () => {
    const proto = writePrototypeOf(db);
    const original = proto.put!;
    vi.spyOn(proto, "put").mockImplementation(function (this: unknown, ...args: unknown[]) {
      if ((args[0] as SettingsRecord).key === "install") throw new Error("panne simulée");
      return original.apply(this, args);
    });

    await expect(seedSettingsDefaults()).rejects.toThrow(/panne simulée/);
    vi.restoreAllMocks();
    expect(await db.settings.count()).toBe(0);
  });

  it("un seed qui lève est journalisé, ses dépendants sont sautés, les autres s'exécutent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const calls: string[] = [];

    const report = await runSeeds([
      { name: "a", run: async () => { calls.push("a"); throw new Error("a en panne"); } },
      { name: "b", dependsOn: ["a"], run: async () => { calls.push("b"); } },
      { name: "c", dependsOn: ["b"], run: async () => { calls.push("c"); } },
      { name: "d", run: async () => { calls.push("d"); } },
    ]);

    expect(report).toMatchObject({ ran: ["d"], failed: ["a"], skipped: ["b", "c"] });
    expect(calls).toEqual(["a", "d"]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/« a » a échoué/);
  });

  it("seeds suspendus (entre effacement et rechargement) : aucune écriture", async () => {
    suspendSeeds();
    const spies = spyWrites();

    expect(await runSeeds()).toMatchObject({ suspended: true, ran: [] });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("T-8 / T-9 (R) — sauvegarde réelle : resetAndRestore puis seeds, deux fois", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("premier passage : seuls les réglages du lot C sont créés ; second passage : aucune écriture ; séances identiques", async () => {
    const file = parseBackup(await readFile(path!, "utf8"));
    await db.workouts.add({ id: "a-remplacer", date: "2030-01-01", status: "draft", blocks: [], createdAt: "x", updatedAt: "x" } as never);

    await resetAndRestore(file, db);
    resumeSeedsForTests(); // le rechargement de l'étape 6

    const restored = await readStores(db);
    for (const name of ["testProtocols", "testProtocolVersions", "testResults", "settings"]) expect(restored.counts[name], name).toBe(0);
    expect(await db.workouts.get("a-remplacer")).toBeUndefined();

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await runSeeds()).toMatchObject({ failed: [], skipped: [] });
    const seeded = await readStores(db);

    expect(Object.keys(await settingsByKey()).sort()).toEqual(["install", "preferences", "testCycle"]);
    const untouched = ["workouts", "plannedSessions", "weeklyPrograms", "sessionTemplates", "weightEntries", "strengthFrames", "strengthFrameVersions", "strengthMilestones", "goals"];
    if ((file.stores.rpeScaleVersions ?? []).length > 0) untouched.push("rpeScaleVersions");
    for (const name of untouched) expect(canonicalStringify(seeded.stores[name]), name).toBe(canonicalStringify(file.stores[name] ?? []));
    /* Le catalogue ne fait que compléter des champs absents : mêmes exercices. */
    expect((seeded.stores.exercises as Array<{ id: string }>).map((e) => e.id).sort()).toEqual(
      expect.arrayContaining((file.stores.exercises as Array<{ id: string }>).map((e) => e.id).sort()),
    );

    const spies = spyWrites();
    await runSeeds();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(canonicalStringify((await readStores(db)).stores.workouts)).toBe(canonicalStringify(file.stores.workouts));
  });
});
