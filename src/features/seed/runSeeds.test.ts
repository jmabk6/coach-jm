import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { SessionTemplate, SettingsRecord, StrengthFrame, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { muscuCWithChairNote } from "../exercises/seedChair90";
import { expectedAfterFrameTargets } from "../strength/seedFrameTargets20260925";
import { FIX_WORKOUT_ID, fixesOf20260924 } from "../workout/seedFixWorkout20260924";
import { buildWorkout20260925, WORKOUT_20260925_ID } from "../history/seedWorkout20260925";
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
import { CARDIO_A, CARDIO_A_FORMER, PROGRAM_V1_ROUTINES, PROGRAM_V1_ROUTINES_EMPTY } from "../program/programV1";
import { CORE_LINKED, FLEXIBILITY_LINKED } from "../program/seedProgramV1";
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
    expect(SEEDS.map((seed) => seed.name)).toEqual(["settingsDefaults", "exerciseCatalog", "rpeScale", "testProtocols", "programV1", "routines", "frames", "goals", "routinesContent", "cardioASingleBlock", "fixWorkout20260924", "removeSkipped20260924", "addWorkout20260925", "themeLight", "frameTargets20260925", "chair90"]);
  });

  it("base neuve : crée les réglages par défaut, le catalogue et l'échelle ; second passage sans écriture", async () => {
    const first = await runSeeds();
    expect(first).toMatchObject({ ran: ["settingsDefaults", "exerciseCatalog", "rpeScale", "testProtocols", "programV1", "routines", "frames", "goals", "routinesContent", "cardioASingleBlock", "fixWorkout20260924", "removeSkipped20260924", "addWorkout20260925", "themeLight", "frameTargets20260925", "chair90"], failed: [], skipped: [] });

    const settings = await settingsByKey();
    expect(Object.keys(settings).sort()).toEqual(["install", "preferences", "testCycle", "testSchedule"]);
    expect(settings.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(settings.testCycle).toEqual({ anchorWeekStart: "2026-09-27", everyWeeks: 4 });
    const iso = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);
    expect(settings.install).toEqual({ settingsDefaults: iso, testProtocols: iso, programV1: iso, routines: iso, frames: iso, goals: iso, routinesContent: iso, cardioASingleBlock: iso, fixWorkout20260924: iso, removeSkipped20260924: iso, addWorkout20260925: iso, themeLight: iso, frameTargets20260925: iso, chair90: iso });
    expect(await db.goals.count()).toBe(7);
    expect(await db.testProtocols.count()).toBe(7);
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
    /* Stores v3 : vides pour un fichier v2, ceux du fichier pour un fichier v3. */
    for (const name of ["testProtocols", "testProtocolVersions", "testResults", "settings"]) {
      expect(restored.counts[name], name).toBe((file.stores[name] ?? []).length);
    }
    expect(await db.workouts.get("a-remplacer")).toBeUndefined();

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await runSeeds()).toMatchObject({ failed: [], skipped: [] });
    const seeded = await readStores(db);

    /* Lots C et D : réglages, place des tests, modèles V1 et routines ajoutés ; rien d'existant n'est réécrit. */
    const settingsKeys = Object.keys(await settingsByKey()).sort();
    expect(settingsKeys).toEqual(["install", "preferences", "testCycle", "testSchedule"]);
    const untouched = ["plannedSessions", "weightEntries", "strengthMilestones"];
    /* Seed 10 : seule la Cardio A du 24/09, si elle est dans l'état constaté, est corrigée. */
    const seededWorkouts = seeded.stores.workouts as WorkoutSession[];
    const byId = (a: WorkoutSession, b: WorkoutSession) => (a.id < b.id ? -1 : 1);
    /* Seed 12 : la séance du 25/09 s'ajoute dans la base de l'utilisateur, si ce jour-là est vide. */
    const fileWorkouts = (file.stores.workouts ?? []) as WorkoutSession[];
    /* Ajoutée par le seed, pas déjà dans le fichier (sauvegarde prise après le seed 12). */
    const added = fileWorkouts.some((workout) => workout.id === WORKOUT_20260925_ID)
      ? undefined
      : seededWorkouts.find((workout) => workout.id === WORKOUT_20260925_ID);
    expect(added !== undefined, "séance du 25/09").toBe(
      fileWorkouts.some((workout) => workout.id === FIX_WORKOUT_ID) &&
        !fileWorkouts.some((workout) => workout.date === "2026-09-25" && workout.status === "completed"),
    );
    if (added) expect(canonicalStringify(added)).toBe(canonicalStringify(buildWorkout20260925(added.createdAt)));
    const expectedWorkouts = [
      ...fileWorkouts.map((workout) => {
        const updatedAt = seededWorkouts.find((candidate) => candidate.id === workout.id)?.updatedAt ?? "";
        return workout.id === FIX_WORKOUT_ID ? fixesOf20260924(workout, updatedAt) : workout;
      }),
      ...(added ? [added] : []),
    ].sort(byId);
    expect(canonicalStringify([...seededWorkouts].sort(byId)), "workouts").toBe(canonicalStringify(expectedWorkouts));
    /* Lot H : les 7 objectifs s'installent ; ceux du fichier restent identiques. */
    const seededGoals = seeded.stores.goals as Array<{ id: string; key: string }>;
    expect(new Set(seededGoals.map((goal) => goal.key)).size).toBe(7);
    for (const goal of (file.stores.goals ?? []) as Array<{ id: string; key: string; linkedExercises: unknown[]; updatedAt: string }>) {
      const seededGoal = seededGoals.find((item) => item.id === goal.id) as { updatedAt?: string } | undefined;
      /* Seed 13 (lot K.1) : Tronc et Souplesse reçoivent leurs exercices liés si leur liste était vide. */
      const linked = goal.linkedExercises.length === 0 ? { core: CORE_LINKED, flexibility: FLEXIBILITY_LINKED }[goal.key] : undefined;
      const expectedGoal = linked
        ? { ...goal, linkedExercises: linked.map((exerciseId) => ({ exerciseId })), updatedAt: seededGoal?.updatedAt }
        : goal;
      expect(canonicalStringify(seededGoal), goal.id).toBe(canonicalStringify(expectedGoal));
    }
    /* Lot D.6 : les cadres du fichier restent identiques, ceux du programme s'ajoutent (T-21) ;
       seed 15 : trois cadres de Muscu B encore en V1 semée passent en V2. */
    const seededVersions = seeded.stores.strengthFrameVersions as StrengthFrameVersion[];
    const recalibrated = expectedAfterFrameTargets(
      (file.stores.strengthFrames ?? []) as StrengthFrame[],
      (file.stores.strengthFrameVersions ?? []) as StrengthFrameVersion[],
      (frameId) => seededVersions.find((version) => version.id === `${frameId}-v2`),
    );
    for (const store of ["strengthFrames", "strengthFrameVersions"]) {
      const seededById = new Map((seeded.stores[store] as Array<{ id: string }>).map((item) => [item.id, item]));
      for (const item of (file.stores[store] ?? []) as Array<{ id: string }>) {
        expect(canonicalStringify(seededById.get(item.id)), `${store} ${item.id}`).toBe(canonicalStringify(recalibrated.get(item.id) ?? item));
      }
    }
    const fileTemplates = (file.stores.sessionTemplates ?? []) as Array<{ id: string }>;
    const seededTemplates = seeded.stores.sessionTemplates as Array<{ id: string }>;
    for (const template of fileTemplates) {
      const seededTemplate = seededTemplates.find((item) => item.id === template.id) as { updatedAt?: string } | undefined;
      /* Seed 9 (24/09/2026) : l'ancien Cardio A intact passe en un seul bloc ; rien d'autre ne change. */
      /* Seed 13 (lot K.1) : une routine encore vide et non modifiée reçoit son contenu. */
      const routine = emptyRoutineContent(template);
      /* Seed 16 : la chaise de Muscu C reçoit sa consigne (90°) si elle n'en avait pas. */
      const withChairNote = muscuCWithChairNote(template as SessionTemplate, seededTemplate?.updatedAt ?? "");
      const expected = isFormerCardioA(template)
        ? { ...template, mainBlockId: CARDIO_A.mainBlockId, blocks: CARDIO_A.blocks, updatedAt: seededTemplate?.updatedAt }
        : routine
          ? { ...template, ...routine, updatedAt: seededTemplate?.updatedAt }
          : (withChairNote ?? template);
      expect(canonicalStringify(seededTemplate), template.id).toBe(canonicalStringify(expected));
    }
    expect(seededTemplates.filter((item) => !fileTemplates.some((t) => t.id === item.id)).every((item) => item.id.startsWith("v1-"))).toBe(true);
    if ((file.stores.weeklyPrograms ?? []).length > 0) untouched.push("weeklyPrograms");
    if ((file.stores.rpeScaleVersions ?? []).length > 0) untouched.push("rpeScaleVersions");
    for (const name of untouched) expect(canonicalStringify(seeded.stores[name]), name).toBe(canonicalStringify(file.stores[name] ?? []));
    /* Le catalogue ne fait que compléter des champs absents : mêmes exercices. */
    expect((seeded.stores.exercises as Array<{ id: string }>).map((e) => e.id).sort()).toEqual(
      expect.arrayContaining((file.stores.exercises as Array<{ id: string }>).map((e) => e.id).sort()),
    );

    const spies = spyWrites();
    await runSeeds();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(canonicalStringify([...((await readStores(db)).stores.workouts as WorkoutSession[])].sort(byId))).toBe(canonicalStringify(expectedWorkouts));
  });
});

function isFormerCardioA(template: { id: string; mainBlockId?: string; blocks?: unknown }): boolean {
  return (
    template.id === CARDIO_A.id &&
    template.mainBlockId === CARDIO_A_FORMER.mainBlockId &&
    canonicalStringify(template.blocks) === canonicalStringify(CARDIO_A_FORMER.blocks)
  );
}

function emptyRoutineContent(template: { id: string; name?: string; blocks?: unknown[] }) {
  const empty = PROGRAM_V1_ROUTINES_EMPTY.find((item) => item.id === template.id);
  if (!empty || template.name !== empty.name || (template.blocks ?? []).length > 0) return undefined;
  return PROGRAM_V1_ROUTINES.find((item) => item.id === template.id);
}
