import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { parseBackup } from "../backup/restoreBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { FIX_WORKOUT_ID, fixWorkout20260924, removeSkippedBlocks20260924, seedFixWorkout20260924, seedRemoveSkipped20260924 } from "./seedFixWorkout20260924";

/**
 * Seed 10 : la Cardio A du 24/09/2026, enregistrée avec « principal » et
 * « retour » validés à vide à 13:43, passe à 45 min ; aucune autre donnée
 * n'est touchée, et une séance dans un autre état n'est jamais modifiée.
 */

const T = "2026-09-25T06:00:00.000Z";
const step = (id: string, durationSec: number, completedAt?: string) => ({
  id, position: 0, status: completedAt ? ("completed" as const) : ("not_performed" as const),
  settings: { durationSec, speedKmh: 5, inclinePercent: 4 }, ...(completedAt ? { completedAt, originalSettings: { durationSec: 2100, speedKmh: 5, inclinePercent: 6 } } : {}),
});
const block = (id: string, steps: ReturnType<typeof step>[], position: number): PerformedExerciseBlock => ({
  id, kind: "exercise", position, addedDuringWorkout: false, exerciseId: "tapis", status: "performed",
  snapshotInstructions: { shape: "steps", steps: [] }, cardioSteps: steps.map((item, index) => ({ ...item, position: index })),
});

/** L'état constaté dans la sauvegarde du 24/09 à 22:32, réduit à l'essentiel. */
function observed(): WorkoutSession {
  return {
    id: FIX_WORKOUT_ID, source: "free", kind: "training", status: "completed", date: "2026-09-24",
    startedAt: "2026-09-24T13:35:25.745Z", endedAt: "2026-09-24T16:22:58.498Z", completedAt: "2026-09-24T16:22:58.498Z",
    lastActionAt: "2026-09-24T16:22:58.498Z", activeDurationSec: 10053, feeling: 5, createdAt: "x", updatedAt: "2026-09-24T20:31:08.881Z",
    blocks: [
      block("workout-block-v1-cardio-a-debut", [step("d1", 1500, "2026-09-24T13:38:34.296Z"), step("d2", 1200, "2026-09-24T16:20:43.476Z")], 0),
      block("workout-block-v1-cardio-a-principal", [step("p1", 300, "2026-09-24T13:43:14.296Z"), step("p2", 300)], 1),
      block("workout-block-v1-cardio-a-retour", [step("r1", 300, "2026-09-24T13:43:16.921Z")], 2),
    ],
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("correction ponctuelle du 24/09", () => {
  it("retire principal et retour, 45 min, ressenti et bloc fait intacts", () => {
    const fixed = fixWorkout20260924(observed(), T)!;
    expect(fixed.activeDurationSec).toBe(2700);
    expect(fixed.blocks.map((item) => (item as PerformedExerciseBlock).status)).toEqual(["performed", "skipped", "skipped"]);
    expect((fixed.blocks[1] as PerformedExerciseBlock).cardioSteps!.every((item) => item.status === "not_performed" && item.completedAt === undefined)).toBe(true);
    expect(fixed.blocks[0]).toEqual(observed().blocks[0]);
    expect(fixed).toMatchObject({ status: "completed", feeling: 5, completedAt: "2026-09-24T16:22:58.498Z", updatedAt: T });
  });

  it("une séance dans un autre état n'est jamais touchée", () => {
    expect(fixWorkout20260924({ ...observed(), activeDurationSec: 2700 }, T)).toBeUndefined();
    expect(fixWorkout20260924({ ...observed(), status: "in_progress" }, T)).toBeUndefined();
    const edited = observed();
    (edited.blocks[2] as PerformedExerciseBlock).cardioSteps![0]!.completedAt = "2026-09-24T16:21:00.000Z";
    expect(fixWorkout20260924(edited, T)).toBeUndefined();
  });

  it("une seule fois : le marqueur posé, un second passage n'écrit rien", async () => {
    await db.workouts.put(observed());
    await seedFixWorkout20260924(T);
    expect((await db.workouts.get(FIX_WORKOUT_ID))!.activeDurationSec).toBe(2700);
    expect(((await db.settings.get("install"))?.value as InstallMarkers).fixWorkout20260924).toBe(T);

    await db.workouts.put(observed());
    await seedFixWorkout20260924("2026-09-26T06:00:00.000Z");
    expect((await db.workouts.get(FIX_WORKOUT_ID))!.activeDurationSec).toBe(10053);
  });

  it("seed 11 : les deux blocs laissés « sautés » sont supprimés, une seule fois", async () => {
    const skipped = fixWorkout20260924(observed(), T)!;
    const removed = removeSkippedBlocks20260924(skipped, T)!;
    expect(removed.blocks.map((item) => [item.id, item.position])).toEqual([["workout-block-v1-cardio-a-debut", 0]]);
    expect(removed.blocks[0]).toEqual(skipped.blocks[0]);
    expect(removed.activeDurationSec).toBe(2700);
    /* Pas dans l'état attendu : rien. */
    expect(removeSkippedBlocks20260924(observed(), T)).toBeUndefined();

    await db.workouts.put(skipped);
    await seedRemoveSkipped20260924(T);
    expect((await db.workouts.get(FIX_WORKOUT_ID))!.blocks).toHaveLength(1);
    await db.workouts.put(skipped);
    await seedRemoveSkipped20260924("2026-09-26T06:00:00.000Z");
    expect((await db.workouts.get(FIX_WORKOUT_ID))!.blocks).toHaveLength(3);
  });

  it.skipIf(!process.env.COACH_JM_BACKUP_2232)("sauvegarde réelle du 24/09 22:32 : 45 min, le reste identique", async () => {
    const file = parseBackup(await readFile(process.env.COACH_JM_BACKUP_2232!, "utf8"));
    await resetAndRestore(file, db);
    resumeSeedsForTests();
    await runSeeds();
    const fixed = (await db.workouts.get(FIX_WORKOUT_ID))!;
    expect(fixed.activeDurationSec).toBe(2700);
    expect(fixed.blocks.map((item) => [item.id, item.position])).toEqual([["workout-block-v1-cardio-a-debut", 0]]);
    expect(fixed.feeling).toBe(5);
    const others = (file.stores.workouts as WorkoutSession[]).filter((item) => item.id !== FIX_WORKOUT_ID);
    for (const other of others) expect(await db.workouts.get(other.id)).toEqual(other);
  });
});
