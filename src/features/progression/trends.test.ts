import { describe, expect, it } from "vitest";
import type { Exercise, PerformedBlock, PerformedExerciseBlock, PerformedGroupBlock, WorkoutSession } from "../../domain";
import { buildEstablishedDataset } from "./fixtures/establishedDataset";
import { isCountedWorkout } from "./overview";
import { resolvePeriod } from "./period";
import { roundPercent } from "./rounding";
import {
  buildExerciseTrend,
  buildExerciseTrends,
  classifyTrend,
  fitTrendLine,
  formatTrendPercent,
  formatTrendsHeadline,
  isExerciseTrend,
  isTrendMetricCompatible,
  listTrendPoints,
  type TrendPoint,
} from "./trends";

/* ------------------------------------------------------------------------ */
/* Fabrique                                                                 */
/* ------------------------------------------------------------------------ */

const TODAY = "2026-09-17";
const T0 = "2026-01-01T00:00:00.000Z";
const period = resolvePeriod("12w", TODAY);

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

const squat = exercise("squat", "Squat barre");
const pompes = exercise("pompes", "Pompes", { zone: "Pecs", measurementType: "reps", equipment: "Poids du corps" });
const planche = exercise("planche", "Planche", { zone: "Core", measurementType: "duration" });
const lateral = exercise("planche-lat", "Planche latérale", { zone: "Core", measurementType: "duration_per_side" });
const tapis = exercise("tapis", "Tapis", { category: "Cardio", mode: "steps", measurementType: "duration_speed_incline" });
const exercises = [squat, pompes, planche, lateral, tapis];

let counter = 0;

function block(exerciseId: string, series: Array<Record<string, unknown>>, status: PerformedExerciseBlock["status"] = "performed"): PerformedExerciseBlock {
  const id = `b${++counter}`;
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    status,
    snapshotInstructions: { shape: "reps", sets: series.length, reps: { min: 8, max: 10 }, restBetweenSetsSec: 90 },
    series: series.map((item, index) => ({ id: `${id}-s${index}`, position: index, status: "completed" as const, ...item })),
  } as PerformedExerciseBlock;
}

const kgReps = (kg: number, reps: number) => ({ load: { kind: "total", kg }, reps });

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
    blocks: blocks.map((item, position) => ({ ...item, position })),
    createdAt: `${date}T17:00:00.000Z`,
    updatedAt: `${date}T17:40:00.000Z`,
  };
}

const squatDay = (id: string, date: string, kg: number, reps = 10) => workout(id, date, [block("squat", [kgReps(kg, reps), kgReps(kg, reps), kgReps(kg, reps)])]);

/* ------------------------------------------------------------------------ */
/* Régression et classement                                                 */
/* ------------------------------------------------------------------------ */

