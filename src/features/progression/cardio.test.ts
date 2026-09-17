import { describe, expect, it } from "vitest";
import type { Exercise, PerformedBlock, PerformedCardioStep, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import {
  averageBpm,
  buildCardioExerciseReport,
  buildCardioReport,
  buildDurationComparableTrend,
  cardioKindOf,
  formatRange,
  formatStepGroupLabel,
  groupComparableSteps,
  isDurationComparable,
  listCardioRealisations,
  median,
} from "./cardio";
import { buildEstablishedDataset } from "./fixtures/establishedDataset";
import { describeWorkoutCardio, getCardioSummary } from "./overview";
import { resolvePeriod } from "./period";

/* ------------------------------------------------------------------------ */
/* Fabrique                                                                 */
/* ------------------------------------------------------------------------ */

const TODAY = "2026-09-17";
const T0 = "2026-01-01T00:00:00.000Z";
const period = resolvePeriod("12w", TODAY);

function exercise(id: string, name: string, extra: Partial<Exercise>): Exercise {
  return {
    id,
    name,
    category: "Cardio",
    equipment: "Tapis",
    location: "Salle",
    mode: "steps",
    measurementType: "duration_speed_incline",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  } as Exercise;
}

const tapis = exercise("tapis", "Tapis de course", {});
const velo = exercise("velo", "Vélo", { mode: "simple", measurementType: "duration_distance", speedDisplay: "speed_kmh" });
const course = exercise("course", "Course", { mode: "simple", measurementType: "duration_distance", speedDisplay: "pace_min_km" });
const marche = exercise("marche", "Marche", { mode: "simple", measurementType: "distance" });
const doigts = exercise("doigts", "Doigts-sol", { category: "Test mobilité", mode: "simple", measurementType: "distance_cm" });
const squat = exercise("squat", "Squat", { category: "Musculation", mode: "series", measurementType: "load_reps" });
const exercises = [tapis, velo, course, marche, doigts, squat];

let counter = 0;

type StepSpec = { sec: number; kmh: number; incline: number; bpm?: number; original?: { sec: number; kmh: number; incline: number }; done?: boolean };

function stepsBlock(exerciseId: string, steps: StepSpec[]): PerformedExerciseBlock {
  const id = `b${++counter}`;
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions: { shape: "steps", steps: [] },
    cardioSteps: steps.map((step, index): PerformedCardioStep => ({
      id: `${id}-p${index}`,
      position: index,
      status: step.done === false ? "not_performed" : "completed",
      settings: { durationSec: step.sec, speedKmh: step.kmh, inclinePercent: step.incline },
      ...(step.bpm !== undefined ? { bpm: step.bpm } : {}),
      ...(step.original
        ? { originalSettings: { durationSec: step.original.sec, speedKmh: step.original.kmh, inclinePercent: step.original.incline } }
        : {}),
    })),
  };
}

function simpleBlock(exerciseId: string, measure: { durationSec?: number; distanceKm?: number; bpm?: number; distanceCm?: number }): PerformedExerciseBlock {
  return {
    id: `b${++counter}`,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions: { shape: "duration_distance" },
    simpleMeasurement: measure,
  };
}

function workout(id: string, date: string, blocks: PerformedBlock[]): WorkoutSession {
  return {
    id,
    source: "free",
    status: "completed",
    date,
    startedAt: `${date}T17:00:00.000Z`,
    lastActionAt: `${date}T17:40:00.000Z`,
    completedAt: `${date}T17:40:00.000Z`,
    activeDurationSec: 2400,
    blocks: blocks.map((block, position) => ({ ...block, position })),
    createdAt: `${date}T17:00:00.000Z`,
    updatedAt: `${date}T17:40:00.000Z`,
  };
}

const ride = (id: string, date: string, durationSec: number, distanceKm: number, bpm?: number) =>
  workout(id, date, [simpleBlock("velo", { durationSec, distanceKm, ...(bpm !== undefined ? { bpm } : {}) })]);

/* ------------------------------------------------------------------------ */
/* Périmètre et réalisations                                                */
/* ------------------------------------------------------------------------ */

