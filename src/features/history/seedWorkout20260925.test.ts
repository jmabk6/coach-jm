import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock } from "../../domain";
import { FIX_WORKOUT_ID } from "../workout/seedFixWorkout20260924";
import { buildWorkout20260925, seedWorkout20260925, WORKOUT_20260925_ID } from "./seedWorkout20260925";

/** Seed 12 — la séance du 25/09/2026, transcrite de la feuille de l'utilisateur. */

const T = "2026-09-25T20:00:00.000Z";

/** La base de l'utilisateur, reconnue à sa Cardio A du 24/09. */
async function userBase() {
  await db.workouts.put({ ...buildWorkout20260925(T), id: FIX_WORKOUT_ID, date: "2026-09-24" });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await userBase();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("séance du 25/09", () => {
  it("transcription fidèle : 9 blocs, séries, rôles, notes, échauffements", () => {
    const workout = buildWorkout20260925(T);
    expect(workout).toMatchObject({ id: WORKOUT_20260925_ID, date: "2026-09-25", status: "completed", source: "free" });
    const blocks = workout.blocks as PerformedExerciseBlock[];
    expect(blocks.map((block) => [block.exerciseId, block.status, block.series?.length ?? block.cardioSteps?.length])).toEqual([
      ["tapis", "performed", 4],
      ["traction-negative", "not_performed", 0],
      ["traction-assistee", "performed", 3],
      ["developpe-epaules-machine", "performed", 4],
      ["presse-cuisses", "performed", 5],
      ["developpe-incline-halteres", "performed", 3],
      ["tirage-vertical", "performed", 3],
      ["elevations-laterales-halteres", "performed", 2],
      ["extension-triceps-poulie", "performed", 2],
    ]);
    expect(blocks.map((block) => block.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(blocks[0]!.role).toBe("warmup");
    expect(blocks[0]!.cardioSteps!.map((step) => [step.settings, step.bpm])).toEqual([
      [{ durationSec: 180, speedKmh: 5, inclinePercent: 3 }, 82],
      [{ durationSec: 180, speedKmh: 5, inclinePercent: 6 }, 92],
      [{ durationSec: 120, speedKmh: 5, inclinePercent: 9 }, 105],
      [{ durationSec: 120, speedKmh: 5, inclinePercent: 12 }, 119],
    ]);
    expect(blocks[2]!.series!.map((series) => [series.load, series.reps, series.rpe])).toEqual([
      [{ kind: "total", kg: 49 }, 8, 8],
      [{ kind: "total", kg: 49 }, 8, 8],
      [{ kind: "total", kg: 49 }, 8, 9],
    ]);
    expect(blocks[4]!.series!.map((series) => series.role)).toEqual(["echauffement", "echauffement", "travail", "travail", "travail"]);
    expect(blocks[3]!.series![1]).toMatchObject({ load: { kind: "total", kg: 25 }, reps: 6, note: "limite" });
    expect(blocks[3]!.series![1]!.rpe).toBeUndefined();
    expect(blocks[8]!.series![1]).toMatchObject({ load: { kind: "total", kg: 10 }, reps: 10, rpe: 9, note: "je suis cuit" });
    /* 10 h 00 → 11 h 30 à Paris : 1 h 30. */
    expect(workout).toMatchObject({ startedAt: "2026-09-25T08:00:00.000Z", completedAt: "2026-09-25T09:30:00.000Z", activeDurationSec: 5400 });
    const times = blocks.flatMap((block) => [...(block.cardioSteps ?? []), ...(block.series ?? [])].map((entry) => entry.completedAt!));
    expect(times.every((time) => time > workout.startedAt && time <= workout.completedAt!)).toBe(true);
    expect([...times].sort()).toEqual(times);
  });

  it("une seule fois ; jamais en double ; jamais dans une autre base", async () => {
    await seedWorkout20260925(T);
    expect(await db.workouts.get(WORKOUT_20260925_ID)).toBeDefined();
    expect(((await db.settings.get("install"))?.value as InstallMarkers).addWorkout20260925).toBe(T);

    await db.workouts.delete(WORKOUT_20260925_ID);
    await seedWorkout20260925("2026-09-26T08:00:00.000Z");
    expect(await db.workouts.get(WORKOUT_20260925_ID)).toBeUndefined();

    await db.delete();
    await db.open();
    await userBase();
    await db.workouts.put({ ...buildWorkout20260925(T), id: "free-2026-09-25-app" });
    await seedWorkout20260925(T);
    expect(await db.workouts.get(WORKOUT_20260925_ID)).toBeUndefined();

    /* Une autre base (tests, recette) : rien. */
    await db.delete();
    await db.open();
    await seedWorkout20260925(T);
    expect(await db.workouts.count()).toBe(0);
  });
});
