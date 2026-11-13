import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { Goal, InstallMarkers, PerformedBlock, PlannedSession, SessionTemplate, TestProtocol, TestProtocolVersion, TestResult, TestScheduleEntry } from "../../domain";
import { testPointsFor } from "../../domain/rules/goalRules";
import { computeTestResult } from "../../domain/rules/testResultRules";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { seedCalendrierV4 } from "../program/seedCalendrierV4";
import { seedCalendrier20261115, seedCardiosLibres20261115, seedProgramMuscu20261115 } from "../program/seedProgram20261115";
import { seedProgramMuscuV4 } from "../program/seedProgramMuscuV4";
import { seedCalendrierV5, seedProgramMuscuV5, seedRoutinesV5 } from "../program/seedProgramV5";
import { seedRoutinesV4 } from "../program/seedRoutinesV4";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { seedTestJambesV2 } from "./seedTestJambesV2";

/** Test jambes V2 (rapport validé par JM le 13/11/2026) : seed 63. */

const V4 = "2026-11-02T08:00:00.000Z";
const V5 = "2026-11-07T22:30:00.000Z";
const TONIGHT = "2026-11-13T21:00:00.000Z";

const install = async () => (await db.settings.get("install"))?.value as InstallMarkers | undefined;
const versions = async () => (await db.testProtocolVersions.where("protocolId").equals("protocol-jambes").toArray()) as TestProtocolVersion[];
const tuesday24 = async () => ((await db.plannedSessions.where("date").equals("2026-11-24").toArray()) as PlannedSession[]).find((session) => (session.slot ?? "day") === "day")!;

async function install4p2() {
  await seedProgramMuscuV4(V4);
  await seedRoutinesV4(V4);
  await seedCalendrierV4(V4);
  await generateProgramWeek("2026-11-08", V4);
  await seedProgramMuscuV5(V5);
  await seedRoutinesV5(V5);
  await seedCalendrierV5(V5);
  for (const week of ["2026-11-15", "2026-11-22", "2026-11-29"]) await generateProgramWeek(week, "2026-11-12T19:00:00.000Z");
  await seedProgramMuscu20261115(TONIGHT);
  await seedCardiosLibres20261115(TONIGHT);
  await seedCalendrier20261115(TONIGHT);
}

