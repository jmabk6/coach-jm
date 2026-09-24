import type { Exercise, Id, LoadSemantics, MuscleZone, PerformedBlock, PerformedSeries, SessionBlock } from "../models";
import { loadSemanticsOf } from "./loadSemanticsRules";

/**
 * Volume (tonnage) d'une liste de séries **d'un même exercice**.
 * Une assistance n'est pas une charge soulevée : sa contribution est
 * nulle (lot a, 23/09/2026). Une liste qui mêle plusieurs exercices
 * passe par `calculateBlocksVolume` (`workoutRecap.ts`).
 */
export function calculateVolume(
  series: ReadonlyArray<PerformedSeries>,
  semantics: LoadSemantics = "external",
): number {
  if (semantics === "assistance") return 0;

  return series.reduce((total, item) => {
    if (!item.load || item.reps === undefined) {
      return total;
    }

    const loadKg =
      item.load.kind === "total"
        ? item.load.kg
        : item.load.kind === "empty"
          ? (item.load.tareKg ?? 0)
          : item.load.kgPerSide * 2 + (item.load.tareKg ?? 0);

    return total + loadKg * item.reps;
  }, 0);
}

export function calculateVisibleNumbering(
  blocks: SessionBlock[],
): Partial<Record<Id, number>> {
  const numbering: Partial<Record<Id, number>> = {};
  let visibleNumber = 0;

  const orderedBlocks = [...blocks].sort(
    (a, b) => a.position - b.position,
  );

  for (const block of orderedBlocks) {
    if (block.kind === "note") {
      continue;
    }

    visibleNumber += 1;
    numbering[block.id] = visibleNumber;
  }

  return numbering;
}

export interface ExecutionProgress {
  completed: number;
  total: number;
}

export function calculateExecutionProgress(
  blocks: PerformedBlock[],
): ExecutionProgress {
  let completed = 0;
  let total = 0;

  for (const block of blocks) {
    if (block.kind === "note" || block.status === "skipped") {
      continue;
    }

    total += 1;

    if (block.status === "performed") {
      completed += 1;
    }
  }

  return {
    completed,
    total,
  };
}

export function calculateSessionDuration(
  blocks: SessionBlock[],
): number {
  let totalSec = 0;

  for (const block of blocks) {
    if (block.kind === "note") {
      continue;
    }

    if (block.kind === "exercise") {
      const instructions = block.instructions;

      switch (instructions.shape) {
        case "reps":
          totalSec +=
            Math.max(0, instructions.sets - 1) *
            instructions.restBetweenSetsSec;
          break;

        case "duration":
          totalSec +=
            instructions.sets * instructions.durationSec +
            Math.max(0, instructions.sets - 1) *
              instructions.restBetweenSetsSec;
          break;

        case "steps":
          totalSec += instructions.steps.reduce(
            (sum, step) => sum + step.durationSec,
            0,
          );
          break;

        case "duration_distance":
          totalSec += instructions.durationSec ?? 0;
          break;

        case "distance":
          break;
      }

      continue;
    }

    const durationPerRound = block.children.reduce(
      (sum, child) => {
        const exerciseDuration =
          child.instructions.shape === "duration"
            ? child.instructions.durationSec
            : 0;

        return (
          sum +
          exerciseDuration +
          (child.restBeforeSec ?? 0)
        );
      },
      0,
    );

    totalSec +=
      durationPerRound * block.rounds +
      Math.max(0, block.rounds - 1) *
        block.restBetweenRoundsSec;
  }

  return totalSec;
}

export interface ZoneSummary {
  zone: MuscleZone;
  volume: number;
  percentage: number;
}

const MUSCLE_ZONES: MuscleZone[] = [
  "Jambes",
  "Dos",
  "Pecs",
  "Épaules",
  "Bras",
  "Core",
];

export function getLoadKg(load: PerformedSeries["load"]): number | undefined {
  if (!load) {
    return undefined;
  }

  switch (load.kind) {
    case "total":
      return load.kg;

    case "empty":
      return load.tareKg ?? 0;

    case "per_side":
      return load.kgPerSide * 2 + (load.tareKg ?? 0);
  }
}

