import "fake-indexeddb/auto";

import Dexie, { type Table } from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import type {
  Exercise,
  Goal,
  PlannedSession,
  SessionTemplate,
  WeeklyProgram,
  WeightEntry,
  WorkoutSession,
} from "../domain";
import { seedExerciseCatalog } from "../features/exercises/seedExerciseCatalog";
import { importSeptember2026History } from "../features/history/importHistory";
import { buildImportedWorkouts } from "../features/history/importedWorkouts";
import { buildEstablishedDataset } from "../features/progression/fixtures/establishedDataset";
import { isCountedWorkout, listCountedWorkouts } from "../features/progression/overview";
import { resolvePeriod } from "../features/progression/period";
import {
  CoachJmDatabase,
  DATABASE_VERSION,
  STORE_NAMES,
  VERSION_1_STORES,
  db,
} from "./database";

/**
 * Migration v1 → v2 (conception technique v1.5, § 7 et § 9), sur des
 * bases indépendantes : chaque test ouvre une base v1 authentique sous un
 * nom unique, la peuple, la ferme, puis la rouvre avec la vraie classe.
 * Aucune de ces bases n'est `coach-jm`, sauf les deux tests qui passent
 * par les fonctions de l'application (import, seed), lesquelles écrivent
 * dans l'instance globale — supprimée avant et après.
 */

/** La base telle que l'application l'a créée jusqu'ici : version 1 seule. */
class LegacyDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  sessionTemplates!: Table<SessionTemplate, string>;
  weeklyPrograms!: Table<WeeklyProgram, string>;
  plannedSessions!: Table<PlannedSession, string>;
  workouts!: Table<WorkoutSession, string>;
  goals!: Table<Goal, string>;
  weightEntries!: Table<WeightEntry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores(VERSION_1_STORES);
  }
}

const LEGACY_STORES = Object.keys(VERSION_1_STORES) as Array<keyof typeof VERSION_1_STORES>;
const NEW_STORES = STORE_NAMES.filter((name) => !(LEGACY_STORES as string[]).includes(name));

let counter = 0;
const opened: string[] = [];

function uniqueName(): string {
  counter += 1;
  const name = `coach-jm-migration-${Date.now()}-${counter}`;
  opened.push(name);
  return name;
}

/** Crée une base v1, la peuple, la ferme. Retourne son nom. */
async function createLegacy(populate: (legacy: LegacyDatabase) => Promise<void>): Promise<string> {
  const name = uniqueName();
  const legacy = new LegacyDatabase(name);
  await legacy.open();
  expect(legacy.verno).toBe(1);
  await populate(legacy);
  legacy.close();
  return name;
}

async function openCurrent(name: string): Promise<CoachJmDatabase> {
  const current = new CoachJmDatabase(name);
  await current.open();
  return current;
}

async function dumpLegacyStores(database: Dexie): Promise<Record<string, unknown[]>> {
  const dump: Record<string, unknown[]> = {};
  for (const store of LEGACY_STORES) {
    dump[store] = await database.table(store).toArray();
  }
  return dump;
}

const NOW = "2026-09-10T10:00:00.000Z";

/** IndexedDB relit par clé primaire : on compare dans le même ordre. */
function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

const dataset = buildEstablishedDataset("2026-09-10");

/** Une séance terminée sans aucune réalisation : hors statistiques, hier comme demain. */
const emptyCompletedWorkout: WorkoutSession = {
  id: "fx-empty-completed",
  source: "free",
  status: "completed",
  date: "2026-09-08",
  startedAt: "2026-09-08T16:00:00.000Z",
  completedAt: "2026-09-08T16:03:00.000Z",
  lastActionAt: "2026-09-08T16:03:00.000Z",
  activeDurationSec: 180,
  blocks: [
    {
      id: "fx-empty-block",
      kind: "exercise",
      position: 0,
      addedDuringWorkout: true,
      exerciseId: "fx-squat",
      status: "not_performed",
      snapshotInstructions: { shape: "reps", sets: 1, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 },
      series: [{ id: "fx-empty-s1", position: 0, status: "not_performed" }],
    },
  ],
  createdAt: "2026-09-08T16:00:00.000Z",
  updatedAt: "2026-09-08T16:03:00.000Z",
};

afterEach(async () => {
  for (const name of opened.splice(0)) {
    await Dexie.delete(name);
  }
});

