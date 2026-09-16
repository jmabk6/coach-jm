import { describe, expect, it } from "vitest";
import type { Exercise, WorkoutSession } from "../../domain";
import {
  formatFreeWorkoutSummary,
  inferFreeWorkoutCategory,
  isFreeWorkoutVisibleInProgram,
} from "./freeWorkouts";

const exercises = new Map<string, Exercise>(
  (
    [
      ["tapis", "Tapis de course", "Cardio"],
      ["presse", "Presse", "Musculation"],
      ["planche", "Planche", "Musculation"],
      ["chat", "Chat-vache", "Mobilité"],
    ] as const
  ).map(([id, name, category]) => [
    id,
    { id, name, category } as unknown as Exercise,
  ]),
);

function workout(exerciseIds: string[], minutes = 52): WorkoutSession {
  return {
    id: "w",
    source: "free",
    status: "completed",
    date: "2026-09-08",
    startedAt: "2026-09-08T16:00:00.000Z",
    lastActionAt: "2026-09-08T16:52:00.000Z",
    activeDurationSec: minutes * 60,
    blocks: exerciseIds.map((exerciseId, position) => ({
      id: `b${position}`,
      kind: "exercise",
      position,
      addedDuringWorkout: false,
      exerciseId,
      status: "performed",
      snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 },
    })),
    createdAt: "now",
    updatedAt: "now",
  };
}

describe("réalisations libres dans le Programme", () => {
  it("résume le contenu réalisé comme ailleurs", () => {
    expect(formatFreeWorkoutSummary(workout(["tapis", "presse", "planche", "chat", "presse"]), exercises)).toBe(
      "Tapis de course + 4 exercices · 52 min",
    );
    expect(formatFreeWorkoutSummary(workout(["tapis"], 35), exercises)).toBe("Tapis de course · 35 min");
    expect(formatFreeWorkoutSummary(workout(["presse"], 40), exercises)).toBe("1 exercice · 40 min");
  });

  it("déduit la catégorie de l'icône", () => {
    expect(inferFreeWorkoutCategory(workout(["tapis"]), exercises)).toBe("Cardio");
    expect(inferFreeWorkoutCategory(workout(["chat"]), exercises)).toBe("Mobilité");
    expect(inferFreeWorkoutCategory(workout(["tapis", "presse"]), exercises)).toBe("Musculation");
  });

  it("n'affiche que les réalisations libres terminées", () => {
    expect(isFreeWorkoutVisibleInProgram(workout(["tapis"]))).toBe(true);
    expect(
      isFreeWorkoutVisibleInProgram({ ...workout(["tapis"]), plannedSessionId: "p1" }),
    ).toBe(false);
    expect(
      isFreeWorkoutVisibleInProgram({ ...workout(["tapis"]), status: "in_progress" }),
    ).toBe(false);
  });
});
