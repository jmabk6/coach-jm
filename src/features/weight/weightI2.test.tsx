// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { WeightEntry } from "../../domain";
import {
  formatWeekSpan,
  formatWeightKg,
  weekAverage,
  weightWeekSummary,
} from "../../domain/rules/weightRules";
import { WeightCard } from "./WeightCard";
import { recordWeight, todayForWeight } from "./weightActions";

/**
 * Lot I.2 — moyenne de la semaine (D9, conception V2 § 5.4) : dimanche →
 * samedi, valide à partir de 3 pesées ; semaine en cours « provisoire » ;
 * calculs exacts, arrondi d'affichage à 0,1 kg.
 */

process.env.TZ = "Europe/Paris";

const w = (date: string, kg: number): Pick<WeightEntry, "date" | "kg"> => ({ date, kg });

describe("moyenne d'une semaine", () => {
  it("2 pesées : non valide ; 3 : valide ; moyenne exacte, arrondie seulement à l'affichage", () => {
    const two = weekAverage([w("2026-09-20", 81.1), w("2026-09-22", 81.2)], "2026-09-20");
    expect(two).toMatchObject({ weekStart: "2026-09-20", weekEnd: "2026-09-26", count: 2, valid: false });

    const three = weekAverage([w("2026-09-20", 81.1), w("2026-09-22", 81.2), w("2026-09-26", 81.2)], "2026-09-20");
    expect(three).toMatchObject({ count: 3, valid: true });
    expect(three.mean).toBeCloseTo(81.1666667, 6);
    expect(formatWeightKg(three.mean!)).toBe("81,2 kg");
  });

  it("aucune pesée : ni moyenne ni validité", () => {
    expect(weekAverage([], "2026-09-20")).toEqual({ weekStart: "2026-09-20", weekEnd: "2026-09-26", count: 0, valid: false });
  });

  it("bords de semaine : samedi soir dans la semaine qui finit, dimanche matin dans la suivante", () => {
    const saturdayEvening = todayForWeight(new Date("2026-09-26T21:30:00.000Z")); // sam. 23 h 30 à Paris
    const sundayMorning = todayForWeight(new Date("2026-09-26T22:30:00.000Z")); // dim. 00 h 30 à Paris
    expect([saturdayEvening, sundayMorning]).toEqual(["2026-09-26", "2026-09-27"]);

    const entries = [w("2026-09-21", 82), w("2026-09-23", 81.8), w(saturdayEvening, 81.6), w(sundayMorning, 81.4)];
    expect(weekAverage(entries, "2026-09-20")).toMatchObject({ count: 3, valid: true });
    expect(weekAverage(entries, "2026-09-20").mean).toBeCloseTo(81.8, 6);
    expect(weekAverage(entries, "2026-09-27")).toMatchObject({ count: 1, mean: 81.4 });
  });
});

describe("résumé de la carte", () => {
  const entries = [
    w("2026-09-21", 82),
    w("2026-09-23", 81.8),
    w("2026-09-26", 81.6),
    w("2026-09-27", 81.4),
    w("2026-09-29", 81.3),
  ];

  it("dernière semaine complète et semaine en cours provisoire, quel que soit le jour de la semaine", () => {
    for (const today of ["2026-09-27", "2026-09-30", "2026-10-03"]) {
      const summary = weightWeekSummary(entries, today);
      expect(summary.lastComplete, today).toMatchObject({ weekStart: "2026-09-20", count: 3, valid: true });
      expect(summary.current, today).toMatchObject({ weekStart: "2026-09-27" });
    }
    expect(weightWeekSummary(entries, "2026-09-27").current).toMatchObject({ count: 1, mean: 81.4, valid: false });
    expect(weightWeekSummary(entries, "2026-09-30").current.count).toBe(2);
    expect(weightWeekSummary(entries, "2026-09-30").current.mean).toBeCloseTo(81.35, 6);
  });

  it("la semaine d'avant n'est pas « la dernière complète » : une semaine incomplète ne remonte pas plus loin", () => {
    /* Semaine du 04/10 : la dernière complète est celle du 27/09 (2 pesées) — non valide, sans repli sur le 20/09. */
    const summary = weightWeekSummary(entries, "2026-10-05");
    expect(summary.lastComplete).toMatchObject({ weekStart: "2026-09-27", count: 2, valid: false });
    expect(summary.current).toMatchObject({ weekStart: "2026-10-04", count: 0 });
  });

  it("intervalles lisibles, sur un ou deux mois", () => {
    expect(formatWeekSpan({ weekStart: "2026-09-20", weekEnd: "2026-09-26" })).toBe("20 → 26 sept.");
    expect(formatWeekSpan({ weekStart: "2026-09-27", weekEnd: "2026-10-03" })).toBe("27 sept. → 3 oct.");
  });
});

describe("affichage sur la carte", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(cleanup);

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("pesée du jour, moyenne de la semaine dernière, moyenne provisoire de la semaine en cours", async () => {
    const now = new Date("2026-09-30T08:00:00.000Z");
    for (const [date, kg] of [["2026-09-21", "82"], ["2026-09-23", "81,8"], ["2026-09-26", "81,6"], ["2026-09-27", "81,4"], ["2026-09-30", "81,3"]] as const) {
      await recordWeight(date, kg, now);
    }
    const { container } = render(<WeightCard today="2026-09-30" />);

    await screen.findByText("Pesées récentes");
    expect(container.querySelector(".weight-card__value")?.textContent).toBe("81,3 kg");
    const averages = container.querySelector(".weight-card__averages")!;
    expect(averages.textContent).toContain("Semaine dernière 20 → 26 sept.81,8 kg · 3 pesées");
    expect(averages.textContent).toContain("Cette semaine provisoire81,4 kg · 2 pesées");
  });

  it("semaine dernière insuffisante : « pas assez de pesées »", async () => {
    await recordWeight("2026-09-22", "82", new Date("2026-09-30T08:00:00.000Z"));
    render(<WeightCard today="2026-09-30" />);

    expect(await screen.findByText("Pas assez de pesées (1 sur 3 minimum)")).toBeTruthy();
    expect(screen.getByText("Aucune pesée")).toBeTruthy();
  });
});
