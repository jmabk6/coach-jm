import { describe, expect, it } from "vitest";
import type { BodyMeasurement, WeightEntry } from "../models";
import { formatWeightHistoryRow, weightHistoryRows } from "./weightHistoryRules";

/**
 * Objectif Poids — l'historique jour par jour (06/10/2026) : une ligne par
 * pesée, « 6/10 · 90,3 · 27,3 % · 24,7 kg · 37,6 kg ». Le poids est celui
 * de la pesée du jour ; la composition vient de la mesure de la balance de
 * référence ce jour-là, jamais d'un autre appareil.
 */

const entry = (date: string, kg: number, bodyMeasurementId?: string): WeightEntry =>
  ({ id: `weight-${date}`, date, kg, ...(bodyMeasurementId ? { bodyMeasurementId } : {}), createdAt: "x", updatedAt: "x" }) as WeightEntry;

const measure = (id: string, date: string, extra: Partial<BodyMeasurement>): BodyMeasurement =>
  ({ id, date, takenAt: `${date}T05:00:00.000Z`, device: "renpho", source: "manual", weightReference: true, weightKg: 90, createdAt: "x", updatedAt: "x", ...extra }) as BodyMeasurement;

describe("weightHistoryRows", () => {
  it("une ligne par pesée, la plus récente en haut ; composition de la mesure liée, masse grasse calculée (poids × %)", () => {
    const rows = weightHistoryRows(
      [entry("2026-10-07", 89.6, "m7"), entry("2026-10-05", 91.15, "m5"), entry("2026-10-06", 90.3, "m6")],
      [
        measure("m5", "2026-10-05", { weightKg: 91.15, fatPct: 27.5, skeletalMuscleKg: 37.83 }),
        measure("m6", "2026-10-06", { weightKg: 90.3, fatPct: 27.3, skeletalMuscleKg: 37.6 }),
        measure("m7", "2026-10-07", { weightKg: 89.6, fatPct: 27.1, fatKg: 24.2, skeletalMuscleKg: 37.7 }),
      ],
      "renpho",
    );
    expect(rows.map((row) => row.date)).toEqual(["2026-10-07", "2026-10-06", "2026-10-05"]);
    expect(rows[1]).toEqual({ date: "2026-10-06", weightKg: 90.3, fatPct: 27.3, fatKg: 24.65, skeletalMuscleKg: 37.6 });
    /* Masse grasse donnée par la balance : gardée telle quelle. */
    expect(rows[0]!.fatKg).toBe(24.2);
  });

  it("pesée sans composition (saisie à la main, ou autre appareil ce jour-là) : poids seul", () => {
    const rows = weightHistoryRows(
      [entry("2026-10-08", 89.4), entry("2026-10-09", 89.2)],
      [measure("w9", "2026-10-09", { device: "withings", weightReference: false, fatPct: 30, skeletalMuscleKg: 35 })],
      "renpho",
    );
    expect(rows).toEqual([
      { date: "2026-10-09", weightKg: 89.2 },
      { date: "2026-10-08", weightKg: 89.4 },
    ]);
  });

  it("sans lien explicite : la première mesure de l'appareil de référence du jour ; jamais une copie de pesée", () => {
    const rows = weightHistoryRows(
      [entry("2026-10-10", 89)],
      [
        measure("copy", "2026-10-10", { originWeightEntry: { id: "x" } as never, fatPct: 40 }),
        measure("late", "2026-10-10", { takenAt: "2026-10-10T18:00:00.000Z", fatPct: 28 }),
        measure("early", "2026-10-10", { takenAt: "2026-10-10T05:00:00.000Z", fatPct: 27, skeletalMuscleKg: 38 }),
      ],
      "renpho",
    );
    expect(rows).toEqual([{ date: "2026-10-10", weightKg: 89, fatPct: 27, fatKg: 24.3, skeletalMuscleKg: 38 }]);
  });

  it("aucune pesée : aucune ligne", () => {
    expect(weightHistoryRows([], [measure("m", "2026-10-05", { fatPct: 27 })], "renpho")).toEqual([]);
  });
});

describe("formatWeightHistoryRow", () => {
  it("« 6/10 · 90,3 · 27,3 % · 24,7 kg · 37,6 kg » ; « — » quand la balance n'a rien donné", () => {
    expect(formatWeightHistoryRow({ date: "2026-10-06", weightKg: 90.3, fatPct: 27.3, fatKg: 24.65, skeletalMuscleKg: 37.6 })).toEqual({
      date: "6/10",
      weight: "90,3",
      fatPct: "27,3 %",
      fatKg: "24,7 kg",
      muscle: "37,6 kg",
    });
    expect(formatWeightHistoryRow({ date: "2026-11-01", weightKg: 88 })).toEqual({ date: "1/11", weight: "88,0", fatPct: "—", fatKg: "—", muscle: "—" });
  });
});
