import { describe, expect, it } from "vitest";
import type {
  Exercise,
  PerformedBlock,
  PerformedExerciseBlock,
  PlannedSession,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { buildExercisePerformanceHistory } from "../exercises/exercisePerformance";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { buildCardioReport } from "./cardio";
import { buildExerciseTrends } from "./trends";
import {
  coversPreviousPeriod,
  formatPeriodRange,
  isWithin,
  rangeDays,
  resolvePeriod,
  shiftDate,
} from "./period";
import {
  buildOverview,
  describeWorkoutSummary,
  getCategoryBreakdown,
  getCompletionRate,
  hasPerformedBlock,
  getCoverageStart,
  getFirstCountedDate,
  getStrengthSummary,
  getCardioSummary,
  getTrainingFrequency,
  getZoneBreakdown,
  isCountedWorkout,
  variationPercent,
} from "./overview";

/* ------------------------------------------------------------------------ */
/* Fabrique                                                                 */
/* ------------------------------------------------------------------------ */

const TODAY = "2026-09-17";
const T0 = "2026-01-01T00:00:00.000Z";

function exercise(id: string, extra: Partial<Exercise>): Exercise {
  return {
    id,
    name: id,
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

const exercises: Exercise[] = [
  exercise("squat", { zone: "Jambes" }),
  exercise("tirage", { zone: "Dos" }),
  exercise("pompes", { zone: "Pecs", measurementType: "reps", equipment: "Poids du corps" }),
  exercise("planche", { zone: "Core", measurementType: "duration" }),
  exercise("tapis", { category: "Cardio", mode: "steps", measurementType: "duration_speed_incline" }),
  exercise("velo", { category: "Cardio", mode: "simple", measurementType: "duration_distance" }),
  exercise("marche", { category: "Cardio", mode: "simple", measurementType: "distance" }),
];

const templates: SessionTemplate[] = (["Musculation", "Cardio", "Mobilité", "Bilan de mobilité"] as const).map((category) => ({
  id: `tpl-${category}`,
  name: `Modèle ${category}`,
  category,
  status: "active",
  position: 0,
  blocks: [],
  createdAt: T0,
  updatedAt: T0,
}));

let counter = 0;

function seriesBlock(exerciseId: string, series: Array<{ kg?: number; reps?: number; durationSec?: number }>): PerformedExerciseBlock {
  const id = `b${++counter}`;
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: series.length, reps: { min: 8, max: 10 }, restBetweenSetsSec: 90 },
    series: series.map((item, index) => ({
      id: `${id}-s${index}`,
      position: index,
      status: "completed",
      ...(item.kg !== undefined ? { load: { kind: "total" as const, kg: item.kg } } : {}),
      ...(item.reps !== undefined ? { reps: item.reps } : {}),
      ...(item.durationSec !== undefined ? { durationSec: item.durationSec } : {}),
    })),
  };
}

function stepsBlock(exerciseId: string, durations: number[]): PerformedExerciseBlock {
  const id = `b${++counter}`;
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions: { shape: "steps", steps: [] },
    cardioSteps: durations.map((durationSec, index) => ({
      id: `${id}-p${index}`,
      position: index,
      status: "completed",
      settings: { durationSec, speedKmh: 5, inclinePercent: 0 },
    })),
  };
}

function simpleBlock(exerciseId: string, measure: { durationSec?: number; distanceKm?: number }): PerformedExerciseBlock {
  const id = `b${++counter}`;
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status: "performed",
    snapshotInstructions: { shape: "duration_distance" },
    simpleMeasurement: measure,
  };
}

function notDone(exerciseId: string): PerformedExerciseBlock {
  return { ...seriesBlock(exerciseId, [{ kg: 40, reps: 10 }]), status: "not_performed", series: [] };
}

function workout(
  id: string,
  date: string,
  blocks: PerformedBlock[],
  extra: Partial<WorkoutSession> = {},
): WorkoutSession {
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
    ...extra,
  };
}

function planned(
  id: string,
  date: string,
  status: PlannedSession["status"],
  workoutId?: string,
  templateId = "tpl-Musculation",
): PlannedSession {
  return {
    id,
    date,
    sessionTemplateId: templateId,
    status,
    ...(workoutId ? { workoutId } : {}),
    source: "manual",
    createdAt: T0,
    updatedAt: T0,
  };
}

