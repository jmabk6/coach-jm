import type {
  Exercise,
  Id,
  PerformedCardioStep,
  PerformedExerciseBlock,
  PerformedSimpleMeasurement,
  WorkoutSession,
} from "../../domain";
import { isCardioStepComparable } from "../../domain/rules/workoutRules";
import { formatSpeedOrPace } from "../workout/workoutBlockDetail";
import { cardioKindOf, type CardioKind } from "./exerciseNature";
import { isCountedWorkout } from "./overview";
import { isWithin, type Period } from "./period";
import { roundPercent } from "./rounding";
import {
  classifyTrend,
  fitTrendLine,
  TREND_MIN_REALISATIONS,
  type TrendDirection,
  type TrendLine,
  type TrendPoint,
  type TrendStatus,
} from "./trends";

/**
 * Onglet Cardio (§16) — analyse **descriptive** par exercice, complétée
 * par des comparaisons strictes là où elles sont réellement possibles.
 * Unité d'analyse : l'exercice cardio ; jamais de moyenne ni de classement
 * entre activités, jamais de vitesse ou de pente moyenne pour un tapis qui
 * s'adapte au pouls — des plages. Rien n'est inventé quand une donnée
 * manque : la métrique n'existe pas, ni à `—`, ni à zéro.
 */

/* -------------------------------------------------------------------------- */
/* Périmètre                                                                  */
/* -------------------------------------------------------------------------- */

export { cardioKindOf, isCardioExercise, type CardioKind } from "./exerciseNature";

/* -------------------------------------------------------------------------- */
/* Réalisations                                                               */
/* -------------------------------------------------------------------------- */

export interface CardioRealisation {
  workoutId: Id;
  date: string;
  /** Paliers validés de la séance, toutes briques de l'exercice confondues. */
  steps: PerformedCardioStep[];
  /** Mesure simple de la séance, s'il y en a une. */
  measurement?: PerformedSimpleMeasurement;
}

function blocksOf(workout: WorkoutSession, exerciseId: Id): PerformedExerciseBlock[] {
  return workout.blocks.filter(
    (block): block is PerformedExerciseBlock =>
      block.kind === "exercise" && block.exerciseId === exerciseId && block.status === "performed",
  );
}

/**
 * Une réalisation par séance comptée de la période où l'exercice a au
 * moins un palier validé ou une mesure saisie ; chronologique.
 */
