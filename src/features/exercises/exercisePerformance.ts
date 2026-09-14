import { getLoadKg } from "../../domain/rules/workoutRules";
import type {
  Exercise,
  Load,
  PerformedGroupRoundChild,
  WorkoutSession,
} from "../../domain";

export interface ExercisePerformanceEntry {
  workoutId: string;
  date: string;
  startedAt: string;

  series: PerformedSeriesLike[];

  chargeMaxKg?: number;
  volumeKg?: number;
  repsMax?: number;
  durationMaxSec?: number;
  distanceCm?: number;
}

export interface PerformedSeriesLike {
  load?: Load;
  reps?: number;
  durationSec?: number;
  sideValues?: Array<{
    side: "left" | "right";
    reps?: number;
    durationSec?: number;
  }>;
  rpe?: number;
  completedAt?: string;
}



function getComparableLoadKg(
  load: Load | undefined,
): number | undefined {
  if (!load) {
    return undefined;
  }

  if (
    load.kind === "empty" &&
    load.tareKg === undefined
  ) {
    return undefined;
  }

  return getLoadKg(load);
}

function getSeriesReps(
  series: PerformedSeriesLike,
): number | undefined {
  if (series.reps !== undefined) {
    return series.reps;
  }

  if (!series.sideValues || series.sideValues.length === 0) {
    return undefined;
  }

  const reps = series.sideValues
    .map((value) => value.reps)
    .filter((value): value is number => value !== undefined);

  if (reps.length === 0) {
    return undefined;
  }

  return Math.min(...reps);
}

function getSeriesDurationSec(
  series: PerformedSeriesLike,
): number | undefined {
  if (series.durationSec !== undefined) {
    return series.durationSec;
  }

  if (!series.sideValues || series.sideValues.length === 0) {
    return undefined;
  }

  const durations = series.sideValues
    .map((value) => value.durationSec)
    .filter((value): value is number => value !== undefined);

  if (durations.length === 0) {
    return undefined;
  }

  return Math.min(...durations);
}

function getExerciseDistanceCmFromWorkout(
  workout: WorkoutSession,
  exerciseId: string,
): number | undefined {
  for (const block of workout.blocks) {
    if (
      block.kind !== "exercise" ||
      block.exerciseId !== exerciseId ||
      block.status !== "performed" ||
      !block.simpleMeasurement
    ) {
      continue;
    }

    if (block.simpleMeasurement.distanceCm !== undefined) {
      return block.simpleMeasurement.distanceCm;
    }

    const sideDistances = (block.simpleMeasurement.sideValues ?? [])
      .map((value) => value.distanceCm)
      .filter(
        (value): value is number =>
          value !== undefined,
      );

    if (sideDistances.length > 0) {
      // Pour les tests de mobilité en cm :
      // plus bas = meilleur.
      // On retient donc le côté le moins bon,
      // c'est-à-dire la valeur numérique la plus haute.
      return Math.max(...sideDistances);
    }
  }

  return undefined;
}
function getExerciseSeriesFromWorkout(
  workout: WorkoutSession,
  exerciseId: string,
): PerformedSeriesLike[] {
  const result: PerformedSeriesLike[] = [];

  for (const block of workout.blocks) {
    if (block.kind === "exercise") {
      if (
        block.exerciseId === exerciseId &&
        block.status === "performed"
      ) {
        for (const series of block.series ?? []) {
          if (series.status === "completed") {
            result.push(series);
          }
        }
      }

      continue;
    }

    if (block.kind !== "group" || block.status !== "performed") {
      continue;
    }

    for (const round of block.rounds) {
      if (round.status !== "completed") {
        continue;
      }

      for (const child of round.children) {
        if (
          child.exerciseId === exerciseId &&
          child.completedAt
        ) {
          result.push(
            groupChildToSeriesLike(child),
          );
        }
      }
    }
  }

  return result;
}

function groupChildToSeriesLike(
  child: PerformedGroupRoundChild,
): PerformedSeriesLike {
  return {
    ...(child.load !== undefined
      ? { load: child.load }
      : {}),
    ...(child.reps !== undefined
      ? { reps: child.reps }
      : {}),
    ...(child.durationSec !== undefined
      ? { durationSec: child.durationSec }
      : {}),
    ...(child.sideValues !== undefined
      ? { sideValues: child.sideValues }
      : {}),
    ...(child.rpe !== undefined
      ? { rpe: child.rpe }
      : {}),
    ...(child.completedAt !== undefined
      ? { completedAt: child.completedAt }
      : {}),
  };
}

