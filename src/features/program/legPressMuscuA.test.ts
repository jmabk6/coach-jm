import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedBlock, PerformedExerciseBlock, PerformedSeries, SessionTemplate, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { v6SnapshotAdjustments } from "../goals/tractionV6";
import { advisedLoadOf } from "../workout/advisedLoad";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { LEG_PRESS_A_NOTE, PROGRAM_V2_TEMPLATES } from "./programV2";
import { muscuAWithLegPress, seedLegPressMuscuA20261005 } from "./seedLegPressMuscuA";

/**
 * Leg press en Muscu A (05/10/2026) : après le curl EZ, avant le leg curl
 * couché ; 2 × 10-12, 2 min de repos, environ 2 reps en réserve. La
 * charge reprend la dernière connue, jamais inventée. Le pari traction V6
 * ne change pas ; le dimanche de test, la leg press reste après le test.
 * Programme du 05/10/2026 (seed 38) : plus de tirage vertical, le leg curl
 * passe avant la leg press.
 */

const NOW = "2026-10-05T08:00:00.000Z";
const ORDER = [
  "v2-muscu-a-echauffement", "v2-muscu-a-traction", "v2-muscu-a-rowing", "v2-muscu-a-chest-press",
  "v2-muscu-a-elevations", "v2-muscu-a-curl", "v2-muscu-a-leg-curl", "v2-muscu-a-presse",
];
/** Le seed 30 insère la leg press juste avant le leg curl (sa place du 05/10, avant le seed 38). */
const ORDER_SEED_30 = [
  "v2-muscu-a-echauffement", "v2-muscu-a-traction", "v2-muscu-a-rowing", "v2-muscu-a-chest-press",
  "v2-muscu-a-elevations", "v2-muscu-a-curl", "v2-muscu-a-presse", "v2-muscu-a-leg-curl",
];
const order = (template: Pick<SessionTemplate, "blocks">) => [...template.blocks].sort((a, b) => a.position - b.position).map((block) => block.id);
const muscuA = () => PROGRAM_V2_TEMPLATES.find((item) => item.id === "v2-muscu-a") as SessionTemplate;

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("le modèle Muscu A", () => {
  it("ordre final : échauffement, traction, rowing, chest press, élévations, curl, leg curl, leg press ; leg press 2 × 10-12, 2 min, RPE 8", () => {
    expect(order(muscuA())).toEqual(ORDER);
    const press = muscuA().blocks.find((block) => block.id === "v2-muscu-a-presse")!;
    expect(press).toMatchObject({
      kind: "exercise",
      exerciseId: "presse-cuisses",
      instructions: { shape: "reps", sets: 2, reps: { min: 10, max: 12 }, targetRpe: { min: 8, max: 8 }, restBetweenSetsSec: 120 },
      notes: LEG_PRESS_A_NOTE,
      outsideFrame: true,
    });
    /* La traction V6 ne bouge pas. */
    expect(muscuA().blocks.find((block) => block.id === "v2-muscu-a-traction")).toMatchObject({ instructions: { sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 } });
  });
});

describe("seed 30", () => {
  it("installation neuve : Muscu A identique au modèle du programme", async () => {
    await runSeeds();
    expect(order((await db.sessionTemplates.get("v2-muscu-a"))!)).toEqual(ORDER);
  });

  it("base d'avant : leg press insérée entre curl et leg curl, positions continues ; séance faite intacte ; second passage : rien", async () => {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "legPressMuscuA20261005"));
    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    await db.sessionTemplates.put({ ...a, blocks: a.blocks.filter((block) => block.id !== "v2-muscu-a-presse") });
    const done = { id: "w-done", date: "2026-10-04", status: "completed", sessionTemplateId: "v2-muscu-a", blocks: [{ id: "x", kind: "exercise", exerciseId: "leg-curl-couche" }] } as unknown as WorkoutSession;
    await db.workouts.put(done);

    await seedLegPressMuscuA20261005(NOW);

    const after = (await db.sessionTemplates.get("v2-muscu-a"))!;
    expect(order(after)).toEqual(ORDER_SEED_30);
    expect(after.blocks.map((block) => block.position).sort((x, y) => x - y)).toEqual(after.blocks.map((_, index) => index));
    expect(await db.workouts.get("w-done")).toEqual(done);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).legPressMuscuA20261005).toBe(NOW);
    expect(muscuAWithLegPress(after, NOW)).toBeUndefined();
  });
});

describe("en séance", () => {
  it("dimanche de test (25/10) : la leg press reste après le test traction, 2 séries, hors palier ; aucun allègement automatique de Muscu A", () => {
    const frame = { id: "frame-presse", workSets: 3 } as StrengthFrameVersion;
    expect(v6SnapshotAdjustments(muscuA(), "2026-10-25")).toEqual([]);
    const blocks: PerformedBlock[] = createWorkoutSnapshot(muscuA(), new Map([["presse-cuisses", frame.id]]), new Map([[frame.id, frame]]), [
      { test: { protocolId: "protocol-traction", placement: "replace_block", targetBlockId: "v2-muscu-a-traction" }, protocolVersionId: "protocol-traction-v3" },
    ]);
    expect(blocks.map((block) => (block.kind === "test" ? "test" : block.sourceBlockId))).toEqual([
      "v2-muscu-a-echauffement", "test", "v2-muscu-a-rowing", "v2-muscu-a-chest-press",
      "v2-muscu-a-elevations", "v2-muscu-a-curl", "v2-muscu-a-leg-curl", "v2-muscu-a-presse",
    ]);
    const press = blocks.find((block) => block.kind !== "test" && block.sourceBlockId === "v2-muscu-a-presse") as PerformedExerciseBlock;
    expect(press.series).toHaveLength(2);
    expect(press.reducedPrescription).toBe(true);
    expect(press.outsideFrame).toBe(true);
    expect(press.note).toContain("travail propre, sans recherche de record");
  });

  it("charge : la dernière connue (130 kg), jamais inventée sans historique ni objectif", () => {
    const version = { id: "v", progressionType: "charge_croissante", workSets: 3, repRange: { min: 10, max: 12 } } as StrengthFrameVersion;
    const last: PerformedSeries[] = [{ id: "s", position: 0, status: "completed", role: "travail", load: { kind: "total", kg: 130 }, reps: 10 }];
    expect(advisedLoadOf(undefined, version, last)).toMatchObject({ value: 130, unit: "kg" });
    expect(advisedLoadOf(undefined, version, undefined)).toBeUndefined();
    expect(advisedLoadOf(undefined, undefined, undefined)).toBeUndefined();
  });
});
