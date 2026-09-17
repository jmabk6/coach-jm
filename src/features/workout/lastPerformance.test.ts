import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import { findLastComparableStep, findLastPerformances } from "./lastPerformance";
import { formatCardioSettingsLine } from "./workoutRecap";
import {
  calculatePerformedNumbering,
  describeNextUp,
  formatExerciseSubtitle,
  formatMmSs,
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

describe("carte de repos : chrono et bloc Ensuite", () => {
  const block = squatOld.blocks[0] as Extract<WorkoutSession["blocks"][number], { kind: "exercise" }>;
  const exerciseById = new Map([
    ["squat", { id: "squat", name: "Squat barre" } as never],
    ["crunch", { id: "crunch", name: "Crunch" } as never],
  ]);
  const rest = {
    id: "r",
    kind: "between_sets" as const,
    startedAt: "2026-09-17T10:00:00.000Z",
    targetEndAt: "2026-09-17T10:01:30.000Z",
    plannedDurationSec: 90,
    afterBlockId: "squat-block",
    afterEntryId: "s1",
  };

  it("formate un décompte en minutes:secondes, jamais négatif", () => {
    expect(formatMmSs(0)).toBe("0:00");
    expect(formatMmSs(65)).toBe("1:05");
    expect(formatMmSs(727)).toBe("12:07");
    expect(formatMmSs(-12)).toBe("0:00");
  });

  it("annonce la série suivante du même exercice avec la cible et la proposition", () => {
    const running = workout("w", "2026-09-17", [
      {
        ...block,
        id: "squat-block",
        status: "not_performed",
        series: [
          { id: "s1", position: 0, status: "completed", load: { kind: "total", kg: 40 }, reps: 10 },
          { id: "s2", position: 1, status: "active" },
        ],
      },
    ], "in_progress");

    expect(
      describeNextUp(
        { ...running, currentBlockId: "squat-block", activeRest: rest },
        exerciseById,
        () => ({ load: { kind: "total", kg: 40 }, reps: 10 }),
      ),
    ).toEqual({ title: "Série 2", detail: "8–10 reps · proposé 40 kg × 10" });
  });

  it("annonce la brique suivante quand l'exercice est terminé", () => {
    const running = workout("w", "2026-09-17", [
      { ...block, id: "squat-block", status: "performed" },
      {
        ...block,
        id: "crunch-block",
        position: 1,
        exerciseId: "crunch",
        status: "not_performed",
        addedDuringWorkout: true,
        series: [{ id: "c1", position: 0, status: "active" }],
      },
    ], "in_progress");

    expect(
      describeNextUp(
        { ...running, currentBlockId: "crunch-block", activeRest: rest },
        exerciseById,
        () => ({}),
      ),
    ).toEqual({ title: "Crunch — Série 1" });
  });

  it("laisse le choix sur une brique sans nombre prévu entièrement validée", () => {
    const running = workout("w", "2026-09-17", [
      {
        ...block,
        id: "squat-block",
        status: "not_performed",
        addedDuringWorkout: true,
        series: [{ id: "s1", position: 0, status: "completed", reps: 10 }],
      },
    ], "in_progress");

    expect(
      describeNextUp(
        { ...running, currentBlockId: "squat-block", activeRest: rest },
        exerciseById,
        () => ({}),
      ),
    ).toEqual({ title: "À toi de choisir", detail: "Ajouter une série, ou Terminer l'exercice" });
  });

  it("ne dit rien sans repos en cours", () => {
    expect(describeNextUp(workout("w", "2026-09-17", []), exerciseById, () => ({}))).toBeUndefined();
  });
});

describe("paliers : dernière fois comparable et réglages", () => {
  const tapis = workout("w-tapis", "2026-09-09", [
    {
      id: "t",
      kind: "exercise",
      position: 0,
      addedDuringWorkout: false,
      exerciseId: "tapis",
      status: "performed",
      snapshotInstructions: { shape: "steps", steps: [] },
      cardioSteps: [
        { id: "p1", position: 0, status: "completed", settings: { durationSec: 300, speedKmh: 4.5, inclinePercent: 0 }, bpm: 79 },
        { id: "p2", position: 1, status: "completed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 5 }, bpm: 106 },
        { id: "p3", position: 2, status: "completed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 10 }, bpm: 139 },
        { id: "p4", position: 3, status: "completed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 10 }, bpm: 138 },
      ],
    },
  ]);

  it("retrouve le dernier palier aux mêmes réglages, pas celui de même rang", () => {
    const last = findLastComparableStep(
      "tapis",
      { durationSec: 300, speedKmh: 5, inclinePercent: 10 },
      [tapis],
    );

    expect(last?.step.id).toBe("p4");
    expect(last?.step.bpm).toBe(138);
    expect(last?.date).toBe("2026-09-09");
  });

  it("tolère une durée proche mais pas d'autres réglages", () => {
    expect(
      findLastComparableStep("tapis", { durationSec: 320, speedKmh: 5, inclinePercent: 5 }, [tapis])?.step.id,
    ).toBe("p2");
    expect(
      findLastComparableStep("tapis", { durationSec: 300, speedKmh: 5, inclinePercent: 12 }, [tapis]),
    ).toBeUndefined();
    expect(
      findLastComparableStep("tapis", { durationSec: 120, speedKmh: 5, inclinePercent: 10 }, [tapis]),
    ).toBeUndefined();
  });

  it("ignore la séance en cours", () => {
    expect(
      findLastComparableStep("tapis", { durationSec: 300, speedKmh: 5, inclinePercent: 10 }, [tapis], "w-tapis"),
    ).toBeUndefined();
  });

  it("écrit les réglages sans arrondir la durée", () => {
    expect(formatCardioSettingsLine({ durationSec: 90, speedKmh: 5, inclinePercent: 12 })).toBe(
      "1 min 30 · 5 km/h · 12 %",
    );
    expect(formatCardioSettingsLine({ durationSec: 600, distanceKm: 1.2 })).toBe("10 min · 1,2 km");
  });
});