describe("schéma v2 — base vide (scénario 1)", () => {
  it("crée la version 2 avec les dix-neuf stores, tous vides", async () => {
    const current = await openCurrent(uniqueName());

    expect(current.verno).toBe(DATABASE_VERSION);
    expect(DATABASE_VERSION).toBe(2);
    expect(current.tables.map((table) => table.name).sort()).toEqual([...STORE_NAMES].sort());
    expect(current.tables).toHaveLength(19);
    expect(LEGACY_STORES).toHaveLength(7);
    expect(NEW_STORES).toHaveLength(12);

    for (const table of current.tables) {
      expect(await table.count(), table.name).toBe(0);
    }

    current.close();
  });

  it("la version 1 ne connaît que ses sept stores : la migration ajoute exactement les douze autres", async () => {
    const name = await createLegacy(async (legacy) => {
      expect(legacy.tables.map((table) => table.name).sort()).toEqual([...LEGACY_STORES].sort());
    });

    const current = await openCurrent(name);
    expect(current.verno).toBe(2);
    for (const store of NEW_STORES) {
      expect(await current.table(store).count(), store).toBe(0);
    }
    current.close();
  });
});

describe("migration v1 → v2 — données existantes préservées", () => {
  it("scénario 2 : base v1 sans séance — exercices et modèles inchangés", async () => {
    const name = await createLegacy(async (legacy) => {
      await legacy.exercises.bulkPut(dataset.exercises);
      await legacy.sessionTemplates.bulkPut(dataset.templates);
    });

    const current = await openCurrent(name);
    expect(await current.exercises.toArray()).toEqual(byId(dataset.exercises));
    expect(await current.sessionTemplates.toArray()).toEqual(byId(dataset.templates));
    expect(await current.workouts.count()).toBe(0);
    current.close();
  });

  it("scénario 3 : les dix séances importées sont relues à l'identique et gardent leur traitement statistique ; aucun jalon", async () => {
    const imported = buildImportedWorkouts();
    expect(imported).toHaveLength(10);
    const countedBefore = imported.filter(isCountedWorkout).map((w) => w.id);

    const name = await createLegacy(async (legacy) => {
      await legacy.workouts.bulkPut(imported);
    });

    const current = await openCurrent(name);
    const after = (await current.workouts.toArray()).sort((a, b) => a.date.localeCompare(b.date));

    expect(after).toEqual(imported);
    /* Le traitement statistique est celui d'avant, ni plus ni moins : on
       ne suppose pas qu'une séance importée est comptée parce qu'importée. */
    expect(after.filter(isCountedWorkout).map((w) => w.id)).toEqual(countedBefore);
    expect(after.every((w) => w.kind === undefined)).toBe(true);
    expect(await current.strengthMilestones.count()).toBe(0);
    current.close();
  });

  it("scénario 4 : séances faites dans l'app — `kind` absent partout, traitement statistique antérieur conservé (séance vide hors statistiques)", async () => {
    const workouts = [...dataset.workouts, emptyCompletedWorkout];
    const period = resolvePeriod("12w", dataset.today);
    const countedBefore = listCountedWorkouts(workouts, period).map((w) => w.id).sort();
    expect(isCountedWorkout(emptyCompletedWorkout)).toBe(false);

    const name = await createLegacy(async (legacy) => {
      await legacy.workouts.bulkPut(workouts);
      await legacy.plannedSessions.bulkPut(dataset.plannedSessions);
    });

    const current = await openCurrent(name);
    const after = await current.workouts.toArray();

    expect(after).toHaveLength(workouts.length);
    expect(after.every((w) => w.kind === undefined)).toBe(true);
    expect(listCountedWorkouts(after, period).map((w) => w.id).sort()).toEqual(countedBefore);
    expect(after.find((w) => w.id === emptyCompletedWorkout.id)).toEqual(emptyCompletedWorkout);
    expect(isCountedWorkout(after.find((w) => w.id === emptyCompletedWorkout.id)!)).toBe(false);
    expect(await current.plannedSessions.count()).toBe(dataset.plannedSessions.length);
    current.close();
  });

  it("scénario 5 : un exercice modifié par l'utilisateur est préservé, sans classification de progression", async () => {
    const custom: Exercise = {
      ...dataset.exercises[0]!,
      name: "Squat — ma variante",
      technique: "Ma consigne à moi",
      updatedAt: NOW,
    };

    const name = await createLegacy(async (legacy) => {
      await legacy.exercises.put(custom);
    });

    const current = await openCurrent(name);
    const stored = await current.exercises.get(custom.id);

    expect(stored).toEqual(custom);
    expect(stored?.progressionGroup).toBeUndefined();
    expect(stored?.movementFamily).toBeUndefined();
    expect(await current.exercises.where("progressionGroup").equals("Quadriceps").count()).toBe(0);
    current.close();
  });

  it("scénario 9 : `goals` et `weightEntries` sont préservés, l'index unique sur la date tient toujours", async () => {
    const goal: Goal = {
      id: "goal-1",
      name: "Presse 120 kg",
      target: { kind: "exercise", exerciseId: "presse-cuisses", metric: "max_load", targetValue: 120 },
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    };
    const weight: WeightEntry = { id: "w-1", date: "2026-09-01", kg: 80.4, createdAt: NOW, updatedAt: NOW };

    const name = await createLegacy(async (legacy) => {
      await legacy.goals.put(goal);
      await legacy.weightEntries.put(weight);
    });

    const current = await openCurrent(name);
    expect(await current.goals.toArray()).toEqual([goal]);
    expect(await current.weightEntries.toArray()).toEqual([weight]);
    await expect(
      current.weightEntries.add({ id: "w-2", date: "2026-09-01", kg: 81, createdAt: NOW, updatedAt: NOW }),
    ).rejects.toThrow();
    expect(await current.weightEntries.count()).toBe(1);
    current.close();
  });
});