describe("périmètre cardio", () => {
  it("classe paliers, durée + distance et distance seule ; exclut séries et tests en centimètres", () => {
    expect(cardioKindOf(tapis)).toBe("steps");
    expect(cardioKindOf(velo)).toBe("duration_distance");
    expect(cardioKindOf(marche)).toBe("distance");
    expect(cardioKindOf(doigts)).toBeUndefined();
    expect(cardioKindOf(squat)).toBeUndefined();
  });

  it("un test de mobilité en centimètres n'est pas une séance contenant du cardio, ni ici ni en Vue générale", () => {
    const test = workout("t", "2026-09-01", [simpleBlock("doigts", { distanceCm: 4 })]);
    const exerciseById = new Map(exercises.map((item) => [item.id, item]));

    expect(describeWorkoutCardio(test, exerciseById)).toEqual({ durationSec: 0, present: false });
    expect(getCardioSummary([test], exerciseById, period, undefined).sessions).toBe(0);
    expect(buildCardioReport(exercises, [test], period)).toEqual({ state: "empty", exercises: [], hasComparison: false });
  });

  it("liste une réalisation par séance comptée de la période, paliers validés et mesure, chronologique", () => {
    const workouts = [
      workout("b", "2026-08-01", [stepsBlock("tapis", [{ sec: 300, kmh: 5, incline: 0 }, { sec: 300, kmh: 5, incline: 5, done: false }])]),
      workout("a", "2026-07-01", [stepsBlock("tapis", [{ sec: 300, kmh: 5, incline: 0 }]), stepsBlock("tapis", [{ sec: 120, kmh: 6, incline: 0 }])]),
      workout("old", "2026-06-25", [stepsBlock("tapis", [{ sec: 300, kmh: 5, incline: 0 }])]),
      workout("none", "2026-08-05", [stepsBlock("tapis", [{ sec: 300, kmh: 5, incline: 0, done: false }])]),
    ];
    const realisations = listCardioRealisations("tapis", workouts, period);

    expect(realisations.map((item) => [item.workoutId, item.steps.length])).toEqual([["a", 2], ["b", 1]]);
  });
});

/* ------------------------------------------------------------------------ */
/* Descriptif : plages, BPM, totaux                                          */
/* ------------------------------------------------------------------------ */

