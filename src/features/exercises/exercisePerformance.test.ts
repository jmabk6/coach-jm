import { describe, expect, it } from "vitest";
import type {
  Exercise,
  WorkoutSession,
} from "../../domain";
import {
  buildExercisePerformanceHistory,
  buildExercisePerformanceSummary,
  getCompatiblePerformanceMetrics,
  getDefaultPerformanceMetric,
} from "./exercisePerformance";

const squat = {
  id: "squat",
  name: "Squat",
  zone: "Jambes",
  movement: "Squat",
  equipment: "Barre",
  location: "Salle",
  mode: "series",
  measurementType: "load_reps",
  status: "active",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
} as Exercise;

const planche = {
  id: "planche",
  name: "Planche",
  zone: "Core",
  movement: "Gainage",
  equipment: "Poids du corps",
  location: "Salle",
  mode: "series",
  measurementType: "duration",
  status: "active",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
} as Exercise;

const unilateral = {
  id: "unilateral",
  name: "Unilatéral",
  zone: "Bras",
  movement: "Isolation",
  equipment: "Haltères",
  location: "Salle",
  mode: "series",
  measurementType: "reps_per_side",
  status: "active",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
} as Exercise;

function makeWorkout(
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  return {
    id: "workout-1",
    source: "free",
    status: "completed",
    date: "2026-09-01",
    startedAt: "2026-09-01T18:00:00.000Z",
    completedAt: "2026-09-01T19:00:00.000Z",
    lastActionAt: "2026-09-01T19:00:00.000Z",
    activeDurationSec: 3600,
    blocks: [],
    createdAt: "2026-09-01T18:00:00.000Z",
    updatedAt: "2026-09-01T19:00:00.000Z",
    ...overrides,
  };
}

describe("exercisePerformance", () => {
  it("ne compte que les séries terminées d'un exercice réalisé", () => {
    const workout = makeWorkout({
      blocks: [
        {
          id: "block-1",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "squat",
          status: "performed",
          snapshotInstructions: {
            shape: "reps",
            sets: 2,
            reps: { min: 8, max: 12 },
            targetRpe: { min: 6, max: 8 },
            restBetweenSetsSec: 90,
          },
          series: [
            {
              id: "series-1",
              position: 0,
              status: "completed",
              load: { kind: "total", kg: 20 },
              reps: 10,
            },
            {
              id: "series-2",
              position: 1,
              status: "active",
              load: { kind: "total", kg: 50 },
              reps: 1,
            },
          ],
        },
      ],
    });

    const history =
      buildExercisePerformanceHistory(
        squat,
        [workout],
      );

    expect(history).toHaveLength(1);
    expect(history[0]?.chargeMaxKg).toBe(20);
    expect(history[0]?.volumeKg).toBe(200);
    expect(history[0]?.repsMax).toBe(10);
  });

  it("ignore une charge à vide dont la tare est inconnue", () => {
    const workout = makeWorkout({
      blocks: [
        {
          id: "block-1",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "squat",
          status: "performed",
          snapshotInstructions: {
            shape: "reps",
            sets: 1,
            reps: { min: 8, max: 12 },
            targetRpe: { min: 6, max: 8 },
            restBetweenSetsSec: 90,
          },
          series: [
            {
              id: "series-1",
              position: 0,
              status: "completed",
              load: { kind: "empty" },
              reps: 12,
            },
          ],
        },
      ],
    });

    const entry =
      buildExercisePerformanceHistory(
        squat,
        [workout],
      )[0];

    expect(entry?.chargeMaxKg).toBeUndefined();
    expect(entry?.volumeKg).toBeUndefined();
    expect(entry?.repsMax).toBe(12);
  });

  it("utilise le côté le plus faible pour les répétitions par côté", () => {
    const workout = makeWorkout({
      blocks: [
        {
          id: "block-1",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "unilateral",
          status: "performed",
          snapshotInstructions: {
            shape: "reps",
            sets: 1,
            reps: { min: 8, max: 12 },
            targetRpe: { min: 6, max: 8 },
            restBetweenSetsSec: 60,
          },
          series: [
            {
              id: "series-1",
              position: 0,
              status: "completed",
              sideValues: [
                { side: "left", reps: 12 },
                { side: "right", reps: 9 },
              ],
            },
          ],
        },
      ],
    });

    const entry =
      buildExercisePerformanceHistory(
        unilateral,
        [workout],
      )[0];

    expect(entry?.repsMax).toBe(9);
  });

  it("n'utilise pas les workouts non terminés", () => {
    const workout = makeWorkout({
      status: "in_progress",
      blocks: [
        {
          id: "block-1",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "squat",
          status: "performed",
          snapshotInstructions: {
            shape: "reps",
            sets: 1,
            reps: { min: 8, max: 12 },
            targetRpe: { min: 6, max: 8 },
            restBetweenSetsSec: 90,
          },
          series: [
            {
              id: "series-1",
              position: 0,
              status: "completed",
              load: { kind: "total", kg: 100 },
              reps: 10,
            },
          ],
        },
      ],
    });

    expect(
      buildExercisePerformanceHistory(
        squat,
        [workout],
      ),
    ).toEqual([]);
  });

  it("définit les métriques compatibles et la métrique par défaut", () => {
    expect(
      getCompatiblePerformanceMetrics(squat),
    ).toEqual([
      "chargeMax",
      "volume",
      "reps",
    ]);

    expect(
      getDefaultPerformanceMetric(squat),
    ).toBe("chargeMax");

    expect(
      getCompatiblePerformanceMetrics(planche),
    ).toEqual(["durationMax"]);

    expect(
      getDefaultPerformanceMetric(planche),
    ).toBe("durationMax");
  });

  it("calcule dernière, meilleure et progression depuis le début", () => {
    const history = [
      {
        workoutId: "w3",
        date: "2026-09-13",
        startedAt: "2026-09-13T18:00:00.000Z",
        series: [],
        chargeMaxKg: 35,
      },
      {
        workoutId: "w2",
        date: "2026-09-07",
        startedAt: "2026-09-07T18:00:00.000Z",
        series: [],
        chargeMaxKg: 30,
      },
      {
        workoutId: "w1",
        date: "2026-09-01",
        startedAt: "2026-09-01T18:00:00.000Z",
        series: [],
        chargeMaxKg: 25,
      },
    ];

    const summary =
      buildExercisePerformanceSummary(
        history,
        "chargeMax",
      );

    expect(summary?.latestValue).toBe(35);
    expect(summary?.bestValue).toBe(35);
    expect(summary?.firstValue).toBe(25);
    expect(summary?.progressionPercent).toBe(40);
  });
});