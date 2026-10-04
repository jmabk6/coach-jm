import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { ExerciseBlock, InstallMarkers, SessionTemplate } from "../../domain";
import { v6SnapshotAdjustments } from "../goals/tractionV6";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { TRACTION_LIGHT_NOTE } from "./programV2";
import { seedTractionV620261004 } from "./seedTractionV6";

/**
 * Seed 26 (04/10/2026), pari traction V6 : Muscu A 3 × jusqu'à 5 à 3 min,
 * Muscu B 3 × 8-10 hors palier (2 × 8 en semaine test), cadre 3 × 1-5.
 */

const NOW = "2026-10-04T08:00:00.000Z";
const traction = (template: SessionTemplate, id: string) => template.blocks.find((block) => block.id === id) as ExerciseBlock;

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

/** Les briques et le cadre tels qu'installés avant le 04/10. */
async function seededBeforeV6() {
  await runSeeds(SEEDS.filter((seed) => seed.name !== "tractionV620261004"));
  for (const [templateId, blockId, sets, min, max, rest] of [
    ["v2-muscu-a", "v2-muscu-a-traction", 3, 6, 8, 150],
    ["v2-muscu-b", "v2-muscu-b-traction", 2, 8, 10, 120],
  ] as const) {
    const template = (await db.sessionTemplates.get(templateId))!;
    await db.sessionTemplates.put({
      ...template,
      blocks: template.blocks.map((block) => {
        if (block.id !== blockId || block.kind !== "exercise") return block;
        const old: ExerciseBlock = { ...block, instructions: { shape: "reps", sets, reps: { min, max }, restBetweenSetsSec: rest } };
        delete old.outsideFrame;
        return old;
      }),
    });
  }
  const frame = (await db.strengthFrames.where("exerciseId").equals("traction-assistee").first())!;
  const v6 = (await db.strengthFrameVersions.get(frame.activeVersionId))!;
  /* Défait la V6 posée par l'installation : la version d'avant redevient active. */
  await db.strengthFrameVersions.delete(v6.id);
  const previous = (await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray()).sort((a, b) => b.number - a.number)[0]!;
  const restored = { ...previous, status: "active" as const, repRange: { min: 6, max: 8 }, restSec: 150, rpeTarget: 9, currentTarget: { value: 42, unit: "kg" as const, acceptedAt: NOW } };
  delete (restored as { archivedAt?: string }).archivedAt;
  delete (restored as { archiveReason?: string }).archiveReason;
  await db.strengthFrameVersions.put(restored as typeof previous);
  await db.strengthFrames.put({ ...frame, activeVersionId: restored.id });
  const install = (await db.settings.get("install"))!.value as InstallMarkers;
  return { frameId: frame.id, previous: restored, install };
}

