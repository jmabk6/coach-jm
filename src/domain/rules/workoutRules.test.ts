import { describe, expect, it } from "vitest";

import type { Exercise, PerformedBlock, PerformedSeries, SessionBlock } from "../models";
import { calculateExecutionProgress, calculateSessionDuration, calculateSuggestedLoad, isCardioStepComparable, calculateVisibleNumbering, calculateVolume, calculateZonesSummary } from "./workoutRules";

describe("calculateVolume", () => {
  it("calcule le volume avec une charge totale", () => {
    const series: PerformedSeries[] = [
      {
        id: "set-1",
        position: 0,
        status: "completed",
        load: {
          kind: "total",
          kg: 40,
        },
        reps: 10,
      },
    ];

    expect(calculateVolume(series)).toBe(400);
  });

  it("calcule le volume avec une charge par côté", () => {
    const series: PerformedSeries[] = [
      {
        id: "set-1",
        position: 0,
        status: "completed",
        load: {
          kind: "per_side",
          kgPerSide: 20,
          tareKg: 20,
        },
        reps: 10,
      },
    ];

    expect(calculateVolume(series)).toBe(600);
  });

  it("ignore une série sans charge ou sans répétitions", () => {
    const series: PerformedSeries[] = [
      {
        id: "set-1",
        position: 0,
        status: "completed",
        reps: 10,
      },
      {
        id: "set-2",
        position: 1,
        status: "completed",
        load: {
          kind: "total",
          kg: 40,
        },
      },
    ];

    expect(calculateVolume(series)).toBe(0);
  });
});

describe("calculateVisibleNumbering", () => {
  it("numérote uniquement les exercices et groupes selon leur position", () => {
    const blocks: SessionBlock[] = [
      {
        id: "note-1",
        kind: "note",
        position: 1,
        text: "Échauffement",
      },
      {
        id: "exercise-1",
        kind: "exercise",
        position: 2,
        exerciseId: "squat",
        instructions: {
          shape: "reps",
          sets: 3,
          reps: {
            min: 8,
            max: 10,
          },
          restBetweenSetsSec: 90,
        },
      },
      {
        id: "group-1",
        kind: "group",
        position: 3,
        rounds: 3,
        restBetweenRoundsSec: 120,
        children: [],
      },
      {
        id: "note-2",
        kind: "note",
        position: 4,
        text: "Retour au calme",
      },
    ];

    expect(calculateVisibleNumbering(blocks)).toEqual({
      "exercise-1": 1,
      "group-1": 2,
    });
  });
});

describe("calculateExecutionProgress", () => {
  it("ignore les notes, retire les skipped et compte les blocs ajoutés", () => {
    const blocks: PerformedBlock[] = [
      {
        id: "exercise-1",
        kind: "exercise",
        position: 0,
        addedDuringWorkout: false,
        exerciseId: "squat",
        status: "performed",
        snapshotInstructions: {
          shape: "reps",
          sets: 3,
          reps: {
            min: 8,
            max: 10,
          },
          restBetweenSetsSec: 90,
        },
      },
      {
        id: "note-1",
        kind: "note",
        position: 1,
        addedDuringWorkout: false,
        text: "Note",
      },
      {
        id: "exercise-2",
        kind: "exercise",
        position: 2,
        addedDuringWorkout: false,
        exerciseId: "rowing",
        status: "skipped",
        snapshotInstructions: {
          shape: "reps",
          sets: 3,
          reps: {
            min: 8,
            max: 10,
          },
          restBetweenSetsSec: 90,
        },
      },
      {
        id: "exercise-added",
        kind: "exercise",
        position: 3,
        addedDuringWorkout: true,
        exerciseId: "planche",
        status: "not_performed",
        snapshotInstructions: {
          shape: "duration",
          sets: 2,
          durationSec: 45,
          restBetweenSetsSec: 60,
        },
      },
    ];

    expect(calculateExecutionProgress(blocks)).toEqual({
      completed: 1,
      total: 2,
    });
  });
});

