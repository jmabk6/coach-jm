import { formatDurationShort, formatRange } from "../../domain/rules/blockInstructionRules";
import type {
  Exercise,
  Id,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedSeries,
  TargetRpe,
  WorkoutSession,
} from "../../domain";
import { summarizeSeriesRoles, type SeriesRoleSummary } from "../../domain/rules/strengthRules";
import { calculateVolume, getLoadKg } from "../../domain/rules/workoutRules";
import { summarizeRests } from "./engine/workoutTime";
import { listSeriesByExercise } from "./lastPerformance";
import { formatPlannedLine } from "./workoutDisplay";
import {
  formatDecimal,
  formatMinutes,
  formatSeconds,
  formatSeriesLine,
  formatSimpleMeasurement,
  type CoveredAverage,
} from "./workoutRecap";

/**
 * Détail d'un exercice dans une réalisation (§14, mockup 19.3, décision
 * Q4) : le résumé confronté au prévu quand une confrontation a un sens,
 * l'historique de l'exercice réellement effectué, la navigation entre
 * briques. Aucune comparaison n'est fabriquée sans référence pertinente.
 */

/* -------------------------------------------------------------------------- */
/* Historique de l'exercice réellement effectué (Q4)                          */
/* -------------------------------------------------------------------------- */

export interface ExerciseHistoryEntry {
  workoutId: Id;
  date: string;
  /** Meilleure série, mesure simple ou résumé des paliers. */
  label: string;
  volumeKg?: number;
  /** Séries validées ce jour-là (0 pour une mesure simple ou du cardio). */
  seriesCount: number;
  /**
   * Vrai quand la brique a été menée au bout : brique autonome réalisée
   * dont toutes les séries sont validées, ou enfant de groupe dont tous
   * les tours sont faits. Seule une réalisation complète sert de référence.
   */
  complete: boolean;
}

/**
 * La meilleure série : la charge × reps la plus haute, sinon le plus de
 * reps, sinon la plus longue, sinon la dernière.
 */
export function pickBestSeries(series: PerformedSeries[]): PerformedSeries | undefined {
  if (series.length === 0) return undefined;

  const score = (item: PerformedSeries): number => {
    const kg = item.load ? getLoadKg(item.load) : undefined;
    if (kg !== undefined && item.reps !== undefined) return 1_000_000 + kg * item.reps * 1000 + kg;
    if (item.reps !== undefined) return 10_000 + item.reps;
    if (item.durationSec !== undefined) return 1_000 + item.durationSec;
    if (item.sideValues && item.sideValues.length > 0) {
      return item.sideValues.reduce(
        (sum, value) => sum + (value.reps ?? value.durationSec ?? value.distanceCm ?? 0),
        0,
      );
    }
    return 0;
  };

  return series.reduce((best, item) => (score(item) > score(best) ? item : best));
}

/** La note se lit à part : les libellés d'historique et de résumé s'en passent. */
function withoutNote<T extends { note?: string }>(item: T): T {
  const copy = { ...item };
  delete copy.note;
  return copy;
}

/** La meilleure série se lit en charge × reps ; son RPE est un détail de séance. */
function bareSeries(item: PerformedSeries): PerformedSeries {
  const copy = withoutNote(item);
  delete copy.rpe;
  return copy;
}

function isBlockComplete(block: PerformedExerciseBlock): boolean {
  if (block.status !== "performed") return false;
  if (block.series) return block.series.every((item) => item.status === "completed");
  if (block.cardioSteps) return block.cardioSteps.every((step) => step.status === "completed");
  return true;
}