const musc = (id: string, date: string, kg = 40, extra: Partial<WorkoutSession> = {}) =>
  workout(id, date, [seriesBlock("squat", [{ kg, reps: 10 }, { kg, reps: 10 }, { kg, reps: 10 }])], {
    sessionTemplateId: "tpl-Musculation",
    source: "planned",
    ...extra,
  });

/* ------------------------------------------------------------------------ */
/* Périodes                                                                 */
/* ------------------------------------------------------------------------ */

describe("périodes glissantes (§16)", () => {
  it("compte en jours, aujourd'hui inclus, avec une période précédente de même durée juste avant", () => {
    const p12 = resolvePeriod("12w", TODAY);

    expect(p12).toEqual({
      key: "12w",
      days: 84,
      start: "2026-06-26",
      end: TODAY,
      previous: { start: "2026-04-03", end: "2026-06-25" },
    });
    expect(rangeDays(p12)).toBe(84);
    expect(rangeDays(p12.previous)).toBe(84);
    expect(resolvePeriod("4w", TODAY).start).toBe("2026-08-21");
    expect(resolvePeriod("1y", TODAY)).toMatchObject({ start: "2025-09-18", previous: { start: "2024-09-18", end: "2025-09-17" } });
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("borne la période aux deux extrémités, et la période précédente ne chevauche pas la courante", () => {
    const period = resolvePeriod("4w", TODAY);

    expect(isWithin("2026-08-21", period)).toBe(true);
    expect(isWithin("2026-08-20", period)).toBe(false);
    expect(isWithin(TODAY, period)).toBe(true);
    expect(isWithin("2026-09-18", period)).toBe(false);
    expect(isWithin("2026-08-20", period.previous)).toBe(true);
    expect(isWithin("2026-08-21", period.previous)).toBe(false);
  });

  it("n'autorise la variation que si l'historique couvre entièrement la période précédente", () => {
    const period = resolvePeriod("4w", TODAY);

    expect(coversPreviousPeriod(period, "2026-07-24")).toBe(true);
    expect(coversPreviousPeriod(period, "2026-07-25")).toBe(false);
    expect(coversPreviousPeriod(period, undefined)).toBe(false);
  });

  it("libelle la période comme le mockup", () => {
    expect(formatPeriodRange(resolvePeriod("12w", "2026-09-10"))).toBe("19 juin – 10 septembre 2026 (84 jours)");
  });
});

/* ------------------------------------------------------------------------ */
/* Séances comptées                                                         */
/* ------------------------------------------------------------------------ */

describe("séances comptées (Q2)", () => {
  it("ne compte qu'une séance terminée avec au moins une brique réalisée", () => {
    expect(isCountedWorkout(musc("a", TODAY))).toBe(true);
    expect(isCountedWorkout(workout("b", TODAY, [notDone("squat")]))).toBe(false);
    expect(isCountedWorkout(workout("c", TODAY, []))).toBe(false);
    expect(isCountedWorkout({ ...musc("d", TODAY), status: "in_progress" })).toBe(false);
    expect(isCountedWorkout(workout("e", TODAY, [{ id: "n", kind: "note", position: 0, addedDuringWorkout: false, text: "x" }]))).toBe(false);
  });

  it("date la première séance comptée à titre indicatif, sans en faire une preuve de couverture", () => {
    const workouts = [musc("a", "2026-06-01"), workout("z", "2026-01-05", [notDone("squat")]), musc("b", "2026-03-10")];

    expect(getFirstCountedDate(workouts)).toBe("2026-03-10");
    expect(getFirstCountedDate([])).toBeUndefined();
    /* Aucune date de collecte complète connue : pas de couverture. */
    expect(getCoverageStart(workouts)).toBeUndefined();
  });

  it("ne connaît la couverture que par l'import complet des feuilles de septembre 2026", () => {
    const imported = buildImportedWorkouts();

    expect(getCoverageStart(imported)).toBe("2026-09-01");
    expect(getCoverageStart([...imported, musc("later", TODAY)])).toBe("2026-09-01");
    /* Une séance antérieure à la collecte ne recule pas la couverture : rien n'est inventé. */
    expect(getCoverageStart([...imported, musc("before", "2026-05-01")])).toBe("2026-09-01");
  });
});

/* ------------------------------------------------------------------------ */
/* Taux de réalisation                                                      */
/* ------------------------------------------------------------------------ */

describe("taux de réalisation du programme (Q1)", () => {
  const period = resolvePeriod("4w", TODAY);
  const workouts = [
    musc("w-done", "2026-09-10", 40, { plannedSessionId: "p-done" }),
    workout("w-empty", "2026-09-12", [notDone("squat")], { plannedSessionId: "p-empty", sessionTemplateId: "tpl-Musculation", source: "planned" }),
    musc("w-today", TODAY, 40, { plannedSessionId: "p-today" }),
    musc("w-free", "2026-09-14"),
  ];

  const templateById = new Map(templates.map((item) => [item.id, item]));

  it("met au dénominateur les instances échues faites, sautées ou non réalisées, et au numérateur les faites réellement réalisées", () => {
    const plannedSessions = [
      planned("p-done", "2026-09-10", "done", "w-done"),
      planned("p-skipped", "2026-09-11", "skipped"),
      planned("p-missed", "2026-09-13", "upcoming"),
      /* Faite mais séance arrêtée sans rien : attendue, pas réalisée. */
      planned("p-empty", "2026-09-12", "done", "w-empty"),
      /* Hors période : la veille du premier jour. */
      planned("p-before", "2026-08-20", "done"),
      /* Futur : pas encore attendue. */
      planned("p-future", "2026-09-20", "upcoming"),
    ];

    expect(getCompletionRate(plannedSessions, workouts, templateById, period, TODAY)).toEqual({ done: 1, expected: 4, percent: 25 });
  });

  it("n'intègre l'instance du jour qu'une fois terminée et réalisée, jamais une séance en cours", () => {
    expect(getCompletionRate([planned("p-today", TODAY, "done", "w-today")], workouts, templateById, period, TODAY)).toEqual({ done: 1, expected: 1, percent: 100 });
    expect(getCompletionRate([planned("p-today", TODAY, "upcoming")], workouts, templateById, period, TODAY)).toEqual({ done: 0, expected: 0 });
    expect(getCompletionRate([planned("p-today", TODAY, "in_progress", "w-run")], [{ ...musc("w-run", TODAY), status: "in_progress" }], templateById, period, TODAY)).toEqual({ done: 0, expected: 0 });
    /* Une séance en cours d'hier est attendue, pas réalisée. */
    expect(getCompletionRate([planned("p-y", "2026-09-16", "in_progress", "w-y")], [{ ...musc("w-y", "2026-09-16"), status: "in_progress" }], templateById, period, TODAY)).toEqual({ done: 0, expected: 1, percent: 0 });
  });

  it("exclut les séances libres et compte la première journée de la période", () => {
    const rate = getCompletionRate([planned("p-first", "2026-08-21", "done", "w-first")], [...workouts, musc("w-first", "2026-08-21", 40, { plannedSessionId: "p-first" })], templateById, period, TODAY);
    expect(rate).toEqual({ done: 1, expected: 1, percent: 100 });
    /* Aucune instance attendue : pas de pourcentage, pas de 0 %. */
    expect(getCompletionRate([], workouts, templateById, period, TODAY)).toEqual({ done: 0, expected: 0 });
  });

  it("se recalcule après la suppression d'une réalisation : l'instance redevenue À venir reste attendue", () => {
    const before = getCompletionRate([planned("p-done", "2026-09-10", "done", "w-done")], workouts, templateById, period, TODAY);
    const after = getCompletionRate([planned("p-done", "2026-09-10", "upcoming")], workouts.filter((w) => w.id !== "w-done"), templateById, period, TODAY);

    expect(before).toEqual({ done: 1, expected: 1, percent: 100 });
    expect(after).toEqual({ done: 0, expected: 1, percent: 0 });
  });
});

describe("taux de réalisation et bilans de mobilité (v1.5, § 11.3)", () => {
  const period = resolvePeriod("4w", TODAY);
  const templateById = new Map(templates.map((item) => [item.id, item]));
  const bilan = (id: string, date: string, extra: Partial<WorkoutSession> = {}) =>
    workout(id, date, [seriesBlock("squat", [{ reps: 1 }])], {
      kind: "mobility_assessment",
      sessionTemplateId: "tpl-Bilan de mobilité",
      source: "planned",
      ...extra,
    });
  const training = [
    planned("p1", "2026-09-10", "done", "w1"),
    planned("p2", "2026-09-11", "skipped"),
    planned("p3", "2026-09-12", "done", "w3"),
  ];
  const trainingWorkouts = [musc("w1", "2026-09-10"), musc("w3", "2026-09-12")];
  const reference = getCompletionRate(training, trainingWorkouts, templateById, period, TODAY);

  it("référence sans bilan : 2 réalisées sur 3 attendues", () => {
    expect(reference).toEqual({ done: 2, expected: 3, percent: 67 });
  });

  it("bilan planifié non fait : hors du dénominateur, taux inchangé", () => {
    const planned2 = [...training, planned("pb", "2026-09-13", "upcoming", undefined, "tpl-Bilan de mobilité")];
    expect(getCompletionRate(planned2, trainingWorkouts, templateById, period, TODAY)).toEqual(reference);
  });

  it("bilan planifié fait : hors des deux côtés, taux inchangé", () => {
    const planned2 = [...training, planned("pb", "2026-09-13", "done", "wb", "tpl-Bilan de mobilité")];
    const workouts2 = [...trainingWorkouts, bilan("wb", "2026-09-13", { plannedSessionId: "pb" })];
    expect(getCompletionRate(planned2, workouts2, templateById, period, TODAY)).toEqual(reference);
  });

  it("cas croisé A — entraînement planifié, séance faite en bilan (kind) : hors des deux côtés", () => {
    const planned2 = [...training, planned("px", "2026-09-13", "done", "wx")];
    const workouts2 = [...trainingWorkouts, bilan("wx", "2026-09-13", { sessionTemplateId: "tpl-Musculation", plannedSessionId: "px" })];
    expect(getCompletionRate(planned2, workouts2, templateById, period, TODAY)).toEqual(reference);
  });

  it("cas croisé B — bilan planifié, séance faite en entraînement : attendue et réalisée, jamais plus de 100 %", () => {
    const planned2 = [...training, planned("py", "2026-09-13", "done", "wy", "tpl-Bilan de mobilité")];
    const workouts2 = [...trainingWorkouts, musc("wy", "2026-09-13", 40, { sessionTemplateId: "tpl-Bilan de mobilité", plannedSessionId: "py", kind: "training" })];
    expect(getCompletionRate(planned2, workouts2, templateById, period, TODAY)).toEqual({ done: 3, expected: 4, percent: 75 });
    /* Un bilan seul planifié et fait en entraînement : 1 / 1, pas 1 / 0. */
    expect(getCompletionRate([planned("py", "2026-09-13", "done", "wy", "tpl-Bilan de mobilité")], workouts2, templateById, period, TODAY)).toEqual({ done: 1, expected: 1, percent: 100 });
  });

  it("changement de catégorie d'un modèle après réalisation : les instances faites ne bougent pas, seules les non faites suivent", () => {
    /* Le modèle Musculation devient « Bilan de mobilité » après coup. */
    const recategorised = new Map(templateById);
    recategorised.set("tpl-Musculation", { ...templateById.get("tpl-Musculation")!, category: "Bilan de mobilité" });
    const planned2 = [...training, planned("p4", "2026-09-14", "upcoming")];

    const before = getCompletionRate(planned2, trainingWorkouts, templateById, period, TODAY);
    const after = getCompletionRate(planned2, trainingWorkouts, recategorised, period, TODAY);

    expect(before).toEqual({ done: 2, expected: 4, percent: 50 });
    /* Les deux faites (kind absent = entraînement) et la sautée… non : la sautée n'est pas faite, elle suit la catégorie. */
    expect(after).toEqual({ done: 2, expected: 2, percent: 100 });

    /* Dans l'autre sens : un modèle « Bilan » redevenu « Mobilité » ne requalifie pas les bilans faits. */
    const back = new Map(templateById);
    back.set("tpl-Bilan de mobilité", { ...templateById.get("tpl-Bilan de mobilité")!, category: "Mobilité" });
    const plannedB = [planned("pb", "2026-09-13", "done", "wb", "tpl-Bilan de mobilité"), planned("pb2", "2026-09-14", "upcoming", undefined, "tpl-Bilan de mobilité")];
    const workoutsB = [bilan("wb", "2026-09-13", { plannedSessionId: "pb" })];
    expect(getCompletionRate(plannedB, workoutsB, back, period, TODAY)).toEqual({ done: 0, expected: 1, percent: 0 });
  });

  it("séance vide et instance du jour : comportement antérieur conservé à l'identique", () => {
    const empty = workout("we", "2026-09-13", [notDone("squat")], { sessionTemplateId: "tpl-Musculation", source: "planned", kind: "training" });
    expect(getCompletionRate([planned("pe", "2026-09-13", "done", "we")], [empty], templateById, period, TODAY)).toEqual({ done: 0, expected: 1, percent: 0 });

    const todayDone = musc("wt", TODAY, 40, { kind: "training" });
    expect(getCompletionRate([planned("pt", TODAY, "done", "wt")], [todayDone], templateById, period, TODAY)).toEqual({ done: 1, expected: 1, percent: 100 });
    expect(getCompletionRate([planned("pt", TODAY, "upcoming")], [], templateById, period, TODAY)).toEqual({ done: 0, expected: 0 });
    const todayEmpty = workout("wte", TODAY, [notDone("squat")], { kind: "training" });
    expect(getCompletionRate([planned("pte", TODAY, "done", "wte")], [todayEmpty], templateById, period, TODAY)).toEqual({ done: 0, expected: 0 });
    /* Bilan fait aujourd'hui : n'entre nulle part. */
    expect(getCompletionRate([planned("ptb", TODAY, "done", "wtb", "tpl-Bilan de mobilité")], [bilan("wtb", TODAY)], templateById, period, TODAY)).toEqual({ done: 0, expected: 0 });
  });

  it("modèle introuvable pour une instance non faite : traitée comme entraînement (comportement actuel)", () => {
    expect(getCompletionRate([planned("pz", "2026-09-13", "skipped", undefined, "tpl-disparu")], [], templateById, period, TODAY)).toEqual({ done: 0, expected: 1, percent: 0 });
  });
});

describe("séance comptée et bilans de mobilité (v1.5, § 3)", () => {
  const exerciseById = new Map(exercises.map((item) => [item.id, item]));
  const templateById = new Map(templates.map((item) => [item.id, item]));
  const period = resolvePeriod("4w", TODAY);
  const base = [
    musc("a", "2026-09-01"),
    musc("b", "2026-09-08"),
    workout("c", "2026-09-10", [stepsBlock("tapis", [300, 300])], { sessionTemplateId: "tpl-Cardio" }),
    workout("empty", "2026-09-11", [notDone("squat")]),
  ];
  const bilans = [
    workout("bilan-1", "2026-09-05", [seriesBlock("squat", [{ kg: 100, reps: 10 }])], { kind: "mobility_assessment", sessionTemplateId: "tpl-Bilan de mobilité" }),
    workout("bilan-libre", "2026-09-12", [seriesBlock("planche", [{ durationSec: 60 }])], { kind: "mobility_assessment" }),
    workout("bilan-vide", "2026-09-13", [notDone("squat")], { kind: "mobility_assessment" }),
  ];

  it("un bilan n'est jamais une séance comptée, même avec des réalisations ; kind absent ou training l'est", () => {
    for (const b of bilans) expect(isCountedWorkout(b)).toBe(false);
    expect(isCountedWorkout(musc("k", "2026-09-01"))).toBe(true);
    expect(isCountedWorkout(musc("k", "2026-09-01", 40, { kind: "training" }))).toBe(true);
    expect(hasPerformedBlock(bilans[0]!)).toBe(true);
    expect(hasPerformedBlock(bilans[2]!)).toBe(false);
  });

  it("tous les indicateurs de la vue générale sont identiques avec et sans bilans", () => {
    const sources = (workouts: WorkoutSession[]) => ({ workouts, plannedSessions: [], templates, exercises });
    const without = buildOverview(sources(base), period, TODAY, { coverageStart: "2026-01-01" });
    const withBilans = buildOverview(sources([...base, ...bilans]), period, TODAY, { coverageStart: "2026-01-01" });

    expect(withBilans.frequency).toEqual(without.frequency);
    expect(withBilans.strength).toEqual(without.strength);
    expect(withBilans.cardio).toEqual(without.cardio);
    expect(withBilans.categories).toEqual(without.categories);
    expect(withBilans.zones).toEqual(without.zones);
    expect(withBilans.recent).toEqual(without.recent);
    expect(withBilans.coverageStart).toBe(without.coverageStart);
    expect(withBilans.firstCountedDate).toBe(without.firstCountedDate);
    expect(withBilans.recent.map((line) => line.workoutId)).not.toContain("bilan-1");
    expect(without.strength.volumeKg).toBe(2 * 3 * 40 * 10);
  });

  it("répartition par catégorie : pas de ligne « Bilan de mobilité » ; un entraînement rattaché à un modèle recatégorisé « Bilan » compte sans catégorie", () => {
    const breakdown = getCategoryBreakdown([...base, ...bilans], templateById, period);
    expect(breakdown.lines.map((line) => line.key)).not.toContain("Bilan de mobilité");
    expect(breakdown.total).toBe(3);

    const training = musc("t", "2026-09-09", 40, { sessionTemplateId: "tpl-Bilan de mobilité", kind: "training" });
    const withTraining = getCategoryBreakdown([...base, training], templateById, period);
    expect(withTraining.total).toBe(4);
    expect(withTraining.lines.find((line) => line.key === "Sans catégorie")?.count).toBe(1);
    expect(withTraining.lines.map((line) => line.key)).not.toContain("Bilan de mobilité");
  });

  it("aucune tendance ni analyse cardio n'est alimentée par un bilan ; la fiche, elle, voit toutes les séances terminées", () => {
    const squat = exercises.find((item) => item.id === "squat")!;
    const withBilans = [...base, ...bilans];
    const trends = buildExerciseTrends([squat], withBilans, period, "chargeMax");
    const trendsWithout = buildExerciseTrends([squat], base, period, "chargeMax");
    expect(trends).toEqual(trendsWithout);
    expect(buildCardioReport(exercises, [...base, bilans[1]!], period)).toEqual(buildCardioReport(exercises, base, period));

    const history = buildExercisePerformanceHistory(squat, withBilans);
    expect(history.map((entry) => entry.workoutId)).toContain("bilan-1");
    void exerciseById;
  });
});

/* ------------------------------------------------------------------------ */
/* Fréquence                                                                */
/* ------------------------------------------------------------------------ */

describe("fréquence d'entraînement", () => {
  it("rapporte toutes les séances comptées, libres comprises, au nombre de semaines de la période", () => {
    const period = resolvePeriod("4w", TODAY);
    const workouts = [
      musc("a", "2026-08-21"),
      musc("b", "2026-09-01"),
      workout("c", "2026-09-05", [stepsBlock("tapis", [300])]),
      workout("empty", "2026-09-06", [notDone("squat")]),
      musc("out", "2026-08-20"),
      musc("future", "2026-09-18"),
    ];

    expect(getTrainingFrequency(workouts, period)).toEqual({ sessions: 3, weeks: 4, perWeek: 0.8 });
    expect(getTrainingFrequency(workouts, resolvePeriod("12w", TODAY))).toEqual({ sessions: 4, weeks: 12, perWeek: 0.3 });
  });

  it("n'extrapole pas de rythme hebdomadaire sous 14 jours", () => {
    const short = { ...resolvePeriod("4w", TODAY), days: 10, start: shiftDate(TODAY, -9) };

    expect(getTrainingFrequency([musc("a", TODAY)], short)).toEqual({ sessions: 1, weeks: 10 / 7 });
  });
});

/* ------------------------------------------------------------------------ */
/* Cartes de synthèse                                                       */
/* ------------------------------------------------------------------------ */

describe("cartes Renforcement et Cardio", () => {
  const exerciseById = new Map(exercises.map((item) => [item.id, item]));
  const period = resolvePeriod("4w", TODAY);
  /* Dans la période : squat 3 × 40 × 10 = 1 200 kg ; pompes 2 séries sans volume ;
     planche 1 série ; tapis 25 min ; vélo 20 min + 8 km ; marche 7 km sans durée. */
  const current = [
    musc("m1", "2026-09-01", 40),
    workout("m2", "2026-09-03", [seriesBlock("pompes", [{ reps: 12 }, { reps: 10 }]), seriesBlock("planche", [{ durationSec: 60 }]), stepsBlock("tapis", [600, 900])]),
    workout("c1", "2026-09-05", [simpleBlock("velo", { durationSec: 1200, distanceKm: 8 })]),
    workout("c2", "2026-09-07", [simpleBlock("marche", { distanceKm: 7 })]),
    workout("empty", "2026-09-08", [notDone("squat")]),
  ];
  /* Période précédente (24/07 → 20/08) : squat 3 × 30 × 10 = 900 kg ; tapis 10 min. */
  const previous = [musc("p1", "2026-08-01", 30), workout("p2", "2026-08-10", [stepsBlock("tapis", [600])])];

  it("agrège le renforcement par exercice en mode séries : volume sur charge + reps seulement, séries de tous, séances contenant", () => {
    const summary = getStrengthSummary([...current, ...previous], exerciseById, period, "2026-07-01");

    expect(summary).toEqual({
      volumeKg: 1200,
      seriesDone: 6,
      sessions: 2,
      previous: { volumeKg: 900, seriesDone: 3, sessions: 1 },
      variation: { volume: 33, series: 100, sessions: 100 },
    });
  });

  it("agrège le cardio en durée mesurée : une distance seule compte comme séance, jamais comme durée", () => {
    const summary = getCardioSummary([...current, ...previous], exerciseById, period, "2026-07-01");

    expect(summary).toEqual({
      durationSec: 1500 + 1200,
      sessions: 3,
      previous: { durationSec: 600, sessions: 1 },
      variation: { duration: 350, sessions: 200 },
    });
  });

  it("masque toute variation quand l'historique ne couvre pas la période précédente, ou depuis une base nulle", () => {
    const summary = getStrengthSummary([...current, ...previous], exerciseById, period, "2026-08-01");

    expect(summary.previous).toBeUndefined();
    expect(summary.variation).toEqual({});
    expect(variationPercent(10, 0, true)).toBeUndefined();
    expect(variationPercent(10, 5, false)).toBeUndefined();
    expect(variationPercent(11, 10, true)).toBe(10);
    expect(variationPercent(9, 10, true)).toBe(-10);
  });

  it("sépare les périmètres : une Muscu A finie sur le tapis compte dans les deux cartes, jamais additionnée", () => {
    const mixed = workout("mix", "2026-09-02", [seriesBlock("squat", [{ kg: 50, reps: 10 }]), stepsBlock("tapis", [300])], { sessionTemplateId: "tpl-Musculation" });

    expect(getStrengthSummary([mixed], exerciseById, period, undefined)).toMatchObject({ volumeKg: 500, seriesDone: 1, sessions: 1 });
    expect(getCardioSummary([mixed], exerciseById, period, undefined)).toMatchObject({ durationSec: 300, sessions: 1 });
  });
});

/* ------------------------------------------------------------------------ */
/* Répartitions                                                             */
/* ------------------------------------------------------------------------ */

describe("répartitions", () => {
  const exerciseById = new Map(exercises.map((item) => [item.id, item]));
  const templateById = new Map(templates.map((item) => [item.id, item]));
  const period = resolvePeriod("12w", TODAY);

  it("répartit les séances par catégorie du modèle, Sans catégorie pour les libres sans modèle, somme = total", () => {
    const workouts = [
      musc("a", "2026-09-01"),
      musc("b", "2026-09-02"),
      workout("c", "2026-09-03", [stepsBlock("tapis", [300])], { sessionTemplateId: "tpl-Cardio" }),
      workout("d", "2026-09-04", [seriesBlock("planche", [{ durationSec: 30 }])], { sessionTemplateId: "tpl-Mobilité" }),
      workout("e", "2026-09-05", [seriesBlock("squat", [{ kg: 20, reps: 10 }])]),
      workout("empty", "2026-09-06", [notDone("squat")]),
    ];
    const breakdown = getCategoryBreakdown(workouts, templateById, period);

    expect(breakdown.total).toBe(5);
    expect(breakdown.lines).toEqual([
      { key: "Musculation", count: 2, percent: 40 },
      { key: "Cardio", count: 1, percent: 20 },
      { key: "Mobilité", count: 1, percent: 20 },
      { key: "Sans catégorie", count: 1, percent: 20 },
    ]);
    expect(breakdown.lines.reduce((sum, line) => sum + line.count, 0)).toBe(breakdown.total);

    /* Sans séance libre sans modèle : la ligne n'existe pas. */
    expect(getCategoryBreakdown(workouts.slice(0, 4), templateById, period).lines.map((line) => line.key)).toEqual(["Musculation", "Cardio", "Mobilité"]);
  });

  it("compte chaque série pour la zone de son exercice, paliers et mesures exclus", () => {
    const workouts = [
      musc("a", "2026-09-01"),
      workout("b", "2026-09-02", [seriesBlock("tirage", [{ kg: 30, reps: 10 }, { kg: 30, reps: 10 }]), seriesBlock("planche", [{ durationSec: 45 }]), stepsBlock("tapis", [300]), simpleBlock("velo", { durationSec: 600 })]),
    ];
    const breakdown = getZoneBreakdown(workouts, exerciseById, period);

    expect(breakdown.total).toBe(6);
    expect(breakdown.lines).toEqual([
      { key: "Jambes", count: 3, percent: 50 },
      { key: "Dos", count: 2, percent: 33 },
      { key: "Pecs", count: 0, percent: 0 },
      { key: "Épaules", count: 0, percent: 0 },
      { key: "Bras", count: 0, percent: 0 },
      { key: "Core", count: 1, percent: 17 },
    ]);
  });
});

/* ------------------------------------------------------------------------ */
/* Vue générale complète et données réelles                                 */
/* ------------------------------------------------------------------------ */

describe("vue générale", () => {
  it("assemble tous les blocs, avec les dernières séances comptées de la plus récente à la plus ancienne", () => {
    const period = resolvePeriod("4w", TODAY);
    const workouts = [
      musc("a", "2026-09-01", 40, { plannedSessionId: "p-a" }),
      workout("b", "2026-09-03", [stepsBlock("tapis", [300, 300]), simpleBlock("marche", { distanceKm: 3 })], { sessionTemplateId: "tpl-Cardio", activeDurationSec: 0 }),
      workout("empty", "2026-09-04", [notDone("squat")]),
    ];
    const overview = buildOverview(
      { workouts, plannedSessions: [planned("p-a", "2026-09-01", "done", "a")], templates, exercises },
      period,
      TODAY,
    );

    expect(overview.coverageStart).toBeUndefined();
    expect(overview.firstCountedDate).toBe("2026-09-01");
    expect(overview.previousCovered).toBe(false);
    expect(overview.completion).toEqual({ done: 1, expected: 1, percent: 100 });
    expect(overview.frequency).toEqual({ sessions: 2, weeks: 4, perWeek: 0.5 });
    expect(overview.strength.variation).toEqual({});
    expect(overview.recent.map((line) => [line.date, line.name, line.summary])).toEqual([
      ["2026-09-03", "Modèle Cardio", "2 paliers · 3 km"],
      ["2026-09-01", "Modèle Musculation", "40 min"],
    ]);
    expect(describeWorkoutSummary(workout("x", TODAY, [seriesBlock("squat", [{ kg: 1, reps: 1 }])], { activeDurationSec: 0 }), new Map())).toBe("durée non renseignée");
  });

  it("recalcule l'état de démarrage depuis les séances réellement importées", () => {
    const imported = buildImportedWorkouts();
    const exerciseById = new Map<string, Exercise>();
    const period = resolvePeriod("12w", "2026-09-10");
    const strength = getStrengthSummary(imported, exerciseById, period, getCoverageStart(imported));
    const cardio = getCardioSummary(imported, exerciseById, period, getCoverageStart(imported));

    /* Recalcul brut, séance par séance, avec les mêmes règles que le moteur. */
    let series = 0;
    let volume = 0;
    let cardioSec = 0;
    for (const w of imported) {
      if (w.date < period.start || w.date > period.end) continue;
      for (const block of w.blocks) {
        if (block.kind !== "exercise" || block.status !== "performed") continue;
        for (const s of block.series ?? []) {
          if (s.status !== "completed") continue;
          series += 1;
          if (s.load && s.reps !== undefined) volume += (s.load.kind === "total" ? s.load.kg : s.load.kind === "per_side" ? s.load.kgPerSide * 2 + (s.load.tareKg ?? 0) : s.load.tareKg ?? 0) * s.reps;
        }
        for (const step of block.cardioSteps ?? []) if (step.status === "completed") cardioSec += step.settings.durationSec;
        cardioSec += block.simpleMeasurement?.durationSec ?? 0;
      }
    }

    expect(strength.seriesDone).toBe(series);
    expect(strength.volumeKg).toBe(volume);
    expect(cardio.durationSec).toBe(cardioSec);
    /* Neuf jours d'historique : aucune variation possible. */
    expect(strength.variation).toEqual({});
    expect(cardio.variation).toEqual({});
    expect(getTrainingFrequency(imported, period).sessions).toBe(
      imported.filter((w) => isCountedWorkout(w) && w.date <= period.end).length,
    );
    /* Les séances importées après la fin de période (11 et 15 septembre) n'y entrent pas. */
    expect(imported.some((w) => w.date > period.end)).toBe(true);
  });
});