export function calculateZonesSummary(
  blocks: PerformedBlock[],
  exercises: Exercise[],
): ZoneSummary[] {
  const exerciseById = new Map(
    exercises.map((exercise) => [exercise.id, exercise]),
  );

  const volumeByZone: Record<MuscleZone, number> = {
    Jambes: 0,
    Dos: 0,
    Pecs: 0,
    Épaules: 0,
    Bras: 0,
    Core: 0,
  };

  for (const block of blocks) {
    if (block.kind === "exercise") {
      const exercise = exerciseById.get(block.exerciseId);

      if (!exercise) {
        continue;
      }

      for (const series of block.series ?? []) {
        if (
          series.status !== "completed" ||
          series.reps === undefined
        ) {
          continue;
        }

        const loadKg = getLoadKg(series.load);

        if (loadKg === undefined) {
          continue;
        }

        if (exercise.category === "Musculation" && loadSemanticsOf(exercise) === "external") {
          volumeByZone[exercise.zone] += loadKg * series.reps;
        }
      }

      continue;
    }

    if (block.kind === "group") {
      for (const round of block.rounds) {
        for (const child of round.children) {
          if (
            child.completedAt === undefined ||
            child.reps === undefined
          ) {
            continue;
          }

          const exercise = exerciseById.get(child.exerciseId);

          if (!exercise) {
            continue;
          }

          const loadKg = getLoadKg(child.load);

          if (loadKg === undefined) {
            continue;
          }

          if (exercise.category === "Musculation" && loadSemanticsOf(exercise) === "external") {
            volumeByZone[exercise.zone] += loadKg * child.reps;
          }
        }
      }
    }
  }

  const totalVolume = MUSCLE_ZONES.reduce(
    (total, zone) => total + volumeByZone[zone],
    0,
  );

  return MUSCLE_ZONES.map((zone) => ({
    zone,
    volume: volumeByZone[zone],
    percentage:
      totalVolume === 0
        ? 0
        : Math.round((volumeByZone[zone] / totalVolume) * 100),
  }));
}

export type SuggestedLoadAction =
  | "increase"
  | "maintain"
  | "decrease";

export interface SuggestedLoadOptions {
  lowRpeMax?: number;
}

export interface SuggestedLoadResult {
  referenceLoad: NonNullable<PerformedSeries["load"]>;
  action: SuggestedLoadAction;
}

export function calculateSuggestedLoad(
  series: PerformedSeries[],
  targetReps: {
    min: number;
    max: number;
  },
  options: SuggestedLoadOptions = {},
): SuggestedLoadResult | undefined {
  const completedSeries = series.filter(
    (item) =>
      item.status === "completed" &&
      item.load !== undefined &&
      item.reps !== undefined,
  );

  if (completedSeries.length === 0) {
    return undefined;
  }

  const lastSeries =
    completedSeries[completedSeries.length - 1];

  if (!lastSeries?.load) {
    return undefined;
  }

  const referenceLoad = lastSeries.load;

  const repsBelowTarget = completedSeries.some(
    (item) =>
      item.reps !== undefined &&
      item.reps < targetReps.min,
  );

  const highRpe = completedSeries.some(
    (item) =>
      item.rpe !== undefined &&
      item.rpe >= 9,
  );

  if (repsBelowTarget || highRpe) {
    return {
      referenceLoad,
      action: "decrease",
    };
  }

  const repsHeld = completedSeries.every(
    (item) =>
      item.reps !== undefined &&
      item.reps >= targetReps.min,
  );

  const lowRpeThreshold = options.lowRpeMax;

  const lowRpe =
    lowRpeThreshold !== undefined &&
    completedSeries.every(
      (item) =>
        item.rpe !== undefined &&
        item.rpe <= lowRpeThreshold,
    );

  if (repsHeld && lowRpe) {
    return {
      referenceLoad,
      action: "increase",
    };
  }

  return {
    referenceLoad,
    action: "maintain",
  };
}

export function isMetricCompatible(
  measurementType: import("../models").MeasurementType,
  metric: import("../models").ExerciseGoalMetric,
): boolean {
  switch (measurementType) {
    case "load_reps":
      return (
        metric === "max_load" ||
        metric === "volume" ||
        metric === "reps"
      );

    case "reps":
    case "reps_per_side":
    case "reps_duration":
      return metric === "reps";

    case "duration":
    case "duration_per_side":
      return metric === "max_duration";
    case "duration_speed_incline":
    case "duration_distance":
    case "duration_power":
    case "distance":
    case "distance_cm":
    case "distance_cm_per_side":
      return false;
  }
}

export interface ComparableCardioStep {
  durationSec: number;
  speedKmh: number;
  inclinePercent: number;
}

export function isCardioStepComparable(
  reference: ComparableCardioStep,
  candidate: ComparableCardioStep,
): boolean {
  if (
    reference.speedKmh !== candidate.speedKmh ||
    reference.inclinePercent !== candidate.inclinePercent
  ) {
    return false;
  }

  const minDuration = reference.durationSec * 0.9;
  const maxDuration = reference.durationSec * 1.1;

  return (
    candidate.durationSec >= minDuration &&
    candidate.durationSec <= maxDuration
  );
}