describe("calculateSessionDuration", () => {
  it("calcule uniquement les durées connues", () => {
    const blocks: SessionBlock[] = [
      {
        id: "reps-1",
        kind: "exercise",
        position: 0,
        exerciseId: "squat",
        instructions: {
          shape: "reps",
          sets: 3,
          reps: {
            min: 8,
            max: 10,
          },
          restBetweenSetsSec: 90,
        },
      },
      {
        id: "duration-1",
        kind: "exercise",
        position: 1,
        exerciseId: "planche",
        instructions: {
          shape: "duration",
          sets: 2,
          durationSec: 45,
          restBetweenSetsSec: 60,
        },
      },
      {
        id: "steps-1",
        kind: "exercise",
        position: 2,
        exerciseId: "tapis",
        instructions: {
          shape: "steps",
          steps: [
            {
              id: "step-1",
              position: 0,
              durationSec: 180,
              speedKmh: 5,
              inclinePercent: 5,
            },
            {
              id: "step-2",
              position: 1,
              durationSec: 120,
              speedKmh: 5,
              inclinePercent: 10,
            },
          ],
        },
      },
      {
        id: "group-1",
        kind: "group",
        position: 3,
        rounds: 2,
        restBetweenRoundsSec: 90,
        children: [
          {
            id: "child-1",
            position: 0,
            exerciseId: "gainage",
            instructions: {
              shape: "duration",
              durationSec: 30,
            },
          },
          {
            id: "child-2",
            position: 1,
            exerciseId: "rowing",
            instructions: {
              shape: "reps",
              reps: {
                min: 10,
                max: 12,
              },
            },
            restBeforeSec: 15,
          },
        ],
      },
    ];

    expect(calculateSessionDuration(blocks)).toBe(810);
  });

  it("n'invente aucune durée pour une distance seule", () => {
    const blocks: SessionBlock[] = [
      {
        id: "distance-1",
        kind: "exercise",
        position: 0,
        exerciseId: "course",
        instructions: {
          shape: "distance",
          distanceKm: 5,
        },
      },
    ];

    expect(calculateSessionDuration(blocks)).toBe(0);
  });

  it("calcule le volume réellement effectué par zone musculaire", () => {
    const exercises: Exercise[] = [
      {
        id: "squat",
        name: "Squat",
        category: "Musculation",
        zone: "Jambes",
        movement: "Squat",
        equipment: "Barre",
        location: "Salle",
        mode: "series",
        measurementType: "load_reps",
        status: "active",
        createdAt: "2026-09-13T10:00:00.000Z",
        updatedAt: "2026-09-13T10:00:00.000Z",
      },
      {
        id: "rowing",
        name: "Rowing",
        category: "Musculation",
        zone: "Dos",
        movement: "Tirage",
        equipment: "Poulie",
        location: "Salle",
        mode: "series",
        measurementType: "load_reps",
        status: "active",
        createdAt: "2026-09-13T10:00:00.000Z",
        updatedAt: "2026-09-13T10:00:00.000Z",
      },
    ];

    const blocks: PerformedBlock[] = [
      {
        id: "block-squat",
        kind: "exercise",
        position: 0,
        addedDuringWorkout: false,
        exerciseId: "squat",
        status: "performed",
        snapshotInstructions: {
          shape: "reps",
          sets: 2,
          reps: {
            min: 10,
            max: 10,
          },
          restBetweenSetsSec: 90,
        },
        series: [
          {
            id: "set-1",
            position: 0,
            status: "completed",
            load: {
              kind: "total",
              kg: 40,
            },
            reps: 10,
          },
          {
            id: "set-2",
            position: 1,
            status: "active",
            load: {
              kind: "total",
              kg: 50,
            },
            reps: 10,
          },
        ],
      },
      {
        id: "block-group",
        kind: "group",
        position: 1,
        addedDuringWorkout: false,
        status: "performed",
        plannedRounds: 1,
        plannedRestBetweenRoundsSec: 90,
        children: [
          {
            id: "group-child-rowing",
            position: 0,
            exerciseId: "rowing",
            snapshotInstructions: {
              shape: "reps",
              reps: {
                min: 20,
                max: 20,
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
                groupChildId: "group-child-rowing",
                exerciseId: "rowing",
                load: {
                  kind: "total",
                  kg: 30,
                },
                reps: 20,
                completedAt: "2026-09-13T10:10:00.000Z",
              },
            ],
          },
        ],
      },
    ];

    expect(calculateZonesSummary(blocks, exercises)).toEqual([
      { zone: "Jambes", volume: 400, percentage: 40 },
      { zone: "Dos", volume: 600, percentage: 60 },
      { zone: "Pecs", volume: 0, percentage: 0 },
      { zone: "Épaules", volume: 0, percentage: 0 },
      { zone: "Bras", volume: 0, percentage: 0 },
      { zone: "Core", volume: 0, percentage: 0 },
    ]);
  });
});


