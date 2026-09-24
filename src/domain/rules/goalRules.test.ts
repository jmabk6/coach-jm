import { describe, expect, it } from "vitest";
import type { Goal, GoalSegment, TestResult } from "../models";
import { GOALS_V1 } from "../../features/goals/goalsV1";
import {
  evaluateSegment,
  goalCurve,
  reachedLabel,
  testPointsFor,
  trajectoryAt,
  weightPointsFor,
  type GoalPoint,
} from "./goalRules";

/**
 * Lot H.2 — calculs des objectifs (conception V2 § 5.1, § 5.1 bis, § 5.2).
 * Traction S1 : assistance minimale, baisse = mieux, 0 kg au 31/03/2027.
 */

const goal = (key: Goal["key"]) => structuredClone(GOALS_V1.find((item) => item.key === key)!) as Goal;
const traction = goal("traction");
const s1 = traction.segments[0]!;
const s2 = traction.segments[1]!;
const point = (date: string, value: number, versionId = "v1"): GoalPoint => ({ date, value, versionId });

describe("trajectoire", () => {
  it("de S à C entre le départ et l'échéance, puis C au-delà", () => {
    const start = point("2026-09-27", 40);
    expect(trajectoryAt(start, 0, "2027-03-31", "2026-09-27")).toBe(40);
    expect(trajectoryAt(start, 0, "2027-03-31", "2026-12-29")).toBeCloseTo(40 - (40 * 93) / 185, 6);
    expect(trajectoryAt(start, 0, "2027-03-31", "2027-03-31")).toBe(0);
    expect(trajectoryAt(start, 0, "2027-03-31", "2027-06-01")).toBe(0);
  });
});

describe("évaluation d'un segment (§ 5.1)", () => {
  it("premier résultat : dans les temps, 0 %, écart nul", () => {
    expect(evaluateSegment(traction, s1, [point("2026-09-27", 40)])).toMatchObject({
      kind: "tracking", status: "on_track", percent: 0, bar: 0, expected: 40,
    });
  });

  it("en avance ou en retard, avec l'écart en semaines arrondi à 0,5", () => {
    /* Au 25/10 (28 j sur 185), la trajectoire vaut ≈ 33,9 kg ; tolérance 2 kg. */
    const ahead = evaluateSegment(traction, s1, [point("2026-09-27", 40), point("2026-10-25", 30)]);
    expect(ahead).toMatchObject({ kind: "tracking", status: "ahead", percent: 25 });
    /* t* = 25 % × 185 j = 46,25 j ; tₐ = 28 j → (28 − 46,25) / 7 = −2,6 → −2,5 semaines (en avance). */
    expect(ahead.kind === "tracking" && ahead.weeks).toBe(-2.5);

    const behind = evaluateSegment(traction, s1, [point("2026-09-27", 40), point("2026-12-20", 38)]);
    expect(behind).toMatchObject({ kind: "tracking", status: "behind", percent: 5 });
    /* t* = 5 % × 185 = 9,25 j ; tₐ = 84 j → 10,7 → 10,5 semaines de retard. */
    expect(behind.kind === "tracking" && behind.weeks).toBe(10.5);

    const onTrack = evaluateSegment(traction, s1, [point("2026-09-27", 40), point("2026-10-25", 34)]);
    expect(onTrack).toMatchObject({ kind: "tracking", status: "on_track" });
    expect(onTrack.kind === "tracking" && onTrack.weeks).toBeUndefined();
  });

  it("recul : pourcentage négatif, barre à 0", () => {
    expect(evaluateSegment(traction, s1, [point("2026-09-27", 40), point("2026-10-25", 44)])).toMatchObject({
      kind: "tracking", status: "behind", percent: -10, bar: 0,
    });
  });

  it("après l'échéance : la trajectoire vaut la cible", () => {
    expect(evaluateSegment(traction, s1, [point("2026-09-27", 40), point("2027-05-01", 10)])).toMatchObject({
      kind: "tracking", status: "behind", expected: 0, percent: 75, bar: 75,
    });
  });

  it("à 0 kg : « Palier atteint », jamais « objectif atteint » ; S2 atteint : « Objectif atteint »", () => {
    const reached = evaluateSegment(traction, s1, [point("2026-09-27", 40), point("2027-02-28", 0)]);
    expect(reached).toMatchObject({ kind: "reached", role: "intermediate" });
    expect(reachedLabel(traction, "intermediate")).toBe("Palier atteint — prochaine étape : traction stricte");
    expect(reachedLabel(traction, "intermediate")).not.toMatch(/objectif atteint/i);
    expect(reachedLabel(goal("core"), "intermediate")).toBe("Palier atteint");

    expect(evaluateSegment(traction, s2, [point("2027-04-01", 1)])).toMatchObject({ kind: "reached", role: "final" });
    expect(reachedLabel(traction, "final")).toBe("Objectif atteint");
  });

  it("amplitude nulle : la cible est tenue dès le départ", () => {
    const flat: GoalSegment = { ...s1, target: 40 };
    expect(evaluateSegment(traction, flat, [point("2026-09-27", 40)])).toMatchObject({ kind: "reached" });
  });

  it("sans mesure, sans résultat, sans cible ou sans échéance", () => {
    const legs = goal("legs");
    expect(evaluateSegment(legs, legs.segments[0]!, [point("2026-10-01", 1)])).toEqual({ kind: "no_measure" });
    expect(evaluateSegment(traction, s1, [])).toEqual({ kind: "no_result" });
    const core = goal("core");
    expect(evaluateSegment(core, core.segments[0]!, [point("2026-09-28", 60), point("2026-10-26", 75)])).toMatchObject({
      kind: "untracked", start: { value: 60 }, latest: { value: 75 },
    });
  });

  it("deux versions du protocole ne se comparent pas : le départ est le premier point de la version du dernier", () => {
    const evaluation = evaluateSegment(traction, s1, [point("2026-09-27", 40, "v1"), point("2026-10-25", 45, "v2"), point("2026-11-22", 42, "v2")]);
    expect(evaluation).toMatchObject({ kind: "tracking", start: { value: 45, versionId: "v2" } });
  });
});

