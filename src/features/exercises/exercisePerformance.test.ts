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

  it("utilise le côté le plus faible pour la durée par côté", () => {
    const durationExercise = {
      id: "duration-unilateral",
      name: "Gainage latéral",
      zone: "Core",
      movement: "Gainage",
      equipment: "Poids du corps",
      location: "Salle",
      mode: "series",
      measurementType: "duration_per_side",
      status: "active",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    } as Exercise;

    const workout = makeWorkout({
      blocks: [
        {
          id: "block-duration",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "duration-unilateral",
          status: "performed",
          snapshotInstructions: {
            shape: "duration",
            sets: 1,
            durationSec: 45,
            targetRpe: {
              min: 6,
              max: 8,
            },
            restBetweenSetsSec: 60,
          },
          series: [
            {
              id: "series-duration",
              position: 0,
              status: "completed",
              sideValues: [
                {
                  side: "left",
                  durationSec: 45,
                },
                {
                  side: "right",
                  durationSec: 32,
                },
              ],
            },
          ],
        },
      ],
    });

    const entry =
      buildExercisePerformanceHistory(
        durationExercise,
        [workout],
      )[0];

    expect(entry?.durationMaxSec).toBe(32);
  });

  it("attribue une réalisation de groupe à l'exercice réellement effectué", () => {
    const substitutedExercise = {
      ...squat,
      id: "substitute",
      name: "Squat substitution",
    } as Exercise;

    const workout = makeWorkout({
      blocks: [
        {
          id: "group-1",
          kind: "group",
          position: 0,
          addedDuringWorkout: false,
          status: "performed",
          plannedRounds: 1,
          plannedRestBetweenRoundsSec: 60,
          children: [
            {
              id: "group-child-1",
              position: 0,
              exerciseId: "squat",
              snapshotInstructions: {
                shape: "reps",
                reps: {
                  min: 8,
                  max: 12,
                },
                targetRpe: {
                  min: 6,
                  max: 8,
                },
              },
            },
          ],
          rounds: [
            {
              id: "round-1",
              roundNumber: 1,
              status: "completed",
              children: [
                {
                  id: "round-child-1",
                  groupChildId: "group-child-1",
                  exerciseId: "substitute",
                  load: {
                    kind: "total",
                    kg: 40,
                  },
                  reps: 10,
                  completedAt: "2026-09-01T18:20:00.000Z",
                },
              ],
              completedAt: "2026-09-01T18:21:00.000Z",
            },
          ],
        } as WorkoutSession["blocks"][number],
      ],
    });

    const substituteEntry =
      buildExercisePerformanceHistory(
        substitutedExercise,
        [workout],
      )[0];

    const originalEntry =
      buildExercisePerformanceHistory(
        squat,
        [workout],
      )[0];

    expect(substituteEntry?.chargeMaxKg).toBe(40);
    expect(substituteEntry?.repsMax).toBe(10);
    expect(originalEntry).toBeUndefined();
  });
  it("règle unique des groupes : toute série validée compte, même dans un tour interrompu ; un enfant non validé ne compte nulle part ; la substitution va au remplaçant", () => {
    const pompes = { ...squat, id: "pompes", name: "Pompes", measurementType: "reps" } as Exercise;
    const pecDeck = { ...squat, id: "pec-deck", name: "Pec deck" } as Exercise;
    const child = (id: string, exerciseId: string, extra: Record<string, unknown>) => ({
      id,
      position: exerciseId === "squat" ? 0 : 1,
      exerciseId,
      snapshotInstructions: { shape: "reps", reps: { min: 8, max: 12 } },
      ...extra,
    });
    const workout = makeWorkout({
      blocks: [
        {
          id: "group-1",
          kind: "group",
          position: 0,
          addedDuringWorkout: false,
          status: "performed",
          plannedRounds: 3,
          plannedRestBetweenRoundsSec: 60,
          children: [child("gc-squat", "squat", {}), child("gc-pompes", "pompes", {})],
          rounds: [
            /* Tour 1 complet : squat 40 × 10, pompes 15. */
            {
              id: "round-1",
              roundNumber: 1,
              status: "completed",
              children: [
                { id: "r1-a", groupChildId: "gc-squat", exerciseId: "squat", load: { kind: "total", kg: 40 }, reps: 10, completedAt: "2026-09-01T18:05:00.000Z" },
                { id: "r1-b", groupChildId: "gc-pompes", exerciseId: "pompes", reps: 15, completedAt: "2026-09-01T18:07:00.000Z" },
              ],
              completedAt: "2026-09-01T18:07:00.000Z",
            },
            /* Tour 2 interrompu après le squat (45 × 8) : le remplaçant Pec deck n'a rien fait. */
            {
              id: "round-2",
              roundNumber: 2,
              status: "not_performed",
              children: [
                { id: "r2-a", groupChildId: "gc-squat", exerciseId: "squat", load: { kind: "total", kg: 45 }, reps: 8, completedAt: "2026-09-01T18:12:00.000Z" },
                { id: "r2-b", groupChildId: "gc-pompes", exerciseId: "pec-deck", load: { kind: "total", kg: 30 }, reps: 12 },
              ],
            },
            /* Tour 3 jamais commencé. */
            {
              id: "round-3",
              roundNumber: 3,
              status: "not_performed",
              children: [
                { id: "r3-a", groupChildId: "gc-squat", exerciseId: "squat" },
                { id: "r3-b", groupChildId: "gc-pompes", exerciseId: "pec-deck" },
              ],
            },
          ],
        } as WorkoutSession["blocks"][number],
      ],
    });

    const squatEntry = buildExercisePerformanceHistory(squat, [workout])[0]!;
    const pompesEntry = buildExercisePerformanceHistory(pompes, [workout])[0]!;

    /* Les deux squats validés comptent, tour interrompu compris : charge max 45, volume 400 + 360. */
    expect(squatEntry.series).toHaveLength(2);
    expect(squatEntry.chargeMaxKg).toBe(45);
    expect(squatEntry.volumeKg).toBe(760);
    expect(squatEntry.repsMax).toBe(10);
    /* Les pompes du tour 1 seulement. */
    expect(pompesEntry.series).toHaveLength(1);
    expect(pompesEntry.repsMax).toBe(15);
    /* L'enfant du tour 2 non validé (valeurs préremplies, sans completedAt) ne compte pas : pas de Pec deck. */
    expect(buildExercisePerformanceHistory(pecDeck, [workout])).toEqual([]);
  });

  it("ne change rien aux exercices autonomes : seules les séries terminées d'une brique réalisée comptent", () => {
    const workout = makeWorkout({
      blocks: [
        {
          id: "block-1",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: "squat",
          status: "performed",
          snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 90 },
          series: [
            { id: "s1", position: 0, status: "completed", load: { kind: "total", kg: 50 }, reps: 10 },
            { id: "s2", position: 1, status: "completed", load: { kind: "total", kg: 52.5 }, reps: 8 },
            { id: "s3", position: 2, status: "not_performed" },
          ],
        } as WorkoutSession["blocks"][number],
      ],
    });

    const entry = buildExercisePerformanceHistory(squat, [workout])[0]!;

    expect(entry.series).toHaveLength(2);
    expect(entry.chargeMaxKg).toBe(52.5);
    expect(entry.volumeKg).toBe(500 + 420);
    expect(entry.repsMax).toBe(10);
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

  it("gère une mesure simple en centimètres", () => {
    const exercise = {
      id: "doigts-sol",
      name: "Doigts-sol",
      category: "Test mobilité",
      location: "Maison",
      mode: "simple",
      measurementType: "distance_cm",
      status: "active",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    } as Exercise;

    const workout = makeWorkout({
      blocks: [
        {
          id: "block-distance",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: exercise.id,
          status: "performed",
          snapshotInstructions: {
            shape: "distance_cm",
          },
          simpleMeasurement: {
            distanceCm: 7.5,
            completedAt: "2026-09-01T18:10:00.000Z",
          },
        },
      ],
    });

    const history =
      buildExercisePerformanceHistory(
        exercise,
        [workout],
      );

    expect(history).toHaveLength(1);
    expect(history[0]?.distanceCm).toBe(7.5);
    expect(
      getCompatiblePerformanceMetrics(exercise),
    ).toEqual(["distanceCm"]);
    expect(
      getDefaultPerformanceMetric(exercise),
    ).toBe("distanceCm");
  });

  it("retient le côté le moins bon pour une mesure en cm par côté", () => {
    const exercise = {
      id: "papillon",
      name: "Papillon",
      category: "Test mobilité",
      location: "Maison",
      mode: "simple",
      measurementType: "distance_cm_per_side",
      status: "active",
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    } as Exercise;

    const workout = makeWorkout({
      blocks: [
        {
          id: "block-butterfly",
          kind: "exercise",
          position: 0,
          addedDuringWorkout: false,
          exerciseId: exercise.id,
          status: "performed",
          snapshotInstructions: {
            shape: "distance_cm_per_side",
          },
          simpleMeasurement: {
            sideValues: [
              {
                side: "left",
                distanceCm: 8,
              },
              {
                side: "right",
                distanceCm: 11,
              },
            ],
            completedAt: "2026-09-01T18:10:00.000Z",
          },
        },
      ],
    });

    const history =
      buildExercisePerformanceHistory(
        exercise,
        [workout],
      );

    expect(history).toHaveLength(1);
    expect(history[0]?.distanceCm).toBe(11);
  });

  it("considère la plus petite distance en cm comme la meilleure", () => {
    const history = [
      {
        workoutId: "w3",
        date: "2026-09-13",
        startedAt: "2026-09-13T18:00:00.000Z",
        series: [],
        distanceCm: 4,
      },
      {
        workoutId: "w2",
        date: "2026-09-07",
        startedAt: "2026-09-07T18:00:00.000Z",
        series: [],
        distanceCm: 6,
      },
      {
        workoutId: "w1",
        date: "2026-09-01",
        startedAt: "2026-09-01T18:00:00.000Z",
        series: [],
        distanceCm: 8,
      },
    ];

    const summary =
      buildExercisePerformanceSummary(
        history,
        "distanceCm",
      );

    expect(summary?.latestValue).toBe(4);
    expect(summary?.bestValue).toBe(4);
    expect(summary?.firstValue).toBe(8);
    expect(summary?.progressionPercent).toBe(50);
  });

  it("gère une amélioration en cm qui passe sous zéro", () => {
    const history = [
      {
        workoutId: "w2",
        date: "2026-09-13",
        startedAt: "2026-09-13T18:00:00.000Z",
        series: [],
        distanceCm: -2,
      },
      {
        workoutId: "w1",
        date: "2026-09-01",
        startedAt: "2026-09-01T18:00:00.000Z",
        series: [],
        distanceCm: 8,
      },
    ];

    const summary =
      buildExercisePerformanceSummary(
        history,
        "distanceCm",
      );

    expect(summary?.latestValue).toBe(-2);
    expect(summary?.bestValue).toBe(-2);
    expect(summary?.firstValue).toBe(8);
    expect(summary?.progressionPercent).toBe(125);
  });
});