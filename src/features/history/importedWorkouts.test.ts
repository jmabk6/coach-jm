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
import { importSeptember2026History } from "./importHistory";
import { buildImportedWorkouts, importedWorkoutSpecs } from "./importedWorkouts";

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

  it("transcrit les 9 séances des feuilles, toutes terminées et datées", () => {
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
    const first = await importSeptember2026History();
    expect(first).toEqual({ workoutsCreated: 9, workoutsUpdated: 0 });

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

    /* Réimporter ne crée rien de plus. */
    const second = await importSeptember2026History();
    expect(second).toEqual({ workoutsCreated: 0, workoutsUpdated: 9 });
    expect((await getCompletedWorkouts()).length).toBe(9);
  });
});
