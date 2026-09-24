import { getLoadKg } from "../../domain/rules/workoutRules";
import { compareAssistedSeries, loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import type {
  Exercise,
  Load,
  LoadSemantics,
  PerformedGroupRoundChild,
  WorkoutSession,
} from "../../domain";

export interface ExercisePerformanceEntry {
  workoutId: string;
  date: string;
  startedAt: string;

  series: PerformedSeriesLike[];

  /**
   * Meilleure charge du jour : la plus haute pour une charge, la plus
   * **basse** pour une assistance (lot a) — métrique `chargeMax`,
   * affichée « Assistance min » dans ce cas.
   */
  chargeMaxKg?: number;
  /**
   * Assistance seulement : le plus de répétitions faites à la meilleure
   * assistance du jour — départage deux jours à la même assistance.
   */
  repsAtBestLoad?: number;
  volumeKg?: number;
  repsMax?: number;
  durationMaxSec?: number;
  distanceCm?: number;
  /**
   * Effort en puissance (D17) : le meilleur résultat du jour, avec la
   * durée de cet effort et son unité. Deux jours ne se comparent qu'à
   * même unité et même durée.
   */
  powerMax?: number;
  powerDurationSec?: number;
  powerUnit?: "watts" | "meters";
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
  result?: { unit: "watts" | "meters"; value: number };
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

    /* Règle unique (décision du 17/09/2026) : toute série effectivement
       validée compte pour l'exercice réellement effectué, même si son tour
       est ensuite interrompu ; un enfant non validé ne compte nulle part.
       Le rang du tour et son statut ne sont pas des critères. */
    for (const round of block.rounds) {
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
  semantics: LoadSemantics,
): ExercisePerformanceEntry {
  if (semantics === "assistance") {
    return calculateAssistedEntry(workout, series);
  }

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

  const bestPower = series
    .filter((item) => item.result !== undefined)
    .reduce<PerformedSeriesLike | undefined>(
      (current, item) => (current === undefined || item.result!.value > current.result!.value ? item : current),
      undefined,
    );

  return {
    workoutId: workout.id,
    date: workout.date,
    startedAt: workout.startedAt,
    series,
    ...(bestPower?.result
      ? {
          powerMax: bestPower.result.value,
          powerUnit: bestPower.result.unit,
          ...(bestPower.durationSec !== undefined ? { powerDurationSec: bestPower.durationSec } : {}),
        }
      : {}),
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

/**
 * Assistance (lot a) : la meilleure valeur est l'assistance la plus
 * basse (à égalité, le plus de répétitions) ; aucun volume — un
 * contrepoids n'est pas une charge soulevée. Répétitions et durée
 * suivent la règle générale.
 */
function calculateAssistedEntry(
  workout: WorkoutSession,
  series: PerformedSeriesLike[],
): ExercisePerformanceEntry {
  const assisted = series.flatMap((item) => {
    const kg = getComparableLoadKg(item.load);
    const reps = getSeriesReps(item);
    return kg !== undefined && reps !== undefined ? [{ kg, reps }] : [];
  });
  const best = assisted.length > 0
    ? assisted.reduce((current, candidate) =>
        compareAssistedSeries(candidate, current) < 0 ? candidate : current,
      )
    : undefined;
  const loads = series
    .map((item) => getComparableLoadKg(item.load))
    .filter((value): value is number => value !== undefined);
  const reps = series
    .map(getSeriesReps)
    .filter((value): value is number => value !== undefined);
  const durations = series
    .map(getSeriesDurationSec)
    .filter((value): value is number => value !== undefined);

  return {
    workoutId: workout.id,
    date: workout.date,
    startedAt: workout.startedAt,
    series,
    ...(best
      ? { chargeMaxKg: best.kg, repsAtBestLoad: best.reps }
      : loads.length > 0
        ? { chargeMaxKg: Math.min(...loads) }
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
  const semantics = loadSemanticsOf(exercise);

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
      ...calculatePerformanceEntry(workout, series, semantics),
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
  | "distanceCm"
  | "powerMax";

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
      /* Une assistance n'a pas de volume (lot a). */
      return loadSemanticsOf(exercise) === "assistance"
        ? ["chargeMax", "reps"]
        : ["chargeMax", "volume", "reps"];

    case "reps":
    case "reps_per_side":
      return ["reps"];

    /* Traction négative (D25) : `durationSec` porte la répétition la plus lente. */
    case "reps_duration":
      return ["reps", "durationMax"];

    case "duration_power":
      return ["powerMax"];

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

    case "powerMax":
      return entry.powerMax;
  }
}

/**
 * Sens d'une métrique : plus bas = mieux pour une distance en cm (tests
 * de mobilité) et pour la meilleure assistance (lot a) ; plus haut = mieux
 * partout ailleurs.
 */
export function isLowerBetterMetric(
  metric: ExercisePerformanceMetric,
  semantics: LoadSemantics = "external",
): boolean {
  return metric === "distanceCm" || (metric === "chargeMax" && semantics === "assistance");
}

export function buildExercisePerformanceSummary(
  history: ExercisePerformanceEntry[],
  metric: ExercisePerformanceMetric,
  semantics: LoadSemantics = "external",
): ExercisePerformanceSummary | undefined {
  const lowerIsBetter = isLowerBetterMetric(metric, semantics);
  /* Assistance : à égalité, le plus de répétitions à cette assistance. */
  const tieBreak = metric === "chargeMax" && semantics === "assistance";

  const measured = history
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

  /* Puissance (D17) : seulement les jours de même unité et de même durée
     d'effort que le plus récent ; un sprint de 12 s ne se compare pas à
     un sprint de 20 s. */
  const reference = measured[0]?.entry;
  const comparable =
    metric === "powerMax" && reference
      ? measured.filter(
          ({ entry }) =>
            entry.powerUnit === reference.powerUnit && entry.powerDurationSec === reference.powerDurationSec,
        )
      : measured;

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
      lowerIsBetter
        ? item.value < currentBest.value ||
          (tieBreak &&
            item.value === currentBest.value &&
            (item.entry.repsAtBestLoad ?? 0) > (currentBest.entry.repsAtBestLoad ?? 0))
        : item.value > currentBest.value;

    return isBetter ? item : currentBest;
  });

  const progressionPercent =
    first.value !== 0
      ? lowerIsBetter
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