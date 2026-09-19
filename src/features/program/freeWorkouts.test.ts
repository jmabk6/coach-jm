import { describe, expect, it } from "vitest";
import type { Exercise, SessionTemplate, WorkoutSession } from "../../domain";
import {
  formatFreeWorkoutSummary,
  categoryForWorkout,
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
      ["doigts-sol", "Distance doigts-sol", "Test mobilité"],
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

  it("kind prime sur l'inférence : un bilan libre est « Bilan de mobilité », même vide ; sans kind, trois tests en cm tombent en Musculation", () => {
    expect(inferFreeWorkoutCategory({ ...workout(["doigts-sol"]), kind: "mobility_assessment" }, exercises)).toBe("Bilan de mobilité");
    expect(inferFreeWorkoutCategory({ ...workout([]), kind: "mobility_assessment" }, exercises)).toBe("Bilan de mobilité");
    /* Documenté : l'inférence ne connaît pas « Test mobilité » — c'est pourquoi kind existe. */
    expect(inferFreeWorkoutCategory(workout(["doigts-sol"]), exercises)).toBe("Musculation");
    expect(inferFreeWorkoutCategory({ ...workout(["tapis"]), kind: "training" }, exercises)).toBe("Cardio");
  });

  it("categoryForWorkout : kind, puis le modèle, puis l'inférence", () => {
    const template: SessionTemplate = { id: "t", name: "T", category: "Cardio", status: "active", position: 0, blocks: [], createdAt: "n", updatedAt: "n" };
    expect(categoryForWorkout({ ...workout(["presse"]), kind: "mobility_assessment" }, template, exercises)).toBe("Bilan de mobilité");
    expect(categoryForWorkout(workout(["presse"]), template, exercises)).toBe("Cardio");
    expect(categoryForWorkout(workout(["presse"]), undefined, exercises)).toBe("Musculation");
    expect(categoryForWorkout({ ...workout(["presse"]), kind: "training" }, { ...template, category: "Bilan de mobilité" }, exercises)).toBe("Bilan de mobilité");
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
