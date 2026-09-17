import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Exercise, Id, WorkoutSession } from "../../domain";
import {
  buildExercisePerformanceHistory,
  getCompatiblePerformanceMetrics,
  getPerformanceMetricValue,
  type ExercisePerformanceEntry,
  type ExercisePerformanceMetric,
} from "../exercises/exercisePerformance";
import { isCountedWorkout } from "./overview";
import { isWithin, type Period } from "./period";
import { roundPercent } from "./rounding";

/**
 * Tendances par exercice — onglet Exercices (§16). Un écran de tendances,
 * pas une bibliothèque : « quels mouvements progressent, stagnent ou
 * reculent sur la période ». Les définitions de métriques sont celles de
 * la fiche (`exercisePerformance.ts`) ; ce module n'ajoute que la
 * période, l'éligibilité, la régression sur la date et le classement.
 *
 * **Tendance sur la période ≠ progression depuis le début.** La fiche
 * compare première et dernière valeur de tout l'historique ; ici, une
 * droite de régression sur les dates des réalisations de la période
 * seule, entre sa première et sa dernière réalisation.
 */

/* -------------------------------------------------------------------------- */
/* Métriques                                                                  */
/* -------------------------------------------------------------------------- */

/** Les quatre métriques de Progression (§16) ; `distanceCm` reste à la fiche. */
export type TrendMetric = Extract<ExercisePerformanceMetric, "chargeMax" | "volume" | "reps" | "durationMax">;

export const TREND_METRICS: TrendMetric[] = ["chargeMax", "volume", "reps", "durationMax"];

export const trendMetricLabels: Record<TrendMetric, string> = {
  chargeMax: "Charge max",
  volume: "Volume",
  reps: "Répétitions",
  durationMax: "Durée max",
};

export const trendMetricUnits: Record<TrendMetric, string> = {
  chargeMax: "kg",
  volume: "kg",
  reps: "reps",
  durationMax: "s",
};

/** Sens déclaré par la métrique : les quatre montent quand on progresse. */
export type TrendDirection = "higher-is-better" | "lower-is-better";

export const trendMetricDirections: Record<TrendMetric, TrendDirection> = {
  chargeMax: "higher-is-better",
  volume: "higher-is-better",
  reps: "higher-is-better",
  durationMax: "higher-is-better",
};

/**
 * Compatibilité stricte (§16) : le type de mesure de l'exercice doit
 * fournir la donnée. Un gainage n'existe pas sous `Charge max`, pas même
 * grisé. Seuls les exercices en mode séries entrent dans cet onglet.
 */
export function isTrendMetricCompatible(exercise: Exercise, metric: TrendMetric): boolean {
  return exercise.mode === "series" && getCompatiblePerformanceMetrics(exercise).includes(metric);
}

/* -------------------------------------------------------------------------- */
/* Régression et classement                                                   */
/* -------------------------------------------------------------------------- */

export interface TrendPoint {
  workoutId: Id;
  date: string;
  value: number;
}

export interface TrendLine {
  /** Valeur estimée par la droite à la première réalisation de la période. */
  fittedFirst: number;
  /** Valeur estimée par la droite à la dernière réalisation de la période. */
  fittedLast: number;
  /** Variation brute, en % de `fittedFirst`. */
  rawPercent: number;
}

/**
 * Régression linéaire de la valeur en fonction de la **date** (en jours
 * depuis la première réalisation), jamais du rang : des séances
 * irrégulières restent correctement espacées. La variation se lit entre
 * la valeur estimée à la première et à la dernière réalisation de la
 * période — pas aux bornes de la période, sinon un exercice introduit en
 * cours de route serait extrapolé sur des semaines où il n'existait pas.
 *
 * Absent quand la droite n'est pas définie : moins de deux points, toutes
 * les réalisations le même jour, ou une valeur estimée de départ nulle ou
 * négative (aucun pourcentage honnête n'en découle).
 */
