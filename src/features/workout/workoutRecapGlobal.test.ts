import { describe, expect, it } from "vitest";
import type {
  Exercise,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import {
  buildWorkoutRecapLines,
  compareVolumeToPrevious,
  countPlannedSeries,
  formatPause,
  formatSeconds,
  isVolumePerimeterIntact,
  splitRecapLines,
  summarizeWorkout,
} from "./workoutRecap";

/* ------------------------------------------------------------------------ */
/* Fabrique                                                                 */
/* ------------------------------------------------------------------------ */

const T0 = "2026-09-01T10:00:00.000Z";

function exercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    category: "Musculation",
    zone: "Jambes",
    movement: "Squat",
    equipment: "Barre",
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
  };
}

const exerciseById = new Map(
  [exercise("squat", "Squat"), exercise("fentes", "Fentes"), exercise("crunch", "Crunch"), exercise("pompes", "Pompes")].map(
    (item) => [item.id, item],
  ),
);

const template: SessionTemplate = {
  id: "muscu-a",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [
    {
      id: "t-sq",
      kind: "exercise",
      position: 0,
      exerciseId: "squat",
      instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 90 },
    },
    {
      id: "t-cr",
      kind: "exercise",
      position: 1,
      exerciseId: "crunch",
      instructions: { shape: "reps", sets: 2, reps: { min: 15, max: 20 }, restBetweenSetsSec: 60 },
    },
  ],
  createdAt: T0,
  updatedAt: T0,
};

function exerciseBlock(
  id: string,
  position: number,
  exerciseId: string,
  series: Array<{ kg: number; reps: number; rpe?: number; rest?: number; comparable?: boolean; done?: boolean }>,
  extra: Partial<PerformedExerciseBlock> = {},
): PerformedExerciseBlock {
  return {
    id,
    kind: "exercise",
    position,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions: {
      shape: "reps",
      sets: series.length,
      reps: { min: 8, max: 10 },
      restBetweenSetsSec: 90,
    },
    series: series.map((item, index) => ({
      id: `${id}-s${index + 1}`,
      position: index,
      status: item.done === false ? "not_performed" : "completed",
      load: { kind: "total", kg: item.kg },
      reps: item.reps,
      ...(item.rpe !== undefined ? { rpe: item.rpe } : {}),
      ...(item.rest !== undefined ? { actualRestAfterSec: item.rest } : {}),
      ...(item.comparable !== undefined ? { restComparable: item.comparable } : {}),
    })),
    ...extra,
  };
}

function groupBlock(id: string, position: number, extra: Partial<PerformedGroupBlock> = {}): PerformedGroupBlock {
  return {
    id,
    kind: "group",
    position,
    addedDuringWorkout: false,
    status: "performed",
    name: "Circuit",
    plannedRounds: 2,
    plannedRestBetweenRoundsSec: 120,
    children: [
      { id: `${id}-c1`, position: 0, exerciseId: "fentes", snapshotInstructions: { shape: "reps", reps: { min: 10, max: 12 } } },
      { id: `${id}-c2`, position: 1, exerciseId: "pompes", snapshotInstructions: { shape: "reps", reps: { min: 10, max: 12 } } },
    ],
    rounds: [1, 2].map((roundNumber) => ({
      id: `${id}-r${roundNumber}`,
      roundNumber,
      status: "completed",
      children: [
        {
          id: `${id}-r${roundNumber}-c1`,
          groupChildId: `${id}-c1`,
          exerciseId: "fentes",
          load: { kind: "total", kg: 20 },
          reps: 10,
          completedAt: T0,
        },
        {
          id: `${id}-r${roundNumber}-c2`,
          groupChildId: `${id}-c2`,
          exerciseId: "pompes",
          reps: 12,
          /* Repos intra-tour : jamais dans le repos moyen classique. */
          actualRestBeforeSec: 30,
          completedAt: T0,
        },
      ],
      actualRestAfterSec: 120,
      completedAt: T0,
    })),
    ...extra,
  };
}

