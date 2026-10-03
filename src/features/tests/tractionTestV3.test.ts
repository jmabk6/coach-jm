import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, TestResult, TestScheduleEntry, TestTrial, WorkoutSession } from "../../domain";
import { computeTestResult } from "../../domain/rules/testResultRules";
import { v6State } from "../goals/tractionV6";
import type { BetSet } from "../goals/tractionBet";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { seedTractionTestV320261005, TRACTION_TEST_V3_MEASURES, TRACTION_TEST_V3_SETTINGS } from "./seedTractionTestV3";

/**
 * Test traction V3 du pari V6 (05/10/2026) : départ au palier A réel,
 * −7 kg après chaque réussite jusqu'au premier échec (0 kg possible) ;
 * résultat = la plus petite assistance réussie ; le test ne change jamais
 * A ; une réussite à 0 kg = objectif gagné.
 */

const V3 = { kind: "trials_descending" as const, measures: TRACTION_TEST_V3_MEASURES, settings: TRACTION_TEST_V3_SETTINGS };
const trial = (order: number, value: number, outcome: TestTrial["outcome"]): TestTrial => ({ order, value, outcome, completedAt: "x" });
const measure = (result: ReturnType<typeof computeTestResult>, key: string) => result.measures.find((item) => item.key === key)?.value;

const set = (assistKg: number, reps: number, rpe?: number): BetSet => ({ assistKg, reps, ...(rpe !== undefined ? { rpe } : {}) });
function muscuA(date: string, sets: BetSet[]): WorkoutSession {
  return {
    id: `w-${date}`, source: "planned", kind: "training", status: "completed", date, sessionTemplateId: "v2-muscu-a",
    startedAt: "x", lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
    blocks: [{
      id: "b", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "performed",
      snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 },
      series: sets.map((item, index) => ({
        id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const,
        load: { kind: "total" as const, kg: item.assistKg }, reps: item.reps, ...(item.rpe !== undefined ? { rpe: item.rpe } : {}),
      })),
    }],
  } as WorkoutSession;
}
const five = (kg: number) => [set(kg, 5, 9), set(kg, 5, 9), set(kg, 5, 9)];

/** Le résultat enregistré d'un test, tel que le moteur V6 le lit. */
function result(date: string, trials: TestTrial[], weightKg?: number): Pick<TestResult, "id" | "protocolId" | "date" | "workoutId" | "measures"> {
  const computed = computeTestResult(V3, { trials, ...(weightKg !== undefined ? { values: { poids_jour_kg: weightKg } } : {}) });
  return { id: `r-${date}`, protocolId: "protocol-traction", date, workoutId: `t-${date}`, measures: computed.measures };
}

describe("résultat du test V3", () => {
  it("A = 35 : réussi 35, réussi 28, échec 21 → résultat 28, départ 35, poids et charge effective indicative ; A reste 35", () => {
    const trials = [trial(1, 35, "success"), trial(2, 28, "success"), trial(3, 21, "failure")];
    const computed = computeTestResult(V3, { trials, values: { poids_jour_kg: 89.4 } });
    expect(computed.status).toBe("complete");
    expect(measure(computed, "assistance_min_kg")).toBe(28);
    expect(measure(computed, "palier_a_depart_kg")).toBe(35);
    expect(measure(computed, "essais_nb")).toBe(3);
    expect(measure(computed, "poids_jour_kg")).toBe(89.4);
    expect(measure(computed, "charge_effective_kg")).toBe(61.4);
    expect(computed.trials?.map((item) => [item.value, item.outcome])).toEqual([[35, "success"], [28, "success"], [21, "failure"]]);

    const state = v6State([muscuA("2026-10-18", [set(35, 4, 9), set(35, 4, 9), set(35, 3, 9)])], "2026-10-26", [result("2026-10-25", trials, 89.4)]);
    expect(state).toMatchObject({ aKg: 35, phase: "travail", consecutiveRegressions: 0 });
    expect(state.events.map((event) => event.kind)).toEqual([]);
  });

  it("A = 28 : échec dès 28 → aucun palier inférieur, pas de résultat réussi ; A reste 28", () => {
    const trials = [trial(1, 28, "failure")];
    const computed = computeTestResult(V3, { trials });
    expect(measure(computed, "assistance_min_kg")).toBeUndefined();
    expect(computed.status).toBe("incomplete");
    expect(computed.messages).toContain("Aucun essai réussi : recalibrer le premier essai");
    const state = v6State([muscuA("2026-10-04", five(35))], "2026-11-23", [result("2026-11-22", trials)]);
    expect(state.aKg).toBe(28);
  });

  it("sans poids du jour : pas de charge effective, le résultat reste complet", () => {
    const computed = computeTestResult(V3, { trials: [trial(1, 35, "success"), trial(2, 28, "failure")] });
    expect(computed.status).toBe("complete");
    expect(measure(computed, "charge_effective_kg")).toBeUndefined();
  });
});

