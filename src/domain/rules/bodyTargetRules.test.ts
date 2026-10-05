import { describe, expect, it } from "vitest";
import type { BodyCompositionTargets, BodyMeasurement } from "../models";
import {
  bodyTargetsFormOf,
  compositionComparison,
  formatBodyEvolution,
  formatTargetRange,
  parseBodyTargetsForm,
  type BodyTargetsFormValues,
} from "./bodyTargetRules";

/**
 * Corps, phase 2.1 : cible personnelle indicative de composition et
 * comparaison avec les mesures de l'appareil de référence. Jamais de
 * mélange entre appareils, jamais d'évolution inventée, le % de graisse
 * évolue en points.
 */

process.env.TZ = "Europe/Paris";

const T = "2026-10-05T06:00:00.000Z";
const TARGETS: BodyCompositionTargets = {
  weightKg: { min: 78, max: 80 },
  fatPct: { min: 12, max: 15 },
  fatKg: { min: 9, max: 12 },
  skeletalMuscleKg: { min: 39 },
  updatedAt: T,
};

function m(id: string, takenAt: string, values: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return {
    id, date: takenAt.slice(0, 10), takenAt, device: "renpho", source: "manual", weightReference: true,
    weightKg: 91.15, fatPct: 27.5, skeletalMuscleKg: 37.83, createdAt: T, updatedAt: T, ...values,
  };
}

const FIRST = m("r1", "2026-10-05T05:00:00.000Z");

describe("comparaison avec la cible", () => {
  it("une seule mesure : les quatre valeurs actuelles (masse grasse calculée), les quatre cibles, aucune évolution", () => {
    const comparison = compositionComparison([FIRST], "renpho", TARGETS)!;
    expect(comparison.device).toBe("renpho");
    expect(comparison.since).toBe("2026-10-05");
    expect(comparison.rows.map((row) => [row.key, row.current, row.target, row.inTarget, row.evolution])).toEqual([
      ["weightKg", 91.15, { min: 78, max: 80 }, false, undefined],
      ["fatPct", 27.5, { min: 12, max: 15 }, false, undefined],
      ["fatKg", 25.07, { min: 9, max: 12 }, false, undefined],
      ["skeletalMuscleKg", 37.83, { min: 39 }, false, undefined],
    ]);
  });

  it("évolution de la première à la dernière mesure du même appareil ; % de graisse en points", () => {
    const later = m("r2", "2026-11-05T05:00:00.000Z", { weightKg: 86.95, fatPct: 24.4, skeletalMuscleKg: 38.13 });
    const middle = m("r3", "2026-10-20T05:00:00.000Z", { weightKg: 89 });
    const rows = compositionComparison([later, FIRST, middle], "renpho", TARGETS)!.rows;
    expect(rows.map((row) => [row.key, row.current, row.evolution])).toEqual([
      ["weightKg", 86.95, -4.2],
      ["fatPct", 24.4, -3.1],
      ["fatKg", 21.22, -3.85],
      ["skeletalMuscleKg", 38.13, 0.3],
    ]);
    expect(formatBodyEvolution(-4.2, "weightKg")).toBe("−4,2 kg");
    expect(formatBodyEvolution(-3.1, "fatPct")).toBe("−3,1 points");
    expect(formatBodyEvolution(0.3, "skeletalMuscleKg")).toBe("+0,3 kg");
    expect(formatBodyEvolution(0, "fatPct")).toBe("0 point");
    expect(formatBodyEvolution(undefined, "weightKg")).toBe("—");
  });

  it("cible atteinte : dans la plage (bornes comprises) ; muscle « au moins »", () => {
    const fit = m("r2", "2026-12-05T05:00:00.000Z", { weightKg: 80, fatPct: 12, skeletalMuscleKg: 39.2 });
    const rows = compositionComparison([FIRST, fit], "renpho", TARGETS)!.rows;
    expect(rows.map((row) => [row.key, row.inTarget])).toEqual([
      ["weightKg", true],
      ["fatPct", true],
      ["fatKg", true],
      ["skeletalMuscleKg", true],
    ]);
  });

  it("jamais de mélange : Withings et copies de pesées ignorées ; une autre balance de référence a sa propre série", () => {
    const withings = m("w1", "2026-09-01T05:00:00.000Z", { device: "withings", weightReference: false, weightKg: 95, fatPct: 30 });
    const copy = m("c1", "2026-10-05T04:00:00.000Z", {
      device: "unknown", source: "weight_entry", weightReference: false, weightKg: 91.6,
      originWeightEntry: { id: "w", date: "2026-10-05", kg: 91.6, createdAt: T, updatedAt: T },
    });
    const comparison = compositionComparison([withings, copy, FIRST], "renpho", TARGETS)!;
    expect(comparison.since).toBe("2026-10-05");
    expect([comparison.rows[0]!.current, comparison.rows[0]!.evolution]).toEqual([91.15, undefined]);

    const tanita = m("t1", "2027-01-05T05:00:00.000Z", { device: "Tanita BC-545", weightKg: 84 });
    const future = compositionComparison([withings, FIRST, tanita], "Tanita BC-545", TARGETS)!;
    expect(future.device).toBe("Tanita BC-545");
    expect(future.since).toBe("2027-01-05");
    expect([future.rows[0]!.current, future.rows[0]!.evolution]).toEqual([84, undefined]);

    expect(compositionComparison([withings], "renpho", TARGETS)).toBeUndefined();
  });

  it("une valeur absente de la dernière mesure : pas d'actuel inventé ; l'évolution prend les mesures qui l'ont", () => {
    const later = m("r2", "2026-11-05T05:00:00.000Z", { weightKg: 88 });
    delete later.skeletalMuscleKg;
    const rows = compositionComparison([FIRST, later], "renpho", TARGETS)!.rows;
    expect([rows[3]!.key, rows[3]!.current, rows[3]!.evolution, rows[3]!.inTarget]).toEqual(["skeletalMuscleKg", undefined, undefined, false]);
    expect(rows[0]).toMatchObject({ current: 88, evolution: -3.15 });
  });

  it("libellés des cibles : plage, « au moins », « au plus »", () => {
    expect(formatTargetRange({ min: 78, max: 80 }, "kg")).toBe("78–80 kg");
    expect(formatTargetRange({ min: 12, max: 15 }, "%")).toBe("12–15 %");
    expect(formatTargetRange({ min: 39 }, "kg")).toBe("≥ 39 kg");
    expect(formatTargetRange({ max: 12 }, "kg")).toBe("≤ 12 kg");
    expect(formatTargetRange({ min: 78.5, max: 80 }, "kg")).toBe("78,5–80 kg");
    expect(formatTargetRange(undefined, "kg")).toBe("—");
  });
});

