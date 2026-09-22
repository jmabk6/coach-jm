import type {
  Exercise,
  Id,
  PerformedSeries,
  StrengthFrameVersion,
  StrengthMilestone,
  StrengthUnit,
  WorkoutSession,
} from "../../domain";
import {
  frameVersionIdsOf,
  isWorkSeries,
  seriesByFrameVersion,
  validateFrame,
  type FrameValidationResult,
} from "../../domain/rules/strengthRules";
import { getLoadKg } from "../../domain/rules/workoutRules";
import { listSeriesByExercise } from "../workout/lastPerformance";

/**
 * Lectures pures d'un cadre (conception v1.6, § 4.2 bis, § 4.4 bis) :
 * tout se calcule depuis les séances terminées et les jalons, rien n'est
 * mis en cache.
 */

export interface CurrentLoad {
  value: number;
  unit: StrengthUnit;
  workoutId: Id;
  date: string;
}

function completedDesc(workouts: ReadonlyArray<WorkoutSession>): WorkoutSession[] {
  return workouts
    .filter((workout) => workout.status === "completed")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function lastWorkSeries(series: ReadonlyArray<PerformedSeries>): PerformedSeries | undefined {
  return [...series].reverse().find((item) => item.status === "completed" && isWorkSeries(item));
}

/**
 * « Charge en cours » : la charge (ou la durée) de la dernière série de
 * travail de la dernière séance terminée de l'exercice — un fait, jamais
 * l'objectif. Les séances importées comptent : elles sont des séances.
 */
export function currentLoadOf(
  exerciseId: Id,
  unit: StrengthUnit,
  workouts: ReadonlyArray<WorkoutSession>,
): CurrentLoad | undefined {
  for (const workout of completedDesc(workouts)) {
    const series = listSeriesByExercise(workout).get(exerciseId);
    const work = series ? lastWorkSeries(series) : undefined;

    if (!work) continue;

    const value = unit === "sec" ? work.durationSec : getLoadKg(work.load);

    if (value !== undefined) return { value, unit, workoutId: workout.id, date: workout.date };
  }

  return undefined;
}

/**
 * Charge de départ **proposée** à la création d'un cadre (décision 2) :
 * la charge en cours de l'exercice, présentée comme une proposition et
 * jamais stockée tant qu'elle n'est pas confirmée.
 */
export function proposeStartingLoad(
  exercise: Pick<Exercise, "id" | "measurementType">,
  workouts: ReadonlyArray<WorkoutSession>,
): CurrentLoad | undefined {
  return currentLoadOf(exercise.id, exercise.measurementType === "duration" ? "sec" : "kg", workouts);
}

/** Le dernier jalon d'une version, par date puis création. */
export function latestMilestone(milestones: ReadonlyArray<StrengthMilestone>): StrengthMilestone | undefined {
  return [...milestones].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )[0];
}

export interface LastSessionOutcome {
  workoutId: Id;
  date: string;
  result: FrameValidationResult;
}

/**
 * Le sort de la dernière séance terminée sous cette version, recalculé
 * (règle pure, même résultat qu'à la clôture) : « Validé — 100 kg » ou
 * « Non validé — motif ». Rien tant qu'aucune séance ne l'a exécutée.
 */
export function lastSessionOutcome(
  version: StrengthFrameVersion,
  workouts: ReadonlyArray<WorkoutSession>,
): LastSessionOutcome | undefined {
  for (const workout of completedDesc(workouts)) {
    if (workout.id.startsWith("import-")) continue;
    if (!frameVersionIdsOf(workout).has(version.id)) continue;

    const series = seriesByFrameVersion(workout).get(version.id);

    if (!series) continue;

    return { workoutId: workout.id, date: workout.date, result: validateFrame(version, series) };
  }

  return undefined;
}

/** Les sorts de chaque version exécutée dans une séance, pour le récapitulatif. */
export function frameOutcomesOf(
  workout: WorkoutSession,
  versionById: ReadonlyMap<Id, StrengthFrameVersion>,
): Map<Id, FrameValidationResult> {
  const outcomes = new Map<Id, FrameValidationResult>();

  if (workout.id.startsWith("import-") || workout.kind === "mobility_assessment") return outcomes;

  for (const [versionId, series] of seriesByFrameVersion(workout)) {
    const version = versionById.get(versionId);
    if (version) outcomes.set(versionId, validateFrame(version, series));
  }

  return outcomes;
}