export function listCardioRealisations(
  exerciseId: Id,
  workouts: WorkoutSession[],
  period: Period,
): CardioRealisation[] {
  const result: CardioRealisation[] = [];

  for (const workout of workouts) {
    if (!isCountedWorkout(workout) || !isWithin(workout.date, period)) continue;

    const blocks = blocksOf(workout, exerciseId);
    const steps = blocks.flatMap((block) =>
      (block.cardioSteps ?? []).filter((step) => step.status === "completed"),
    );
    const measurement = blocks.find((block) => block.simpleMeasurement)?.simpleMeasurement;

    if (steps.length === 0 && !measurement) continue;

    result.push({
      workoutId: workout.id,
      date: workout.date,
      steps,
      ...(measurement ? { measurement } : {}),
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));
}

/* -------------------------------------------------------------------------- */
/* Couverture BPM                                                             */
/* -------------------------------------------------------------------------- */

export const BPM_MIN_COVERAGE_RATIO = 0.5;
export const BPM_MIN_VALUES = 5;

export interface BpmAverage {
  average: number;
  count: number;
  total: number;
}

/**
 * BPM moyen d'une réalisation en paliers (§16) : moyenne simple des
 * relevés de fin de palier, affichée seulement si au moins 50 % des
 * paliers réalisés sont renseignés **et** au moins 5 valeurs existent.
 * En dessous, rien — les valeurs individuelles restent sur leurs lignes.
 */
export function averageBpm(steps: PerformedCardioStep[]): BpmAverage | undefined {
  const values = steps.map((step) => step.bpm).filter((value): value is number => value !== undefined);

  if (values.length < BPM_MIN_VALUES || values.length < steps.length * BPM_MIN_COVERAGE_RATIO) {
    return undefined;
  }

  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    count: values.length,
    total: steps.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Descriptif                                                                 */
/* -------------------------------------------------------------------------- */

export interface Range {
  min: number;
  max: number;
}

function rangeOf(values: number[]): Range | undefined {
  return values.length === 0 ? undefined : { min: Math.min(...values), max: Math.max(...values) };
}

export interface CardioLastRealisation {
  workoutId: Id;
  date: string;
  durationSec?: number;
  stepsCount?: number;
  /** Plages de réglages réellement exécutés — jamais une moyenne. */
  speedRange?: Range;
  inclineRange?: Range;
  distanceRange?: Range;
  distanceKm?: number;
  /** Vitesse ou allure selon la lecture de l'exercice, jamais les deux. */
  speedOrPace?: string;
  /** Moyenne des paliers, soumise au seuil de couverture. */
  bpm?: BpmAverage;
  /** Relevés renseignés / paliers réalisés, toujours disponibles. */
  bpmCoverage?: { count: number; total: number };
  /** BPM d'une mesure simple, s'il a été saisi. */
  bpmValue?: number;
}

export interface CardioPeriodTotals {
  realisations: number;
  /** Durée mesurée seulement : une distance seule n'y entre pas. */
  durationSec?: number;
  distanceKm?: number;
}

function stepDurationSec(steps: PerformedCardioStep[]): number {
  return steps.reduce((sum, step) => sum + step.settings.durationSec, 0);
}

export function describeLastRealisation(
  kind: CardioKind,
  realisation: CardioRealisation,
  exercise: Exercise,
): CardioLastRealisation {
  const base = { workoutId: realisation.workoutId, date: realisation.date };

  if (kind === "steps") {
    const steps = realisation.steps;
    const speeds = steps.flatMap((step) => ("speedKmh" in step.settings ? [step.settings.speedKmh] : []));
    const inclines = steps.flatMap((step) => ("inclinePercent" in step.settings ? [step.settings.inclinePercent] : []));
    const distances = steps.flatMap((step) => ("distanceKm" in step.settings ? [step.settings.distanceKm] : []));
    const bpm = averageBpm(steps);
    const known = steps.filter((step) => step.bpm !== undefined).length;
    const speedRange = rangeOf(speeds);
    const inclineRange = rangeOf(inclines);
    const distanceRange = rangeOf(distances);

    return {
      ...base,
      durationSec: stepDurationSec(steps),
      stepsCount: steps.length,
      ...(speedRange ? { speedRange } : {}),
      ...(inclineRange ? { inclineRange } : {}),
      ...(distanceRange ? { distanceRange } : {}),
      ...(bpm ? { bpm } : {}),
      bpmCoverage: { count: known, total: steps.length },
    };
  }

  const measure = realisation.measurement;
  const durationSec = measure?.durationSec;
  const distanceKm = measure?.distanceKm;
  const speedOrPace =
    kind === "duration_distance" && durationSec !== undefined && distanceKm !== undefined
      ? formatSpeedOrPace(durationSec, distanceKm, exercise.speedDisplay)
      : undefined;

  return {
    ...base,
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    ...(speedOrPace ? { speedOrPace } : {}),
    ...(measure?.bpm !== undefined ? { bpmValue: measure.bpm } : {}),
  };
}

export function describePeriodTotals(kind: CardioKind, realisations: CardioRealisation[]): CardioPeriodTotals {
  const totals: CardioPeriodTotals = { realisations: realisations.length };

  if (kind === "steps") {
    totals.durationSec = realisations.reduce((sum, item) => sum + stepDurationSec(item.steps), 0);
    return totals;
  }

  const durations = realisations.flatMap((item) =>
    item.measurement?.durationSec !== undefined ? [item.measurement.durationSec] : [],
  );
  const distances = realisations.flatMap((item) =>
    item.measurement?.distanceKm !== undefined ? [item.measurement.distanceKm] : [],
  );

  if (kind === "duration_distance" && durations.length > 0) {
    totals.durationSec = durations.reduce((sum, value) => sum + value, 0);
  }
  if (distances.length > 0) {
    totals.distanceKm = distances.reduce((sum, value) => sum + value, 0);
  }

  return totals;
}

/* -------------------------------------------------------------------------- */
/* Tendance à durée comparable (Durée + distance)                             */
/* -------------------------------------------------------------------------- */

export const DURATION_TOLERANCE = 0.1;

export type PaceMetric = "speed_kmh" | "pace_min_km" | "pace_min_500m";

export interface DurationComparableTrend {
  metric: PaceMetric;
  direction: TrendDirection;
  /** Durée médiane des réalisations complètes (durée et distance) de la période. */
  medianDurationSec: number;
  /** Réalisations dont la durée est dans ±10 % de la médiane. */
  points: TrendPoint[];
  count: number;
  required: number;
  line?: TrendLine;
  percent?: number;
  status?: TrendStatus;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function isDurationComparable(durationSec: number, referenceSec: number): boolean {
  return Math.abs(durationSec - referenceSec) <= referenceSec * DURATION_TOLERANCE;
}

/**
 * Valeur de la métrique d'allure pour une réalisation : km/h, ou secondes
 * par kilomètre / par 500 m. Une allure plus basse est meilleure.
 */
export function paceValue(metric: PaceMetric, durationSec: number, distanceKm: number): number {
  switch (metric) {
    case "speed_kmh":
      return distanceKm / (durationSec / 3600);
    case "pace_min_km":
      return durationSec / distanceKm;
    case "pace_min_500m":
      return durationSec / (distanceKm * 2);
  }
}

export function buildDurationComparableTrend(
  exercise: Exercise,
  realisations: CardioRealisation[],
): DurationComparableTrend | undefined {
  const complete = realisations.filter(
    (item) =>
      item.measurement?.durationSec !== undefined &&
      item.measurement.durationSec > 0 &&
      item.measurement.distanceKm !== undefined &&
      item.measurement.distanceKm > 0,
  );

  if (complete.length === 0) return undefined;

  const metric: PaceMetric = exercise.speedDisplay ?? "speed_kmh";
  const direction: TrendDirection = metric === "speed_kmh" ? "higher-is-better" : "lower-is-better";
  const medianDurationSec = median(complete.map((item) => item.measurement!.durationSec!));
  const points: TrendPoint[] = complete
    .filter((item) => isDurationComparable(item.measurement!.durationSec!, medianDurationSec))
    .map((item) => ({
      workoutId: item.workoutId,
      date: item.date,
      value: paceValue(metric, item.measurement!.durationSec!, item.measurement!.distanceKm!),
    }));
  const line = points.length >= TREND_MIN_REALISATIONS ? fitTrendLine(points) : undefined;
  const percent = line ? roundPercent(line.rawPercent) : undefined;

  return {
    metric,
    direction,
    medianDurationSec,
    points,
    count: points.length,
    required: TREND_MIN_REALISATIONS,
    ...(line ? { line } : {}),
    ...(percent !== undefined ? { percent, status: classifyTrend(percent, direction) } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Paliers comparables (paliers)                                              */
/* -------------------------------------------------------------------------- */

export interface StepOccurrence {
  workoutId: Id;
  date: string;
  step: PerformedCardioStep;
}

export interface ComparableStepGroup {
  /** Réglages de référence du groupe : ceux de sa première occurrence. */
  durationSec: number;
  speedKmh: number;
  inclinePercent: number;
  occurrences: StepOccurrence[];
  /** Occurrences avec BPM renseigné : la seule lecture directionnelle du BPM. */
  bpmPoints: TrendPoint[];
  required: number;
  line?: TrendLine;
  percent?: number;
  /** BPM plus bas = amélioration (`up`), plus haut = ambre (`down`). */
  status?: TrendStatus;
}

/**
 * Regroupe les paliers réalisés de la période par réglages **réellement
 * exécutés** : même vitesse, même pente, durée comparable à ±10 % de la
 * première occurrence rencontrée (règle de `Dernière fois comparable`,
 * §11 — le rang n'est pas un critère). Un palier adapté pendant la séance
 * est comparé sur ses réglages exécutés, jamais sur sa consigne d'origine.
 * Ordre : groupes les plus fréquents d'abord, puis vitesse, pente, durée.
 */
export function groupComparableSteps(realisations: CardioRealisation[]): ComparableStepGroup[] {
  const groups: ComparableStepGroup[] = [];

  for (const realisation of realisations) {
    for (const step of realisation.steps) {
      if (!("speedKmh" in step.settings)) continue;

      const settings = step.settings;
      const occurrence: StepOccurrence = { workoutId: realisation.workoutId, date: realisation.date, step };
      const group = groups.find((candidate) =>
        isCardioStepComparable(
          { durationSec: candidate.durationSec, speedKmh: candidate.speedKmh, inclinePercent: candidate.inclinePercent },
          settings,
        ),
      );

      if (group) {
        group.occurrences.push(occurrence);
      } else {
        groups.push({
          durationSec: settings.durationSec,
          speedKmh: settings.speedKmh,
          inclinePercent: settings.inclinePercent,
          occurrences: [occurrence],
          bpmPoints: [],
          required: TREND_MIN_REALISATIONS,
        });
      }
    }
  }

  for (const group of groups) {
    group.bpmPoints = group.occurrences
      .filter((item) => item.step.bpm !== undefined)
      .map((item) => ({ workoutId: item.workoutId, date: item.date, value: item.step.bpm! }));

    const line = group.bpmPoints.length >= TREND_MIN_REALISATIONS ? fitTrendLine(group.bpmPoints) : undefined;

    if (line) {
      const percent = roundPercent(line.rawPercent);
      group.line = line;
      group.percent = percent;
      group.status = classifyTrend(percent, "lower-is-better");
    }
  }

  return groups.sort(
    (a, b) =>
      b.occurrences.length - a.occurrences.length ||
      a.speedKmh - b.speedKmh ||
      a.inclinePercent - b.inclinePercent ||
      a.durationSec - b.durationSec,
  );
}

/* -------------------------------------------------------------------------- */
/* Rapport                                                                    */
/* -------------------------------------------------------------------------- */

export interface CardioExerciseReport {
  exercise: Exercise;
  kind: CardioKind;
  totals: CardioPeriodTotals;
  last: CardioLastRealisation;
  /** Durée + distance seulement. */
  trend?: DurationComparableTrend;
  /** Paliers seulement. */
  comparableSteps?: ComparableStepGroup[];
}

export interface CardioReport {
  state: "empty" | "list";
  exercises: CardioExerciseReport[];
  /** Vrai dès qu'une comparaison est disponible quelque part (état établi). */
  hasComparison: boolean;
}

export function buildCardioExerciseReport(
  exercise: Exercise,
  workouts: WorkoutSession[],
  period: Period,
): CardioExerciseReport | undefined {
  const kind = cardioKindOf(exercise);

  if (!kind) return undefined;

  const realisations = listCardioRealisations(exercise.id, workouts, period);
  const lastRealisation = realisations[realisations.length - 1];

  if (!lastRealisation) return undefined;

  const trend = kind === "duration_distance" ? buildDurationComparableTrend(exercise, realisations) : undefined;

  return {
    exercise,
    kind,
    totals: describePeriodTotals(kind, realisations),
    last: describeLastRealisation(kind, lastRealisation, exercise),
    ...(trend ? { trend } : {}),
    ...(kind === "steps" ? { comparableSteps: groupComparableSteps(realisations) } : {}),
  };
}

export function buildCardioReport(exercises: Exercise[], workouts: WorkoutSession[], period: Period): CardioReport {
  const reports = exercises
    .map((exercise) => buildCardioExerciseReport(exercise, workouts, period))
    .filter((report): report is CardioExerciseReport => report !== undefined)
    .sort((a, b) => a.exercise.name.localeCompare(b.exercise.name, "fr", { sensitivity: "base" }));

  return {
    state: reports.length === 0 ? "empty" : "list",
    exercises: reports,
    hasComparison: reports.some(
      (report) =>
        report.trend?.status !== undefined ||
        (report.comparableSteps ?? []).some((group) => group.status !== undefined),
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Formats                                                                    */
/* -------------------------------------------------------------------------- */

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** `4,5–5 km/h`, `0–12 %` — un tiret, jamais une flèche. */
export function formatRange(range: Range, unit: string): string {
  return range.min === range.max
    ? `${fr.format(range.min)} ${unit}`
    : `${fr.format(range.min)}–${fr.format(range.max)} ${unit}`;
}

/** `5 min · 5 km/h · 8 %` : un groupe de paliers est identifié par ses réglages. */
export function formatStepGroupLabel(group: ComparableStepGroup): string {
  const minutes = group.durationSec % 60 === 0 ? `${group.durationSec / 60} min` : `${group.durationSec} s`;

  return `${minutes} · ${fr.format(group.speedKmh)} km/h · ${fr.format(group.inclinePercent)} %`;
}