describe("métriques descriptives", () => {
  it("décrit la dernière réalisation en paliers par des plages, jamais une moyenne, et le BPM avec sa couverture", () => {
    const workouts = [
      workout("a", "2026-08-01", [stepsBlock("tapis", [{ sec: 300, kmh: 4.5, incline: 0, bpm: 110 }, { sec: 300, kmh: 5, incline: 12, bpm: 150 }])]),
      workout("b", "2026-08-08", [
        stepsBlock("tapis", [
          { sec: 300, kmh: 4.5, incline: 0, bpm: 112 },
          { sec: 300, kmh: 5, incline: 5, bpm: 128 },
          { sec: 300, kmh: 5, incline: 10, bpm: 150 },
          { sec: 120, kmh: 5, incline: 12, bpm: 138, original: { sec: 300, kmh: 5, incline: 12 } },
          { sec: 300, kmh: 5, incline: 5, bpm: 118 },
          { sec: 300, kmh: 4.5, incline: 2 },
        ]),
      ]),
    ];
    const report = buildCardioExerciseReport(tapis, workouts, period)!;

    expect(report.kind).toBe("steps");
    expect(report.totals).toEqual({ realisations: 2, durationSec: 600 + 1620 });
    expect(report.last).toMatchObject({
      workoutId: "b",
      durationSec: 1620,
      stepsCount: 6,
      speedRange: { min: 4.5, max: 5 },
      inclineRange: { min: 0, max: 12 },
      bpm: { average: (112 + 128 + 150 + 138 + 118) / 5, count: 5, total: 6 },
      bpmCoverage: { count: 5, total: 6 },
    });
    expect(report.last.speedOrPace).toBeUndefined();
    expect(report.trend).toBeUndefined();
    expect(formatRange(report.last.speedRange!, "km/h")).toBe("4,5–5 km/h");
    expect(formatRange(report.last.inclineRange!, "%")).toBe("0–12 %");
    expect(formatRange({ min: 5, max: 5 }, "km/h")).toBe("5 km/h");
  });

  it("applique le seuil de couverture du BPM : 50 % et 5 valeurs, sinon rien", () => {
    const step = (bpm?: number): PerformedCardioStep => ({
      id: `s${++counter}`,
      position: 0,
      status: "completed",
      settings: { durationSec: 300, speedKmh: 5, inclinePercent: 0 },
      ...(bpm !== undefined ? { bpm } : {}),
    });

    /* 5 sur 10 : exactement 50 % et 5 valeurs → affiché. */
    expect(averageBpm([step(100), step(110), step(120), step(130), step(140), step(), step(), step(), step(), step()])).toEqual({ average: 120, count: 5, total: 10 });
    /* 4 sur 4 : 100 % mais moins de 5 valeurs → rien (un vélo à 3 paliers n'a jamais de BPM moyen). */
    expect(averageBpm([step(100), step(110), step(120), step(130)])).toBeUndefined();
    /* 5 sur 11 : moins de 50 % → rien. */
    expect(averageBpm([step(100), step(110), step(120), step(130), step(140), step(), step(), step(), step(), step(), step()])).toBeUndefined();
    expect(averageBpm([])).toBeUndefined();
  });

  it("durée + distance : totaux, vitesse ou allure selon la fiche, BPM si saisi ; distance seule : ni durée ni vitesse", () => {
    const workouts = [
      ride("v1", "2026-08-01", 1500, 10, 120),
      ride("v2", "2026-08-08", 1500, 10.5),
      workout("v3", "2026-08-15", [simpleBlock("velo", { distanceKm: 8 })]),
      workout("c1", "2026-08-02", [simpleBlock("course", { durationSec: 1800, distanceKm: 5 })]),
      workout("m1", "2026-08-03", [simpleBlock("marche", { distanceKm: 7 })]),
      workout("m2", "2026-08-10", [simpleBlock("marche", { distanceKm: 6.5 })]),
    ];
    const report = buildCardioReport(exercises, workouts, period);
    const byName = new Map(report.exercises.map((item) => [item.exercise.name, item]));

    expect(report.exercises.map((item) => item.exercise.name)).toEqual(["Course", "Marche", "Vélo"]);

    const veloReport = byName.get("Vélo")!;
    /* La sortie sans durée compte comme réalisation et en distance, jamais en durée. */
    expect(veloReport.totals).toEqual({ realisations: 3, durationSec: 3000, distanceKm: 28.5 });
    expect(veloReport.last).toEqual({ workoutId: "v3", date: "2026-08-15", distanceKm: 8 });
    expect(buildCardioExerciseReport(velo, workouts.slice(0, 2), period)!.last).toEqual({
      workoutId: "v2",
      date: "2026-08-08",
      durationSec: 1500,
      distanceKm: 10.5,
      speedOrPace: "25,2 km/h",
    });
    expect(buildCardioExerciseReport(velo, workouts.slice(0, 1), period)!.last.bpmValue).toBe(120);

    expect(byName.get("Course")!.last.speedOrPace).toBe("6:00 min/km");

    const marcheReport = byName.get("Marche")!;
    expect(marcheReport.totals).toEqual({ realisations: 2, distanceKm: 13.5 });
    expect(marcheReport.last).toEqual({ workoutId: "m2", date: "2026-08-10", distanceKm: 6.5 });
    expect(marcheReport.trend).toBeUndefined();
    expect(marcheReport.comparableSteps).toBeUndefined();
  });
});

/* ------------------------------------------------------------------------ */
/* Tendance à durée comparable                                              */
/* ------------------------------------------------------------------------ */

