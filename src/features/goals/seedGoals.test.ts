import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { getAllGoals } from "../../db/repositories/goalRepository";
import type { Goal } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { seedGoals } from "./seedGoals";

/**
 * Lot H.1 — seed 8 : les 7 objectifs, aucune valeur inventée (conception
 * V2 § 2.2, § 3.6.2) ; seed idempotent, clé unique, jamais d'écrasement.
 */

const NOW = "2026-09-24T10:00:00.000Z";

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

describe("les 7 objectifs", () => {
  it("dans l'ordre, avec leurs segments ; seules Traction S1 et Poids ont cible et échéance", async () => {
    const goals = await getAllGoals();
    expect(goals.map((goal) => goal.key)).toEqual(["traction", "upper_body", "legs", "cardio", "core", "flexibility", "weight"]);

    const traction = goals[0]!;
    expect(traction.segments).toMatchObject([
      { role: "intermediate", measure: { protocolId: "protocol-traction", measureKey: "assistance_min_kg" }, direction: "decrease", target: 0, dueDate: "2027-03-31" },
      { role: "final", measure: { protocolId: "protocol-traction_stricte", measureKey: "tractions_barre" }, direction: "increase", target: 1 },
    ]);
    expect(traction.segments[1]!.dueDate).toBeUndefined();
    expect(traction.currentSegmentId).toBe(traction.segments[0]!.id);

    const weight = goals.find((goal) => goal.key === "weight")!;
    expect(weight.segments).toMatchObject([{ role: "final", measure: { source: "weight_weekly_average" }, direction: "decrease", target: 75, dueDate: "2027-03-31" }]);

    for (const goal of goals.filter((item) => item.key !== "traction" && item.key !== "weight")) {
      expect(goal.segments, goal.key).toHaveLength(1);
      expect(goal.segments[0]!.target, goal.key).toBeUndefined();
      expect(goal.segments[0]!.dueDate, goal.key).toBeUndefined();
      expect(goal.dueDate, goal.key).toBeUndefined();
    }
    /* Jambes : l'indicateur se choisit après 2 tests. */
    expect(goals.find((goal) => goal.key === "legs")!.segments[0]!.measure).toBeUndefined();
  });

  it("références valides : exercices liés et indicateurs dans le catalogue, protocoles installés", async () => {
    const catalog = new Set(exerciseCatalog.map((exercise) => exercise.id));
    const protocols = new Set((await db.testProtocols.toArray()).map((protocol) => protocol.id));

    for (const goal of await getAllGoals()) {
      for (const link of goal.linkedExercises) expect(catalog.has(link.exerciseId), `${goal.key} ${link.exerciseId}`).toBe(true);
      for (const indicator of goal.secondaryIndicators) {
        if (indicator.kind === "exercise") expect(catalog.has(indicator.exerciseId), indicator.exerciseId).toBe(true);
        else expect(protocols.has(indicator.protocolId), indicator.protocolId).toBe(true);
      }
      for (const segment of goal.segments) {
        if (segment.measure?.source === "test") expect(protocols.has(segment.measure.protocolId), segment.measure.protocolId).toBe(true);
      }
    }

    const counts = Object.fromEntries((await getAllGoals()).map((goal) => [goal.key, goal.linkedExercises.length]));
    expect(counts).toEqual({ traction: 6, upper_body: 7, legs: 8, cardio: 2, core: 6, flexibility: 9, weight: 0 });
  });

  it("idempotent ; un objectif existant n'est jamais écrasé", async () => {
    const before = JSON.stringify(await getAllGoals());
    await seedGoals("2026-10-01T10:00:00.000Z");
    expect(JSON.stringify(await getAllGoals())).toBe(before);

    await db.goals.clear();
    await db.settings.put({ key: "install", value: {} });
    const mine: Goal = { ...(JSON.parse(before) as Goal[])[6]!, title: "Mon poids", segments: [] };
    await db.goals.put(mine);
    await seedGoals(NOW);
    expect(await db.goals.count()).toBe(7);
    expect((await db.goals.where("key").equals("weight").first())?.title).toBe("Mon poids");
  });
});
