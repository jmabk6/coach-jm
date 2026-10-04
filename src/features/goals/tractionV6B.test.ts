import "fake-indexeddb/auto";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { SessionTemplate, TestTrial, WorkoutSession } from "../../domain";
import { computeTestResult } from "../../domain/rules/testResultRules";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { FIX_WORKOUT_ID, fixesOf20261004 } from "../history/seedFixWorkout20261004";
import { TRACTION_LIGHT_NOTE } from "../program/programV2";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { TRACTION_TEST_V3_MEASURES, TRACTION_TEST_V3_SETTINGS } from "../tests/seedTractionTestV3";
import type { BetSet } from "./tractionBet";
import { V6_REFERENCE, V6_START_B_KG, v6ForceSession, v6LightSession, v6State, v6VolumeKgAfter, v6WeekOf } from "./tractionV6";
import { v6Progress } from "./tractionV6View";

/**
 * Correction V6 du 04/10/2026 :
 * - Muscu B ne descend pas avec A : B = le palier de volume associé au
 *   dernier palier A validé (aucun validé : 42 ; 35 validé : 42 ; 28 : 35 ;
 *   21 : 28 ; 14 : 21 ; 7 : phase essai libre, 14) ;
 * - la référence V6 est recalée sur le premier vrai résultat (S1 = 35
 *   validé), figée ; le statut compare le palier A du début de la semaine
 *   au palier de référence de la semaine, par crans, sans semaines.
 */

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
const five = (kg: number) => [set(kg, 5, 8), set(kg, 5, 8), set(kg, 5, 8)];
const DATES = ["2026-10-04", "2026-11-08", "2026-12-13", "2027-01-24", "2027-03-07"];
/** Les paliers validés dans l'ordre : 35, 28, 21, 14, 7. */
const validated = (count: number) => [35, 28, 21, 14, 7].slice(0, count).map((kg, index) => muscuA(DATES[index]!, five(kg)));

describe("Muscu B : le palier de volume du dernier palier A validé", () => {
  it("1. 35 non validé : A 35, B 42", () => {
    expect(v6State([], "2026-10-04")).toMatchObject({ aKg: 35, bKg: 42 });
    expect(v6State([muscuA("2026-10-04", [set(35, 4), set(35, 4), set(35, 3)])], "2026-10-05")).toMatchObject({ aKg: 35, bKg: 42 });
  });

  it("2. 35 validé : A 28, B reste 42", () => {
    expect(v6State(validated(1), "2026-10-05")).toMatchObject({ aKg: 28, bKg: 42 });
  });

  it("3. 28 non validé : A 28, B reste 42", () => {
    expect(v6State([...validated(1), muscuA("2026-10-11", [set(28, 4), set(28, 3), set(28, 3)])], "2026-10-12")).toMatchObject({ aKg: 28, bKg: 42 });
  });

  it("4. 28 validé : A 21, B 35", () => {
    expect(v6State(validated(2), "2026-11-09")).toMatchObject({ aKg: 21, bKg: 35 });
  });

  it("5. 21 validé : A 14, B 28", () => {
    expect(v6State(validated(3), "2026-12-14")).toMatchObject({ aKg: 14, bKg: 28 });
  });

  it("6. 14 validé : A 7, B 21", () => {
    expect(v6State(validated(4), "2027-01-25")).toMatchObject({ aKg: 7, bKg: 21 });
  });

  it("7. 7 validé : phase essai libre, B 14", () => {
    expect(v6State(validated(5), "2027-03-08")).toMatchObject({ phase: "essai_libre", bKg: 14 });
  });

  it("8. test officiel réussi plus bas : ni A ni B ne bougent", () => {
    const V3 = { kind: "trials_descending" as const, measures: TRACTION_TEST_V3_MEASURES, settings: TRACTION_TEST_V3_SETTINGS };
    const trial = (order: number, value: number, outcome: TestTrial["outcome"]): TestTrial => ({ order, value, outcome, completedAt: "x" });
    const measures = computeTestResult(V3, { trials: [trial(1, 28, "success"), trial(2, 21, "success"), trial(3, 14, "failure")] }).measures;
    const results = [{ id: "r", protocolId: "protocol-traction", date: "2026-10-25", workoutId: "t", measures }];
    expect(v6State(validated(1), "2026-10-26", results)).toMatchObject({ aKg: 28, bKg: 42 });
  });

  it("9. repli : ne valide pas A, ne fait pas descendre B", () => {
    const state = v6State([...validated(1), muscuA("2026-10-11", [set(28, 2, 10), set(35, 5), set(35, 5)])], "2026-10-12");
    expect(state).toMatchObject({ aKg: 28, bKg: 42 });
    expect(state.events.at(-1)?.kind).toBe("repli");
  });

  it("12. semaine test : même assistance B, seulement 2 × 8 ; hors test 3 × 8-10, RPE 6-8", () => {
    const state = v6State(validated(1), "2026-10-26");
    expect(v6LightSession(state, "2026-10-27")).toMatchObject({ assistKg: 42, label: "42 kg — 2 × 8, RPE 6-8 (semaine test)" });
    expect(v6LightSession(state, "2026-10-27").sets).toHaveLength(2);
    expect(v6LightSession(state, "2026-10-06")).toMatchObject({ assistKg: 42, label: "42 kg — 3 × 8-10, RPE 6-8, jamais à l'échec" });
    expect(v6LightSession(v6State(validated(2), "2026-11-23"), "2026-11-24")).toMatchObject({ assistKg: 35, label: "35 kg — 2 × 8, RPE 6-8 (semaine test)" });
  });

  it("le dimanche suivant la validation de 35 : A 28, jusqu'à 5/5/5, 3 min ; le repli à 35", () => {
    const force = v6ForceSession(v6State(validated(1), "2026-10-10"));
    expect(force.sets).toEqual([set(28, 5), set(28, 5), set(28, 5)]);
    expect(force.restSec).toBe(180);
    expect(force.lines.join(" ")).toContain("séries 2 et 3 à 35 kg. Le palier reste 28 kg");
  });
});