describe("tendance à durée comparable (Durée + distance)", () => {
  it("compare les durées à ±10 % de la médiane, bornes incluses", () => {
    expect(median([1500, 1200, 1800])).toBe(1500);
    expect(median([1200, 1800])).toBe(1500);
    expect(isDurationComparable(1650, 1500)).toBe(true);
    expect(isDurationComparable(1350, 1500)).toBe(true);
    expect(isDurationComparable(1651, 1500)).toBe(false);
    expect(isDurationComparable(1349, 1500)).toBe(false);
  });

  it("vitesse : régression sur la date des seules réalisations comparables, plus haut est mieux", () => {
    const workouts = [
      ride("v1", "2026-07-01", 1500, 10),
      ride("v2", "2026-07-15", 1500, 10.5),
      /* 1 h : hors ±10 % de la médiane, ignorée même si très rapide. */
      ride("long", "2026-07-20", 3600, 40),
      ride("v3", "2026-08-05", 1560, 11.2),
      ride("v4", "2026-09-02", 1440, 10.8),
    ];
    const trend = buildDurationComparableTrend(velo, listCardioRealisations("velo", workouts, period))!;

    expect(trend.metric).toBe("speed_kmh");
    expect(trend.direction).toBe("higher-is-better");
    expect(trend.medianDurationSec).toBe(1500);
    expect(trend.points.map((point) => point.workoutId)).toEqual(["v1", "v2", "v3", "v4"]);
    expect(trend.count).toBe(4);
    expect(trend.points[0]!.value).toBeCloseTo(24, 6);
    expect(trend.percent).toBeGreaterThan(3);
    expect(trend.status).toBe("up");
  });

  it("allure : plus bas est mieux — une allure qui baisse est une amélioration, une allure identique est stable", () => {
    const faster = [
      workout("c1", "2026-07-01", [simpleBlock("course", { durationSec: 1800, distanceKm: 5 })]),
      workout("c2", "2026-07-20", [simpleBlock("course", { durationSec: 1800, distanceKm: 5.3 })]),
      workout("c3", "2026-08-15", [simpleBlock("course", { durationSec: 1800, distanceKm: 5.6 })]),
    ];
    const trend = buildDurationComparableTrend(course, listCardioRealisations("course", faster, period))!;

    expect(trend.metric).toBe("pace_min_km");
    expect(trend.direction).toBe("lower-is-better");
    expect(trend.points[0]!.value).toBe(360);
    expect(trend.percent).toBeLessThan(-3);
    expect(trend.status).toBe("up");

    const same = faster.map((w, i) => workout(`s${i}`, w.date, [simpleBlock("course", { durationSec: 1800, distanceKm: 5 })]));
    expect(buildDurationComparableTrend(course, listCardioRealisations("course", same, period))).toMatchObject({ percent: 0, status: "stable" });
  });

  it("sous trois réalisations comparables : le compte sur 3, sans pourcentage ; sans aucune réalisation complète : rien", () => {
    const two = [ride("v1", "2026-07-01", 1500, 10), ride("v2", "2026-07-15", 1500, 10.5), ride("far", "2026-08-01", 600, 5)];
    const trend = buildDurationComparableTrend(velo, listCardioRealisations("velo", two, period))!;

    expect(trend).toMatchObject({ count: 2, required: 3 });
    expect(trend.percent).toBeUndefined();
    expect(trend.status).toBeUndefined();

    const distanceOnly = [workout("d", "2026-07-01", [simpleBlock("velo", { distanceKm: 8 })])];
    expect(buildDurationComparableTrend(velo, listCardioRealisations("velo", distanceOnly, period))).toBeUndefined();
  });

  it("perd sa tendance quand une réalisation comparable est supprimée", () => {
    const workouts = [ride("v1", "2026-07-01", 1500, 10), ride("v2", "2026-07-15", 1500, 10.5), ride("v3", "2026-08-05", 1500, 11)];
    const before = buildCardioExerciseReport(velo, workouts, period)!;
    const after = buildCardioExerciseReport(velo, workouts.filter((w) => w.id !== "v2"), period)!;

    expect(before.trend?.status).toBe("up");
    expect(after.trend).toMatchObject({ count: 2, required: 3 });
    expect(after.trend?.status).toBeUndefined();
  });
});

/* ------------------------------------------------------------------------ */
/* Paliers comparables                                                      */
/* ------------------------------------------------------------------------ */