describe("migration v1 → v2 — stabilité", () => {
  it("scénario 7 : une base déjà en v2 se rouvre sans retraitement", async () => {
    const name = await createLegacy(async (legacy) => {
      await legacy.workouts.bulkPut(dataset.workouts);
      await legacy.exercises.bulkPut(dataset.exercises);
    });

    const first = await openCurrent(name);
    const snapshot = await dumpLegacyStores(first);
    first.close();

    const second = await openCurrent(name);
    expect(second.verno).toBe(2);
    expect(await dumpLegacyStores(second)).toEqual(snapshot);
    for (const store of NEW_STORES) expect(await second.table(store).count()).toBe(0);
    second.close();
  });

  it("scénario 8 : la migration relancée est idempotente", async () => {
    const name = await createLegacy(async (legacy) => {
      await legacy.workouts.bulkPut(dataset.workouts);
      await legacy.sessionTemplates.bulkPut(dataset.templates);
      await legacy.exercises.bulkPut(dataset.exercises);
    });

    let reference: Record<string, unknown[]> | undefined;
    for (let round = 0; round < 3; round += 1) {
      const current = await openCurrent(name);
      const dump = await dumpLegacyStores(current);
      reference ??= dump;
      expect(dump).toEqual(reference);
      expect(current.verno).toBe(2);
      current.close();
    }
  });

  it("scénario 10 : les nouveaux index répondent, y compris sur des champs absents", async () => {
    const name = await createLegacy(async (legacy) => {
      await legacy.workouts.bulkPut(dataset.workouts);
      await legacy.exercises.bulkPut(dataset.exercises);
    });

    const current = await openCurrent(name);

    /* Champs absents sur les enregistrements anciens : 0 résultat, pas d'erreur. */
    expect(await current.workouts.where("kind").equals("mobility_assessment").count()).toBe(0);
    expect(await current.exercises.where("movementFamily").equals("tirage_vertical").count()).toBe(0);

    /* Les index simples des anciens stores fonctionnent toujours. */
    expect(await current.workouts.where("status").equals("completed").count()).toBe(
      dataset.workouts.filter((w) => w.status === "completed").length,
    );

    /* Index composés des nouveaux stores. */
    await current.cardioTestMeasures.bulkAdd([
      { id: "m1", testId: "t1", key: "fc", value: 120, unit: "bpm" },
      { id: "m2", testId: "t1", key: "vitesse", value: 8, unit: "km/h" },
      { id: "m3", testId: "t2", key: "fc", value: 118, unit: "bpm" },
    ]);
    expect(await current.cardioTestMeasures.where("[testId+key]").equals(["t1", "fc"]).count()).toBe(1);
    expect(await current.cardioTestMeasures.where("testId").equals("t1").count()).toBe(2);

    await current.mobilityMeasures.bulkAdd([
      { id: "mm1", assessmentId: "a1", key: "jambes_doigts_orteils", conforme: true, measureRef: { blockId: "b1", field: "distanceCm" } },
      { id: "mm2", assessmentId: "a1", key: "cheville_orteil_mur", side: "gauche", conforme: true, measureRef: { blockId: "b2", field: "left" } },
    ]);
    expect(await current.mobilityMeasures.where("[assessmentId+key]").equals(["a1", "cheville_orteil_mur"]).count()).toBe(1);

    /* Un seul bilan par séance : l'index unique refuse le doublon. */
    await current.mobilityAssessments.add({ id: "a1", workoutId: "w-1", versionId: "v1", date: "2026-09-10", createdAt: NOW });
    await expect(
      current.mobilityAssessments.add({ id: "a2", workoutId: "w-1", versionId: "v1", date: "2026-09-11", createdAt: NOW }),
    ).rejects.toThrow();
    expect(await current.mobilityAssessments.where("workoutId").equals("w-1").count()).toBe(1);

    /* Un nouveau champ indexé sur un ancien store est interrogeable dès qu'il est écrit. */
    await current.workouts.put({ ...emptyCompletedWorkout, id: "fx-bilan", kind: "mobility_assessment" });
    expect(await current.workouts.where("kind").equals("mobility_assessment").primaryKeys()).toEqual(["fx-bilan"]);

    current.close();
  });
});