function calculatePerformanceEntry(
  workout: WorkoutSession,
  series: PerformedSeriesLike[],
): ExercisePerformanceEntry {
  const loads = series
    .map((item) => getComparableLoadKg(item.load))
    .filter((value): value is number => value !== undefined);

  const reps = series
    .map(getSeriesReps)
    .filter((value): value is number => value !== undefined);

  const durations = series
    .map(getSeriesDurationSec)
    .filter((value): value is number => value !== undefined);

  let volumeKg: number | undefined;

  const volumeValues = series
    .map((item) => {
      const load = getComparableLoadKg(item.load);
      const itemReps = getSeriesReps(item);

      if (load === undefined || itemReps === undefined) {
        return undefined;
      }

      return load * itemReps;
    })
    .filter((value): value is number => value !== undefined);

  if (volumeValues.length > 0) {
    volumeKg = volumeValues.reduce(
      (total, value) => total + value,
      0,
    );
  }

  return {
    workoutId: workout.id,
    date: workout.date,
    startedAt: workout.startedAt,
    series,
    ...(loads.length > 0
      ? { chargeMaxKg: Math.max(...loads) }
      : {}),
    ...(volumeKg !== undefined
      ? { volumeKg }
      : {}),
    ...(reps.length > 0
      ? { repsMax: Math.max(...reps) }
      : {}),
    ...(durations.length > 0
      ? { durationMaxSec: Math.max(...durations) }
      : {}),
  };
}

export function buildExercisePerformanceHistory(
  exercise: Exercise,
  workouts: WorkoutSession[],
): ExercisePerformanceEntry[] {
  return workouts
    .filter((workout) => workout.status === "completed")
    .map((workout) => ({
      workout,
      series: getExerciseSeriesFromWorkout(
        workout,
        exercise.id,
      ),
      distanceCm: getExerciseDistanceCmFromWorkout(
        workout,
        exercise.id,
      ),
    }))
    .filter(
      ({ series, distanceCm }) =>
        series.length > 0 || distanceCm !== undefined,
    )
    .map(({ workout, series, distanceCm }) => ({
      ...calculatePerformanceEntry(workout, series),
      ...(distanceCm !== undefined
        ? { distanceCm }
        : {}),
    }))
    .sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
}



export type ExercisePerformanceMetric =
  | "chargeMax"
  | "volume"
  | "reps"
  | "durationMax"
  | "distanceCm";

export interface ExercisePerformanceSummary {
  metric: ExercisePerformanceMetric;
  latestValue: number;
  bestValue: number;
  firstValue: number;
  progressionPercent: number | undefined;
  latestEntry: ExercisePerformanceEntry;
  bestEntry: ExercisePerformanceEntry;
}

export function getCompatiblePerformanceMetrics(
  exercise: Exercise,
): ExercisePerformanceMetric[] {
  switch (exercise.measurementType) {
    case "load_reps":
      return ["chargeMax", "volume", "reps"];

    case "reps":
    case "reps_per_side":
      return ["reps"];

    case "duration":
    case "duration_per_side":
      return ["durationMax"];

    case "distance_cm":
    case "distance_cm_per_side":
      return ["distanceCm"];

    default:
      return [];
  }
}

export function getDefaultPerformanceMetric(
  exercise: Exercise,
): ExercisePerformanceMetric | undefined {
  return getCompatiblePerformanceMetrics(exercise)[0];
}

export function getPerformanceMetricValue(
  entry: ExercisePerformanceEntry,
  metric: ExercisePerformanceMetric,
): number | undefined {
  switch (metric) {
    case "chargeMax":
      return entry.chargeMaxKg;

    case "volume":
      return entry.volumeKg;

    case "reps":
      return entry.repsMax;

    case "durationMax":
      return entry.durationMaxSec;

    case "distanceCm":
      return entry.distanceCm;
  }
}

export function buildExercisePerformanceSummary(
  history: ExercisePerformanceEntry[],
  metric: ExercisePerformanceMetric,
): ExercisePerformanceSummary | undefined {
  const comparable = history
    .map((entry) => ({
      entry,
      value: getPerformanceMetricValue(entry, metric),
    }))
    .filter(
      (
        item,
      ): item is {
        entry: ExercisePerformanceEntry;
        value: number;
      } => item.value !== undefined,
    );

  if (comparable.length === 0) {
    return undefined;
  }

  const latest = comparable[0];

  if (!latest) {
    return undefined;
  }

  const first = comparable[comparable.length - 1];

  if (!first) {
    return undefined;
  }

  const best = comparable.reduce((currentBest, item) => {
    const isBetter =
      metric === "distanceCm"
        ? item.value < currentBest.value
        : item.value > currentBest.value;

    return isBetter ? item : currentBest;
  });

  const progressionPercent =
    first.value !== 0
      ? metric === "distanceCm"
        ? ((first.value - latest.value) / Math.abs(first.value)) * 100
        : ((latest.value - first.value) / first.value) * 100
      : undefined;

  return {
    metric,
    latestValue: latest.value,
    bestValue: best.value,
    firstValue: first.value,
    progressionPercent,
    latestEntry: latest.entry,
    bestEntry: best.entry,
  };
}