describe("modifier la cible", () => {
  const valid = (): BodyTargetsFormValues => bodyTargetsFormOf(TARGETS);

  it("formulaire prérempli ; lecture à la virgule ; muscle : maximum facultatif", () => {
    expect(valid()).toEqual({
      weightKgMin: "78", weightKgMax: "80", fatPctMin: "12", fatPctMax: "15", fatKgMin: "9", fatKgMax: "12", skeletalMuscleKgMin: "39", skeletalMuscleKgMax: "",
    });
    expect(parseBodyTargetsForm({ ...valid(), weightKgMin: "78,5" }, "2026-10-06T08:00:00.000Z")).toEqual({
      ok: true,
      targets: { ...TARGETS, weightKg: { min: 78.5, max: 80 }, updatedAt: "2026-10-06T08:00:00.000Z" },
    });
    expect(parseBodyTargetsForm({ ...valid(), skeletalMuscleKgMax: "42" }, T)).toMatchObject({ ok: true, targets: { skeletalMuscleKg: { min: 39, max: 42 } } });
  });

  it("refus : minimum au-dessus du maximum, valeur négative, hors bornes, illisible, borne obligatoire vide", () => {
    expect(parseBodyTargetsForm({ ...valid(), weightKgMin: "82" }, T)).toEqual({ ok: false, message: "Poids : le minimum dépasse le maximum." });
    expect(parseBodyTargetsForm({ ...valid(), fatPctMin: "16" }, T)).toEqual({ ok: false, message: "% graisse : le minimum dépasse le maximum." });
    expect(parseBodyTargetsForm({ ...valid(), fatKgMin: "-2" }, T)).toEqual({ ok: false, message: "Masse grasse : entre 1 et 150 kg." });
    expect(parseBodyTargetsForm({ ...valid(), fatPctMax: "90" }, T)).toEqual({ ok: false, message: "% graisse : entre 3 et 75 %." });
    expect(parseBodyTargetsForm({ ...valid(), weightKgMax: "beaucoup" }, T)).toEqual({ ok: false, message: "Poids : nombre illisible." });
    expect(parseBodyTargetsForm({ ...valid(), weightKgMax: "" }, T)).toEqual({ ok: false, message: "Poids : maximum obligatoire." });
    expect(parseBodyTargetsForm({ ...valid(), skeletalMuscleKgMin: "" }, T)).toEqual({ ok: false, message: "Muscle squelettique : minimum obligatoire." });
    expect(parseBodyTargetsForm({ ...valid(), skeletalMuscleKgMax: "30" }, T)).toEqual({ ok: false, message: "Muscle squelettique : le minimum dépasse le maximum." });
  });
});
