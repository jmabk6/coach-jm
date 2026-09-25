import "fake-indexeddb/auto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../db/database";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import {
  buildExercisePerformanceHistory,
  buildExercisePerformanceSummary,
  getDefaultPerformanceMetric,
} from "../exercises/exercisePerformance";
import { buildImportedWorkouts, importedWorkoutSpecs } from "./fixtures/september2026";

describe("historique importé de septembre 2026", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedExerciseCatalog();
  });

  afterAll(async () => {
    await db.delete();
    db.close();
  });

  it("transcrit les 10 séances des feuilles, toutes terminées et datées", () => {
    const workouts = buildImportedWorkouts();

    expect(workouts.map((w) => w.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-05",
      "2026-09-06",
      "2026-09-08",
      "2026-09-09",
      "2026-09-11",
      "2026-09-15",
      "2026-09-16",
    ]);

    for (const workout of workouts) {
      expect(workout.status).toBe("completed");
      expect(workout.source).toBe("free");
      expect(workout.activeDurationSec).toBeGreaterThan(0);
      expect(workout.completedAt).toBeDefined();
      expect(workout.startedAt.startsWith(`${workout.date}T16:00`)).toBe(true);
    }
  });

  it("référence uniquement des exercices du catalogue officiel", async () => {
    const known = new Set((await getAllExercises()).map((e) => e.id));

    for (const spec of importedWorkoutSpecs) {
      for (const block of spec.blocks) {
        expect(known.has(block.exercise), block.exercise).toBe(true);
      }
    }
  });

  it("alimente les fiches : charge max et volume de la presse, BPM du tapis", async () => {
    await db.workouts.bulkPut(buildImportedWorkouts());

    const exercises = await getAllExercises();
    const presse = exercises.find((e) => e.id === "presse-cuisses");
    if (!presse) throw new Error("presse absente");

    const workouts = await getCompletedWorkouts();
    const history = buildExercisePerformanceHistory(presse, workouts);

    expect(history.map((entry) => entry.date)).toEqual([
      "2026-09-15",
      "2026-09-11",
      "2026-09-05",
      "2026-09-01",
    ]);
    expect(Math.max(...history.map((e) => e.chargeMaxKg ?? 0))).toBe(120);

    const metric = getDefaultPerformanceMetric(presse);
    if (!metric) throw new Error("métrique absente");
    expect(buildExercisePerformanceSummary(history, metric)).toBeDefined();

    const tapis = workouts.find((w) => w.date === "2026-09-09")?.blocks[0];
    expect(tapis?.kind === "exercise" && tapis.cardioSteps?.length).toBe(8);
    expect(tapis?.kind === "exercise" && tapis.cardioSteps?.[5]?.bpm).toBe(150);

    /* 16/09 : la colonne « Temps » est cumulative (5, 10 … 30, 32, 40 min). */
    const tapis16 = workouts.find((w) => w.date === "2026-09-16")?.blocks[0];
    const steps16 = tapis16?.kind === "exercise" ? tapis16.cardioSteps ?? [] : [];
    const settings16 = steps16.map((step) => step.settings as { durationSec: number; inclinePercent: number });
    expect(settings16.map((step) => step.durationSec)).toEqual([300, 300, 300, 300, 300, 300, 120, 480]);
    expect(settings16.map((step) => step.inclinePercent)).toEqual([0, 5, 7, 5, 7, 5, 15, 0]);
    expect(steps16.map((step) => step.bpm)).toEqual([86, 98, 111, 102, 112, 105, 140, 92]);
  });
});