describe("migration v1 → v2 — par les fonctions de l'application (instance globale `coach-jm`)", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  /** Recrée `coach-jm` en version 1, comme l'application l'a laissée. */
  async function createLegacyCoachJm(populate: (legacy: LegacyDatabase) => Promise<void>): Promise<void> {
    db.close();
    await db.delete();
    const legacy = new LegacyDatabase("coach-jm");
    await legacy.open();
    expect(legacy.verno).toBe(1);
    await populate(legacy);
    legacy.close();
  }

  it("scénario 3 bis : base à neuf séances (version déployée), migration, puis import en version dix", async () => {
    const nine = buildImportedWorkouts()
      .slice(0, 9)
      .map((w) => ({ ...w, createdAt: "2026-09-16T12:00:00.000Z", updatedAt: "2026-09-16T12:00:00.000Z" }));
    expect(nine.map((w) => w.date).at(-1)).toBe("2026-09-15");

    await createLegacyCoachJm(async (legacy) => {
      await legacy.workouts.bulkPut(nine);
    });

    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.workouts.count()).toBe(9);

    const result = await importSeptember2026History();
    expect(result).toEqual({ workoutsCreated: 1, workoutsUpdated: 9 });

    const after = (await db.workouts.toArray()).sort((a, b) => a.date.localeCompare(b.date));
    expect(after).toHaveLength(10);
    expect(after.at(-1)?.id).toBe("import-2026-09-16");

    const strip = (w: WorkoutSession) => {
      const copy = { ...w } as Partial<WorkoutSession>;
      delete copy.createdAt;
      delete copy.updatedAt;
      return copy;
    };
    expect(after.slice(0, 9).map(strip)).toEqual(nine.map(strip));
    expect(after.slice(0, 9).every((w) => w.updatedAt === "2026-09-17T12:00:00.000Z")).toBe(true);
    expect(new Set(after.map((w) => w.id)).size).toBe(10);
    expect(await db.strengthMilestones.count()).toBe(0);
  });

  it("scénario 6 : résidus de l'ancien seed de validation — rattrapage inchangé, pas de doublon", async () => {
    const legacyNow = "2026-09-05T08:00:00.000Z";
    /* Exercices tels que l'ancien seed les écrivait : sans `category`. */
    const legacySeed = [
      { id: "squat", name: "Squat", zone: "Jambes", movement: "Squat", equipment: "Barre", location: "Salle", mode: "series", measurementType: "load_reps", status: "active", createdAt: legacyNow, updatedAt: legacyNow },
      { id: "tapis", name: "Tapis", equipment: "Machine", location: "Salle", mode: "steps", measurementType: "duration_speed_incline", status: "active", createdAt: legacyNow, updatedAt: legacyNow },
      { id: "vieux-perso", name: "Exercice perso sans catégorie", location: "Maison", mode: "series", measurementType: "reps", status: "active", createdAt: legacyNow, updatedAt: legacyNow },
    ] as unknown as Exercise[];

    await createLegacyCoachJm(async (legacy) => {
      await legacy.exercises.bulkPut(legacySeed);
    });

    await db.open();
    expect(db.verno).toBe(2);
    await seedExerciseCatalog();

    const squat = await db.exercises.get("squat");
    expect(squat?.category).toBe("Musculation");
    expect(squat?.name).toBe("Squat barre");
    expect(squat?.createdAt).toBe(legacyNow);

    const tapis = await db.exercises.get("tapis");
    expect(tapis?.category).toBe("Cardio");
    expect(tapis?.createdAt).toBe(legacyNow);

    const perso = await db.exercises.get("vieux-perso");
    expect(perso?.status).toBe("archived");

    const all = await db.exercises.toArray();
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    expect(all.filter((e) => e.status === "active")).toHaveLength(48);
    expect(all.every((e) => e.progressionGroup === undefined && e.movementFamily === undefined)).toBe(true);
  });
});
