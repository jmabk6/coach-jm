import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID, fixDeveloppeEpaules20261110, seedFixDeveloppeEpaules20261110 } from "./seedFixDeveloppeEpaules20261110";

/**
 * Seed 59 (12/11/2026) : la dernière série du développé épaules machine de la
 * Muscu B du 10/11 a été notée 10 kg ; c'était 20 kg (3 × 20 kg).
 * Seulement si la série est exactement dans l'état constaté.
 */

const NOW = "2026-11-12T18:00:00.000Z";
const BLOCK = "workout-block-v2-muscu-b-developpe-epaules";

function set(index: number, kg: number, rpe: number, completedAt: string) {
  return {
    id: `${BLOCK}-set-${index}`, position: index - 1, status: "completed" as const, role: "travail" as const,
    load: { kind: "total" as const, kg }, reps: 10, rpe, sideLimited: false, completedAt, restUnmeasured: true, restComparable: false,
  };
}

/** La séance telle que dans la sauvegarde du 10/11 à 20:16 (parties utiles). */
function observed(): WorkoutSession {
  return {
    id: FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID, source: "planned", plannedSessionId: "weekly-2026-11-10", sessionTemplateId: "v2-muscu-b", status: "completed",
    date: "2026-11-10", startedAt: "2026-11-10T14:08:25.230Z", completedAt: "2026-11-10T15:19:48.833Z", endedAt: "2026-11-10T15:19:48.833Z",
    lastActionAt: "2026-11-10T15:19:48.833Z", activeDurationSec: 4200, createdAt: "x", updatedAt: "2026-11-10T15:19:50.000Z",
    blocks: [
      {
        id: BLOCK, sourceBlockId: "v2-muscu-b-developpe-epaules", kind: "exercise", position: 2, addedDuringWorkout: false, exerciseId: "developpe-epaules-machine", status: "performed",
        frameVersionId: "frame-v1-developpe-epaules-machine-v5",
        snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 150 },
        series: [set(1, 20, 8, "2026-11-10T14:32:25.491Z"), set(2, 20, 8, "2026-11-10T14:35:33.938Z"), { ...set(3, 10, 9, "2026-11-10T14:39:17.171Z"), endedAt: "2026-11-10T14:38:41.226Z" }],
      },
      {
        id: "workout-block-v2-muscu-b-chest-press", sourceBlockId: "v2-muscu-b-chest-press", kind: "exercise", position: 4, addedDuringWorkout: false, exerciseId: "chest-press", status: "performed",
        snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 10 }, restBetweenSetsSec: 150 },
        series: [{ id: "c1", position: 0, status: "completed", role: "travail", load: { kind: "total", kg: 10 }, reps: 10, rpe: 9, completedAt: "2026-11-10T14:51:15.359Z" }],
      },
    ],
  } as WorkoutSession;
}

const developpe = (workout: WorkoutSession) => workout.blocks.find((block) => block.id === BLOCK) as PerformedExerciseBlock;

describe("correction du développé épaules (Muscu B du 10/11)", () => {
  it("10 kg → 20 kg sur la 3e série seulement ; répétitions, RPE, heures, autres séries et exercices identiques", () => {
    const before = observed();
    const fixed = fixDeveloppeEpaules20261110(before, NOW)!;
    expect(developpe(fixed).series!.map((item) => [item.load, item.reps, item.rpe])).toEqual([
      [{ kind: "total", kg: 20 }, 10, 8], [{ kind: "total", kg: 20 }, 10, 8], [{ kind: "total", kg: 20 }, 10, 9],
    ]);
    expect(developpe(fixed).series![2]).toEqual({ ...developpe(before).series![2], load: { kind: "total", kg: 20 } });
    expect(developpe(fixed).series!.slice(0, 2)).toEqual(developpe(before).series!.slice(0, 2));
    expect(fixed.blocks[1]).toEqual(before.blocks[1]);
    expect(fixed).toEqual({ ...before, blocks: fixed.blocks, updatedAt: NOW });
  });

  it("rien si la séance n'est plus dans l'état constaté (déjà corrigée, autres valeurs, autre heure, non enregistrée)", () => {
    const fixed = fixDeveloppeEpaules20261110(observed(), NOW)!;
    expect(fixDeveloppeEpaules20261110(fixed, NOW)).toBeUndefined();
    const variant = (change: (series: PerformedExerciseBlock["series"]) => void, status: WorkoutSession["status"] = "completed") => {
      const workout = structuredClone(observed());
      change(developpe(workout).series);
      return fixDeveloppeEpaules20261110({ ...workout, status }, NOW);
    };
    expect(variant((series) => void (series![2]!.load = { kind: "total", kg: 15 }))).toBeUndefined();
    expect(variant((series) => void (series![2]!.reps = 12))).toBeUndefined();
    expect(variant((series) => void (series![2]!.rpe = 8))).toBeUndefined();
    expect(variant((series) => void (series![2]!.completedAt = "2026-11-10T14:40:00.000Z"))).toBeUndefined();
    expect(variant(() => undefined, "in_progress")).toBeUndefined();
  });
});

describe("seed 59", () => {
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
    delete markers.fixDeveloppeEpaules20261110;
    await db.settings.put({ key: "install", value: markers });
    const other = { ...observed(), id: "autre", plannedSessionId: "x" } as WorkoutSession;
    await db.workouts.bulkPut([observed(), other]);
    const milestones = await db.strengthMilestones.toArray();

    await seedFixDeveloppeEpaules20261110(NOW);

    expect(developpe((await db.workouts.get(FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID))!).series![2]!.load).toEqual({ kind: "total", kg: 20 });
    expect(await db.workouts.get("autre")).toEqual(other);
    expect(await db.strengthMilestones.toArray()).toEqual(milestones);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).fixDeveloppeEpaules20261110).toBe(NOW);

    /* Remise à la main : le seed ne repasse pas. */
    const back = structuredClone((await db.workouts.get(FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID))!);
    developpe(back).series![2]!.load = { kind: "total", kg: 10 };
    await db.workouts.put(back);
    await seedFixDeveloppeEpaules20261110("2026-11-13T08:00:00.000Z");
    expect(developpe((await db.workouts.get(FIX_DEVELOPPE_EPAULES_20261110_WORKOUT_ID))!).series![2]!.load).toEqual({ kind: "total", kg: 10 });
  });

  it("base sans cette séance : rien n'est écrit sauf le marqueur", async () => {
    const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete markers.fixDeveloppeEpaules20261110;
    await db.settings.put({ key: "install", value: markers });
    const before = await db.workouts.toArray();
    await seedFixDeveloppeEpaules20261110(NOW);
    expect(await db.workouts.toArray()).toEqual(before);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).fixDeveloppeEpaules20261110).toBe(NOW);
  });
});
