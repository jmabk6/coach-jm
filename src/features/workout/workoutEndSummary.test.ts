import { describe, expect, it } from "vitest";
import type { Exercise } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { formatAssistanceNotIncluded, formatHoursMinutes, formatRecordSeries } from "./workoutEndSummary";

const byId = new Map<string, Exercise>(exerciseCatalog.map((exercise) => [exercise.id, exercise]));

describe("libellés de fin de séance (M10.1)", () => {
  it("record : charge, assistance, durée par côté ; ni RPE ni note", () => {
    const base = { id: "s", position: 0, status: "completed" as const, rpe: 8, note: "dur" };
    expect(formatRecordSeries({ ...base, load: { kind: "total", kg: 35 }, reps: 10 }, byId.get("squat"))).toBe("35 kg × 10");
    expect(formatRecordSeries({ ...base, load: { kind: "total", kg: 52 }, reps: 7 }, byId.get("traction-assistee"))).toBe("52 kg d'assistance × 7");
    expect(
      formatRecordSeries({ ...base, sideValues: [{ side: "left", durationSec: 45 }, { side: "right", durationSec: 45 }] }, byId.get("mobilite-ischio-jambiers")),
    ).toBe("45 s par côté");
  });

  it("tonnage : mention d'assistance seulement si une assistance a été faite", () => {
    expect(formatAssistanceNotIncluded([])).toBeUndefined();
    expect(formatAssistanceNotIncluded(["Traction assistée"])).toBe("traction assistée non incluse");
    expect(formatAssistanceNotIncluded(["Traction assistée", "Dips assistés"])).toBe("assistance non incluse : traction assistée, dips assistés");
  });

  it("durées : 48 min, 1 h 02 min", () => {
    expect(formatHoursMinutes(48 * 60)).toBe("48 min");
    expect(formatHoursMinutes(62 * 60)).toBe("1 h 02 min");
  });
});
