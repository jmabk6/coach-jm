import { describe, expect, it } from "vitest";
import type {
  Exercise,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  WorkoutSession,
} from "../../domain";
import {
  buildExerciseHistory,
  findBlockNeighbours,
  formatRpePosition,
  formatSignedPercent,
  formatSignedSeconds,
  formatSpeedOrPace,
  pickBestSeries,
  summarizeExerciseBlock,
} from "./workoutBlockDetail";

/* ------------------------------------------------------------------------ */
/* Fabrique                                                                 */
/* ------------------------------------------------------------------------ */

const T0 = "2026-09-01T10:00:00.000Z";

function exercise(id: string, name: string, extra: Partial<Exercise> = {}): Exercise {
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
    ...extra,
  } as Exercise;
}

const squatEx = exercise("squat", "Squat");

function exerciseBlock(
  id: string,
  exerciseId: string,
  series: Array<{ kg?: number; reps: number; rpe?: number; rest?: number; comparable?: boolean; done?: boolean; note?: string }>,
  extra: Partial<PerformedExerciseBlock> = {},
): PerformedExerciseBlock {
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions: {
      shape: "reps",
      sets: series.length,
      reps: { min: 8, max: 10 },
      targetRpe: { min: 7, max: 8 },
      restBetweenSetsSec: 90,
    },
    series: series.map((item, index) => ({
      id: `${id}-s${index + 1}`,
      position: index,
      status: item.done === false ? "not_performed" : "completed",
      ...(item.kg !== undefined ? { load: { kind: "total" as const, kg: item.kg } } : {}),
      reps: item.reps,
      ...(item.rpe !== undefined ? { rpe: item.rpe } : {}),
      ...(item.rest !== undefined ? { actualRestAfterSec: item.rest } : {}),
      ...(item.comparable !== undefined ? { restComparable: item.comparable } : {}),
      ...(item.note !== undefined ? { note: item.note } : {}),
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
    blocks: blocks.map((block, position) => ({ ...block, position })),
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T16:45:00.000Z`,
    ...extra,
  };
}

/** Brique sans séries : paliers ou mesure simple. */
function bareBlock(id: string, exerciseId: string, extra: Partial<PerformedExerciseBlock>): PerformedExerciseBlock {
  const block = exerciseBlock(id, exerciseId, []);
  delete block.series;
  return { ...block, ...extra };
}

const squat3 = (id: string, kg: number, rests = true) =>
  exerciseBlock(id, "squat", [
    { kg, reps: 10, rpe: 7, ...(rests ? { rest: 95 } : {}) },
    { kg, reps: 10, rpe: 8, ...(rests ? { rest: 100 } : {}) },
    { kg, reps: 9, rpe: 8 },
  ]);

/* ------------------------------------------------------------------------ */
/* Historique (Q4)                                                          */
/* ------------------------------------------------------------------------ */

describe("historique de l'exercice réellement effectué (Q4)", () => {
  const dates = ["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29", "2026-09-05", "2026-09-12"];
  const past = dates.map((date, index) => workout(`w-${date}`, date, [squat3(`sq-${index}`, 30 + index * 2)]));
  const current = workout("w-now", "2026-09-17", [squat3("sq-now", 50)]);

  it("garde les cinq dernières, la plus récente d'abord, la séance courante exclue", () => {
    const history = buildExerciseHistory("squat", [...past, current], "w-now", squatEx);

    expect(history.map((entry) => entry.date)).toEqual([
      "2026-09-12",
      "2026-09-05",
      "2026-08-29",
      "2026-08-22",
      "2026-08-15",
    ]);
    expect(history[0]).toMatchObject({
      workoutId: "w-2026-09-12",
      label: "42 kg × 10",
      volumeKg: 42 * 29,
      seriesCount: 3,
      complete: true,
    });
  });

  it("est vide sans réalisation antérieure, et ignore une séance en cours", () => {
    expect(buildExerciseHistory("squat", [current], "w-now", squatEx)).toEqual([]);
    expect(
      buildExerciseHistory(
        "squat",
        [current, { ...past[0]!, status: "in_progress" }],
        "w-now",
        squatEx,
      ),
    ).toEqual([]);
  });

  it("alimente le remplaçant après substitution, jamais l'exercice prévu, y compris dans un groupe", () => {
    const substituted = workout("w-sub", "2026-09-10", [
      { ...squat3("sq-sub", 60), exerciseId: "fentes", originalExerciseId: "squat" },
    ]);
    const group: PerformedGroupBlock = {
      id: "g",
      kind: "group",
      position: 0,
      addedDuringWorkout: false,
      status: "performed",
      plannedRounds: 2,
      plannedRestBetweenRoundsSec: 60,
      children: [{ id: "c1", position: 0, exerciseId: "squat", snapshotInstructions: { shape: "reps", reps: { min: 8, max: 10 } } }],
      rounds: [
        { id: "r1", roundNumber: 1, status: "completed", children: [{ id: "r1c1", groupChildId: "c1", exerciseId: "squat", load: { kind: "total", kg: 20 }, reps: 10, completedAt: T0 }], completedAt: T0 },
        { id: "r2", roundNumber: 2, status: "completed", children: [{ id: "r2c1", groupChildId: "c1", exerciseId: "fentes", load: { kind: "total", kg: 12 }, reps: 12, completedAt: T0 }], completedAt: T0 },
      ],
    };
    const grouped = workout("w-grp", "2026-09-11", [group]);

    const fentes = buildExerciseHistory("fentes", [substituted, grouped], undefined, undefined);
    expect(fentes.map((entry) => [entry.date, entry.label])).toEqual([
      ["2026-09-11", "12 kg × 12"],
      ["2026-09-10", "60 kg × 10"],
    ]);
    /* Le squat prévu mais remplacé n'apparaît pas ; dans le groupe, seul le tour 1 le compte. */
    const squat = buildExerciseHistory("squat", [substituted, grouped], undefined, squatEx);
    expect(squat).toHaveLength(1);
    expect(squat[0]).toMatchObject({ date: "2026-09-11", seriesCount: 1, complete: false });
  });

  it("signale une réalisation partielle et lit mesures simples et paliers", () => {
    const partial = workout("w-part", "2026-09-10", [
      exerciseBlock("sq-part", "squat", [{ kg: 40, reps: 10 }, { kg: 40, reps: 10, done: false }]),
    ]);
    const marche = workout("w-marche", "2026-09-09", [
      bareBlock("m", "marche", {
        snapshotInstructions: { shape: "duration_distance" },
        simpleMeasurement: { durationSec: 3600, distanceKm: 7, note: "Plat" },
      }),
    ]);
    const tapis = workout("w-tapis", "2026-09-08", [
      bareBlock("t", "tapis", {
        snapshotInstructions: { shape: "steps", steps: [] },
        cardioSteps: [
          { id: "p1", position: 0, status: "completed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 0 }, bpm: 110 },
          { id: "p2", position: 1, status: "completed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 5 } },
        ],
      }),
    ]);

    expect(buildExerciseHistory("squat", [partial], undefined, squatEx)[0]).toMatchObject({
      label: "40 kg × 10",
      seriesCount: 1,
      complete: false,
    });
    expect(buildExerciseHistory("marche", [marche], undefined, undefined)[0]).toMatchObject({
      label: "60 min · 7 km",
      seriesCount: 0,
      complete: true,
    });
    expect(buildExerciseHistory("tapis", [tapis], undefined, undefined)[0]).toMatchObject({
      label: "2 paliers · 10 min · 110 bpm moy.",
    });
  });

  it("retient la meilleure série : charge × reps, sinon reps, sinon durée", () => {
    expect(
      pickBestSeries([
        { id: "a", position: 0, status: "completed", load: { kind: "total", kg: 40 }, reps: 10 },
        { id: "b", position: 1, status: "completed", load: { kind: "total", kg: 42.5 }, reps: 10 },
        { id: "c", position: 2, status: "completed", load: { kind: "total", kg: 45 }, reps: 8 },
      ])?.id,
    ).toBe("b");
    expect(
      pickBestSeries([
        { id: "a", position: 0, status: "completed", reps: 12 },
        { id: "b", position: 1, status: "completed", reps: 15 },
      ])?.id,
    ).toBe("b");
    expect(
      pickBestSeries([
        { id: "a", position: 0, status: "completed", durationSec: 30 },
        { id: "b", position: 1, status: "completed", durationSec: 45 },
      ])?.id,
    ).toBe("b");
    expect(pickBestSeries([])).toBeUndefined();
  });
});

/* ------------------------------------------------------------------------ */
/* Résumé confronté au prévu                                                */
/* ------------------------------------------------------------------------ */

describe("résumé d'un exercice en séries", () => {
  const previous = buildExerciseHistory("squat", [workout("w-prev", "2026-09-10", [squat3("sq-prev", 40)])], undefined, squatEx);

  it("confronte séries, volume, RPE et repos au prévu quand la comparaison s'applique", () => {
    const summary = summarizeExerciseBlock(squat3("sq", 44), squatEx, previous);

    expect(summary).toMatchObject({
      kind: "series",
      seriesDone: 3,
      seriesPlanned: 3,
      volumeKg: 44 * 29,
      volumeVsLast: { previousDate: "2026-09-10", previousVolumeKg: 40 * 29, deltaPercent: 10 },
      rpe: { value: (7 + 8 + 8) / 3, count: 3, total: 3, target: { min: 7, max: 8 }, position: "within" },
      rest: { averageSec: 98, comparableCount: 2, totalCount: 2, plannedSec: 90, deltaSec: 8 },
      plannedLine: "8–10 reps · RPE 7–8 · Repos 1 min 30",
    });
    expect(formatSignedSeconds(8)).toBe("+8 s");
    expect(formatSignedSeconds(-12)).toBe("−12 s");
    expect(formatSignedSeconds(0)).toBe("= prévu");
    expect(formatSignedPercent(10)).toBe("+10 %");
    expect(formatSignedPercent(0)).toBe("=");
  });

  it("ne compare pas le volume sans référence pertinente : exercice partiel, autre nombre de séries, référence partielle ou absente", () => {
    const partial = exerciseBlock("sq", "squat", [{ kg: 44, reps: 10 }, { kg: 44, reps: 10 }, { kg: 44, reps: 10, done: false }]);
    const partialSummary = summarizeExerciseBlock(partial, squatEx, previous);
    expect(partialSummary).toMatchObject({ kind: "series", seriesDone: 2, seriesPlanned: 3, volumeKg: 880 });
    expect(partialSummary.kind === "series" && partialSummary.volumeVsLast).toBeUndefined();

    const fourSeries = exerciseBlock("sq", "squat", [{ kg: 44, reps: 10 }, { kg: 44, reps: 10 }, { kg: 44, reps: 10 }, { kg: 44, reps: 10 }]);
    const four = summarizeExerciseBlock(fourSeries, squatEx, previous);
    expect(four.kind === "series" && four.volumeVsLast).toBeUndefined();

    /* Référence arrêtée en cours : ses séries validées existent, mais elle
       n'est pas complète — pas de pourcentage. */
    const partialReference = buildExerciseHistory(
      "squat",
      [workout("w-prev", "2026-09-10", [exerciseBlock("sq-prev", "squat", [{ kg: 40, reps: 10 }, { kg: 40, reps: 10 }, { kg: 40, reps: 10, done: false }])])],
      undefined,
      squatEx,
    );
    expect(partialReference[0]?.complete).toBe(false);
    const againstPartial = summarizeExerciseBlock(squat3("sq", 44), squatEx, partialReference);
    expect(againstPartial.kind === "series" && againstPartial.volumeVsLast).toBeUndefined();

    const none = summarizeExerciseBlock(squat3("sq", 44), squatEx, []);
    expect(none.kind === "series" && none.volumeVsLast).toBeUndefined();
  });

  it("saute une référence partielle pour prendre la dernière complète", () => {
    const history = buildExerciseHistory(
      "squat",
      [
        workout("w-part", "2026-09-12", [exerciseBlock("sq-part", "squat", [{ kg: 40, reps: 10 }, { kg: 40, reps: 10, done: false }, { kg: 40, reps: 10, done: false }])]),
        workout("w-full", "2026-09-05", [squat3("sq-full", 40)]),
      ],
      undefined,
      squatEx,
    );
    const summary = summarizeExerciseBlock(squat3("sq", 44), squatEx, history);

    expect(summary.kind === "series" && summary.volumeVsLast?.previousWorkoutId).toBe("w-full");
  });

  it("n'invente aucun prévu pour un ajout pendant la séance", () => {
    const added = exerciseBlock("add", "squat", [{ kg: 20, reps: 12, rpe: 9, rest: 60 }, { kg: 20, reps: 12, rpe: 9 }], {
      addedDuringWorkout: true,
    });
    const summary = summarizeExerciseBlock(added, squatEx, []);

    expect(summary).toEqual({
      kind: "series",
      seriesDone: 2,
      volumeKg: 480,
      rpe: { value: 9, count: 2, total: 2 },
      rest: { averageSec: 60, comparableCount: 1, totalCount: 1 },
    });
  });

  it("situe le RPE moyen par rapport à la cible", () => {
    const above = summarizeExerciseBlock(exerciseBlock("sq", "squat", [{ kg: 40, reps: 10, rpe: 9 }, { kg: 40, reps: 10, rpe: 9.5 }]), squatEx, []);
    const below = summarizeExerciseBlock(exerciseBlock("sq", "squat", [{ kg: 40, reps: 10, rpe: 6 }]), squatEx, []);
    const silent = summarizeExerciseBlock(exerciseBlock("sq", "squat", [{ kg: 40, reps: 10 }]), squatEx, []);

    expect(above.kind === "series" && above.rpe && formatRpePosition(above.rpe)).toBe("cible 7–8 · +1,3 au-dessus");
    expect(below.kind === "series" && below.rpe && formatRpePosition(below.rpe)).toBe("cible 7–8 · −1 en dessous");
    expect(silent.kind === "series" && silent.rpe).toBeUndefined();
  });

  it("exclut du repos moyen les repos non comparables, tout en les comptant", () => {
    const block = exerciseBlock("sq", "squat", [
      { kg: 40, reps: 10, rest: 90 },
      { kg: 40, reps: 10, rest: 600, comparable: false },
      { kg: 40, reps: 10 },
    ]);
    const summary = summarizeExerciseBlock(block, squatEx, []);

    expect(summary.kind === "series" && summary.rest).toEqual({
      averageSec: 90,
      comparableCount: 1,
      totalCount: 2,
      plannedSec: 90,
      deltaSec: 0,
    });
  });
});

describe("résumé d'un exercice cardio et d'une mesure simple", () => {
  it("donne durée totale, BPM avec couverture, plages de réglages et adaptations — jamais de vitesse moyenne", () => {
    const block = bareBlock("t", "tapis", {
      snapshotInstructions: { shape: "steps", steps: [] },
      cardioSteps: [
        { id: "p1", position: 0, status: "completed", settings: { durationSec: 300, speedKmh: 4.5, inclinePercent: 0 }, bpm: 112 },
        { id: "p2", position: 1, status: "completed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 5 }, bpm: 128 },
        { id: "p3", position: 2, status: "completed", settings: { durationSec: 120, speedKmh: 5, inclinePercent: 12 }, originalSettings: { durationSec: 300, speedKmh: 5, inclinePercent: 12 } },
        { id: "p4", position: 3, status: "not_performed", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 0 } },
      ],
    });

    expect(summarizeExerciseBlock(block, undefined, [])).toEqual({
      kind: "steps",
      stepsDone: 3,
      stepsPlanned: 4,
      durationSec: 720,
      bpm: { min: 112, max: 128, average: 120, count: 2, total: 3 },
      adaptations: 1,
      ranges: "4,5–5 km/h · 0–12 %",
    });
  });

  it("lit une mesure simple avec vitesse ou allure selon la fiche, et son prévu", () => {
    const base = bareBlock("m", "marche", {
      snapshotInstructions: { shape: "duration_distance", durationSec: 3600, distanceKm: 7 },
      simpleMeasurement: { durationSec: 3000, distanceKm: 7, note: "Bien" },
    });

    expect(summarizeExerciseBlock(base, exercise("marche", "Marche", { measurementType: "duration_distance", speedDisplay: "speed_kmh" }), [])).toEqual({
      kind: "simple",
      label: "50 min · 7 km",
      speed: "8,4 km/h",
      plannedLine: "60 min · 7 km",
    });
    expect(formatSpeedOrPace(3000, 7, "pace_min_km")).toBe("7:09 min/km");
    expect(formatSpeedOrPace(120, 0.5, "pace_min_500m")).toBe("2:00 min/500 m");
    expect(formatSpeedOrPace(0, 7, "speed_kmh")).toBeUndefined();

    const added = summarizeExerciseBlock({ ...base, addedDuringWorkout: true }, undefined, []);
    expect(added.kind === "simple" && added.plannedLine).toBeUndefined();
  });
});

/* ------------------------------------------------------------------------ */
/* Navigation                                                               */
/* ------------------------------------------------------------------------ */

describe("navigation précédent / suivant", () => {
  it("suit l'ordre du récapitulatif, enjambe les notes et s'arrête aux bords", () => {
    const w = workout("w", "2026-09-17", [
      squat3("a", 40),
      { id: "n", kind: "note", position: 1, addedDuringWorkout: false, text: "Hydratation" },
      squat3("b", 40),
      squat3("c", 40),
    ]);

    expect(findBlockNeighbours(w.blocks, "a")).toEqual({ next: expect.objectContaining({ id: "b" }) });
    expect(findBlockNeighbours(w.blocks, "b")).toEqual({
      previous: expect.objectContaining({ id: "a" }),
      next: expect.objectContaining({ id: "c" }),
    });
    expect(findBlockNeighbours(w.blocks, "c")).toEqual({ previous: expect.objectContaining({ id: "b" }) });
    expect(findBlockNeighbours(w.blocks, "zz")).toEqual({});
  });
});