describe("calculateSuggestedLoad", () => {
  it("conserve la dernière charge réelle et maintient sans seuil de RPE bas", () => {
    const series: PerformedSeries[] = [
      {
        id: "set-1",
        position: 0,
        status: "completed",
        load: {
          kind: "per_side",
          kgPerSide: 20,
          tareKg: 20,
        },
        reps: 10,
        rpe: 7,
      },
    ];

    expect(
      calculateSuggestedLoad(series, { min: 10, max: 12 }),
    ).toEqual({
      referenceLoad: {
        kind: "per_side",
        kgPerSide: 20,
        tareKg: 20,
      },
      action: "maintain",
    });
  });

  it("propose une baisse si les répétitions passent sous la cible", () => {
    const series: PerformedSeries[] = [
      {
        id: "set-1",
        position: 0,
        status: "completed",
        load: {
          kind: "total",
          kg: 40,
        },
        reps: 8,
        rpe: 8,
      },
    ];

    expect(
      calculateSuggestedLoad(series, { min: 10, max: 12 }),
    ).toEqual({
      referenceLoad: {
        kind: "total",
        kg: 40,
      },
      action: "decrease",
    });
  });

  it("propose une baisse si le RPE est de 9 ou 10", () => {
    const series: PerformedSeries[] = [
      {
        id: "set-1",
        position: 0,
        status: "completed",
        load: {
          kind: "total",
          kg: 40,
        },
        reps: 10,
        rpe: 9,
      },
    ];

    expect(
      calculateSuggestedLoad(series, { min: 10, max: 12 }),
    ).toEqual({
      referenceLoad: {
        kind: "total",
        kg: 40,
      },
      action: "decrease",
    });
  });

  it("propose une hausse uniquement avec un seuil explicite de RPE bas", () => {
    const series: PerformedSeries[] = [
      {
        id: "set-1",
        position: 0,
        status: "completed",
        load: {
          kind: "total",
          kg: 40,
        },
        reps: 12,
        rpe: 6,
      },
    ];

    expect(
      calculateSuggestedLoad(
        series,
        { min: 10, max: 12 },
        { lowRpeMax: 6 },
      ),
    ).toEqual({
      referenceLoad: {
        kind: "total",
        kg: 40,
      },
      action: "increase",
    });
  });
});


describe("isCardioStepComparable", () => {
  it("considère comparables deux paliers de mêmes réglages avec une durée dans ±10 %", () => {
    expect(
      isCardioStepComparable(
        {
          durationSec: 300,
          speedKmh: 5,
          inclinePercent: 10,
        },
        {
          durationSec: 330,
          speedKmh: 5,
          inclinePercent: 10,
        },
      ),
    ).toBe(true);

    expect(
      isCardioStepComparable(
        {
          durationSec: 300,
          speedKmh: 5,
          inclinePercent: 10,
        },
        {
          durationSec: 270,
          speedKmh: 5,
          inclinePercent: 10,
        },
      ),
    ).toBe(true);
  });

  it("refuse une durée hors de la tolérance de ±10 %", () => {
    expect(
      isCardioStepComparable(
        {
          durationSec: 300,
          speedKmh: 5,
          inclinePercent: 10,
        },
        {
          durationSec: 331,
          speedKmh: 5,
          inclinePercent: 10,
        },
      ),
    ).toBe(false);
  });

  it("refuse une vitesse ou une pente différente", () => {
    expect(
      isCardioStepComparable(
        {
          durationSec: 300,
          speedKmh: 5,
          inclinePercent: 10,
        },
        {
          durationSec: 300,
          speedKmh: 5.5,
          inclinePercent: 10,
        },
      ),
    ).toBe(false);

    expect(
      isCardioStepComparable(
        {
          durationSec: 300,
          speedKmh: 5,
          inclinePercent: 10,
        },
        {
          durationSec: 300,
          speedKmh: 5,
          inclinePercent: 12,
        },
      ),
    ).toBe(false);
  });
});
