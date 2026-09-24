import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { Exercise, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { calculateVolume } from "../../domain/rules/workoutRules";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { pickBestSeries } from "../workout/workoutBlockDetail";
import { readBackup, serializeBackup, type BackupContext } from "./exportBackup";
import { parseBackup, restoreBackup } from "./restoreBackup";
import { createTestDatabase } from "./testDatabase";

/**
 * Lot a (23/09/2026) : `Exercise.loadSemantics` est un champ facultatif,
 * non indexé — ni version Dexie, ni `upgrade()`. Il voyage dans la
 * sauvegarde comme tout champ d'enregistrement, et une sauvegarde plus
 * ancienne (sans le champ) se restaure telle quelle, le seed du
 * lancement le complétant ensuite.
 */

const context: BackupContext = {
  now: new Date("2026-09-23T10:00:00.000Z"),
  buildTime: "build",
  userAgent: "test",
  standalone: true,
};

const opened: Dexie[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
  db.close();
  await db.delete();
});

function withoutSemantics(exercise: Exercise): Exercise {
  const copy = { ...exercise };
  delete copy.loadSemantics;
  return copy;
}

function tractionSeries(workout: WorkoutSession | undefined) {
  const block = workout?.blocks.find(
    (item): item is PerformedExerciseBlock => item.kind === "exercise" && item.exerciseId === "traction-assistee",
  );
  return block?.series ?? [];
}

describe("sauvegarde et sens de la charge", () => {
  it("un export de la base semée contient le champ sur la traction et les dips assistés", async () => {
    await db.delete();
    await db.open();
    await seedExerciseCatalog();

    const envelope = await readBackup(db, context);
    const exercises = envelope.stores.exercises as Exercise[];
    const semantics = Object.fromEntries(
      exercises.filter((exercise) => exercise.loadSemantics !== undefined).map((e) => [e.id, e.loadSemantics]),
    );

    expect(semantics).toEqual({ "traction-assistee": "assistance", "dips-assistes": "assistance" });
    expect(serializeBackup(envelope)).toMatch(/"loadSemantics":\s*"assistance"/);
  });

  it("une sauvegarde sans le champ se restaure, puis le seed le complète sans toucher aux séances", async () => {
    const source = createTestDatabase("coach-jm-test", 2);
    opened.push(source);
    await source.table("exercises").bulkAdd(exerciseCatalog.map(withoutSemantics));
    await source.table("workouts").bulkAdd(buildImportedWorkouts());
    const text = serializeBackup(await readBackup(source, context));
    expect(text).not.toContain("loadSemantics");

    await db.delete();
    await db.open();
    const result = await restoreBackup(parseBackup(text), db);
    expect(result.counts.exercises).toBe(exerciseCatalog.length);

    const restored = await db.table("exercises").get("traction-assistee");
    expect(restored.loadSemantics).toBeUndefined();

    const before = await db.table("workouts").toArray();
    await seedExerciseCatalog();

    expect((await db.table("exercises").get("traction-assistee")).loadSemantics).toBe("assistance");
    expect((await db.table("exercises").get("dips-assistes")).loadSemantics).toBe("assistance");
    expect((await db.table("exercises").get("squat")).loadSemantics).toBeUndefined();
    expect(await db.table("workouts").toArray()).toEqual(before);
  });
});

describe("fichier réel (COACH_JM_BACKUP) — sens de la charge", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("restauré puis semé : la traction devient une assistance, les séries du 15/09 restent identiques", async () => {
    const text = await readFile(path!, "utf8");
    const envelope = parseBackup(text);
    const fileWorkout = (envelope.stores.workouts as WorkoutSession[]).find((w) => w.id === "import-2026-09-15");
    const fileSeries = tractionSeries(fileWorkout);
    expect(fileSeries.map((item) => [item.load, item.reps])).toEqual([
      [{ kind: "total", kg: 49 }, 10],
      [{ kind: "total", kg: 49 }, 6],
      [{ kind: "total", kg: 56 }, 10],
    ]);

    await db.delete();
    await db.open();
    await restoreBackup(envelope, db);
    await seedExerciseCatalog();

    const traction = (await db.table("exercises").get("traction-assistee")) as Exercise;
    expect(traction.loadSemantics).toBe("assistance");

    /* Les séances ne sont pas touchées : le 15/09 est identique au fichier. */
    const stored = (await db.table("workouts").get("import-2026-09-15")) as WorkoutSession;
    expect(stored).toEqual(fileWorkout);
    const series = tractionSeries(stored);
    expect(series).toEqual(fileSeries);

    expect(calculateVolume(series, traction.loadSemantics)).toBe(0);
    const best = pickBestSeries(series, traction.loadSemantics);
    expect([best?.load, best?.reps]).toEqual([{ kind: "total", kg: 49 }, 10]);

    /* Toutes les séances du fichier sont relues à l'identique après le seed. */
    const all = await db.table("workouts").toArray();
    expect(all.length).toBe((envelope.stores.workouts as WorkoutSession[]).length);
    const byId = new Map((envelope.stores.workouts as WorkoutSession[]).map((w) => [w.id, w]));
    for (const workout of all as WorkoutSession[]) expect(workout, workout.id).toEqual(byId.get(workout.id));
  });
});