describe("10. référence V6 recalée sur le 04/10, figée", () => {
  const week = (number: number) => V6_REFERENCE.find((item) => item.number === number)!;

  it("S1 35 validé, S2 28 ≥3/3/3, S6 28 objectif 5/5/5, S7 21 ≥3/3/3, S18 7, S23 7 objectif, S24 test, S25-S26 essais libres", () => {
    expect(V6_REFERENCE).toHaveLength(26);
    expect(week(1)).toMatchObject({ date: "2026-10-04", weightKg: 92, kind: "force", refKg: 35, a: "35 validé 5/5/5+", b: "42 — 3×8–10", refReps: [5, 5, 5] });
    expect(week(2)).toMatchObject({ date: "2026-10-11", weightKg: 91, refKg: 28, a: "28 ≥3/3/3", b: "42 — 3×8–10", refReps: [3, 3, 3] });
    expect(week(4)).toMatchObject({ kind: "test", refKg: 28, a: "TEST #1", b: "42 — 2×8" });
    expect(week(6)).toMatchObject({ refKg: 28, a: "28 objectif 5/5/5", refReps: [5, 5, 5] });
    expect(week(7)).toMatchObject({ date: "2026-11-15", refKg: 21, a: "21 ≥3/3/3", b: "35 — 3×8–10" });
    expect(week(13)).toMatchObject({ refKg: 14, a: "14 ≥3/3/3", b: "28 — 3×8–10" });
    expect(week(18)).toMatchObject({ date: "2027-01-31", weightKg: 75, refKg: 7, a: "7 ≥2–3/2–3/2", b: "21 — 3×8–10" });
    expect(week(23)).toMatchObject({ refKg: 7, a: "7 objectif 5/5/5", refReps: [5, 5, 5] });
    expect(week(24)).toMatchObject({ kind: "test", a: "TEST #6, 0 possible", b: "14 — 2×8" });
    expect(week(25)).toMatchObject({ kind: "essai", a: "essai libre 0 kg", b: "14 léger" });
    expect(week(26)).toMatchObject({ kind: "essai", date: "2027-03-28", a: "essai libre 0 kg", b: "très léger" });
    expect(V6_REFERENCE.filter((item) => item.kind === "test").map((item) => item.number)).toEqual([4, 8, 12, 16, 20, 24]);
    expect(V6_REFERENCE.map((item) => item.weightKg)).toEqual([92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 75, 75, 75, 75, 75, 75, 75, 75]);
    expect(v6WeekOf("2026-10-06").number).toBe(1);
    /* Corrigé le 05/10 : S12 = TEST #3, palier 14, B 28 en 2 × 8. */
    expect(week(12)).toMatchObject({ date: "2026-12-20", weightKg: 81, kind: "test", refKg: 14, a: "TEST #3", b: "28 — 2×8" });
  });

  it("colonne B cohérente avec la règle : chaque validation prévue (« validé » / « objectif 5/5/5 ») fait passer B au palier validé + 7 dès sa semaine ; un test ne change que le volume", () => {
    let expected = V6_START_B_KG;
    for (const item of V6_REFERENCE) {
      const kg = Number.parseInt(item.a, 10);
      if (/validé|objectif 5\/5\/5/.test(item.a) && !Number.isNaN(kg)) expected = v6VolumeKgAfter(kg);
      const b = Number.parseInt(item.b, 10);
      if (!Number.isNaN(b)) expect(b, `S${item.number}`).toBe(expected);
      if (item.kind === "test") expect(item.b, `S${item.number}`).toMatch(/— 2×8$/);
    }
    expect(V6_REFERENCE.filter((item) => /objectif 5\/5\/5|validé/.test(item.a)).map((item) => [item.number, item.b])).toEqual([
      [1, "42 — 3×8–10"], [6, "35 — 3×8–10"], [11, "28 — 3×8–10"], [17, "21 — 3×8–10"], [23, "14 — 3×8–10"],
    ]);
  });
});

