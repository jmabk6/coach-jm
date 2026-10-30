import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { nextNegativesTarget, trackResults } from "../../domain/rules/progressionRules";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { ADD_NEGATIVES_20261029_WORKOUT_ID, addNegatives20261029, seedAddNegatives20261029 } from "./seedAddNegatives20261029";

/**
 * Seed 48 (30/10/2026) : les tractions négatives faites à la Muscu C du
 * 29/10, absentes de la séance (programmées à partir du 01/11) — 2 × 2,
 * descente 5 s, RPE 9 — ajoutées juste après l'échauffement.
 */

const NOW = "2026-10-30T14:00:00.000Z";

/** La séance telle que dans la sauvegarde du 30/10 à 12:48 (parties utiles). */
function observed(): WorkoutSession {
  return {
    id: ADD_NEGATIVES_20261029_WORKOUT_ID, plannedSessionId: "weekly-2026-10-29", sessionTemplateId: "v2-muscu-c", kind: "training", source: "planned", status: "completed",
    date: "2026-10-29", startedAt: "2026-10-29T16:53:48.209Z", completedAt: "2026-10-29T18:29:23.894Z", endedAt: "2026-10-29T18:29:23.894Z",
    lastActionAt: "2026-10-29T18:29:23.894Z", activeDurationSec: 5736, createdAt: "2026-10-29T16:53:48.209Z", updatedAt: "2026-10-29T18:29:29.344Z",
    blocks: [
      { id: "workout-block-v2-muscu-c-echauffement", sourceBlockId: "v2-muscu-c-echauffement", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "tapis", role: "warmup", status: "performed", snapshotInstructions: { shape: "steps", steps: [] } },
      {
        id: "workout-block-v2-muscu-c-suspension", sourceBlockId: "v2-muscu-c-suspension", kind: "exercise", position: 2, addedDuringWorkout: false, exerciseId: "suspension-omoplates", status: "performed",
        snapshotInstructions: { shape: "duration", sets: 2, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 60 },
        series: [{ id: "s1", position: 0, status: "completed", role: "travail", durationSec: 25, rpe: 8, completedAt: "2026-10-29T17:04:30.965Z" }],
      },
    ],
  } as WorkoutSession;
}

const negatives = (workout: WorkoutSession) => workout.blocks.find((block) => block.kind === "exercise" && block.exerciseId === "traction-negative") as PerformedExerciseBlock | undefined;

describe("ajout des négatives de la Muscu C du 29/10", () => {
  it("brique ajoutée juste après l'échauffement : 2 × 2, descentes de 5 s, RPE 9, saisie après coup ; le reste identique", () => {
    const before = observed();
    const fixed = addNegatives20261029(before, NOW)!;
    expect(fixed.blocks.map((block) => block.position)).toEqual([0, 1, 2]);
    const block = negatives(fixed)!;
    expect(block).toMatchObject({ position: 1, sourceBlockId: "v2-muscu-c-negatives", status: "performed", snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 2, max: 2 } } });
    expect(block.series!.map((item) => [item.reps, item.repDurationsSec, item.durationSec, item.rpe, item.role])).toEqual([[2, [5, 5], 5, 9, "travail"], [2, [5, 5], 5, 9, "travail"]]);
    expect(block.series!.every((item) => item.note?.includes("après coup"))).toBe(true);
    expect(fixed.blocks.filter((item) => item !== block)).toEqual(before.blocks);
    expect(fixed).toEqual({ ...before, blocks: fixed.blocks, updatedAt: NOW });
  });

  it("rien si la séance a déjà des négatives, n'est pas enregistrée ou n'est pas la Muscu C", () => {
    const fixed = addNegatives20261029(observed(), NOW)!;
    expect(addNegatives20261029(fixed, NOW)).toBeUndefined();
    expect(addNegatives20261029({ ...observed(), status: "in_progress" }, NOW)).toBeUndefined();
    expect(addNegatives20261029({ ...observed(), sessionTemplateId: "v2-muscu-b" }, NOW)).toBeUndefined();
  });

  it("elles comptent pour la progression des négatives : la séance du 29/10 devient la référence", () => {
    const fixed = addNegatives20261029(observed(), NOW)!;
    const results = trackResults([fixed], ["v2-muscu-c-negatives"], "2026-10-04");
    expect(results).toEqual([{ workoutId: ADD_NEGATIVES_20261029_WORKOUT_ID, date: "2026-10-29", sets: [{ kg: 0, reps: 2, rpe: 9, durationSec: 5, repDurationsSec: [5, 5] }, { kg: 0, reps: 2, rpe: 9, durationSec: 5, repDurationsSec: [5, 5] }] }]);
    expect(nextNegativesTarget(2, results.at(-1), NOW).kind).not.toBe("insufficient");
  });
});

describe("seed 48", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("une seule fois : complète la séance, pose le marqueur ; ne touche pas aux autres séances", async () => {
    const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete markers.addNegatives20261029;
    await db.settings.put({ key: "install", value: markers });
    const other = { ...observed(), id: "autre" } as WorkoutSession;
    await db.workouts.bulkPut([observed(), other]);

    await seedAddNegatives20261029(NOW);

    expect(negatives((await db.workouts.get(ADD_NEGATIVES_20261029_WORKOUT_ID))!)?.series).toHaveLength(2);
    expect(await db.workouts.get("autre")).toEqual(other);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).addNegatives20261029).toBe(NOW);

    /* Retirée à la main : le seed ne repasse pas. */
    const back = structuredClone((await db.workouts.get(ADD_NEGATIVES_20261029_WORKOUT_ID))!);
    back.blocks = back.blocks.filter((block) => block.position !== 1);
    await db.workouts.put(back);
    await seedAddNegatives20261029("2026-10-31T08:00:00.000Z");
    expect(negatives((await db.workouts.get(ADD_NEGATIVES_20261029_WORKOUT_ID))!)).toBeUndefined();
  });
});
