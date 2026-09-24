import type { Exercise, Id, LoadSemantics, PerformedSeries, WorkoutSession } from "../../domain";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { isWorkSeries } from "../../domain/rules/strengthRules";
import { getLoadKg } from "../../domain/rules/workoutRules";
import { roundChildAsSeries } from "./workoutGroupDetail";
import { pickBestSeries } from "./workoutBlockDetail";

/**
 * Records d'une séance (conception V2 § 5.6, D22, N7, N10) — fonction pure.
 *
 * - Portée : chaque exercice réellement effectué (brique ou enfant de
 *   tour), hors séries d'échauffement, séries limitées par un côté et
 *   briques `warmup`.
 * - Historique *H* : les séries retenues du même exercice dans les séances
 *   **enregistrées** antérieures, importées comprises. *H* vide : première
 *   mesure, une **référence**, jamais un record.
 * - Un record par exercice et par séance : la meilleure série du jour
 *   (`pickBestSeries`), qui bat toute performance antérieure comparable.
 * - Pas de record cardio (paliers, mesures simples) en V1 (N7).
 */

export type RecordKind = "load" | "reps" | "duration" | "reps_duration" | "power";

export interface WorkoutRecord {
  exerciseId: Id;
  kind: RecordKind;
  /** La série du jour qui fait le record. */
  series: PerformedSeries;
  /** Le précédent affiché : « 35 kg × 10, précédent : 30 kg × 12 ». */
  previous?: PerformedSeries;
  /** Séance du précédent. */
  previousWorkoutId?: Id;
}

export interface WorkoutRecordsSummary {
  records: WorkoutRecord[];
  /** Exercices faits pour la première fois : leur mesure devient la référence. */
  references: Id[];
}

interface Dated {
  series: PerformedSeries;
  workoutId: Id;
  startedAt: string;
}

