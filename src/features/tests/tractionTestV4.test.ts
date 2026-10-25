import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, PlannedSession, TestScheduleEntry, WorkoutSession } from "../../domain";
import type { BetSet } from "../goals/tractionBet";
import { v6State } from "../goals/tractionV6";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { betBannerFor } from "../workout/betBanner";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { seedTractionTestV420261025, TRACTION_TEST_V4_INSTRUCTIONS } from "./seedTractionTestV4";

/**
 * Test traction V4 du pari V6 (25/10/2026) : le test garde sa règle, puis
 * 2 séries de complément à palier A + 7 kg d'aide, jusqu'à 5 reps, RPE 8
 * au plus — sans effet sur le palier A (ni validation, ni repli, ni
 * régression).
 */

const NOW = "2026-10-25T16:00:00.000Z";
const set = (assistKg: number, reps: number, rpe?: number): BetSet => ({ assistKg, reps, ...(rpe !== undefined ? { rpe } : {}) });

function muscuA(date: string, sets: BetSet[], options: { reduced?: boolean; tested?: boolean } = {}): WorkoutSession {
  const traction = {
    id: "workout-block-v2-muscu-a-traction", sourceBlockId: "v2-muscu-a-traction", kind: "exercise", position: 2, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "performed",
    ...(options.reduced ? { reducedPrescription: true } : {}),
    snapshotInstructions: { shape: "reps", sets: options.reduced ? 2 : 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 },
    series: sets.map((item, index) => ({
      id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const,
      load: { kind: "total" as const, kg: item.assistKg }, reps: item.reps, ...(item.rpe !== undefined ? { rpe: item.rpe } : {}),
    })),
  } as PerformedExerciseBlock;
  const test = { id: "workout-block-test-protocol-traction", kind: "test", position: 1, addedDuringWorkout: false, status: "performed", protocolId: "protocol-traction", protocolVersionId: "protocol-traction-v4" };
  return {
    id: `w-${date}`, source: "planned", status: "completed", date, sessionTemplateId: "v2-muscu-a", startedAt: "x", lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
    blocks: [...(options.tested ? [test] : []), traction],
  } as WorkoutSession;
}

describe("complément après le test : sans effet sur le palier A", () => {
  it("A = 21 : 2 × 5 à 28 kg après le test ne valident rien, ne déclenchent ni repli ni régression ; un 5/5/5 réduit ne valide pas non plus", () => {
    const before = [muscuA("2026-10-04", [set(35, 5, 8), set(35, 5, 8), set(35, 5, 8)]), muscuA("2026-10-19", [set(28, 5, 8), set(28, 5, 8), set(28, 5, 9)])];
    const reference = v6State(before, "2026-10-26");
    expect(reference.aKg).toBe(21);
    for (const complement of [[set(28, 5, 8), set(28, 5, 8)], [set(21, 5, 8), set(21, 5, 8), set(21, 5, 8)], [set(28, 1, 10), set(28, 2, 10)]]) {
      const state = v6State([...before, muscuA("2026-10-25", complement, { reduced: true, tested: true })], "2026-10-26");
      expect(state.aKg).toBe(21);
      expect(state.events).toEqual(reference.events);
      expect(state.last?.date).toBe("2026-10-19");
    }
  });

  it("bandeau : « Complément après le test — 28 kg d'aide », 2 séries jusqu'à 5, palier A inchangé ; une ancienne séance réduite sans test : rien", () => {
    const state = v6State([muscuA("2026-10-04", [set(35, 5, 8), set(35, 5, 8), set(35, 5, 8)]), muscuA("2026-10-19", [set(28, 5, 8), set(28, 5, 8), set(28, 5, 9)])], "2026-10-26");
    const tested = muscuA("2026-10-25", [], { reduced: true, tested: true });
    const banner = betBannerFor(tested, tested.blocks[1] as PerformedExerciseBlock, state)!;
    expect(banner.title).toBe("Complément après le test — 28 kg d'aide");
    expect(banner.sets).toEqual([{ assistKg: 28, reps: 5 }, { assistKg: 28, reps: 5 }]);
    expect(banner.lines.map((line) => line.value).join(" ")).toContain("RPE 8 max");
    expect(banner.lines.map((line) => line.value).join(" ")).toContain("21 kg, inchangé");
    const old = muscuA("2026-10-25", [], { reduced: true });
    expect(betBannerFor(old, old.blocks[0] as PerformedExerciseBlock, state)).toBeUndefined();
  });
});