describe("seed 26 : pari traction V6", () => {
  it("installation neuve : Muscu A 3 × 1-5 à 3 min, Muscu B 3 × 8-10 hors palier, cadre 3 × 1-5 RPE 9 à 3 min, cran 7 kg", async () => {
    await runSeeds();
    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    const b = (await db.sessionTemplates.get("v2-muscu-b"))!;
    expect(traction(a, "v2-muscu-a-traction").instructions).toEqual({ shape: "reps", sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 });
    expect(traction(b, "v2-muscu-b-traction")).toMatchObject({ instructions: { sets: 3, reps: { min: 8, max: 10 } }, outsideFrame: true, notes: TRACTION_LIGHT_NOTE });
    const frame = (await db.strengthFrames.where("exerciseId").equals("traction-assistee").first())!;
    const active = (await db.strengthFrameVersions.get(frame.activeVersionId))!;
    expect(active).toMatchObject({ status: "active", workSets: 3, repRange: { min: 1, max: 5 }, rpeTarget: 9, restSec: 180, increment: { unit: "kg", value: 7 } });
    expect(active.currentTarget).toBeUndefined();
  });

  it("base d'avant le 04/10 : briques et cadre passent en V6, l'ancienne version est archivée ; deuxième passage : rien", async () => {
    const { frameId, previous } = await seededBeforeV6();
    await seedTractionV620261004(NOW);

    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    const b = (await db.sessionTemplates.get("v2-muscu-b"))!;
    expect(traction(a, "v2-muscu-a-traction").instructions).toMatchObject({ sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 });
    expect(traction(b, "v2-muscu-b-traction")).toMatchObject({ instructions: { sets: 3 }, outsideFrame: true });
    const frame = (await db.strengthFrames.get(frameId))!;
    expect(frame.activeVersionId).toBe(`${frameId}-v${previous.number + 1}`);
    expect(await db.strengthFrameVersions.get(previous.id)).toMatchObject({ status: "archived", archiveReason: "changement_programme", archivedAt: NOW });
    expect((await db.strengthFrameVersions.get(previous.id))!.currentTarget).toBeUndefined();
    const install = (await db.settings.get("install"))!.value as InstallMarkers;
    expect(install.tractionV620261004).toBe(NOW);

    await seedTractionV620261004("2026-10-05T08:00:00.000Z");
    expect((await db.strengthFrameVersions.where("frameId").equals(frameId).toArray()).length).toBe(previous.number + 1);
  });

  it("brique modifiée à la main : on n'y touche pas", async () => {
    await seededBeforeV6();
    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    await db.sessionTemplates.put({
      ...a,
      blocks: a.blocks.map((block) => (block.id === "v2-muscu-a-traction" && block.kind === "exercise" ? { ...block, instructions: { shape: "reps", sets: 4, reps: { min: 4, max: 6 }, restBetweenSetsSec: 150 } } : block)),
    });
    await seedTractionV620261004(NOW);
    expect(traction((await db.sessionTemplates.get("v2-muscu-a"))!, "v2-muscu-a-traction").instructions).toMatchObject({ sets: 4 });
  });
});

describe("séance créée : Muscu B hors palier, 2 séries en semaine test", () => {
  it("la traction de Muscu B est une prescription réduite (ni palier ni stagnation) ; semaine test : 2 séries ; Muscu A : 3 séries, pas réduite", async () => {
    await runSeeds();
    const frame = (await db.strengthFrames.where("exerciseId").equals("traction-assistee").first())!;
    const version = (await db.strengthFrameVersions.get(frame.activeVersionId))!;
    const ids = new Map([["traction-assistee", version.id]]);
    const versions = new Map([[version.id, version]]);
    const b = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;

    const normal = createWorkoutSnapshot(b, ids, versions, [], v6SnapshotAdjustments(b, "2026-10-06"));
    const tractionB = normal.find((block) => block.kind !== "test" && block.sourceBlockId === "v2-muscu-b-traction")!;
    expect(tractionB).toMatchObject({ reducedPrescription: true, frameVersionId: version.id });
    expect(tractionB.kind === "exercise" && tractionB.series).toHaveLength(3);

    expect(v6SnapshotAdjustments(b, "2026-10-27")).toEqual([{ blockId: "v2-muscu-b-traction", sets: 2 }]);
    expect(v6SnapshotAdjustments(a, "2026-10-25")).toEqual([]);
    expect(v6SnapshotAdjustments(b, "2026-09-29")).toEqual([]);
    const light = createWorkoutSnapshot(b, ids, versions, [], v6SnapshotAdjustments(b, "2026-10-27"));
    const lightB = light.find((block) => block.kind !== "test" && block.sourceBlockId === "v2-muscu-b-traction")!;
    expect(lightB.kind === "exercise" && lightB.series).toHaveLength(2);

    const tractionA = createWorkoutSnapshot(a, ids, versions).find((block) => block.kind !== "test" && block.sourceBlockId === "v2-muscu-a-traction")!;
    expect(tractionA).not.toHaveProperty("reducedPrescription");
    expect(tractionA.kind === "exercise" && tractionA.series).toHaveLength(3);
    expect(tractionA.kind === "exercise" && tractionA.snapshotInstructions).toMatchObject({ restBetweenSetsSec: 180 });
  });
});
