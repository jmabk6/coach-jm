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

  it("signale un échauffement ou une série limitée par un côté, jamais une série de travail ordinaire", () => {
    const base = { id: "s", position: 0, status: "completed" as const, load: { kind: "total" as const, kg: 40 }, reps: 10 };

    expect(formatSeriesLine({ ...base, role: "travail", sideLimited: false, rpe: 7 })).toBe("40 kg × 10 · RPE 7");
    expect(formatSeriesLine({ ...base, role: "echauffement", rpe: 5 })).toBe("40 kg × 10 · éch. · RPE 5");
    expect(formatSeriesLine({ ...base, role: "travail", sideLimited: true, note: "gauche lâche" })).toBe(
      "40 kg × 10 · limitée par un côté · gauche lâche",
    );
  });

  it("récap : volume total sur toutes les séries, séries comptées à part (décisions 6 et 10)", () => {
    const workout = byDate("2026-09-08");
    const blocks = structuredClone(workout.blocks);
    const first = blocks.find((block) => block.kind === "exercise" && block.series && block.series.length >= 3);
    if (!first || first.kind !== "exercise" || !first.series) throw new Error("fixture");
    first.series[0]!.role = "echauffement";
    first.series[1]!.role = "travail";
    first.series[1]!.sideLimited = true;

    const before = summarizeWorkout(workout);
    const head = summarizeWorkout({ ...workout, blocks });

    expect(before.roles).toEqual({ total: 21, counted: 21, warmup: 0, sideLimited: 0 });
    expect(head.volumeKg).toBe(before.volumeKg);
    expect(head.seriesDone).toBe(21);
    expect(head.roles).toEqual({ total: 21, counted: 19, warmup: 1, sideLimited: 1 });
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
