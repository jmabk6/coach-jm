import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { FIX_ELEVATIONS_20261023_WORKOUT_ID, fixElevations20261023, seedFixElevations20261023 } from "./seedFixElevations20261023";

/**
 * Seed 46 (24/10/2026) : la dernière série d'élévations latérales de la
 * Muscu C du 23/10 (5 kg) a été notée 15 répétitions à RPE 11 ; c'était
 * 11 répétitions à RPE 9. Seulement si la série est exactement dans l'état
 * constaté ; rien d'autre ne bouge.
 */

const NOW = "2026-10-24T08:00:00.000Z";
const BLOCK = "workout-block-v2-muscu-c-elevations";

function set(index: number, reps: number, rpe: number, completedAt: string) {
  return {
    id: `${BLOCK}-set-${index}`, position: index - 1, status: "completed" as const, role: "travail" as const,
    load: { kind: "total" as const, kg: 5 }, reps, rpe, sideLimited: false, completedAt, restUnmeasured: true, restComparable: false,
  };
}

/** La séance telle que dans la sauvegarde du 24/10 à 00:02 (parties utiles). */
function observed(): WorkoutSession {
  return {
    id: FIX_ELEVATIONS_20261023_WORKOUT_ID, source: "planned", plannedSessionId: "weekly-2026-10-22", sessionTemplateId: "v2-muscu-c", status: "completed",
    date: "2026-10-23", startedAt: "2026-10-23T11:00:00.000Z", completedAt: "2026-10-23T12:50:16.328Z", endedAt: "2026-10-23T12:50:16.328Z",
    lastActionAt: "2026-10-23T12:50:16.328Z", activeDurationSec: 6000, createdAt: "x", updatedAt: "2026-10-23T12:50:21.610Z",
    blocks: [
      {
        id: BLOCK, sourceBlockId: "v2-muscu-c-elevations", kind: "exercise", position: 4, addedDuringWorkout: false, exerciseId: "elevations-laterales-halteres", status: "performed",
        frameVersionId: "frame-v1-elevations-laterales-halteres-v2",
        snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 12, max: 15 }, restBetweenSetsSec: 90 },
        series: [set(1, 15, 8, "2026-10-23T12:03:35.453Z"), set(2, 15, 9, "2026-10-23T12:06:29.600Z"), { ...set(3, 15, 11, "2026-10-23T12:08:32.502Z"), endedAt: "2026-10-23T12:08:25.286Z" }],
      },
      {
        id: "workout-block-v2-muscu-c-face-pull", sourceBlockId: "v2-muscu-c-face-pull", kind: "exercise", position: 5, addedDuringWorkout: false, exerciseId: "face-pull", status: "performed",
        snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 12, max: 15 }, restBetweenSetsSec: 90 },
        series: [{ id: "f1", position: 0, status: "completed", role: "travail", load: { kind: "total", kg: 17.5 }, reps: 12, rpe: 8, completedAt: "2026-10-23T12:15:00.000Z" }],
      },
    ],
  } as WorkoutSession;
}

const elevations = (workout: WorkoutSession) => workout.blocks.find((block) => block.id === BLOCK) as PerformedExerciseBlock;

describe("correction de la dernière série d'élévations (Muscu C du 23/10)", () => {
  it("15 rép. RPE 11 → 11 rép. RPE 9 sur la 3e série seulement ; charge, heures, autres séries et exercices identiques", () => {
    const before = observed();
    const fixed = fixElevations20261023(before, NOW)!;
    expect(elevations(fixed).series!.map((item) => [item.reps, item.rpe])).toEqual([[15, 8], [15, 9], [11, 9]]);
    expect(elevations(fixed).series![2]).toEqual({ ...elevations(before).series![2], reps: 11, rpe: 9 });
    expect(elevations(fixed).series!.slice(0, 2)).toEqual(elevations(before).series!.slice(0, 2));
    expect(fixed.blocks[1]).toEqual(before.blocks[1]);
    expect(fixed).toEqual({ ...before, blocks: fixed.blocks, updatedAt: NOW });
  });

  it("rien si la séance n'est plus dans l'état constaté (déjà corrigée, autre charge, autres valeurs, autre heure, non enregistrée)", () => {
    const fixed = fixElevations20261023(observed(), NOW)!;
    expect(fixElevations20261023(fixed, NOW)).toBeUndefined();
    const variant = (change: (series: PerformedExerciseBlock["series"]) => void, status: WorkoutSession["status"] = "completed") => {
      const workout = structuredClone(observed());
      change(elevations(workout).series);
      return fixElevations20261023({ ...workout, status }, NOW);
    };
    expect(variant((series) => void (series![2]!.load = { kind: "total", kg: 6 }))).toBeUndefined();
    expect(variant((series) => void (series![2]!.reps = 12))).toBeUndefined();
    expect(variant((series) => void (series![2]!.rpe = 9))).toBeUndefined();
    expect(variant((series) => void (series![2]!.completedAt = "2026-10-23T12:10:00.000Z"))).toBeUndefined();
    expect(variant(() => undefined, "in_progress")).toBeUndefined();
  });
});

describe("seed 46", () => {
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
    delete markers.fixElevations20261023;
    await db.settings.put({ key: "install", value: markers });
    const other = { ...observed(), id: "autre", plannedSessionId: "x" } as WorkoutSession;
    await db.workouts.bulkPut([observed(), other]);
    const milestones = await db.strengthMilestones.toArray();

    await seedFixElevations20261023(NOW);

    expect(elevations((await db.workouts.get(FIX_ELEVATIONS_20261023_WORKOUT_ID))!).series![2]).toMatchObject({ reps: 11, rpe: 9 });
    expect(await db.workouts.get("autre")).toEqual(other);
    expect(await db.strengthMilestones.toArray()).toEqual(milestones);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).fixElevations20261023).toBe(NOW);

    /* Remise à la main : le seed ne repasse pas. */
    const back = structuredClone((await db.workouts.get(FIX_ELEVATIONS_20261023_WORKOUT_ID))!);
    elevations(back).series![2]!.reps = 15;
    elevations(back).series![2]!.rpe = 11;
    await db.workouts.put(back);
    await seedFixElevations20261023("2026-10-25T08:00:00.000Z");
    expect(elevations((await db.workouts.get(FIX_ELEVATIONS_20261023_WORKOUT_ID))!).series![2]).toMatchObject({ reps: 15, rpe: 11 });
  });

  it("base sans cette séance : rien n'est écrit sauf le marqueur", async () => {
    const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete markers.fixElevations20261023;
    await db.settings.put({ key: "install", value: markers });
    const before = await db.workouts.toArray();
    await seedFixElevations20261023(NOW);
    expect(await db.workouts.toArray()).toEqual(before);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).fixElevations20261023).toBe(NOW);
  });
});