describe("seed 47 : test traction V4", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("installation neuve : V4 active (complément 2 × 5, +7 kg, RPE 8), V3 archivée ; calendrier après l'échauffement, traction réduite à 2 séries ; la séance du test garde une traction réduite, juste après le test", async () => {
    await runSeeds();
    const protocol = (await db.testProtocols.get("protocol-traction"))!;
    const version = (await db.testProtocolVersions.get(protocol.activeVersionId))!;
    expect(version).toMatchObject({ status: "active", instructions: TRACTION_TEST_V4_INSTRUCTIONS, settings: { start: "palier_a", complementSets: 2, complementReps: 5, complementOffsetKg: 7, complementRpeMax: 8 } });
    expect((await db.testProtocolVersions.where("protocolId").equals("protocol-traction").toArray()).filter((item) => item.status === "active")).toHaveLength(1);
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    const entry = schedule.find((item) => item.protocolKey === "traction")!;
    expect(entry).toMatchObject({ templateId: "v2-muscu-a", placement: "after_warmup", adjustments: [{ blockId: "v2-muscu-a-traction", sets: 2 }] });
    expect(entry).not.toHaveProperty("targetBlockId");

    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    const frames = await db.strengthFrames.toArray();
    const active = await db.strengthFrameVersions.where("status").equals("active").toArray();
    const byExercise = new Map(frames.flatMap((frame) => (frame.activeVersionId ? [[frame.exerciseId, frame.activeVersionId] as const] : [])));
    const byId = new Map(active.map((item) => [item.id, item]));
    const blocks = createWorkoutSnapshot(a, byExercise, byId, [{ test: { protocolId: "protocol-traction", placement: entry.placement!, adjustments: entry.adjustments! }, protocolVersionId: version.id }]);
    const testIndex = blocks.findIndex((block) => block.kind === "test");
    const traction = blocks[testIndex + 1] as PerformedExerciseBlock;
    expect(traction).toMatchObject({ exerciseId: "traction-assistee", reducedPrescription: true, snapshotInstructions: { sets: 2 } });
  });

  it("base d'avant (V3 figée par le test du 25/10) : V3 archivée, V4 active ; calendrier et séance du 22/11 déjà générée retouchés ; second passage : rien", async () => {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "tractionTestV420261025"));
    const protocol = (await db.testProtocols.get("protocol-traction"))!;
    const v3 = (await db.testProtocolVersions.get(protocol.activeVersionId))!;
    expect(v3.settings?.start).toBe("palier_a");
    await db.testProtocolVersions.put({ ...v3, firstOfficialResultId: "r-2026-10-25", frozenAt: NOW });
    const planned: PlannedSession = {
      id: "p-2026-11-22", date: "2026-11-22", sessionTemplateId: "v2-muscu-a", status: "upcoming", source: "weekly_program", createdAt: NOW, updatedAt: NOW,
      tests: [{ protocolId: "protocol-traction", placement: "replace_block", targetBlockId: "v2-muscu-a-traction" }],
    } as PlannedSession;
    await db.plannedSessions.put(planned);

    await seedTractionTestV420261025(NOW);

    const after = (await db.testProtocols.get("protocol-traction"))!;
    expect(after.activeVersionId).toBe(`protocol-traction-v${v3.number + 1}`);
    expect(await db.testProtocolVersions.get(v3.id)).toMatchObject({ status: "archived", firstOfficialResultId: "r-2026-10-25", instructions: v3.instructions });
    const v4 = (await db.testProtocolVersions.get(after.activeVersionId))!;
    expect(v4).not.toHaveProperty("firstOfficialResultId");
    expect(v4).not.toHaveProperty("frozenAt");
    const nextSchedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(nextSchedule.find((entry) => entry.protocolKey === "traction")).toMatchObject({ placement: "after_warmup", adjustments: [{ blockId: "v2-muscu-a-traction", sets: 2 }] });
    expect((await db.plannedSessions.get("p-2026-11-22"))!.tests).toEqual([{ protocolId: "protocol-traction", placement: "after_warmup", adjustments: [{ blockId: "v2-muscu-a-traction", sets: 2 }] }]);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).tractionTestV420261025).toBe(NOW);

    await seedTractionTestV420261025("2026-10-26T08:00:00.000Z");
    expect((await db.testProtocolVersions.where("protocolId").equals("protocol-traction").toArray()).length).toBe(v3.number + 1);
  });
});