function describeWorkoutForExercise(
  workout: WorkoutSession,
  exerciseId: Id,
  exercise: Exercise | undefined,
): ExerciseHistoryEntry | undefined {
  const series = listSeriesByExercise(workout).get(exerciseId) ?? [];

  if (series.length > 0) {
    const best = pickBestSeries(series)!;
    const volume = calculateVolume(series);
    const ownBlocks = workout.blocks.filter(
      (block): block is PerformedExerciseBlock =>
        block.kind === "exercise" && block.exerciseId === exerciseId && block.status === "performed",
    );
    const groupComplete = workout.blocks.some(
      (block) =>
        block.kind === "group" &&
        block.status === "performed" &&
        block.rounds.length > 0 &&
        block.rounds.every((round) =>
          round.children.some(
            (child) => child.exerciseId === exerciseId && child.completedAt !== undefined,
          ),
        ),
    );

    return {
      workoutId: workout.id,
      date: workout.date,
      label: formatSeriesLine(bareSeries(best)),
      ...(volume > 0 ? { volumeKg: volume } : {}),
      seriesCount: series.length,
      complete: ownBlocks.length > 0 ? ownBlocks.every(isBlockComplete) : groupComplete,
    };
  }

  /* Paliers ou mesure simple : la brique autonome réalisée la plus riche. */
  for (const block of workout.blocks) {
    if (block.kind !== "exercise" || block.exerciseId !== exerciseId || block.status !== "performed") {
      continue;
    }

    const steps = (block.cardioSteps ?? []).filter((step) => step.status === "completed");

    if (steps.length > 0) {
      const durationSec = steps.reduce((sum, step) => sum + step.settings.durationSec, 0);
      const bpm = steps.map((step) => step.bpm).filter((v): v is number => v !== undefined);

      return {
        workoutId: workout.id,
        date: workout.date,
        label: `${steps.length} palier${steps.length > 1 ? "s" : ""} · ${formatMinutes(durationSec)}${
          bpm.length > 0 ? ` · ${Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length)} bpm moy.` : ""
        }`,
        seriesCount: 0,
        complete: isBlockComplete(block),
      };
    }

    if (block.simpleMeasurement) {
      return {
        workoutId: workout.id,
        date: workout.date,
        label: formatSimpleMeasurement(withoutNote(block.simpleMeasurement), exercise),
        seriesCount: 0,
        complete: true,
      };
    }
  }

  return undefined;
}

/**
 * Les cinq dernières réalisations de l'exercice **réellement effectué**
 * (Q4) **antérieures** à la séance lue, de la plus récente à la plus
 * ancienne : l'historique d'une séance passée ne montre pas ce qui est
 * venu après elle.
 */
export function buildExerciseHistory(
  exerciseId: Id,
  completedWorkouts: WorkoutSession[],
  current: Pick<WorkoutSession, "id" | "startedAt"> | undefined,
  exercise: Exercise | undefined,
  limit = 5,
): ExerciseHistoryEntry[] {
  const entries: ExerciseHistoryEntry[] = [];

  const ordered = [...completedWorkouts]
    .filter(
      (workout) =>
        workout.status === "completed" &&
        (current === undefined ||
          (workout.id !== current.id && workout.startedAt < current.startedAt)),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const workout of ordered) {
    const entry = describeWorkoutForExercise(workout, exerciseId, exercise);
    if (entry) entries.push(entry);
    if (entries.length >= limit) break;
  }

  return entries;
}

/* -------------------------------------------------------------------------- */
/* Résumé confronté au prévu                                                  */
/* -------------------------------------------------------------------------- */

export interface VolumeVsLast {
  previousWorkoutId: Id;
  previousDate: string;
  previousVolumeKg: number;
  deltaPercent: number;
}

export interface RpeSummary extends CoveredAverage {
  target?: TargetRpe;
  /** Position par rapport à la cible, seulement si une cible existe. */
  position?: "below" | "within" | "above";
}

export interface RestDetail {
  averageSec: number;
  comparableCount: number;
  totalCount: number;
  plannedSec?: number;
  deltaSec?: number;
}

export type ExerciseDetailSummary =
  | {
      kind: "series";
      seriesDone: number;
      /** Absent pour un ajout : rien n'était prévu. */
      seriesPlanned?: number;
      /** Rôles des séries réalisées (v1.6) : comptées, échauffements, limitées. */
      roles: SeriesRoleSummary;
      volumeKg?: number;
      volumeVsLast?: VolumeVsLast;
      rpe?: RpeSummary;
      rest?: RestDetail;
      plannedLine?: string;
    }
  | {
      kind: "steps";
      stepsDone: number;
      stepsPlanned: number;
      durationSec: number;
      bpm?: { min: number; max: number; average: number; count: number; total: number };
      adaptations: number;
      /** `4,5–5 km/h · 0–12 %` ou `1–2 km` : des plages, jamais une moyenne. */
      ranges?: string;
    }
  | {
      kind: "simple";
      label: string;
      /** Vitesse ou allure selon la lecture de l'exercice. */
      speed?: string;
      plannedLine?: string;
    }
  | { kind: "none" };

function summarizeRpe(series: PerformedSeries[], target: TargetRpe | undefined): RpeSummary | undefined {
  const values = series.map((item) => item.rpe).filter((v): v is number => v !== undefined);

  if (values.length === 0) return undefined;

  const value = values.reduce((sum, v) => sum + v, 0) / values.length;
  const position =
    target === undefined
      ? undefined
      : value < target.min
        ? "below"
        : value > target.max
          ? "above"
          : "within";

  return {
    value,
    count: values.length,
    total: series.length,
    ...(target ? { target } : {}),
    ...(position ? { position } : {}),
  };
}