describe("test jambes V2 (seed 63)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    await install4p2();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("sous Vitest, les seeds du lancement ne le posent pas ; avant le 13/11 : rien", async () => {
    expect((await install())?.testJambesV2_20261113).toBeUndefined();
    const before = await versions();
    await seedTestJambesV2("2026-11-12T20:00:00.000Z");
    expect(await versions()).toEqual(before);
    expect((await install())?.testJambesV2_20261113).toBeUndefined();
  });

  it("le 13/11 : V2 active, V1 archivée (gardée) ; mesures, plafonds, choix et réglages du brief ; squats sur chaise en mesure principale", async () => {
    await seedTestJambesV2(TONIGHT);
    expect((await install())?.testJambesV2_20261113).toBe(TONIGHT);
    const all = await versions();
    expect(all.map((version) => [version.id, version.status]).sort()).toEqual([["protocol-jambes-v1", "archived"], ["protocol-jambes-v2", "active"]]);
    expect(((await db.testProtocols.get("protocol-jambes")) as TestProtocol).activeVersionId).toBe("protocol-jambes-v2");
    const v2 = all.find((version) => version.id === "protocol-jambes-v2")!;
    expect(v2.primaryMeasureKey).toBe("squat_reps");
    expect(v2.measures.map((measure) => measure.key)).toEqual(["step_fc_fin", "step_fc_1min", "step_fc_recup", "step_brulure", "step_cadence_tenue", "squat_reps", "chaise_duree_s", "chaise_distance_cm", "arret_douleur"]);
    expect(v2.measures.find((measure) => measure.key === "squat_reps")?.max).toBe(40);
    expect(v2.measures.find((measure) => measure.key === "chaise_duree_s")?.max).toBe(120);
    expect(v2.measures.find((measure) => measure.key === "chaise_distance_cm")?.prefill).toBe("previous");
    expect(v2.measures.find((measure) => measure.key === "step_cadence_tenue")?.choices?.map((choice) => choice.label)).toEqual(["Oui", "Non"]);
    expect(v2.measures.find((measure) => measure.key === "arret_douleur")).toMatchObject({ required: false, choices: [{ value: 0, label: "Aucun" }, { value: 1, label: "Genou" }, { value: 2, label: "Dos" }] });
    expect(v2.settings).toEqual({ stepHeightCm: 30, stepCadencePerMin: 20, stepMetronomeBpm: 80, stepDurationSec: 120, recoverySec: 180, squatTempo: "2-1", squatMetronomeBpm: 60, squatCapReps: 40, chairCapSec: 120 });
  });

  it("calendrier : jambes le mardi dans le Cardio A, plus suspendu ; le mardi 24/11 reçoit le test ; ce jour-là : 8 min + test + 10 min de marche, sans fractionné ni bloc jambes", async () => {
    await seedTestJambesV2(TONIGHT);
    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[];
    const entry = schedule.find((item) => item.protocolKey === "jambes")!;
    expect(entry).toMatchObject({ weekday: "tuesday", slot: "day", templateId: "v2-cardio-b", placement: "replace_block", targetBlockId: "v2-cardio-b-tapis" });
    expect(entry.suspendedUntil).toBeUndefined();
    expect(schedule.filter((item) => item.protocolKey === "jambes")).toHaveLength(1);

    const session = await tuesday24();
    expect(session.sessionTemplateId).toBe("v2-cardio-b");
    expect(session.tests?.map((test) => test.protocolId)).toEqual(["protocol-jambes"]);

    const template = (await db.sessionTemplates.get("v2-cardio-b")) as SessionTemplate;
    const blocks: PerformedBlock[] = createWorkoutSnapshot(template, undefined, undefined, [{ test: session.tests![0]!, protocolVersionId: "protocol-jambes-v2" }]);
    expect(blocks.map((block) => (block.kind === "test" ? "test" : block.kind === "exercise" ? block.exerciseId : block.kind))).toEqual(["tapis", "test", "tapis"]);
    const minutes = (block: PerformedBlock): number[] => {
      if (block.kind !== "exercise" || block.snapshotInstructions.shape !== "steps") return [];
      return block.snapshotInstructions.steps.map((step) => (typeof step.durationSec === "number" ? step.durationSec : step.durationSec.max) / 60);
    };
    expect(minutes(blocks[0]!)).toEqual([8]);
    expect(minutes(blocks[2]!)).toEqual([10]);

    /* Les autres mardis (hors semaine de tests) ne bougent pas. */
    const tuesday17 = ((await db.plannedSessions.where("date").equals("2026-11-17").toArray()) as PlannedSession[]).find((item) => (item.slot ?? "day") === "day")!;
    expect(tuesday17.tests ?? []).toEqual([]);
  });

  it("objectif Jambes : courbe sur les squats sur chaise ; exercices liés + squat sur chaise et presse à une jambe, − sprint vélo, les autres gardés ; indicateurs : − sprints, + FC fin des montées", async () => {
    const before = (await db.goals.where("key").equals("legs").first()) as Goal;
    await seedTestJambesV2(TONIGHT);
    const goal = (await db.goals.where("key").equals("legs").first()) as Goal;
    expect(goal.segments[0]).toMatchObject({ measure: { source: "test", protocolId: "protocol-jambes", measureKey: "squat_reps" }, direction: "increase", label: "Squats sur chaise" });
    expect(goal.segments[0]?.target).toBeUndefined();
    const ids = goal.linkedExercises.map((link) => link.exerciseId);
    expect(ids).not.toContain("sprint-velo");
    expect(ids).toEqual(expect.arrayContaining(["squat-chaise", "presse-cuisses-une-jambe", "montee-banc", "chaise-60"]));
    for (const kept of before.linkedExercises.map((link) => link.exerciseId).filter((id) => id !== "sprint-velo")) expect(ids).toContain(kept);
    expect(goal.secondaryIndicators.some((indicator) => indicator.kind === "test_measure" && indicator.measureKey.startsWith("sprint_"))).toBe(false);
    expect(goal.secondaryIndicators).toContainEqual({ kind: "test_measure", protocolId: "protocol-jambes", measureKey: "step_fc_fin" });
    expect(goal.secondaryIndicators).toContainEqual({ kind: "test_measure", protocolId: "protocol-jambes", measureKey: "chaise_duree_s" });
  });

  it("résultat : récupération cardiaque calculée, complet sans « arrêt sur douleur » ; un test arrêté sur douleur est gardé mais exclu de la courbe", async () => {
    await seedTestJambesV2(TONIGHT);
    const v2 = (await versions()).find((version) => version.id === "protocol-jambes-v2")!;
    const values = { step_fc_fin: 132, step_fc_1min: 104, step_brulure: 6, step_cadence_tenue: 1, squat_reps: 22, chaise_duree_s: 75, chaise_distance_cm: 45 };
    const result = computeTestResult(v2, { values });
    expect(result.status).toBe("complete");
    expect(result.measures.find((measure) => measure.key === "step_fc_recup")?.value).toBe(28);

    const goal = (await db.goals.where("key").equals("legs").first()) as Goal;
    const asResult = (id: string, date: string, extra: Record<string, number>) =>
      ({ id, protocolId: "protocol-jambes", versionId: v2.id, date, status: "complete", measures: computeTestResult(v2, { values: { ...values, ...extra } }).measures }) as unknown as TestResult;
    const points = testPointsFor(goal.segments[0]!, [asResult("r1", "2026-11-24", {}), asResult("r2", "2026-12-22", { squat_reps: 15, arret_douleur: 1 })]);
    expect(points.map((point) => [point.date, point.value])).toEqual([["2026-11-24", 22]]);
  });

  it("une seule fois ; Cardio A modifié à la main : rien n'est touché, marqueur posé", async () => {
    await seedTestJambesV2(TONIGHT);
    const all = await versions();
    await seedTestJambesV2("2026-11-14T08:00:00.000Z");
    expect(await versions()).toEqual(all);
  });
});