describe("paliers comparables", () => {
  const session = (id: string, date: string, steps: StepSpec[]) => workout(id, date, [stepsBlock("tapis", steps)]);

  it("regroupe par vitesse, pente et durée ±10 %, sur les réglages réellement exécutés, quel que soit le rang", () => {
    const workouts = [
      session("a", "2026-07-01", [{ sec: 300, kmh: 5, incline: 8, bpm: 140 }, { sec: 300, kmh: 5, incline: 0, bpm: 110 }]),
      /* Même palier en 3e position, durée 330 s (+10 %) : comparable. Pente 8,5 : un autre groupe. */
      session("b", "2026-07-15", [{ sec: 300, kmh: 5, incline: 0, bpm: 108 }, { sec: 300, kmh: 5, incline: 8.5, bpm: 139 }, { sec: 330, kmh: 5, incline: 8, bpm: 136 }]),
      /* Adapté pendant la séance : comparé sur 5 km/h · 8 % · 300 s exécutés, pas sur la consigne 6 km/h. */
      session("c", "2026-08-01", [{ sec: 300, kmh: 5, incline: 8, bpm: 132, original: { sec: 300, kmh: 6, incline: 8 } }]),
      /* 331 s : hors ±10 % → groupe à part ; vitesse 5,5 : groupe à part. */
      session("d", "2026-08-15", [{ sec: 331, kmh: 5, incline: 8, bpm: 130 }, { sec: 300, kmh: 5.5, incline: 8, bpm: 129 }]),
    ];
    const groups = groupComparableSteps(listCardioRealisations("tapis", workouts, period));
    const main = groups[0]!;

    expect(main).toMatchObject({ durationSec: 300, speedKmh: 5, inclinePercent: 8 });
    expect(main.occurrences.map((item) => item.workoutId)).toEqual(["a", "b", "c"]);
    expect(main.bpmPoints.map((point) => point.value)).toEqual([140, 136, 132]);
    expect(main.percent).toBeLessThan(-3);
    expect(main.status).toBe("up");
    expect(formatStepGroupLabel(main)).toBe("5 min · 5 km/h · 8 %");

    const labels = groups.map((group) => [formatStepGroupLabel(group), group.occurrences.length]);
    /* Les plus fréquents d'abord, puis vitesse, pente, durée. */
    expect(labels).toEqual([
      ["5 min · 5 km/h · 8 %", 3],
      ["5 min · 5 km/h · 0 %", 2],
      ["331 s · 5 km/h · 8 %", 1],
      ["5 min · 5 km/h · 8,5 %", 1],
      ["5 min · 5,5 km/h · 8 %", 1],
    ]);
  });

  it("exige trois occurrences avec BPM renseigné : les paliers sans BPM comptent comme occurrences, pas pour la tendance", () => {
    const workouts = [
      session("a", "2026-07-01", [{ sec: 300, kmh: 5, incline: 0, bpm: 120 }]),
      session("b", "2026-07-15", [{ sec: 300, kmh: 5, incline: 0 }]),
      session("c", "2026-08-01", [{ sec: 300, kmh: 5, incline: 0, bpm: 118 }]),
      session("d", "2026-08-15", [{ sec: 300, kmh: 5, incline: 0 }]),
    ];
    const [group] = groupComparableSteps(listCardioRealisations("tapis", workouts, period));

    expect(group!.occurrences).toHaveLength(4);
    expect(group!.bpmPoints).toHaveLength(2);
    expect(group!.percent).toBeUndefined();
    expect(group!.status).toBeUndefined();

    /* Une troisième occurrence renseignée suffit ; BPM identique → stable. */
    const three = [...workouts, session("e", "2026-09-01", [{ sec: 300, kmh: 5, incline: 0, bpm: 119 }])];
    const [withTrend] = groupComparableSteps(listCardioRealisations("tapis", three, period));
    expect(withTrend!.bpmPoints).toHaveLength(3);
    expect(withTrend!.status).toBe("stable");
    expect(withTrend!.percent).toBe(-1);
  });

  it("un BPM qui monte à effort comparable est en baisse (ambre) ; une séance partielle n'apporte que ses paliers validés", () => {
    const workouts = [
      session("a", "2026-07-01", [{ sec: 300, kmh: 5, incline: 0, bpm: 110 }]),
      session("b", "2026-07-15", [{ sec: 300, kmh: 5, incline: 0, bpm: 118 }]),
      session("c", "2026-08-01", [{ sec: 300, kmh: 5, incline: 0, bpm: 126 }, { sec: 300, kmh: 5, incline: 5, bpm: 140, done: false }]),
    ];
    const groups = groupComparableSteps(listCardioRealisations("tapis", workouts, period));

    expect(groups).toHaveLength(1);
    expect(groups[0]!.status).toBe("down");
    expect(groups[0]!.percent).toBeGreaterThan(3);
  });
});