function formatRangeOf(values: number[], unit: string): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const fmt = (v: number) => formatDecimal(v);

  return min === max ? `${fmt(min)} ${unit}` : `${fmt(min)}–${fmt(max)} ${unit}`;
}

/**
 * Vitesse en km/h ou allure en min/km · min/500 m, selon la lecture
 * choisie sur la fiche (§14) — jamais l'un et l'autre.
 */
export function formatSpeedOrPace(
  durationSec: number,
  distanceKm: number,
  display: Exercise["speedDisplay"] | undefined,
): string | undefined {
  if (durationSec <= 0 || distanceKm <= 0) return undefined;

  if (display === "pace_min_km" || display === "pace_min_500m") {
    const perUnitSec = display === "pace_min_km" ? durationSec / distanceKm : durationSec / (distanceKm * 2);
    const minutes = Math.floor(perUnitSec / 60);
    const seconds = Math.round(perUnitSec % 60);

    return `${minutes}:${String(seconds).padStart(2, "0")} ${display === "pace_min_km" ? "min/km" : "min/500 m"}`;
  }

  return `${formatDecimal(distanceKm / (durationSec / 3600))} km/h`;
}

/**
 * Le résumé d'un exercice : séries, volume, RPE et repos moyen, chacun
 * avec son prévu et son écart **lorsque la comparaison s'applique**. Un
 * ajout n'a pas de prévu ; le volume ne se compare qu'à une réalisation
 * antérieure complète du même exercice, au même nombre de séries.
 */
export function summarizeExerciseBlock(
  block: PerformedExerciseBlock,
  exercise: Exercise | undefined,
  history: ExerciseHistoryEntry[],
): ExerciseDetailSummary {
  const instructions = block.snapshotInstructions;

  if (block.cardioSteps && block.cardioSteps.length > 0) {
    const steps = block.cardioSteps.filter((step) => step.status === "completed");
    const bpm = steps.map((step) => step.bpm).filter((v): v is number => v !== undefined);
    const speeds = steps.flatMap((step) => ("speedKmh" in step.settings ? [step.settings.speedKmh] : []));
    const inclines = steps.flatMap((step) =>
      "inclinePercent" in step.settings ? [step.settings.inclinePercent] : [],
    );
    const distances = steps.flatMap((step) => ("distanceKm" in step.settings ? [step.settings.distanceKm] : []));
    const ranges = [
      speeds.length > 0 ? formatRangeOf(speeds, "km/h") : undefined,
      inclines.length > 0 ? formatRangeOf(inclines, "%") : undefined,
      distances.length > 0 ? formatRangeOf(distances, "km") : undefined,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      kind: "steps",
      stepsDone: steps.length,
      stepsPlanned: block.cardioSteps.length,
      durationSec: steps.reduce((sum, step) => sum + step.settings.durationSec, 0),
      ...(bpm.length > 0
        ? {
            bpm: {
              min: Math.min(...bpm),
              max: Math.max(...bpm),
              average: bpm.reduce((a, b) => a + b, 0) / bpm.length,
              count: bpm.length,
              total: steps.length,
            },
          }
        : {}),
      adaptations: steps.filter((step) => step.originalSettings !== undefined).length,
      ...(ranges ? { ranges } : {}),
    };
  }

  if (block.simpleMeasurement) {
    const measure = block.simpleMeasurement;
    const speed =
      measure.durationSec !== undefined && measure.distanceKm !== undefined
        ? formatSpeedOrPace(measure.durationSec, measure.distanceKm, exercise?.speedDisplay)
        : undefined;
    const plannedLine = block.addedDuringWorkout ? undefined : formatSimpleInstructions(block);

    return {
      kind: "simple",
      label: formatSimpleMeasurement(withoutNote(measure), exercise),
      ...(speed ? { speed } : {}),
      ...(plannedLine ? { plannedLine } : {}),
    };
  }

  if (!block.series || block.series.length === 0) return { kind: "none" };

  const done = block.series.filter((item) => item.status === "completed");
  const volumeKg = calculateVolume(done);
  const target =
    instructions.shape === "reps" || instructions.shape === "duration" ? instructions.targetRpe : undefined;
  const plannedRest =
    !block.addedDuringWorkout && (instructions.shape === "reps" || instructions.shape === "duration")
      ? instructions.restBetweenSetsSec
      : undefined;
  const rests = summarizeRests([block]);
  const rest: RestDetail | undefined =
    rests.averageSec !== undefined
      ? {
          averageSec: rests.averageSec,
          comparableCount: rests.comparableCount,
          totalCount: rests.totalCount,
          ...(plannedRest !== undefined
            ? { plannedSec: plannedRest, deltaSec: rests.averageSec - plannedRest }
            : {}),
        }
      : undefined;

  /* Référence pertinente : la dernière réalisation complète du même
     exercice **au même nombre de séries**, avec un volume — et la brique
     courante menée au bout. Une réalisation complète d'un autre format
     (2 séries au lieu de 3) est enjambée, pas prise pour référence. */
  const previous = history.find(
    (entry) => entry.complete && entry.volumeKg !== undefined && entry.seriesCount === done.length,
  );
  const volumeVsLast: VolumeVsLast | undefined =
    previous && volumeKg > 0 && isBlockComplete(block) && previous.volumeKg !== undefined
      ? {
          previousWorkoutId: previous.workoutId,
          previousDate: previous.date,
          previousVolumeKg: previous.volumeKg,
          deltaPercent: Math.round(((volumeKg - previous.volumeKg) / previous.volumeKg) * 100),
        }
      : undefined;
  const rpe = summarizeRpe(done, block.addedDuringWorkout ? undefined : target);
  const plannedLine = formatPlannedLine(block);

  return {
    kind: "series",
    seriesDone: done.length,
    ...(block.addedDuringWorkout ? {} : { seriesPlanned: block.series.length }),
    roles: summarizeSeriesRoles(done),
    ...(volumeKg > 0 ? { volumeKg } : {}),
    ...(volumeVsLast ? { volumeVsLast } : {}),
    ...(rpe ? { rpe } : {}),
    ...(rest ? { rest } : {}),
    ...(plannedLine ? { plannedLine } : {}),
  };
}