function workout(id: string, date: string, blocks: PerformedBlock[], extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    sessionTemplateId: "muscu-a",
    source: "planned",
    status: "completed",
    date,
    startedAt: `${date}T16:00:00.000Z`,
    lastActionAt: `${date}T16:45:00.000Z`,
    completedAt: `${date}T16:45:00.000Z`,
    activeDurationSec: 2400,
    blocks,
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T16:45:00.000Z`,
    ...extra,
  };
}

function stripTemplate(item: WorkoutSession): WorkoutSession {
  const copy = { ...item };
  delete copy.sessionTemplateId;
  return copy;
}

const squat = (id: string, kg = 40) =>
  exerciseBlock(id, 0, "squat", [
    { kg, reps: 10, rpe: 7, rest: 95 },
    { kg, reps: 10, rpe: 8, rest: 100 },
    { kg, reps: 9, rpe: 8 },
  ]);
const crunch = (id: string) =>
  exerciseBlock(id, 1, "crunch", [
    { kg: 0, reps: 20, rest: 60 },
    { kg: 0, reps: 18 },
  ]);

/* ------------------------------------------------------------------------ */
/* Cartes de tête                                                           */
/* ------------------------------------------------------------------------ */

describe("récapitulatif global — cartes de tête (§14)", () => {
  it("compte les séries réalisées sur les séries attendues, tours de groupe compris, briques sautées exclues", () => {
    const blocks: PerformedBlock[] = [
      squat("sq"),
      exerciseBlock("cr", 1, "crunch", [{ kg: 0, reps: 20 }, { kg: 0, reps: 18, done: false }]),
      groupBlock("g", 2),
      exerciseBlock("sk", 3, "pompes", [{ kg: 0, reps: 10 }], { status: "skipped" }),
    ];
    const head = summarizeWorkout(workout("w", "2026-09-10", blocks));

    expect(countPlannedSeries(blocks)).toBe(3 + 2 + 2 * 2);
    expect(head.seriesPlanned).toBe(9);
    expect(head.seriesDone).toBe(3 + 1 + 4);
    /* Le volume additionne exercices et enfants de tours : 40×29 + 20×10×2. */
    expect(head.volumeKg).toBe(40 * 29 + 400);
  });

  it("calcule le repos moyen sur les seuls repos comparables, avec le prévu, sans les repos intra-tour", () => {
    const blocks: PerformedBlock[] = [
      exerciseBlock("sq", 0, "squat", [
        { kg: 40, reps: 10, rest: 90 },
        { kg: 40, reps: 10, rest: 120 },
        /* Repos coupé par la pause : compté, jamais moyenné. */
        { kg: 40, reps: 10, rest: 400, comparable: false },
      ]),
      groupBlock("g", 1),
    ];
    const head = summarizeWorkout(workout("w", "2026-09-10", blocks));

    /* 90, 120 (séries) + 120, 120 (tours) ; le 400 et les deux « repos
       avant Pompes » de 30 s ne pèsent pas. */
    expect(head.rest).toEqual({
      averageSec: Math.round((90 + 120 + 120 + 120) / 4),
      comparableCount: 4,
      totalCount: 5,
      plannedAverageSec: (90 + 90 + 120 + 120) / 4,
    });
  });

  it("affiche les durées de repos lisiblement, sans toucher aux secondes stockées", () => {
    expect(formatSeconds(45)).toBe("45 s");
    expect(formatSeconds(120)).toBe("2 min");
    expect(formatSeconds(345)).toBe("5 min 45 s");
    expect(formatSeconds(95)).toBe("1 min 35 s");
  });

  it("n'a pas de repos moyen quand aucun repos n'est comparable", () => {
    const head = summarizeWorkout(
      workout("w", "2026-09-10", [exerciseBlock("sq", 0, "squat", [{ kg: 40, reps: 10, rest: 500, comparable: false }])]),
    );

    expect(head.rest.averageSec).toBeUndefined();
    expect(head.rest.totalCount).toBe(1);
  });

  it("prend la durée prévue dans les consignes du modèle, jamais pour une séance libre (Q2)", () => {
    const planned = summarizeWorkout(workout("w", "2026-09-10", [squat("sq")]), template);
    const free = summarizeWorkout(
      workout("f", "2026-09-10", [squat("sq")], { source: "free" }),
      template,
    );
    const withoutTemplate = summarizeWorkout(stripTemplate(workout("l", "2026-09-10", [squat("sq")], { source: "free" })));

    expect(planned.plannedDurationSec).toBeGreaterThan(0);
    /* Séance supplémentaire depuis un modèle : le modèle donne bien un prévu. */
    expect(free.plannedDurationSec).toBe(planned.plannedDurationSec);
    expect(withoutTemplate.plannedDurationSec).toBeUndefined();
  });

  it("liste les pauses explicites terminées et compte les ajouts", () => {
    const head = summarizeWorkout(
      workout("w", "2026-09-10", [squat("sq"), exerciseBlock("add", 1, "pompes", [{ kg: 0, reps: 10 }], { addedDuringWorkout: true })], {
        pauses: [
          { id: "p1", startedAt: "2026-09-10T16:20:00.000Z", endedAt: "2026-09-10T16:28:00.000Z" },
          { id: "p2", startedAt: "2026-09-10T16:40:00.000Z" },
        ],
      }),
    );

    expect(head.pauses.map((pause) => pause.id)).toEqual(["p1"]);
    expect(formatPause(head.pauses[0]!)).toMatch(/^Pause \d{2}:\d{2} – \d{2}:\d{2} · 8 min, non comptée dans la durée active$/);
    expect(
      formatPause({ id: "p", startedAt: "2026-09-10T16:20:00.000Z", endedAt: "2026-09-10T16:20:40.000Z" }),
    ).toContain("· 40 s,");
    expect(head.added).toBe(1);
  });
});

/* ------------------------------------------------------------------------ */
/* Volume vs dernière fois (Q1)                                             */
/* ------------------------------------------------------------------------ */

describe("volume vs dernière fois (Q1)", () => {
  const previous = workout("w-03", "2026-09-03", [squat("sq", 40), crunch("cr")]);
  const current = workout("w-10", "2026-09-10", [squat("sq", 44), crunch("cr")]);

  it("compare à la dernière réalisation terminée du même modèle quand les deux périmètres sont intacts", () => {
    const older = workout("w-01", "2026-08-20", [squat("sq", 30), crunch("cr")]);
    const later = workout("w-17", "2026-09-17", [squat("sq", 50), crunch("cr")]);
    const otherTemplate = workout("w-09", "2026-09-09", [squat("sq", 10)], { sessionTemplateId: "muscu-b" });

    expect(compareVolumeToPrevious(current, [older, later, otherTemplate, previous, current])).toEqual({
      previousWorkoutId: "w-03",
      previousDate: "2026-09-03",
      previousVolumeKg: 40 * 29,
      deltaPercent: 10,
    });
  });

  it("ne compare pas une séance libre sans modèle, ni sans réalisation antérieure", () => {
    expect(compareVolumeToPrevious(stripTemplate(current), [previous])).toBeUndefined();
    expect(compareVolumeToPrevious(current, [current])).toBeUndefined();
  });

  it("ne compare pas quand un exercice est ajouté, sauté, non réalisé ou remplacé — dans l'une ou l'autre séance", () => {
    const added = workout("w-10", "2026-09-10", [
      squat("sq", 44),
      crunch("cr"),
      exerciseBlock("add", 2, "pompes", [{ kg: 0, reps: 10 }], { addedDuringWorkout: true }),
    ]);
    const skipped = workout("w-10", "2026-09-10", [squat("sq", 44), { ...crunch("cr"), status: "skipped" }]);
    const notPerformed = workout("w-10", "2026-09-10", [squat("sq", 44), { ...crunch("cr"), status: "not_performed" }]);
    const substituted = workout("w-10", "2026-09-10", [
      { ...squat("sq", 44), exerciseId: "fentes", originalExerciseId: "squat" },
      crunch("cr"),
    ]);

    expect(isVolumePerimeterIntact(current)).toBe(true);
    for (const broken of [added, skipped, notPerformed, substituted]) {
      expect(isVolumePerimeterIntact(broken)).toBe(false);
      expect(compareVolumeToPrevious(broken, [previous])).toBeUndefined();
    }

    /* Périmètre cassé du côté de la dernière fois : pas de pourcentage non plus. */
    expect(compareVolumeToPrevious(current, [{ ...previous, blocks: added.blocks }])).toBeUndefined();
  });

  it("voit la substitution d'un enfant de groupe à partir d'un tour", () => {
    const group = groupBlock("g", 0);
    const substitutedGroup: PerformedGroupBlock = {
      ...group,
      rounds: group.rounds.map((round, index) =>
        index === 0
          ? round
          : { ...round, children: round.children.map((child) => (child.groupChildId === "g-c2" ? { ...child, exerciseId: "crunch" } : child)) },
      ),
    };

    expect(isVolumePerimeterIntact(workout("a", "2026-09-10", [group]))).toBe(true);
    expect(isVolumePerimeterIntact(workout("b", "2026-09-10", [substitutedGroup]))).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
/* Tableau : prévu puis ajouts                                              */
/* ------------------------------------------------------------------------ */

describe("tableau par brique et ajouts pendant la séance", () => {
  it("numérote les briques prévues puis les ajouts à la suite, dans une section à part", () => {
    const blocks: PerformedBlock[] = [
      squat("sq"),
      exerciseBlock("add-1", 1, "pompes", [{ kg: 0, reps: 10 }], { addedDuringWorkout: true }),
      { id: "n", kind: "note" as const, position: 2, addedDuringWorkout: false, text: "Bien s'hydrater" },
      crunch("cr"),
      groupBlock("g", 4, { addedDuringWorkout: true }),
    ].map((block, position) => ({ ...block, position }));

    const { planned, added } = splitRecapLines(buildWorkoutRecapLines(workout("w", "2026-09-10", blocks), exerciseById));

    expect(planned.map((line) => [line.number, line.name])).toEqual([
      ["1", "Squat"],
      ["", "Note"],
      ["2", "Crunch"],
    ]);
    expect(added.map((line) => [line.number, line.name])).toEqual([
      ["3", "Pompes"],
      ["4", "Circuit"],
    ]);

    /* Séance libre sans modèle : tout est ajouté, rien à séparer. */
    const free = splitRecapLines(buildWorkoutRecapLines(workout("w", "2026-09-10", blocks), exerciseById), false);
    expect(free.added).toEqual([]);
    expect(free.planned.map((line) => line.number)).toEqual(["1", "2", "", "3", "4"]);
  });

  it("donne au groupe ses tours, son volume et son RPE, et signale les remplacements", () => {
    const group = groupBlock("g", 0);
    const withRpe: PerformedGroupBlock = {
      ...group,
      rounds: group.rounds.map((round) => ({
        ...round,
        children: round.children.map((child) => ({ ...child, rpe: 8 })),
      })),
    };
    const [line] = buildWorkoutRecapLines(workout("w", "2026-09-10", [withRpe]), exerciseById);

    expect(line?.subtitle).toBe("2 tours sur 2 · 2 exercices");
    expect(line?.volumeKg).toBe(400);
    expect(line?.rpe).toBe(8);

    const substituted: PerformedGroupBlock = {
      ...group,
      rounds: group.rounds.map((round) => ({
        ...round,
        children: round.children.map((child) => (child.groupChildId === "g-c2" ? { ...child, exerciseId: "crunch" } : child)),
      })),
    };
    expect(buildWorkoutRecapLines(workout("w", "2026-09-10", [substituted]), exerciseById)[0]?.subtitle).toBe(
      "2 tours sur 2 · 2 exercices · 1 remplacé",
    );
  });
});