describe("points d'un segment : seulement des résultats de test complets", () => {
  const result = (id: string, date: string, value: number, extra: Partial<TestResult> = {}): TestResult => ({
    id, protocolId: "protocol-traction", versionId: "protocol-traction-v1", date, origin: "workout", status: "complete",
    measures: [{ key: "assistance_min_kg", value, unit: "kg" }], createdAt: "x", updatedAt: "x", ...extra,
  });

  it("incomplet ou d'un autre protocole : exclu ; tri par date", () => {
    const points = testPointsFor(s1, [
      result("b", "2026-10-25", 37),
      result("a", "2026-09-27", 40),
      result("c", "2026-10-26", 35, { status: "incomplete" }),
      result("d", "2026-10-27", 20, { protocolId: "protocol-cardio" }),
    ]);
    expect(points.map((item) => [item.date, item.value])).toEqual([["2026-09-27", 40], ["2026-10-25", 37]]);
  });

  it("mesure par côté : le côté le moins bon, selon le sens", () => {
    const apley: GoalSegment = { id: "s", role: "final", measure: { source: "test", protocolId: "protocol-souplesse", measureKey: "apley_cm" }, direction: "decrease", label: "Apley" };
    const [only] = testPointsFor(apley, [{
      ...result("a", "2026-09-28", 0), protocolId: "protocol-souplesse",
      measures: [{ key: "apley_cm", value: 6, unit: "cm", side: "left" }, { key: "apley_cm", value: 11, unit: "cm", side: "right" }],
    }]);
    expect(only?.value).toBe(11);
  });

  it("invariant : une courbe ne se construit qu'à partir de résultats de test (aucune séance en entrée)", () => {
    /* Les signatures ne reçoivent ni séance ni jalon : sans résultat de test, aucun point, quoi que contienne l'entraînement. */
    expect(testPointsFor(s1, [])).toEqual([]);
    const curve = goalCurve(traction, new Map([[s1.id, []], [s2.id, []]]));
    expect(curve).toEqual({ series: [] });
  });
});

describe("Poids : moyennes hebdomadaires (§ 5.4)", () => {
  const weigh = (date: string, kg: number) => ({ date, kg });

  it("semaines complètes d'au moins 3 pesées, datées du samedi ; semaine en cours en point creux", () => {
    const entries = [
      weigh("2026-09-27", 82), weigh("2026-09-29", 81.6), weigh("2026-10-01", 81.2),
      weigh("2026-10-04", 81), weigh("2026-10-06", 80.8),
      weigh("2026-10-11", 80.5), weigh("2026-10-12", 80.4), weigh("2026-10-14", 80.3),
      weigh("2026-10-18", 80),
    ];
    const points = weightPointsFor(entries, "2026-10-19");
    expect(points.weeks.map((item) => [item.date, Math.round(item.value * 100) / 100])).toEqual([
      ["2026-10-03", 81.6],
      ["2026-10-17", 80.4],
    ]);
    expect(points.provisional).toEqual({ date: "2026-10-24", value: 80 });

    const weight = goal("weight");
    const evaluation = evaluateSegment(weight, weight.segments[0]!, points.weeks);
    expect(evaluation.kind).toBe("tracking");
    expect(evaluation.kind === "tracking" && evaluation.start.value).toBeCloseTo(81.6, 6);
  });
});

describe("courbe (§ 5.2)", () => {
  it("un tracé par segment et par version, jamais reliés ; trajectoire du segment courant", () => {
    const curve = goalCurve(
      traction,
      new Map([
        [s1.id, [point("2026-09-27", 40, "v1"), point("2026-10-25", 36, "v1"), point("2026-11-22", 38, "v2")]],
        [s2.id, []],
      ]),
    );
    expect(curve.series.map((series) => [series.segmentId, series.versionId, series.points.length])).toEqual([
      [s1.id, "v1", 2],
      [s1.id, "v2", 1],
    ]);
    expect(curve.trajectory).toEqual([point("2026-11-22", 38, "v2"), { date: "2027-03-31", value: 0 }]);
  });

  it("palier atteint : courbe arrêtée, pas de trajectoire", () => {
    const curve = goalCurve(traction, new Map([[s1.id, [point("2026-09-27", 40), point("2027-02-28", 0)]]]));
    expect(curve.trajectory).toBeUndefined();
  });
});
