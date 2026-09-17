import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import { findLastPerformances } from "./lastPerformance";
import {
  calculatePerformedNumbering,
  formatExerciseSubtitle,
  formatPlannedLine,
} from "./workoutDisplay";

function workout(
  id: string,
  date: string,
  blocks: WorkoutSession["blocks"],
  status: WorkoutSession["status"] = "completed",
): WorkoutSession {
  return {
    id,
    source: "free",
    status,
    date,
    startedAt: `${date}T16:00:00.000Z`,
    lastActionAt: `${date}T17:00:00.000Z`,
    activeDurationSec: 3600,
    blocks,
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T17:00:00.000Z`,
  };
}

const squatOld = workout("w-old", "2026-09-03", [
  {
    id: "b",
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId: "squat",
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 8, max: 10 }, restBetweenSetsSec: 90 },
    series: [
      { id: "s1", position: 0, status: "completed", load: { kind: "total", kg: 35 }, reps: 10 },
      { id: "s2", position: 1, status: "completed", load: { kind: "total", kg: 35 }, reps: 9 },
    ],
  },
]);

const groupRecent = workout("w-new", "2026-09-10", [
  {
    id: "g",
    kind: "group",
    position: 0,
    addedDuringWorkout: false,
    status: "performed",
    plannedRounds: 1,
    plannedRestBetweenRoundsSec: 60,
    children: [
      { id: "c", position: 0, exerciseId: "squat", snapshotInstructions: { shape: "reps", reps: { min: 8, max: 10 } } },
    ],
    rounds: [
      {
        id: "r1",
        roundNumber: 1,
        status: "completed",
        children: [
          { id: "r1c", groupChildId: "c", exerciseId: "squat", load: { kind: "total", kg: 40 }, reps: 8, rpe: 8, completedAt: "2026-09-10T16:10:00.000Z" },
        ],
      },
    ],
  },
]);

describe("findLastPerformances", () => {
  it("prend la réalisation terminée la plus récente, enfant de groupe compris", () => {
    const last = findLastPerformances([squatOld, groupRecent]).get("squat");

    expect(last).toMatchObject({
      workoutId: "w-new",
      date: "2026-09-10",
      series: { load: { kind: "total", kg: 40 }, reps: 8, rpe: 8 },
    });
  });

  it("retient la dernière série validée du jour et ignore la séance en cours", () => {
    const running = workout("w-run", "2026-09-17", squatOld.blocks, "in_progress");
    const last = findLastPerformances([squatOld, running], "w-run").get("squat");

    expect(last).toMatchObject({ workoutId: "w-old", series: { reps: 9 } });
    expect(last?.allSeries).toHaveLength(2);
  });

  it("ne renvoie rien pour un exercice jamais réalisé", () => {
    expect(findLastPerformances([squatOld]).get("crunch")).toBeUndefined();
  });
});

describe("libellés de l'écran de séance", () => {
  const block = squatOld.blocks[0] as Extract<WorkoutSession["blocks"][number], { kind: "exercise" }>;

  it("numérote exercices et groupes, jamais les notes", () => {
    expect(
      calculatePerformedNumbering([
        { id: "n", kind: "note", position: 0, addedDuringWorkout: false, text: "x" },
        { ...block, id: "a", position: 1 },
        { ...block, id: "b", position: 2 },
      ]),
    ).toEqual({ a: 1, b: 2 });
  });

  it("met la structure dans le sous-titre et les cibles dans Prévu", () => {
    expect(formatExerciseSubtitle(block)).toBe("2 séries · Repos 1 min 30");
    expect(formatPlannedLine(block)).toBe("8–10 reps · Repos 1 min 30");
    expect(formatPlannedLine({ ...block, addedDuringWorkout: true })).toBeUndefined();
  });
});