describe("test jambes V2 — Cardio A modifié à la main", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("sans bloc jambes dans le Cardio A : protocole, calendrier et objectif inchangés", async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    await install4p2();
    const cardio = (await db.sessionTemplates.get("v2-cardio-b")) as SessionTemplate;
    await db.sessionTemplates.put({ ...cardio, blocks: cardio.blocks.slice(0, 1) });
    const before = { versions: await versions(), schedule: (await db.settings.get("testSchedule"))?.value, goals: await db.goals.toArray() };
    await seedTestJambesV2(TONIGHT);
    expect(await versions()).toEqual(before.versions);
    expect((await db.settings.get("testSchedule"))?.value).toEqual(before.schedule);
    expect(await db.goals.toArray()).toEqual(before.goals);
    expect((await install())?.testJambesV2_20261113).toBe(TONIGHT);
  });
});

describe("test jambes V2 — sauvegarde réelle", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!process.env.COACH_JM_BACKUP)("seeds 60 à 63 le 13/11 au soir : séances faites intactes, mardi 24/11 avec le test jambes", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(process.env.COACH_JM_BACKUP!, "utf8")), db);
    resumeSeedsForTests();
    expect((await runSeeds()).failed).toEqual([]);
    if ((await install())?.calendrierV5 === undefined) return;
    const workouts = await db.workouts.toArray();
    await seedProgramMuscu20261115(TONIGHT);
    await seedCardiosLibres20261115(TONIGHT);
    await seedCalendrier20261115(TONIGHT);
    await seedTestJambesV2(TONIGHT);
    expect(await db.workouts.toArray()).toEqual(workouts);
    expect((await tuesday24()).tests?.map((test) => test.protocolId)).toEqual(["protocol-jambes"]);
    expect(((await db.testProtocols.get("protocol-jambes")) as TestProtocol).activeVersionId).toBe("protocol-jambes-v2");
  });
});