describe("régression sur la date et classement (§16)", () => {
  const point = (date: string, value: number): TrendPoint => ({ workoutId: date, date, value });

  it("régresse sur les dates réelles, pas sur le rang : des séances irrégulières restent espacées", () => {
    /* Trois points sur une droite dans le temps : 40 au jour 0, 41 au jour 1, 100 au jour 60. */
    const irregular = fitTrendLine([point("2026-07-01", 40), point("2026-07-02", 41), point("2026-08-30", 100)])!;
    const byRank = fitTrendLine([point("2026-07-01", 40), point("2026-07-08", 41), point("2026-07-15", 100)])!;

    /* Sur les dates, la pente est ~1 kg/jour et la droite passe près des points ; sur le rang, elle serait de 30 par pas. */
    expect(irregular.fittedLast - irregular.fittedFirst).toBeCloseTo(60, 0);
    expect(irregular.rawPercent).toBeCloseTo(150, 0);
    expect(byRank.rawPercent).not.toBeCloseTo(irregular.rawPercent, 0);

    /* Une progression parfaitement linéaire dans le temps est restituée exactement. */
    const linear = fitTrendLine([point("2026-07-01", 40), point("2026-07-15", 42), point("2026-08-12", 46)])!;
    expect(linear.fittedFirst).toBeCloseTo(40, 6);
    expect(linear.fittedLast).toBeCloseTo(46, 6);
    expect(linear.rawPercent).toBeCloseTo(15, 6);
  });

  it("donne 0 % pour des valeurs identiques, et aucune droite pour un seul jour ou une base nulle", () => {
    expect(fitTrendLine([point("2026-07-01", 50), point("2026-07-10", 50), point("2026-07-20", 50)])!.rawPercent).toBe(0);
    expect(fitTrendLine([point("2026-07-01", 50), point("2026-07-01", 60), point("2026-07-01", 70)])).toBeUndefined();
    expect(fitTrendLine([point("2026-07-01", 50)])).toBeUndefined();
    /* Une droite qui démarre à zéro ou en dessous n'a pas de pourcentage. */
    expect(fitTrendLine([point("2026-07-01", 0), point("2026-07-08", 0), point("2026-07-15", 10)])).toBeUndefined();
  });

  it("classe sur la valeur arrondie : ±3 inclus est stable, ambre en dessous, vert au-dessus", () => {
    expect(classifyTrend(roundPercent(3.4), "higher-is-better")).toBe("stable");
    expect(classifyTrend(roundPercent(3.5), "higher-is-better")).toBe("up");
    expect(classifyTrend(roundPercent(-3.4), "higher-is-better")).toBe("stable");
    /* Arrondi symétrique : −3,5 → −4, pas −3 comme le ferait Math.round. */
    expect(roundPercent(-3.5)).toBe(-4);
    expect(roundPercent(-0.4)).toBe(0);
    expect(classifyTrend(roundPercent(-3.5), "higher-is-better")).toBe("down");
    expect(classifyTrend(3, "higher-is-better")).toBe("stable");
    expect(classifyTrend(-3, "higher-is-better")).toBe("stable");
    expect(classifyTrend(0, "higher-is-better")).toBe("stable");
    /* Sens déclaré par la métrique : une allure qui baisse est une amélioration. */
    expect(classifyTrend(-9, "lower-is-better")).toBe("up");
    expect(classifyTrend(9, "lower-is-better")).toBe("down");
    expect(formatTrendPercent(8)).toBe("+8 %");
    expect(formatTrendPercent(-4)).toBe("−4 %");
    expect(formatTrendPercent(0)).toBe("0 %");
  });
});

/* ------------------------------------------------------------------------ */
/* Compatibilité, réalisations comparables                                  */
/* ------------------------------------------------------------------------ */

