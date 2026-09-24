import { describe, expect, it } from "vitest";
import type { TestCycleSettings, TestProtocolVersion, TestScheduleEntry } from "../../domain";
import { morningMeasurementFor } from "../../domain/rules/testCycleRules";
import { computeTestResult } from "../../domain/rules/testResultRules";
import { PROGRAM_V1_TEST_SCHEDULE } from "../program/programV1";
import { TEST_PROTOCOLS_V1 } from "../tests/testProtocolsV1";

/**
 * Lot I.3 — mensurations du matin : invitation le lundi d'une semaine de
 * tests (conception V2 § 2.3, § 2.4), ratio épaules / taille dérivé à 0,01.
 */

const cycle: TestCycleSettings = { anchorWeekStart: "2026-09-27", everyWeeks: 4 };
const schedule = PROGRAM_V1_TEST_SCHEDULE as TestScheduleEntry[];
const protocol = { id: "protocol-mensurations", key: "mensurations", status: "active" as const };

const at = (today: string, results: Array<{ id: string; protocolId: string; date: string }> = []) =>
  morningMeasurementFor({ today, cycle, schedule, protocol, results });

describe("invitation aux mensurations", () => {
  it("semaine de tests : rien le dimanche, invitation le lundi, encore à faire ensuite", () => {
    expect(at("2026-09-27")).toBeUndefined();
    expect(at("2026-09-28")).toEqual({ state: "due", scheduledDate: "2026-09-28" });
    expect(at("2026-10-01")).toEqual({ state: "late", scheduledDate: "2026-09-28" });
    expect(at("2026-10-03")).toEqual({ state: "late", scheduledDate: "2026-09-28" });
  });

  it("un résultat dans la semaine : fait ; un résultat d'une autre semaine ne compte pas", () => {
    expect(at("2026-09-28", [{ id: "r", protocolId: "protocol-mensurations", date: "2026-09-28" }])).toEqual({
      state: "done", scheduledDate: "2026-09-28", resultId: "r",
    });
    expect(at("2026-09-29", [{ id: "old", protocolId: "protocol-mensurations", date: "2026-09-20" }])?.state).toBe("late");
    expect(at("2026-09-28", [{ id: "x", protocolId: "protocol-souplesse", date: "2026-09-28" }])?.state).toBe("due");
  });

  it("hors semaine de tests, protocole en pause ou absent du calendrier : rien", () => {
    expect(at("2026-10-05")).toBeUndefined();
    expect(at("2026-10-26")).toEqual({ state: "due", scheduledDate: "2026-10-26" });
    expect(morningMeasurementFor({ today: "2026-09-28", cycle, schedule, protocol: { ...protocol, status: "paused" }, results: [] })).toBeUndefined();
    expect(morningMeasurementFor({ today: "2026-09-28", cycle, schedule: [], protocol, results: [] })).toBeUndefined();
  });
});

describe("rapport épaules / taille (§ 5.3)", () => {
  const content = TEST_PROTOCOLS_V1.find((item) => item.key === "mensurations")!;
  const version = { ...content.version } as TestProtocolVersion;
  const ratio = (epaules_cm: number, taille_cm: number) =>
    computeTestResult(version, { values: { epaules_cm, taille_cm } }).measures.find((measure) => measure.key === "ratio_epaules_taille")?.value;

  it("arrondi à 0,01", () => {
    expect(ratio(118, 92.3)).toBe(1.28);
    expect(ratio(119.5, 95)).toBe(1.26);
    expect(ratio(100, 80)).toBe(1.25);
    expect(ratio(116, 94)).toBe(1.23);
  });

  it("une seule mesure : pas de rapport, résultat incomplet", () => {
    const result = computeTestResult(version, { values: { epaules_cm: 118 } });
    expect(result.status).toBe("incomplete");
    expect(result.measures.map((measure) => measure.key)).toEqual(["epaules_cm"]);
  });
});
