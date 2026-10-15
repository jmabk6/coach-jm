import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { BodyMeasurement, Goal, InstallMarkers } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { seedWeightGoalStart20261015 } from "./seedWeightGoalStart";

/**
 * Seed 40 (15/10/2026) : le départ de l'objectif Poids est enregistré une
 * fois — la première mesure de la balance de référence (91,15 kg le
 * 5/10/2026 chez l'utilisateur). Idempotent, jamais d'écrasement, rien
 * d'autre n'est touché.
 */

const NOW = "2026-10-15T12:00:00.000Z";
const T = "2026-10-05T05:00:00.000Z";

const measure = (date: string, weightKg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement =>
  ({ id: `m-${date}-${extra.device ?? "renpho"}`, date, takenAt: `${date}T05:00:00.000Z`, device: "renpho", source: "manual", weightReference: true, weightKg, createdAt: T, updatedAt: T, ...extra }) as BodyMeasurement;

const weightGoal = async () => (await db.goals.where("key").equals("weight").first()) as Goal;
const install = async () => (await db.settings.get("install"))?.value as InstallMarkers;

/** Base « avant le seed 40 » : les seeds passés, le marqueur retiré, des mesures comme sur ta base. */
async function beforeSeed40(measures: BodyMeasurement[]): Promise<void> {
  const markers = { ...(await install()) };
  delete markers.weightGoalStart20261015;
  await db.settings.put({ key: "install", value: markers });
  await db.bodyMeasurements.bulkPut(measures);
}

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

describe("seed 40 — départ fixe de l'objectif Poids", () => {
  it("enregistre 91,15 kg au 5/10/2026 : la première mesure RENPHO, jamais une autre balance ni une copie de pesée", async () => {
    await beforeSeed40([
      measure("2026-10-03", 70, { device: "withings", weightReference: false }),
      measure("2026-10-04", 60, { originWeightEntry: { id: "w" } as never }),
      measure("2026-10-05", 91.15),
      measure("2026-10-06", 90.3),
      measure("2026-10-15", 87.75),
    ]);
    const before = await weightGoal();
    await seedWeightGoalStart20261015(NOW);

    const after = await weightGoal();
    const segment = after.segments.find((item) => item.id === after.currentSegmentId)!;
    expect(segment.start).toEqual({ date: "2026-10-05", value: 91.15 });
    /* Rien d'autre ne change : ni la cible, ni l'échéance enregistrée, ni les autres segments. */
    expect(segment).toEqual({ ...before.segments.find((item) => item.id === before.currentSegmentId), start: { date: "2026-10-05", value: 91.15 } });
    expect(after.title).toBe(before.title);
    expect(await db.bodyMeasurements.count()).toBe(5);
    expect((await install()).weightGoalStart20261015).toBe(NOW);
  });

  it("idempotent ; un départ déjà enregistré n'est jamais déplacé, même si une pesée plus ancienne apparaît", async () => {
    await beforeSeed40([measure("2026-10-05", 91.15)]);
    await seedWeightGoalStart20261015(NOW);
    await db.bodyMeasurements.put(measure("2026-10-01", 93));
    await seedWeightGoalStart20261015("2026-10-16T12:00:00.000Z");
    expect((await install()).weightGoalStart20261015).toBe(NOW);

    /* Même relancé sans marqueur : le départ existant reste. */
    await beforeSeed40([]);
    await seedWeightGoalStart20261015(NOW);
    const goal = await weightGoal();
    expect(goal.segments.find((item) => item.id === goal.currentSegmentId)!.start).toEqual({ date: "2026-10-05", value: 91.15 });
  });

  it("sans mesure : rien n'est écrit sur l'objectif (départ provisoire à la première pesée), le marqueur est posé", async () => {
    await beforeSeed40([]);
    const before = await weightGoal();
    await seedWeightGoalStart20261015(NOW);
    expect(await weightGoal()).toEqual(before);
    expect((await install()).weightGoalStart20261015).toBe(NOW);
  });
});
