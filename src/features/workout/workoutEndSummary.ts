import type { Exercise, Goal, Id, PerformedSeries, WorkoutSession } from "../../domain";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { isWorkSeries } from "../../domain/rules/strengthRules";
import { formatSeriesLine } from "./workoutRecap";
import type { WorkoutRecord } from "./workoutRecords";

/**
 * Fin de séance (M10, conception V2 § 2.6) : ce que la vue 1 lit en plus
 * du récapitulatif — mention d'assistance du tonnage, objectifs
 * travaillés, libellés des records ; ressenti de la vue 3.
 */

/** Ressenti global, 1 = Très difficile … 5 = Très facile (M10.3). */
export type WorkoutFeeling = NonNullable<WorkoutSession["feeling"]>;

export const FEELING_LEVELS: ReadonlyArray<{ value: WorkoutFeeling; label: string }> = [
  { value: 1, label: "Très difficile" },
  { value: 2, label: "Difficile" },
  { value: 3, label: "Normale" },
  { value: 4, label: "Facile" },
  { value: 5, label: "Très facile" },
];

/** Borne de fin : `completedAt` une fois enregistrée, `endedAt` en attente (D20). */
export function workoutEndOf(workout: WorkoutSession): string | undefined {
  return workout.completedAt ?? workout.endedAt;
}

/**
 * Exercices réellement effectués (§ 5.7) : briques réalisées hors `warmup`
 * et enfants de tour validés, avec au moins une série, un palier ou une
 * mesure validés.
 */
export function performedExerciseIds(workout: Pick<WorkoutSession, "blocks">): Set<Id> {
  const ids = new Set<Id>();

  for (const block of workout.blocks) {
    if (block.kind === "exercise") {
      if (block.role === "warmup" || block.status === "skipped") continue;
      const done =
        (block.series ?? []).some((series) => series.status === "completed") ||
        (block.cardioSteps ?? []).some((step) => step.status === "completed") ||
        block.simpleMeasurement !== undefined;
      if (done) ids.add(block.exerciseId);
      continue;
    }

    if (block.kind === "group" && block.status !== "skipped") {
      for (const round of block.rounds) {
        for (const child of round.children) {
          if (child.completedAt !== undefined) ids.add(child.exerciseId);
        }
      }
    }
  }

  return ids;
}

/**
 * Exercices à assistance dont une série de travail a été validée : leur
 * charge n'entre pas dans le tonnage (§ 5.5), ce que la carte signale.
 */
export function assistedExerciseNames(workout: WorkoutSession, exerciseById: ReadonlyMap<Id, Exercise>): string[] {
  const names: string[] = [];

  for (const block of workout.blocks) {
    if (block.kind !== "exercise" || block.role === "warmup") continue;
    const exercise = exerciseById.get(block.exerciseId);
    if (loadSemanticsOf(exercise) !== "assistance") continue;
    const worked = (block.series ?? []).some((series) => series.status === "completed" && isWorkSeries(series));
    if (worked && exercise && !names.includes(exercise.name)) names.push(exercise.name);
  }

  return names;
}

/** `traction assistée non incluse` (M10.1) ; plusieurs : la liste après « assistance non incluse ». */
export function formatAssistanceNotIncluded(names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length === 1) return `${names[0]!.toLocaleLowerCase("fr-FR")} non incluse`;
  return `assistance non incluse : ${names.map((name) => name.toLocaleLowerCase("fr-FR")).join(", ")}`;
}

/**
 * Objectifs travaillés (§ 5.7) : ceux dont au moins un exercice lié a été
 * réellement effectué. Aucun objectif (avant le lot H) : liste vide, la
 * section reste masquée.
 */
export function workedGoals(workout: WorkoutSession, goals: ReadonlyArray<Goal>): Goal[] {
  const performed = performedExerciseIds(workout);
  return goals.filter((goal) => goal.linkedExercises.some((link) => performed.has(link.exerciseId)));
}

/** La série d'un record sans RPE ni note : `35 kg × 10`, `52 kg d'assistance × 7`, `45 s par côté`. */
export function formatRecordSeries(series: PerformedSeries, exercise: Exercise | undefined): string {
  const bare: PerformedSeries = { id: series.id, position: series.position, status: series.status };
  if (series.load) bare.load = series.load;
  if (series.reps !== undefined) bare.reps = series.reps;
  if (series.durationSec !== undefined) bare.durationSec = series.durationSec;
  if (series.repDurationsSec) bare.repDurationsSec = series.repDurationsSec;
  if (series.result) bare.result = series.result;
  if (series.resistance !== undefined) bare.resistance = series.resistance;
  if (series.sideValues) bare.sideValues = series.sideValues;

  const line = formatSeriesLine(bare);
  return loadSemanticsOf(exercise) === "assistance" && series.load
    ? line.replace(/ kg( |$)/, " kg d'assistance$1")
    : line;
}

export interface RecordCard {
  exerciseId: Id;
  name: string;
  value: string;
  previous?: string;
}

export function recordCards(records: ReadonlyArray<WorkoutRecord>, exerciseById: ReadonlyMap<Id, Exercise>): RecordCard[] {
  return records.map((record) => {
    const exercise = exerciseById.get(record.exerciseId);
    const card: RecordCard = {
      exerciseId: record.exerciseId,
      name: exercise?.name ?? record.exerciseId,
      value: formatRecordSeries(record.series, exercise),
    };
    if (record.previous) card.previous = formatRecordSeries(record.previous, exercise);
    return card;
  });
}

/** `48 min`, `1 h 02 min` (M10.1). */
export function formatHoursMinutes(sec: number): string {
  const minutes = Math.round(sec / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
