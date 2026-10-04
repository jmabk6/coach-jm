import "fake-indexeddb/auto";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, SessionTemplate } from "../../domain";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { v6State } from "../goals/tractionV6";
import { muscuAWithCurlHalteres } from "../program/seedCurlHalteresMuscuA";
import { PROGRAM_V2_TEMPLATES } from "../program/programV2";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { CURL_EZ_MILESTONE_ID, FIX_WORKOUT_ID, fixWorkout20261004 } from "./seedFixWorkout20261004";

/**
 * Seeds 31 et 32 (04/10/2026) : la Muscu A du 04/10 corrigée (traction
 * 28 kg × 3 oubliée ; curl haltères 3 × 8 à 6 kg, RPE 8, au lieu du curl
 * EZ) et le curl haltères à la place du curl EZ dans le modèle Muscu A.
 */

const NOW = "2026-10-04T17:30:00.000Z";

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("seed 32 : le modèle Muscu A", () => {
  it("le curl haltères remplace le curl EZ, même place, 3 × 8-12, 1 min 30 ; une brique déjà changée n'est pas touchée", async () => {
    const curl = PROGRAM_V2_TEMPLATES.find((item) => item.id === "v2-muscu-a")!.blocks.find((block) => block.id === "v2-muscu-a-curl");
    expect(curl).toMatchObject({ position: 6, exerciseId: "curl-halteres", instructions: { sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 }, notes: "Haltères, bras alternés." });

    await runSeeds();
    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    expect(a.blocks.find((block) => block.id === "v2-muscu-a-curl")).toMatchObject({ exerciseId: "curl-halteres" });
    const ez = { ...a, blocks: a.blocks.map((block) => (block.id === "v2-muscu-a-curl" ? { ...block, exerciseId: "import-curl-biceps-ez" } : block)) } as SessionTemplate;
    expect(muscuAWithCurlHalteres(ez, NOW)!.blocks.find((block) => block.id === "v2-muscu-a-curl")).toMatchObject({ exerciseId: "curl-halteres", notes: "Haltères, bras alternés." });
    expect(muscuAWithCurlHalteres(a, NOW)).toBeUndefined();
  });
});

/* La sauvegarde de l'utilisateur du 04/10 à 17:05. */
const REAL = "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-04-1705.json";
const path = existsSync(REAL) ? REAL : undefined;

describe("seed 31 : la Muscu A du 04/10 (sauvegarde réelle)", () => {
  it.skipIf(!path)("traction + 28 kg × 3, curl haltères 3 × 8 à 6 kg RPE 8, jalon du curl EZ retiré, cadre du curl EZ défigé ; tout le reste identique ; palier A = 28", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await resetAndRestore(parseBackup(await readFile(path!, "utf8")), db);
    resumeSeedsForTests();
    const before = await db.workouts.toArray();
    const milestonesBefore = await db.strengthMilestones.toArray();

    await runSeeds(undefined);

    const after = await db.workouts.toArray();
    for (const workout of before.filter((item) => item.id !== FIX_WORKOUT_ID)) expect(after.find((item) => item.id === workout.id), workout.id).toEqual(workout);

    const original = before.find((item) => item.id === FIX_WORKOUT_ID)!;
    const fixed = after.find((item) => item.id === FIX_WORKOUT_ID)!;
    const block = (id: string) => fixed.blocks.find((item) => item.id === id) as PerformedExerciseBlock;
    expect(block("workout-block-v2-muscu-a-traction").series!.map((set) => [set.load, set.reps])).toEqual([
      [{ kind: "total", kg: 35 }, 5], [{ kind: "total", kg: 35 }, 5], [{ kind: "total", kg: 35 }, 5], [{ kind: "total", kg: 28 }, 3],
    ]);
    const curl = block("workout-block-v2-muscu-a-curl");
    expect(curl.exerciseId).toBe("curl-halteres");
    expect(curl.frameVersionId).toBeUndefined();
    expect(curl.series!.map((set) => [set.load, set.reps, set.rpe])).toEqual([0, 1, 2].map(() => [{ kind: "total", kg: 6 }, 8, 8]));
    /* Les autres briques de la séance ne bougent pas. */
    for (const item of original.blocks.filter((b) => b.id !== "workout-block-v2-muscu-a-traction" && b.id !== "workout-block-v2-muscu-a-curl")) {
      expect(fixed.blocks.find((b) => b.id === item.id), item.id).toEqual(item);
    }

    expect(await db.strengthMilestones.get(CURL_EZ_MILESTONE_ID)).toBeUndefined();
    expect(await db.strengthMilestones.count()).toBe(milestonesBefore.length - 1);
    const ez = (await db.strengthFrameVersions.get("frame-v2-import-curl-biceps-ez-v1"))!;
    expect(ez.firstOfficialWorkoutId).toBeUndefined();
    expect(ez.frozenAt).toBeUndefined();
    expect(((await db.settings.get("install"))!.value as InstallMarkers).fixWorkout20261004).toBeDefined();

    /* Pari V6 : 5/5/5 à 35 kg le 04/10 → palier A 28, Muscu B 35. */
    expect(v6State(after, "2026-10-05")).toMatchObject({ aKg: 28, bKg: 35, phase: "travail" });
    /* La correction ne s'applique qu'une fois, et pas sur une séance déjà corrigée. */
    expect(fixWorkout20261004(fixed, NOW)).toBeUndefined();
  }, 20000);
});
