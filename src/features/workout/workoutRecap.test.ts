import { describe, expect, it } from "vitest";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import {
  formatLoad,
  formatSeriesLine,
  summarizeWorkout,
} from "./workoutRecap";

const workouts = buildImportedWorkouts();
const byDate = (date: string) => {
  const workout = workouts.find((w) => w.date === date);
  if (!workout) throw new Error(date);
  return workout;
};

describe("récapitulatif d'une réalisation", () => {
  it("lit une série sur une ligne, note comprise", () => {
    expect(
      formatSeriesLine({
        id: "s",
        position: 0,
        status: "completed",
        load: { kind: "total", kg: 10 },
        reps: 12,
        rpe: 10,
        note: "Tremblement",
      }),
    ).toBe("10 kg × 12 · RPE 10 · Tremblement");
    expect(
      formatSeriesLine({
        id: "s",
        position: 0,
        status: "completed",
        sideValues: [
          { side: "left", durationSec: 30 },
          { side: "right", durationSec: 30 },
        ],
      }),
    ).toBe("30 s par côté");
    expect(formatLoad({ kind: "per_side", kgPerSide: 5 })).toBe("5 kg/côté");
    expect(formatLoad({ kind: "empty" })).toBe("à vide");
  });

  it("porte le dénominateur réel du RPE et la couverture du BPM", () => {
    const head = summarizeWorkout(byDate("2026-09-08"));

    expect(head.seriesDone).toBe(21);
    expect(head.rpe?.count).toBe(14);
    expect(head.rpe?.total).toBe(21);
    expect(head.bpm).toEqual({
      min: 80,
      max: 112,
      average: { value: 94, count: 4, total: 4 },
    });
    expect(head.volumeKg).toBeGreaterThan(0);

    /* 3 séries de gainage : sous le seuil, pas de RPE. */
    expect(summarizeWorkout(byDate("2026-09-03")).rpe).toBeUndefined();
  });
});
