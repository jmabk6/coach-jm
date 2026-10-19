import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { FIX_TRACTION_RPE_20261019_WORKOUT_ID, fixTractionRpe20261019, seedFixTractionRpe20261019 } from "./seedFixTractionRpe20261019";

/**
 * Seed 41 (19/10/2026) : la dernière série de traction assistée de la
 * Muscu A du 19/10 (28 kg × 5) a été notée RPE 5 ; c'était RPE 9. Seulement
 * si la série est exactement dans l'état constaté ; rien d'autre ne bouge.
 */

const NOW = "2026-10-19T20:00:00.000Z";
const BLOCK = "workout-block-v2-muscu-a-traction";

function set(index: number, rpe: number, completedAt: string) {
  return {
    id: `${BLOCK}-set-${index}`, position: index - 1, status: "completed" as const, role: "travail" as const,
    load: { kind: "total" as const, kg: 28 }, reps: 5, rpe, sideLimited: false, completedAt,
  };
}

/** La séance telle que dans la sauvegarde du 19/10 à 20:34 (parties utiles). */
function observed(): WorkoutSession {
  return {
    id: FIX_TRACTION_RPE_20261019_WORKOUT_ID, source: "planned", plannedSessionId: "weekly-2026-10-18", status: "completed",
    date: "2026-10-19", startedAt: "2026-10-19T13:30:00.000Z", completedAt: "2026-10-19T14:46:07.941Z", endedAt: "2026-10-19T14:45:56.336Z",
    lastActionAt: "2026-10-19T14:46:07.941Z", activeDurationSec: 4500, createdAt: "x", updatedAt: "2026-10-19T14:46:07.941Z",
    blocks: [
      {
        id: BLOCK, kind: "exercise", position: 1, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "performed",
        frameVersionId: "frame-v1-traction-assistee-v4",
        snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 },
        series: [set(1, 8, "2026-10-19T13:53:14.215Z"), set(2, 8, "2026-10-19T13:56:27.378Z"), { ...set(3, 5, "2026-10-19T13:59:44.484Z"), endedAt: "2026-10-19T13:59:38.086Z", actualRestAfterSec: 199, restComparable: true }],
      },
      {
        id: "workout-block-v2-muscu-a-presse", kind: "exercise", position: 7, addedDuringWorkout: false, exerciseId: "presse-cuisses", status: "performed",
        snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 10, max: 12 }, restBetweenSetsSec: 120 },
        series: [{ id: "p1", position: 0, status: "completed", role: "echauffement", load: { kind: "total", kg: 100 }, reps: 10, rpe: 6, completedAt: "2026-10-19T14:40:05.069Z" }],
      },
    ],
  } as WorkoutSession;
}

const traction = (workout: WorkoutSession) => workout.blocks.find((block) => block.id === BLOCK) as PerformedExerciseBlock;

describe("correction du RPE de la dernière traction (Muscu A du 19/10)", () => {
  it("RPE 5 → 9 sur la 3e série seulement ; charges, répétitions, heures, repos et autres exercices identiques", () => {
    const before = observed();
    const fixed = fixTractionRpe20261019(before, NOW)!;
    expect(traction(fixed).series!.map((item) => item.rpe)).toEqual([8, 8, 9]);
    expect(traction(fixed).series![2]).toEqual({ ...traction(before).series![2], rpe: 9 });
    expect(traction(fixed).series!.slice(0, 2)).toEqual(traction(before).series!.slice(0, 2));
    expect(fixed.blocks[1]).toEqual(before.blocks[1]);
    expect(fixed).toEqual({ ...before, blocks: fixed.blocks, updatedAt: NOW });
  });

  it("rien si la séance n'est plus dans l'état constaté (déjà corrigée, autre charge, autres répétitions, autre heure, non enregistrée)", () => {
    const fixed = fixTractionRpe20261019(observed(), NOW)!;
    expect(fixTractionRpe20261019(fixed, NOW)).toBeUndefined();
    const variant = (change: (series: PerformedExerciseBlock["series"]) => void, status: WorkoutSession["status"] = "completed") => {
      const workout = structuredClone(observed());
      change(traction(workout).series);
      return fixTractionRpe20261019({ ...workout, status }, NOW);
    };
    expect(variant((series) => void (series![2]!.load = { kind: "total", kg: 35 }))).toBeUndefined();
    expect(variant((series) => void (series![2]!.reps = 4))).toBeUndefined();
    expect(variant((series) => void (series![2]!.completedAt = "2026-10-19T14:00:00.000Z"))).toBeUndefined();
    expect(variant((series) => void (series![2]!.rpe = 7))).toBeUndefined();
    expect(variant(() => undefined, "in_progress")).toBeUndefined();
  });
});

describe("seed 41", () => {
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

  it("une seule fois : corrige la séance, pose le marqueur ; ne touche ni aux jalons ni aux autres séances", async () => {
    const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete markers.fixTractionRpe20261019;
    await db.settings.put({ key: "install", value: markers });
    const other = { ...observed(), id: "autre", plannedSessionId: "x" } as WorkoutSession;
    await db.workouts.bulkPut([observed(), other]);
    const milestones = await db.strengthMilestones.toArray();

    await seedFixTractionRpe20261019(NOW);

    expect(traction((await db.workouts.get(FIX_TRACTION_RPE_20261019_WORKOUT_ID))!).series![2]!.rpe).toBe(9);
    expect(await db.workouts.get("autre")).toEqual(other);
    expect(await db.strengthMilestones.toArray()).toEqual(milestones);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).fixTractionRpe20261019).toBe(NOW);

    /* Remise à RPE 5 à la main : le seed ne repasse pas. */
    const back = structuredClone((await db.workouts.get(FIX_TRACTION_RPE_20261019_WORKOUT_ID))!);
    traction(back).series![2]!.rpe = 5;
    await db.workouts.put(back);
    await seedFixTractionRpe20261019("2026-10-20T08:00:00.000Z");
    expect(traction((await db.workouts.get(FIX_TRACTION_RPE_20261019_WORKOUT_ID))!).series![2]!.rpe).toBe(5);
  });

  it("base sans cette séance : rien n'est écrit sauf le marqueur", async () => {
    const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete markers.fixTractionRpe20261019;
    await db.settings.put({ key: "install", value: markers });
    const before = await db.workouts.toArray();
    await seedFixTractionRpe20261019(NOW);
    expect(await db.workouts.toArray()).toEqual(before);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).fixTractionRpe20261019).toBe(NOW);
  });
});