function formatSimpleInstructions(block: PerformedExerciseBlock): string | undefined {
  const instructions = block.snapshotInstructions;
  const parts: string[] = [];

  switch (instructions.shape) {
    case "duration_distance":
      if (instructions.durationSec !== undefined) parts.push(formatDurationShort(instructions.durationSec));
      if (instructions.distanceKm !== undefined) parts.push(`${formatDecimal(instructions.distanceKm)} km`);
      break;
    case "distance":
      if (instructions.distanceKm !== undefined) parts.push(`${formatDecimal(instructions.distanceKm)} km`);
      break;
    case "distance_cm":
      if (instructions.distanceCm !== undefined) parts.push(`${instructions.distanceCm} cm`);
      break;
    case "distance_cm_per_side":
      if (instructions.leftCm !== undefined) parts.push(`G ${instructions.leftCm} cm`);
      if (instructions.rightCm !== undefined) parts.push(`D ${instructions.rightCm} cm`);
      break;
    default:
      return undefined;
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/* -------------------------------------------------------------------------- */
/* Formats d'écart                                                            */
/* -------------------------------------------------------------------------- */

export function formatSignedPercent(delta: number): string {
  if (delta === 0) return "=";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} %`;
}

export function formatSignedSeconds(delta: number): string {
  if (delta === 0) return "= prévu";
  return `${delta > 0 ? "+" : "−"}${formatSeconds(Math.abs(delta))}`;
}

export function formatRpePosition(rpe: RpeSummary): string | undefined {
  if (!rpe.target || !rpe.position) return undefined;

  const target = `cible ${formatRange(rpe.target)}`;

  if (rpe.position === "within") return `${target} · dans la cible`;
  if (rpe.position === "above") return `${target} · +${formatDecimal(rpe.value - rpe.target.max)} au-dessus`;
  return `${target} · −${formatDecimal(rpe.target.min - rpe.value)} en dessous`;
}

/* -------------------------------------------------------------------------- */
/* Navigation précédent / suivant                                             */
/* -------------------------------------------------------------------------- */

export interface BlockNeighbours {
  previous?: PerformedBlock;
  next?: PerformedBlock;
}

/**
 * Les briques voisines dans l'ordre du récapitulatif (prévues puis
 * ajouts, tel que numéroté) — les notes n'ayant pas d'écran de détail,
 * elles sont enjambées.
 */
export function findBlockNeighbours(orderedBlocks: PerformedBlock[], blockId: Id): BlockNeighbours {
  const ordered = orderedBlocks.filter((block) => block.kind !== "note");
  const index = ordered.findIndex((block) => block.id === blockId);

  if (index < 0) return {};

  const previous = ordered[index - 1];
  const next = ordered[index + 1];

  return {
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
  };
}