describe("compatibilité et réalisations comparables", () => {
  it("n'accepte que les métriques que le type de mesure fournit, et jamais un exercice cardio", () => {
    expect(isTrendMetricCompatible(squat, "chargeMax")).toBe(true);
    expect(isTrendMetricCompatible(squat, "durationMax")).toBe(false);
    expect(isTrendMetricCompatible(pompes, "reps")).toBe(true);
    expect(isTrendMetricCompatible(pompes, "chargeMax")).toBe(false);
    expect(isTrendMetricCompatible(pompes, "volume")).toBe(false);
    expect(isTrendMetricCompatible(planche, "durationMax")).toBe(true);
    expect(isTrendMetricCompatible(lateral, "durationMax")).toBe(true);
    expect(isTrendMetricCompatible(tapis, "durationMax")).toBe(false);
  });

  it("ne retient que les réalisations où la métrique est calculable : à vide sans tare, séries sans reps, briques non réalisées", () => {
    const workouts = [
      squatDay("a", "2026-07-01", 40),
      /* À vide sans tare : pas de charge comparable, pas de volume ; les reps restent. */
      workout("b", "2026-07-08", [block("squat", [{ load: { kind: "empty" }, reps: 12 }])]),
      /* Brique non réalisée : rien. */
      workout("c", "2026-07-15", [block("squat", [kgReps(60, 10)], "not_performed")]),
      /* Séance arrêtée sans aucune réalisation : hors comptes. */
      { ...workout("d", "2026-07-20", [block("squat", [], "not_performed")]), blocks: [block("squat", [], "not_performed")] },
      squatDay("e", "2026-07-22", 44),
    ];

    expect(listTrendPoints(squat, workouts, period, "chargeMax").map((p) => [p.date, p.value])).toEqual([["2026-07-01", 40], ["2026-07-22", 44]]);
    expect(listTrendPoints(squat, workouts, period, "volume").map((p) => p.value)).toEqual([1200, 1320]);
    expect(listTrendPoints(squat, workouts, period, "reps").map((p) => [p.date, p.value])).toEqual([["2026-07-01", 10], ["2026-07-08", 12], ["2026-07-22", 10]]);
    expect(isCountedWorkout(workouts[3]!)).toBe(false);
  });

  it("retient le côté le plus faible pour une mesure par côté", () => {
    const workouts = [
      workout("a", "2026-07-01", [block("planche-lat", [{ sideValues: [{ side: "left", durationSec: 40 }, { side: "right", durationSec: 30 }] }])]),
    ];

    expect(listTrendPoints(lateral, workouts, period, "durationMax").map((p) => p.value)).toEqual([30]);
  });

  it("ignore les réalisations hors période et attribue les tours de groupe à l'exercice réellement fait", () => {
    const group: PerformedGroupBlock = {
      id: "g",
      kind: "group",
      position: 0,
      addedDuringWorkout: false,
      status: "performed",
      plannedRounds: 2,
      plannedRestBetweenRoundsSec: 60,
      children: [{ id: "c1", position: 0, exerciseId: "pompes", snapshotInstructions: { shape: "reps", reps: { min: 8, max: 10 } } }],
      rounds: [
        { id: "r1", roundNumber: 1, status: "completed", children: [{ id: "r1c1", groupChildId: "c1", exerciseId: "squat", load: { kind: "total", kg: 50 }, reps: 8, completedAt: T0 }], completedAt: T0 },
        { id: "r2", roundNumber: 2, status: "completed", children: [{ id: "r2c1", groupChildId: "c1", exerciseId: "squat", load: { kind: "total", kg: 55 }, reps: 8, completedAt: T0 }], completedAt: T0 },
      ],
    };
    const workouts = [
      squatDay("old", "2026-06-25", 30),
      squatDay("first", "2026-06-26", 40),
      workout("grp", "2026-07-10", [group]),
    ];

    expect(listTrendPoints(squat, workouts, period, "chargeMax").map((p) => [p.date, p.value])).toEqual([["2026-06-26", 40], ["2026-07-10", 55]]);
    /* Le pompes prévu dans le groupe n'a rien fait : aucune réalisation. */
    expect(listTrendPoints(pompes, workouts, period, "reps")).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/* Éligibilité, rapport, en-tête                                            */
/* ------------------------------------------------------------------------ */

describe("rapport de l'onglet Exercices", () => {
  const workouts = [
    /* Squat : 4 réalisations, +10 % linéaire → En progression. */
    squatDay("s1", "2026-07-01", 40),
    squatDay("s2", "2026-07-15", 41),
    squatDay("s3", "2026-08-05", 42.5),
    squatDay("s4", "2026-09-02", 44.4),
    /* Pompes : 3 réalisations identiques → Stable ; planche 2 réalisations → sans tendance. */
    workout("p1", "2026-07-03", [block("pompes", [{ reps: 15 }]), block("planche", [{ durationSec: 60 }])]),
    workout("p2", "2026-08-03", [block("pompes", [{ reps: 15 }]), block("planche", [{ durationSec: 70 }])]),
    workout("p3", "2026-09-03", [block("pompes", [{ reps: 15 }])]),
  ];

  it("exige trois réalisations comparables sur la période, classe et ordonne En baisse → Stables → En progression", () => {
    const report = buildExerciseTrends(exercises, workouts, period, "reps");

    expect(report.state).toBe("trends");
    expect(report.compatibleCount).toBe(2);
    expect(report.eligible.map((t) => [t.exercise.name, t.percent, t.status, t.count])).toEqual([
      ["Pompes", 0, "stable", 3],
      ["Squat barre", 0, "stable", 4],
    ]);
    expect(report.counts).toEqual({ down: 0, stable: 2, up: 0 });
    expect(formatTrendsHeadline(report)).toBe("Répétitions · 2 exercices éligibles sur 2 compatibles réalisés");

    const charge = buildExerciseTrends(exercises, workouts, period, "chargeMax");
    expect(charge.eligible.map((t) => [t.exercise.name, t.percent, t.status])).toEqual([["Squat barre", 11, "up"]]);
    expect(charge.eligible[0]!.lastValue).toBe(44.4);
    expect(charge.eligible[0]!.lastDate).toBe("2026-09-02");
    expect(charge.eligible[0]!.scope).toBe("period");
    expect(formatTrendsHeadline(charge)).toBe("Charge max · 1 exercice éligible sur 1 compatible réalisé");
  });

  it("place sous le seuil dans « sans tendance », avec la dernière valeur datée et le compte sur 3", () => {
    const report = buildExerciseTrends(exercises, workouts, period, "durationMax");

    expect(report.state).toBe("none-eligible");
    expect(report.eligible).toEqual([]);
    expect(report.compatibleCount).toBe(1);
    expect(report.withoutTrend).toEqual([
      { exercise: planche, metric: "durationMax", count: 2, required: 3, lastValue: 70, lastDate: "2026-08-03" },
    ]);
    expect(formatTrendsHeadline(report)).toBe("Durée max · 0 exercice éligible sur 1 compatible réalisé");
  });

  it("ne montre rien quand aucun exercice compatible n'a été réalisé sur la période", () => {
    const report = buildExerciseTrends(exercises, [squatDay("s1", "2026-07-01", 40)], period, "durationMax");

    expect(report).toMatchObject({ state: "none-compatible", compatibleCount: 0, eligible: [], withoutTrend: [] });
  });

  it("recule de « tendance » à « sans tendance » quand une réalisation est supprimée", () => {
    const before = buildExerciseTrend(pompes, workouts, period, "reps");
    const after = buildExerciseTrend(pompes, workouts.filter((w) => w.id !== "p2"), period, "reps");

    expect(isExerciseTrend(before)).toBe(true);
    expect(isExerciseTrend(after)).toBe(false);
    expect(after).toMatchObject({ count: 2, required: 3, lastValue: 15, lastDate: "2026-09-03" });
  });

  it("un exercice compatible réalisé sans aucune valeur calculable reste compté dans « sur M », sans dernière valeur", () => {
    const onlyEmpty = [workout("e", "2026-07-08", [block("squat", [{ load: { kind: "empty" }, reps: 12 }])])];
    const report = buildExerciseTrends(exercises, onlyEmpty, period, "chargeMax");

    expect(report.state).toBe("none-eligible");
    expect(report.compatibleCount).toBe(1);
    expect(report.withoutTrend[0]).toEqual({ exercise: squat, metric: "chargeMax", count: 0, required: 3 });
  });

  it("tri : En baisse d'abord, puis alphabétique dans chaque statut", () => {
    const down = exercise("rowing", "Rowing", { zone: "Dos" });
    const upA = exercise("curl", "Curl", { zone: "Bras" });
    const many = [
      ...workouts,
      ...["2026-07-01", "2026-08-01", "2026-09-01"].map((date, i) => workout(`r${i}`, date, [block("rowing", [kgReps(50 - i * 5, 10)]), block("curl", [kgReps(10 + i, 12)])])),
    ];
    const report = buildExerciseTrends([...exercises, down, upA], many, period, "chargeMax");

    expect(report.eligible.map((t) => [t.exercise.name, t.status])).toEqual([
      ["Rowing", "down"],
      ["Curl", "up"],
      ["Squat barre", "up"],
    ]);
    expect(report.counts).toEqual({ down: 1, stable: 0, up: 2 });
  });
});

/* ------------------------------------------------------------------------ */
/* Jeu de référence                                                         */
/* ------------------------------------------------------------------------ */

describe("tendances sur le jeu « état établi »", () => {
  const dataset = buildEstablishedDataset("2026-09-10");
  const p12 = resolvePeriod("12w", dataset.today);

  /** Moindres carrés indépendants du moteur, sur les jours depuis la première date. */
  function leastSquaresPercent(points: Array<{ date: string; value: number }>): number {
    const day = (d: string) => Math.round((Date.parse(d) - Date.parse(points[0]!.date)) / 86400000);
    const n = points.length;
    const xs = points.map((p) => day(p.date));
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = points.reduce((a, p) => a + p.value, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const sxy = xs.reduce((a, x, i) => a + (x - mx) * (points[i]!.value - my), 0);
    const b = sxy / sxx;
    const a = my - b * mx;
    const first = a + b * xs[0]!;
    const last = a + b * xs[n - 1]!;
    const percent = ((last - first) / first) * 100;
    return Math.sign(percent) * Math.round(Math.abs(percent));
  }

  it("Charge max : le squat monte de 0,5 kg par semaine → +12 % exactement linéaire, presse +? , curl par paliers", () => {
    const report = buildExerciseTrends(dataset.exercises, dataset.workouts, p12, "chargeMax");
    const byName = new Map(report.eligible.map((t) => [t.exercise.name, t]));

    /* Squat : lundis des semaines 14 → 25 (2 manqués), 47 kg → 52,5 kg, droite exacte. */
    const squatTrend = byName.get("Squat barre")!;
    expect(squatTrend.count).toBe(10);
    expect(squatTrend.points[0]).toMatchObject({ date: "2026-06-22", value: 47 });
    expect(squatTrend.lastValue).toBe(52.5);
    expect(squatTrend.percent).toBe(Math.round(((52.5 - 47) / 47) * 100));
    expect(squatTrend.status).toBe("up");

    /* Chaque pourcentage est celui d'une régression sur les dates, recomptée à part. */
    for (const trend of report.eligible) {
      expect(trend.percent).toBe(leastSquaresPercent(trend.points));
    }
    expect(report.compatibleCount).toBe(4);
    expect(report.eligible.map((t) => t.exercise.name).sort()).toEqual(["Curl haltères", "Presse à cuisses", "Squat barre", "Tirage vertical"]);
    expect(report.eligible.map((t) => t.status)).toEqual(report.eligible.map((t) => t.status).slice().sort((a, b) => ["down", "stable", "up"].indexOf(a) - ["down", "stable", "up"].indexOf(b)));
  });

  it("Répétitions et Durée max : compatibilité stricte, pompes par paliers, planche mêlant lundis et samedis", () => {
    const reps = buildExerciseTrends(dataset.exercises, dataset.workouts, p12, "reps");
    const duration = buildExerciseTrends(dataset.exercises, dataset.workouts, p12, "durationMax");

    expect(reps.compatibleCount).toBe(5);
    expect(reps.eligible.map((t) => t.exercise.name).sort()).toEqual(["Curl haltères", "Pompes", "Presse à cuisses", "Squat barre", "Tirage vertical"]);
    const pompesTrend = reps.eligible.find((t) => t.exercise.name === "Pompes")!;
    expect(pompesTrend.percent).toBe(leastSquaresPercent(pompesTrend.points));
    expect(pompesTrend.count).toBe(9);

    expect(duration.compatibleCount).toBe(1);
    const plancheTrend = duration.eligible[0]!;
    expect(plancheTrend.exercise.name).toBe("Planche");
    /* 10 lundis (45 s + semaine) et 8 samedis (30 s) : la droite ne suit pas une simple première → dernière. */
    expect(plancheTrend.count).toBe(18);
    expect(plancheTrend.percent).toBe(leastSquaresPercent(plancheTrend.points));
    const firstToLast = Math.round(((plancheTrend.points[plancheTrend.count - 1]!.value - plancheTrend.points[0]!.value) / plancheTrend.points[0]!.value) * 100);
    expect(plancheTrend.percent).not.toBe(firstToLast);
  });

  it("le tapis et le vélo n'existent pas dans cet onglet, quelle que soit la métrique", () => {
    for (const metric of ["chargeMax", "volume", "reps", "durationMax"] as const) {
      const report = buildExerciseTrends(dataset.exercises, dataset.workouts, p12, metric);
      const names = [...report.eligible, ...report.withoutTrend].map((t) => t.exercise.name);
      expect(names).not.toContain("Tapis de course");
      expect(names).not.toContain("Vélo");
    }
  });
});
