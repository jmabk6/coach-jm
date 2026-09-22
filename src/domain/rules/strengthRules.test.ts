import { describe, expect, it } from "vitest";
import {
  RPE_SCALE_V1_ID,
  RPE_SCALE_V1_TABLE,
  formatRpeRowLabel,
  formatSeriesRoleSummary,
  isCountedSeries,
  isWorkSeries,
  rpeScaleV1,
  seriesRoleOf,
  summarizeSeriesRoles,
} from "./strengthRules";

describe("échelle de RPE V1 (spec Musculation § 6)", () => {
  it("porte les six lignes de la spec, de 10 à « 5 et moins »", () => {
    expect(RPE_SCALE_V1_TABLE.map((row) => row.rpe)).toEqual([10, 9, 8, 7, 6, 5]);
    expect(RPE_SCALE_V1_TABLE.map((row) => row.repsInReserveLabel)).toEqual([
      "0 — échec, aucune répétition de plus",
      "1",
      "2 à 3",
      "4 à 5",
      "6 à 7",
      "8 ou plus, estimation imprécise",
    ]);
    expect(formatRpeRowLabel(5, RPE_SCALE_V1_TABLE)).toBe("5 et moins");
    expect(formatRpeRowLabel(8, RPE_SCALE_V1_TABLE)).toBe("8");
  });

  it("la V1 est active, numéro 1, datée du jour du seed, et sa table est une copie", () => {
    const version = rpeScaleV1("2026-09-22", "2026-09-22T08:00:00.000Z");

    expect(version).toMatchObject({
      id: RPE_SCALE_V1_ID,
      number: 1,
      status: "active",
      startDate: "2026-09-22",
      createdAt: "2026-09-22T08:00:00.000Z",
    });
    expect(version.table).toEqual(RPE_SCALE_V1_TABLE);
    expect(version.table).not.toBe(RPE_SCALE_V1_TABLE);
    expect(version.table[0]).not.toBe(RPE_SCALE_V1_TABLE[0]);
  });
});

describe("rôle de série et série comptée (décisions 6, 7, 10)", () => {
  it("absent = travail ; seul un échauffement explicite n'est pas une série de travail", () => {
    expect(seriesRoleOf({})).toBe("travail");
    expect(seriesRoleOf({ role: "travail" })).toBe("travail");
    expect(seriesRoleOf({ role: "echauffement" })).toBe("echauffement");
    expect(isWorkSeries({})).toBe(true);
    expect(isWorkSeries({ role: "echauffement" })).toBe(false);
  });

  it("une série comptée est de travail et non limitée par un côté", () => {
    expect(isCountedSeries({})).toBe(true);
    expect(isCountedSeries({ role: "travail", sideLimited: false })).toBe(true);
    expect(isCountedSeries({ role: "travail", sideLimited: true })).toBe(false);
    expect(isCountedSeries({ role: "echauffement" })).toBe(false);
    /* Un drapeau sur un échauffement (impossible par le moteur) ne compte pas deux fois. */
    expect(isCountedSeries({ role: "echauffement", sideLimited: true })).toBe(false);
  });

  it("résume et formate : rien quand toutes comptent, sinon « dont n comptées · … »", () => {
    const allWork = summarizeSeriesRoles([{}, { role: "travail" }, { role: "travail", sideLimited: false }]);
    expect(allWork).toEqual({ total: 3, counted: 3, warmup: 0, sideLimited: 0 });
    expect(formatSeriesRoleSummary(allWork)).toBeUndefined();

    const mixed = summarizeSeriesRoles([
      { role: "echauffement" },
      { role: "echauffement" },
      { role: "travail", sideLimited: true },
      { role: "travail" },
      {},
    ]);
    expect(mixed).toEqual({ total: 5, counted: 2, warmup: 2, sideLimited: 1 });
    expect(formatSeriesRoleSummary(mixed)).toBe("dont 2 comptées · 2 éch. · 1 limitée par un côté");

    expect(formatSeriesRoleSummary(summarizeSeriesRoles([{ role: "echauffement" }, { role: "travail" }]))).toBe(
      "dont 1 comptée · 1 éch.",
    );
    expect(
      formatSeriesRoleSummary(
        summarizeSeriesRoles([{ sideLimited: true }, { sideLimited: true }, { role: "travail" }]),
      ),
    ).toBe("dont 1 comptée · 2 limitées par un côté");
    expect(formatSeriesRoleSummary(summarizeSeriesRoles([]))).toBeUndefined();
  });
});