describe("victoire par le test", () => {
  it("A = 7 : réussi 7, réussi 0 → le test s'arrête à 0, objectif gagné", () => {
    const trials = [trial(1, 7, "success"), trial(2, 0, "success")];
    const computed = computeTestResult(V3, { trials, values: { poids_jour_kg: 75 } });
    expect(computed.status).toBe("complete");
    expect(measure(computed, "assistance_min_kg")).toBe(0);
    expect(measure(computed, "charge_effective_kg")).toBe(75);
    const dates = ["2026-10-04", "2026-11-01", "2026-12-06", "2027-01-10"];
    const workouts = [35, 28, 21, 14].map((kg, index) => muscuA(dates[index]!, five(kg)));
    const before = v6State(workouts, "2027-03-13");
    expect(before).toMatchObject({ aKg: 7, phase: "travail" });
    const state = v6State(workouts, "2027-03-15", [result("2027-03-14", trials, 75)]);
    expect(state.phase).toBe("gagne");
    expect(state.events.at(-1)).toMatchObject({ kind: "victoire", date: "2027-03-14", detail: "test à 0 kg" });
  });

  it("phase essai libre : réussi 0 au test → objectif gagné", () => {
    const dates = ["2026-10-04", "2026-11-01", "2026-12-06", "2027-01-10", "2027-02-07"];
    const workouts = [35, 28, 21, 14, 7].map((kg, index) => muscuA(dates[index]!, five(kg)));
    expect(v6State(workouts, "2027-02-13").phase).toBe("essai_libre");
    expect(v6State(workouts, "2027-02-15", [result("2027-02-14", [trial(1, 7, "success"), trial(2, 0, "success")])]).phase).toBe("gagne");
  });

  it("un résultat de test à 0 suffit, sans aucune séance A à 0 ; avant la date du test, pas encore gagné", () => {
    const results = [result("2026-10-25", [trial(1, 35, "success"), trial(2, 28, "success"), trial(3, 21, "success"), trial(4, 14, "success"), trial(5, 7, "success"), trial(6, 0, "success")])];
    expect(v6State([], "2026-10-26", results).phase).toBe("gagne");
    expect(v6State([], "2026-10-24", results).phase).toBe("travail");
    /* Les séances après la victoire ne la défont pas. */
    expect(v6State([muscuA("2026-11-01", [set(35, 1, 10)])], "2026-11-02", results)).toMatchObject({ phase: "gagne", aKg: 35 });
  });
});

describe("seed 27 : le test remplace la traction de Muscu A", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  const NOW = "2026-10-05T08:00:00.000Z";

  it("installation neuve : protocole V3 actif, calendrier au remplacement de la brique ; la séance du test n'a plus de traction de travail", async () => {
    await runSeeds();
    const protocol = (await db.testProtocols.get("protocol-traction"))!;
    const version = (await db.testProtocolVersions.get(protocol.activeVersionId))!;
    expect(version).toMatchObject({ status: "active", kind: "trials_descending", settings: TRACTION_TEST_V3_SETTINGS, primaryMeasureKey: "assistance_min_kg" });
    expect(version.measures.map((spec) => spec.key)).toEqual(["assistance_min_kg", "palier_a_depart_kg", "essais_nb", "poids_jour_kg", "charge_effective_kg"]);
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "traction")).toMatchObject({ placement: "replace_block", targetBlockId: "v2-muscu-a-traction" });
    expect(schedule.find((entry) => entry.protocolKey === "traction")).not.toHaveProperty("adjustments");

    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    const blocks = createWorkoutSnapshot(a, new Map(), new Map(), [
      { test: { protocolId: "protocol-traction", placement: "replace_block", targetBlockId: "v2-muscu-a-traction" }, protocolVersionId: version.id },
    ]);
    expect(blocks.some((block) => block.kind === "exercise" && block.exerciseId === "traction-assistee")).toBe(false);
    expect(blocks.findIndex((block) => block.kind === "test")).toBe(1);
  });

  it("base d'avant : V2 archivée, V3 active ; calendrier et séance du 25/10 déjà générée retouchés ; second passage : rien", async () => {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "tractionTestV320261005"));
    const protocol = (await db.testProtocols.get("protocol-traction"))!;
    const v2 = (await db.testProtocolVersions.get(protocol.activeVersionId))!;
    expect(v2.settings?.start).toBeUndefined();
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    const old: TestScheduleEntry = { protocolKey: "traction", weekday: "sunday", slot: "day", templateId: "v2-muscu-a", placement: "after_warmup", adjustments: [{ blockId: "v2-muscu-a-traction", sets: 2 }] };
    await db.settings.put({ key: "testSchedule", value: schedule.map((entry) => (entry.protocolKey === "traction" ? old : entry)) });
    const planned: PlannedSession = {
      id: "p-2026-10-25", date: "2026-10-25", sessionTemplateId: "v2-muscu-a", status: "upcoming", source: "weekly_program", createdAt: NOW, updatedAt: NOW,
      tests: [{ protocolId: "protocol-traction", placement: "after_warmup", adjustments: [{ blockId: "v2-muscu-a-traction", sets: 2 }] }],
    } as PlannedSession;
    await db.plannedSessions.put(planned);

    await seedTractionTestV320261005(NOW);

    const after = (await db.testProtocols.get("protocol-traction"))!;
    expect(after.activeVersionId).toBe(`protocol-traction-v${v2.number + 1}`);
    expect(await db.testProtocolVersions.get(v2.id)).toMatchObject({ status: "archived" });
    const nextSchedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(nextSchedule.find((entry) => entry.protocolKey === "traction")).toMatchObject({ placement: "replace_block", targetBlockId: "v2-muscu-a-traction" });
    expect((await db.plannedSessions.get("p-2026-10-25"))!.tests).toEqual([{ protocolId: "protocol-traction", placement: "replace_block", targetBlockId: "v2-muscu-a-traction" }]);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).tractionTestV320261005).toBe(NOW);

    await seedTractionTestV320261005("2026-10-06T08:00:00.000Z");
    expect((await db.testProtocolVersions.where("protocolId").equals("protocol-traction").toArray()).length).toBe(v2.number + 1);
  });
});