/* ------------------------------------------------------------------------ */
/* Jeu de référence                                                         */
/* ------------------------------------------------------------------------ */

describe("cardio sur le jeu « état établi »", () => {
  const dataset = buildEstablishedDataset("2026-09-10");
  const p12 = resolvePeriod("12w", dataset.today);
  const report = buildCardioReport(dataset.exercises, dataset.workouts, p12);
  const inP = (date: string) => date >= p12.start && date <= p12.end;

  it("liste tapis et vélo, alphabétiquement, avec des totaux recomptés à la main", () => {
    expect(report.state).toBe("list");
    expect(report.exercises.map((item) => item.exercise.name)).toEqual(["Tapis de course", "Vélo"]);

    const tapisReport = report.exercises[0]!;
    const mondays = dataset.workouts.filter((w) => w.id.startsWith("fx-w-a-") && inP(w.date));
    expect(tapisReport.totals).toEqual({ realisations: mondays.length, durationSec: mondays.length * 600 });
    expect(tapisReport.last).toMatchObject({
      date: "2026-09-07",
      durationSec: 600,
      stepsCount: 2,
      speedRange: { min: 5, max: 5 },
      inclineRange: { min: 0, max: 5 },
      bpmCoverage: { count: 2, total: 2 },
    });
    /* Deux paliers renseignés : sous les 5 valeurs, pas de BPM moyen. */
    expect(tapisReport.last.bpm).toBeUndefined();

    const veloReport = report.exercises[1]!;
    const rides = dataset.workouts.filter((w) => w.id.startsWith("fx-w-c-") && inP(w.date));
    const km = rides.reduce((sum, w) => sum + ((w.blocks[0] as PerformedExerciseBlock).simpleMeasurement!.distanceKm ?? 0), 0);
    expect(veloReport.totals.realisations).toBe(12);
    expect(veloReport.totals.durationSec).toBe(12 * 1500);
    expect(veloReport.totals.distanceKm).toBeCloseTo(km, 6);
    expect(veloReport.last).toMatchObject({ date: "2026-09-09", durationSec: 1500, distanceKm: 12.5, speedOrPace: "30 km/h", bpmValue: 120 });
  });

  it("vélo : douze sorties de 25 min, toutes comparables, vitesse en hausse linéaire → tendance En progression", () => {
    const trend = report.exercises[1]!.trend!;

    expect(trend.medianDurationSec).toBe(1500);
    expect(trend.count).toBe(12);
    /* Distance 11,4 → 12,5 km en 25 min : +9,6 % → +10 %. */
    expect(trend.points[0]!.value).toBeCloseTo(11.4 / (1500 / 3600), 6);
    expect(trend.percent).toBe(10);
    expect(trend.status).toBe("up");
  });

  it("tapis : deux groupes de paliers comparables, le BPM à 5 % descend au fil des semaines → amélioration", () => {
    const groups = report.exercises[0]!.comparableSteps!;

    expect(groups.map((group) => [formatStepGroupLabel(group), group.occurrences.length, group.bpmPoints.length])).toEqual([
      ["5 min · 5 km/h · 0 %", 10, 10],
      ["5 min · 5 km/h · 5 %", 10, 10],
    ]);
    /* En pente : 118 → 107 bpm sur les lundis des semaines 14 → 25, régression exacte → −9 %. */
    const incline = groups[1]!;
    expect(incline.bpmPoints[0]!.value).toBe(118);
    expect(incline.bpmPoints[incline.bpmPoints.length - 1]!.value).toBe(107);
    expect(incline.percent).toBe(-9);
    expect(incline.status).toBe("up");
    /* À plat, le BPM oscille sans dériver : stable. */
    expect(groups[0]!.status).toBe("stable");
    expect(report.hasComparison).toBe(true);
  });
});