describe("11. statut S1 avec 35 validé : conforme, jamais « semaines d'avance »", () => {
  it("le 04/10 après la séance et pendant la semaine : Conforme ; S2 encore à 28 : Conforme ; S7 encore à 28 : 1 cran derrière", () => {
    for (const today of ["2026-10-04", "2026-10-06", "2026-10-10"]) {
      const progress = v6Progress(validated(1), [], today);
      expect(progress, today).toMatchObject({ color: "vert", statusLabel: "Conforme à la référence", state: { aKg: 28, bKg: 42 } });
    }
    expect(v6Progress([...validated(1), muscuA("2026-10-11", [set(28, 4), set(28, 3), set(28, 3)])], [], "2026-10-12")).toMatchObject({ color: "vert", statusLabel: "Conforme à la référence" });
    expect(v6Progress(validated(1), [], "2026-11-16")).toMatchObject({ color: "orange", statusLabel: "1 cran plus assisté que la référence (21 kg)" });
    expect(JSON.stringify(v6Progress(validated(1), [], "2026-10-06"))).not.toMatch(/semaines? d'avance|semaines? de retard|En avance de|En retard de/);
  });
});

/* La sauvegarde réelle de l'utilisateur du 04/10/2026 (la plus récente : 18:06). */
const REAL = "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-04-1806.json";
const path = existsSync(REAL) ? REAL : undefined;

describe("13. sauvegarde réelle du 04/10", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!path)("seeds sans erreur, séances terminées inchangées, prochain A 28 kg, prochain B 42 kg 3 × 8-10 ; consigne de Muscu B à jour", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await resetAndRestore(parseBackup(await readFile(path!, "utf8")), db);
    resumeSeedsForTests();
    const before = await db.workouts.where("status").equals("completed").toArray();

    expect(await runSeeds()).toMatchObject({ failed: [], skipped: [] });

    const after = await db.workouts.where("status").equals("completed").toArray();
    /* Seule la séance du 04/10 bouge, et seulement par les corrections déjà en production (seeds 31 et 33) ;
       cette correction V6 ne touche à aucune séance terminée. */
    expect(after).toEqual(before.map((workout) => (workout.id === FIX_WORKOUT_ID ? fixesOf20261004(workout, after.find((item) => item.id === workout.id)!.updatedAt) : workout)));
    const state = v6State(after, "2026-10-05");
    expect(state).toMatchObject({ aKg: 28, bKg: 42, phase: "travail" });
    expect(v6LightSession(state, "2026-10-06")).toMatchObject({ assistKg: 42, label: "42 kg — 3 × 8-10, RPE 6-8, jamais à l'échec" });
    expect(v6LightSession(state, "2026-10-06").sets).toHaveLength(3);
    expect(v6ForceSession(v6State(after, "2026-10-10")).sets).toEqual([set(28, 5), set(28, 5), set(28, 5)]);
    const b = (await db.sessionTemplates.get("v2-muscu-b")) as SessionTemplate;
    expect(b.blocks.find((block) => block.id === "v2-muscu-b-traction")).toMatchObject({ notes: TRACTION_LIGHT_NOTE });
    expect(TRACTION_LIGHT_NOTE).not.toContain("A + 7");
  }, 20000);
});