export function fitTrendLine(points: TrendPoint[]): TrendLine | undefined {
  if (points.length < 2) return undefined;

  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const origin = parseISO(ordered[0]!.date);
  const xs = ordered.map((point) => differenceInCalendarDays(parseISO(point.date), origin));
  const ys = ordered.map((point) => point.value);
  const n = ordered.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  const sxx = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);

  if (sxx === 0) return undefined;

  const sxy = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index]! - meanY), 0);
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const fittedFirst = intercept + slope * xs[0]!;
  const fittedLast = intercept + slope * xs[n - 1]!;

  if (fittedFirst <= 0) return undefined;

  return {
    fittedFirst,
    fittedLast,
    rawPercent: ((fittedLast - fittedFirst) / fittedFirst) * 100,
  };
}

export type TrendStatus = "down" | "stable" | "up";

export const trendStatusLabels: Record<TrendStatus, string> = {
  down: "En baisse",
  stable: "Stable",
  up: "En progression",
};

/** Bande de stabilité (§16) : de −3 % à +3 % inclus, sur la valeur arrondie. */
export const STABILITY_BAND_PERCENT = 3;

/**
 * Le classement se fait sur la **valeur arrondie à l'unité affichée** :
 * un `+3 %` affiché est toujours Stable, jamais En progression à cause
 * d'un `+3,4 %` caché. Le sens appartient à la métrique : pour une allure
 * (plus bas est mieux), une baisse est une progression.
 */
export function classifyTrend(roundedPercent: number, direction: TrendDirection): TrendStatus {
  if (Math.abs(roundedPercent) <= STABILITY_BAND_PERCENT) return "stable";

  const improving = direction === "higher-is-better" ? roundedPercent > 0 : roundedPercent < 0;

  return improving ? "up" : "down";
}

export function formatTrendPercent(roundedPercent: number): string {
  if (roundedPercent === 0) return "0 %";

  return `${roundedPercent > 0 ? "+" : "−"}${Math.abs(roundedPercent)} %`;
}

/* -------------------------------------------------------------------------- */
/* Rapport d'un exercice                                                      */
/* -------------------------------------------------------------------------- */

export const TREND_MIN_REALISATIONS = 3;

export interface ExerciseTrend {
  scope: "period";
  exercise: Exercise;
  metric: TrendMetric;
  /** Une entrée par réalisation comparable, chronologique. */
  points: TrendPoint[];
  /** `N réalisations` : le nombre qui dit la robustesse. */
  count: number;
  lastValue: number;
  lastDate: string;
  line: TrendLine;
  /** Le pourcentage affiché est exactement celui qui classe. */
  percent: number;
  status: TrendStatus;
}

export interface ExerciseWithoutTrend {
  exercise: Exercise;
  metric: TrendMetric;
  /** Réalisations comparables sur la période, sous le seuil. */
  count: number;
  required: number;
  lastValue?: number;
  lastDate?: string;
}

/**
 * Les réalisations de l'exercice sur la période où la métrique est
 * calculable — une par séance comptée, valeurs de la fiche.
 */
export function listTrendPoints(
  exercise: Exercise,
  workouts: WorkoutSession[],
  period: Period,
  metric: TrendMetric,
): TrendPoint[] {
  const counted = workouts.filter((workout) => isCountedWorkout(workout) && isWithin(workout.date, period));
  const history: ExercisePerformanceEntry[] = buildExercisePerformanceHistory(exercise, counted);

  return history
    .map((entry) => ({ entry, value: getPerformanceMetricValue(entry, metric) }))
    .filter((item): item is { entry: ExercisePerformanceEntry; value: number } => item.value !== undefined)
    .map(({ entry, value }) => ({ workoutId: entry.workoutId, date: entry.date, value }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));
}