/** Les séries retenues d'une séance, par exercice (§ 5.6, portée). */
export function retainedSeriesByExercise(workout: Pick<WorkoutSession, "blocks">): Map<Id, PerformedSeries[]> {
  const result = new Map<Id, PerformedSeries[]>();
  const push = (exerciseId: Id, series: PerformedSeries) => {
    if (!isWorkSeries(series) || series.sideLimited === true) return;
    result.set(exerciseId, [...(result.get(exerciseId) ?? []), series]);
  };

  for (const block of workout.blocks) {
    if (block.kind === "exercise") {
      if (block.role === "warmup" || block.status === "skipped") continue;
      for (const series of block.series ?? []) {
        if (series.status === "completed") push(block.exerciseId, series);
      }
      continue;
    }

    if (block.kind === "group") {
      if (block.status === "skipped") continue;
      for (const round of block.rounds) {
        round.children.forEach((child, position) => {
          if (child.completedAt !== undefined) push(child.exerciseId, roundChildAsSeries(child, position));
        });
      }
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Mesures d'une série                                                         */
/* -------------------------------------------------------------------------- */

function loadKg(series: PerformedSeries): number | undefined {
  if (!series.load) return undefined;
  if (series.load.kind === "empty" && series.load.tareKg === undefined) return undefined;
  return getLoadKg(series.load);
}

/** Répétitions ; par côté, le côté le plus faible. */
function repsOf(series: PerformedSeries): number | undefined {
  if (series.reps !== undefined) return series.reps;
  const sides = (series.sideValues ?? []).map((value) => value.reps).filter((value): value is number => value !== undefined);
  return sides.length > 0 ? Math.min(...sides) : undefined;
}

/** Durée ; par côté, le côté le plus faible. Pour `reps_duration`, la plus longue répétition. */
function durationOf(series: PerformedSeries): number | undefined {
  if (series.durationSec !== undefined) return series.durationSec;
  const sides = (series.sideValues ?? []).map((value) => value.durationSec).filter((value): value is number => value !== undefined);
  return sides.length > 0 ? Math.min(...sides) : undefined;
}

function kindOf(exercise: Exercise): RecordKind | undefined {
  switch (exercise.measurementType) {
    case "load_reps":
      return "load";
    case "reps":
    case "reps_per_side":
      return "reps";
    case "duration":
    case "duration_per_side":
      return "duration";
    case "reps_duration":
      return "reps_duration";
    case "duration_power":
      return "power";
    default:
      /* Paliers et mesures simples : pas de record en V1 (N7). */
      return undefined;
  }
}

/** Le plus récent d'abord, à égalité de critère. */
function mostRecent(a: Dated, b: Dated): Dated {
  return b.startedAt > a.startedAt ? b : a;
}

function best(items: Dated[], value: (item: Dated) => number | undefined): Dated | undefined {
  let chosen: Dated | undefined;
  let chosenValue = -Infinity;
  for (const item of items) {
    const current = value(item);
    if (current === undefined) continue;
    if (chosen === undefined || current > chosenValue) {
      chosen = item;
      chosenValue = current;
    } else if (current === chosenValue) {
      chosen = mostRecent(chosen, item);
    }
  }
  return chosen;
}

/* -------------------------------------------------------------------------- */
/* Record d'un exercice                                                        */
/* -------------------------------------------------------------------------- */

function loadRecord(day: PerformedSeries, history: Dated[], semantics: LoadSemantics): Omit<WorkoutRecord, "exerciseId" | "kind"> | undefined {
  const kg = loadKg(day);
  const reps = repsOf(day);
  if (kg === undefined || reps === undefined) return undefined;

  const comparable = history.filter((item) => loadKg(item.series) !== undefined && repsOf(item.series) !== undefined);
  if (comparable.length === 0) return undefined;

  const atLeastAsGood = (other: number) => (semantics === "assistance" ? other <= kg : other >= kg);
  const dominated = comparable.some((item) => atLeastAsGood(loadKg(item.series)!) && repsOf(item.series)! >= reps);
  if (dominated) return undefined;

  /* Précédent : la charge la plus proche, la plus récente à égalité. */
  let previous: Dated | undefined;
  for (const item of comparable) {
    if (previous === undefined) {
      previous = item;
      continue;
    }
    const distance = Math.abs(loadKg(item.series)! - kg);
    const previousDistance = Math.abs(loadKg(previous.series)! - kg);
    if (distance < previousDistance || (distance === previousDistance && item.startedAt > previous.startedAt)) previous = item;
  }

  return { series: day, previous: previous!.series, previousWorkoutId: previous!.workoutId };
}

function scalarRecord(
  day: PerformedSeries,
  history: Dated[],
  value: (series: PerformedSeries) => number | undefined,
): Omit<WorkoutRecord, "exerciseId" | "kind"> | undefined {
  const mine = value(day);
  const top = best(history, (item) => value(item.series));
  if (mine === undefined || top === undefined) return undefined;

  return mine > value(top.series)! ? { series: day, previous: top.series, previousWorkoutId: top.workoutId } : undefined;
}

function repsDurationRecord(day: PerformedSeries, history: Dated[]): Omit<WorkoutRecord, "exerciseId" | "kind"> | undefined {
  const reps = repsOf(day);
  if (reps === undefined) return undefined;
  const duration = durationOf(day) ?? 0;

  const dominated = history.some((item) => (repsOf(item.series) ?? -1) >= reps && (durationOf(item.series) ?? 0) >= duration);
  if (dominated) return undefined;

  const top = best(history, (item) => repsOf(item.series));
  return top ? { series: day, previous: top.series, previousWorkoutId: top.workoutId } : undefined;
}

function powerRecord(day: PerformedSeries, history: Dated[]): Omit<WorkoutRecord, "exerciseId" | "kind"> | undefined {
  if (!day.result) return undefined;
  const comparable = history.filter(
    (item) =>
      item.series.result?.unit === day.result!.unit &&
      item.series.durationSec === day.durationSec &&
      item.series.resistance === day.resistance,
  );
  return scalarRecord(day, comparable, (series) => series.result?.value);
}

/* -------------------------------------------------------------------------- */
/* Séance                                                                      */
/* -------------------------------------------------------------------------- */

export function computeWorkoutRecords(
  workout: WorkoutSession,
  allWorkouts: ReadonlyArray<WorkoutSession>,
  exerciseById: ReadonlyMap<Id, Exercise>,
): WorkoutRecordsSummary {
  const earlier = allWorkouts.filter(
    (item) => item.status === "completed" && item.id !== workout.id && item.startedAt < workout.startedAt,
  );
  const historyByExercise = new Map<Id, Dated[]>();
  for (const item of earlier) {
    for (const [exerciseId, series] of retainedSeriesByExercise(item)) {
      const dated = series.map((entry) => ({ series: entry, workoutId: item.id, startedAt: item.startedAt }));
      historyByExercise.set(exerciseId, [...(historyByExercise.get(exerciseId) ?? []), ...dated]);
    }
  }

  const records: WorkoutRecord[] = [];
  const references: Id[] = [];

  for (const [exerciseId, series] of retainedSeriesByExercise(workout)) {
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) continue;
    const kind = kindOf(exercise);
    if (!kind) continue;

    const history = historyByExercise.get(exerciseId) ?? [];
    if (history.length === 0) {
      references.push(exerciseId);
      continue;
    }

    const semantics = loadSemanticsOf(exercise);
    const day = pickBestSeries(series, semantics);
    if (!day) continue;

    const found =
      kind === "load"
        ? loadRecord(day, history, semantics)
        : kind === "reps"
          ? scalarRecord(day, history, repsOf)
          : kind === "duration"
            ? scalarRecord(day, history, durationOf)
            : kind === "reps_duration"
              ? repsDurationRecord(day, history)
              : powerRecord(day, history);

    if (found) records.push({ exerciseId, kind, ...found });
  }

  return { records, references };
}
