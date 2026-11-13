import { describe, expect, it } from "vitest";
import { computeTestResult, draftFromResult } from "../../domain/rules/testResultRules";
import { TEST_JAMBES_V2 } from "./testJambesV2";
import { beatsBetween, formatClock, stageClock, testStagesOf } from "./testStages";

/** Test jambes V2, lot 2 (13/11/2026) : épreuves, horloges, métronome ; plafonds qui gardent la saisie. */

describe("épreuves outillées du test jambes V2", () => {
  it("cinq épreuves dans l'ordre du protocole, cadences et durées de la version", () => {
    const stages = testStagesOf(TEST_JAMBES_V2.settings);
    expect(stages.map((stage) => [stage.id, stage.kind, stage.bpm, stage.accentEvery, stage.durationSec])).toEqual([
      ["montees", "metronome_countdown", 80, 4, 120],
      ["recup-1", "countdown", undefined, undefined, 180],
      ["squats", "metronome", 60, 3, undefined],
      ["recup-2", "countdown", undefined, undefined, 180],
      ["chaise", "stopwatch", undefined, undefined, 120],
    ]);
  });

  it("aucune épreuve outillée pour un protocole sans métronome (les autres tests ne changent pas)", () => {
    expect(testStagesOf(undefined)).toEqual([]);
    expect(testStagesOf({ sprintCount: 6, sprintSec: 12, recoverySec: 48 })).toEqual([]);
  });

  it("horloges : compte à rebours 2:00 → 0:00 puis fini ; chaise de 0:00 à 2:00, finie au plafond ; métronome seul qui compte", () => {
    const countdown = { kind: "countdown" as const, durationSec: 120 };
    expect(stageClock(countdown, 0)).toEqual({ display: "2:00", done: false });
    expect(stageClock(countdown, 59_400)).toEqual({ display: "1:01", done: false });
    expect(stageClock(countdown, 120_000)).toEqual({ display: "0:00", done: true });
    const chair = { kind: "stopwatch" as const, durationSec: 120 };
    expect(stageClock(chair, 75_900)).toEqual({ display: "1:15", done: false });
    expect(stageClock(chair, 130_000)).toEqual({ display: "2:00", done: true });
    expect(stageClock({ kind: "metronome" as const }, 61_000)).toEqual({ display: "1:01", done: false });
    /* Après une mise en veille, l'horloge se recalcule sur l'heure réelle. */
    expect(stageClock(countdown, 600_000).done).toBe(true);
    expect(formatClock(7)).toBe("0:07");
  });

  it("métronome : 80/min = une frappe toutes les 0,75 s, appuyée toutes les 4 (une montée) ; 60/min appuyée toutes les 3 (une répétition) ; pas de doublon entre deux fenêtres", () => {
    const steps = beatsBetween(10, 80, 4, 10, 13.1);
    expect(steps.map((beat) => beat.at - 10)).toEqual([0, 0.75, 1.5, 2.25, 3]);
    expect(steps.map((beat) => beat.accent)).toEqual([true, false, false, false, true]);
    const squats = beatsBetween(0, 60, 3, 0, 6);
    expect(squats.map((beat) => beat.accent)).toEqual([true, false, false, true, false, false]);
    const first = beatsBetween(0, 80, 4, 0, 1);
    const next = beatsBetween(0, 80, 4, 1, 2);
    expect([...first, ...next].map((beat) => beat.at)).toEqual([0, 0.75, 1.5]);
    /* 2 min à 80/min : 160 frappes, 40 montées. */
    const two = beatsBetween(0, 80, 4, 0, 120);
    expect(two).toHaveLength(160);
    expect(two.filter((beat) => beat.accent)).toHaveLength(40);
  });
});

describe("plafonds : la saisie réelle est gardée, la valeur retenue est plafonnée", () => {
  const version = { ...TEST_JAMBES_V2, measures: TEST_JAMBES_V2.measures };
  const values = { step_fc_fin: 130, step_fc_1min: 100, step_brulure: 5, step_cadence_tenue: 1, squat_reps: 45, chaise_duree_s: 130, chaise_distance_cm: 40 };

  it("45 squats et 130 s de chaise : 40 et 120 retenus, 45 et 130 gardés", () => {
    const result = computeTestResult(version, { values });
    expect(result.status).toBe("complete");
    expect(result.measures.find((measure) => measure.key === "squat_reps")).toEqual({ key: "squat_reps", value: 40, unit: "reps", entered: 45 });
    expect(result.measures.find((measure) => measure.key === "chaise_duree_s")).toEqual({ key: "chaise_duree_s", value: 120, unit: "s", entered: 130 });
    expect(result.measures.find((measure) => measure.key === "chaise_distance_cm")).toEqual({ key: "chaise_distance_cm", value: 40, unit: "cm" });
  });

  it("séance rouverte : la saisie revient telle quelle (45, pas 40)", () => {
    const result = computeTestResult(version, { values });
    expect(draftFromResult({ measures: result.measures }).values?.squat_reps).toBe(45);
    expect(draftFromResult({ measures: result.measures }).values?.chaise_duree_s).toBe(130);
  });

  it("sous le plafond : rien ne change", () => {
    const result = computeTestResult(version, { values: { ...values, squat_reps: 22 } });
    expect(result.measures.find((measure) => measure.key === "squat_reps")).toEqual({ key: "squat_reps", value: 22, unit: "reps" });
  });
});