function hasSeriesInPeriod(exercise: Exercise, workouts: WorkoutSession[], period: Period): boolean {
  const counted = workouts.filter((workout) => isCountedWorkout(workout) && isWithin(workout.date, period));

  return buildExercisePerformanceHistory(exercise, counted).some((entry) => entry.series.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Rapport de l'onglet                                                        */
/* -------------------------------------------------------------------------- */

export type TrendsState =
  /** Au moins un exercice éligible : en-tête, compteurs, filtres, liste. */
  | "trends"
  /** Des compatibles réalisés, aucun éligible : en-tête, encart, liste dépliée. */
  | "none-eligible"
  /** Aucun compatible réalisé sur la période : titre, une phrase. */
  | "none-compatible";

export interface ExerciseTrendsReport {
  metric: TrendMetric;
  state: TrendsState;
  /** Exercices compatibles avec la métrique **et** réalisés sur la période : le « sur M ». */
  compatibleCount: number;
  /** Éligibles, dans l'ordre : En baisse → Stables → En progression, alphabétique dedans. */
  eligible: ExerciseTrend[];
  counts: Record<TrendStatus, number>;
  /** Compatibles réalisés mais sous le seuil, alphabétique. */
  withoutTrend: ExerciseWithoutTrend[];
}

const STATUS_ORDER: TrendStatus[] = ["down", "stable", "up"];
const byName = (a: { exercise: Exercise }, b: { exercise: Exercise }) =>
  a.exercise.name.localeCompare(b.exercise.name, "fr", { sensitivity: "base" });

export function buildExerciseTrend(
  exercise: Exercise,
  workouts: WorkoutSession[],
  period: Period,
  metric: TrendMetric,
): ExerciseTrend | ExerciseWithoutTrend {
  const points = listTrendPoints(exercise, workouts, period, metric);
  const last = points[points.length - 1];
  const line = points.length >= TREND_MIN_REALISATIONS ? fitTrendLine(points) : undefined;

  if (!line || !last) {
    return {
      exercise,
      metric,
      count: points.length,
      required: TREND_MIN_REALISATIONS,
      ...(last ? { lastValue: last.value, lastDate: last.date } : {}),
    };
  }

  const percent = roundPercent(line.rawPercent);

  return {
    scope: "period",
    exercise,
    metric,
    points,
    count: points.length,
    lastValue: last.value,
    lastDate: last.date,
    line,
    percent,
    status: classifyTrend(percent, trendMetricDirections[metric]),
  };
}

export function isExerciseTrend(item: ExerciseTrend | ExerciseWithoutTrend): item is ExerciseTrend {
  return "status" in item;
}

export function buildExerciseTrends(
  exercises: Exercise[],
  workouts: WorkoutSession[],
  period: Period,
  metric: TrendMetric,
): ExerciseTrendsReport {
  const compatible = exercises.filter(
    (exercise) => isTrendMetricCompatible(exercise, metric) && hasSeriesInPeriod(exercise, workouts, period),
  );
  const items = compatible.map((exercise) => buildExerciseTrend(exercise, workouts, period, metric));
  const eligible = items.filter(isExerciseTrend);
  const withoutTrend = items.filter((item): item is ExerciseWithoutTrend => !isExerciseTrend(item)).sort(byName);

  eligible.sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byName(a, b),
  );

  const counts: Record<TrendStatus, number> = { down: 0, stable: 0, up: 0 };
  for (const trend of eligible) counts[trend.status] += 1;

  return {
    metric,
    state: compatible.length === 0 ? "none-compatible" : eligible.length === 0 ? "none-eligible" : "trends",
    compatibleCount: compatible.length,
    eligible,
    counts,
    withoutTrend,
  };
}

/**
 * `Charge max · 9 exercices éligibles sur 11 compatibles réalisés`.
 */
export function formatTrendsHeadline(report: ExerciseTrendsReport): string {
  const eligible = report.eligible.length;

  return `${trendMetricLabels[report.metric]} · ${eligible} exercice${eligible > 1 ? "s" : ""} éligible${eligible > 1 ? "s" : ""} sur ${report.compatibleCount} compatible${report.compatibleCount > 1 ? "s" : ""} réalisé${report.compatibleCount > 1 ? "s" : ""}`;
}
