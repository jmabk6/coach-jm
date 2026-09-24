import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { parseBackup } from "../backup/restoreBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { loadGoalsProgress } from "./goalProgress";

/**
 * Lot H.2 — progression des objectifs lue en base : objectifs, résultats de
 * test, pesées. Invariant : aucune donnée d'entraînement dans une courbe.
 */

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

const T = "2026-09-20T08:00:00.000Z";

describe("invariant : aucune donnée d'entraînement dans une courbe", () => {
  it("séances de traction et jalon présents, aucun résultat de test : aucun point, « À mesurer »", async () => {
    resumeSeedsForTests();
    await runSeeds();
    await db.workouts.put({
      id: "w", source: "free", kind: "training", status: "completed", date: "2026-09-20", startedAt: T, completedAt: T, lastActionAt: T,
      activeDurationSec: 3600, createdAt: T, updatedAt: T,
      blocks: [{
        id: "b", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "performed",
        snapshotInstructions: { shape: "reps", sets: 1, reps: { min: 8, max: 8 }, restBetweenSetsSec: 90 },
        series: [{ id: "s", position: 0, status: "completed", role: "travail", load: { kind: "total", kg: 30 }, reps: 8 }],
      }],
    });
    await db.strengthMilestones.put({ id: "m", frameVersionId: "f", workoutId: "w", date: "2026-09-20", value: 30, unit: "kg", createdAt: T });

    const progress = await loadGoalsProgress("2026-09-24");
    const traction = progress.find((item) => item.goal.key === "traction")!;
    expect(traction.evaluation).toEqual({ kind: "no_result" });
    expect(progress.every((item) => item.curve.series.length === 0)).toBe(true);
  });
});

describe("sauvegarde réelle (COACH_JM_BACKUP)", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("chaque point d'une courbe est un résultat de test du fichier, ou une moyenne de pesées", async () => {
    const file = parseBackup(await readFile(path!, "utf8"));
    await resetAndRestore(file, db);
    resumeSeedsForTests();
    await runSeeds();

    const progress = await loadGoalsProgress("2026-09-24");
    expect(progress.map((item) => item.goal.key)).toEqual(["traction", "upper_body", "legs", "cardio", "core", "flexibility", "weight"]);

    const resultIds = new Set(((file.stores.testResults ?? []) as Array<{ id: string }>).map((result) => result.id));
    for (const item of progress) {
      for (const series of item.curve.series) {
        for (const point of series.points) {
          if (item.goal.key === "weight") expect(point.resultId).toBeUndefined();
          else expect(resultIds.has(point.resultId!), `${item.goal.key} ${point.resultId}`).toBe(true);
        }
      }
    }
    /* Jambes n'a pas d'indicateur tant que 2 tests n'ont pas été faits. */
    expect(progress.find((item) => item.goal.key === "legs")!.evaluation).toEqual({ kind: "no_measure" });
    console.info("[objectifs réels]", Object.fromEntries(progress.map((item) => [item.goal.key, item.evaluation.kind])));
  });
});
