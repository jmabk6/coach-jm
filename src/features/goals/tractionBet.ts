import type { PerformedExerciseBlock, PerformedSeries, WorkoutSession } from "../../domain";
import { isWorkSeries } from "../../domain/rules/strengthRules";

/**
 * Pari traction : la lecture des séances de force (traction assistée de
 * Muscu A). Les règles du pari sont dans `tractionV6` (spécification V6
 * figée du 04/10/2026), qui remplace le rétroplanning à étapes du 03/10.
 */

export const BET_EXERCISE_ID = "traction-assistee";
/** Les séances de force : la Muscu A du V1 (avant le 04/10) puis du V2. */
export const BET_FORCE_TEMPLATES = ["v1-muscu-a", "v2-muscu-a"];

export interface BetSet {
  assistKg: number;
  reps: number;
  rpe?: number;
}

/* -------------------------------------------------------------------------- */
/* Séances                                                                    */
/* -------------------------------------------------------------------------- */

function assistOf(series: PerformedSeries): number | undefined {
  if (series.load?.kind === "total") return series.load.kg;
  if (series.load?.kind === "empty") return 0;
  return undefined;
}

function tractionBlock(workout: WorkoutSession): PerformedExerciseBlock | undefined {
  const block = workout.blocks.find((item) => item.kind === "exercise" && item.exerciseId === BET_EXERCISE_ID);
  return block?.kind === "exercise" ? block : undefined;
}

/** Les séries de travail validées, dans l'ordre. */
export function betSets(block: PerformedExerciseBlock): BetSet[] {
  return [...(block.series ?? [])]
    .filter((series) => series.status === "completed" && isWorkSeries(series))
    .sort((a, b) => a.position - b.position)
    .flatMap((series) => {
      const assistKg = assistOf(series);
      return assistKg === undefined ? [] : [{ assistKg, reps: series.reps ?? 0, ...(series.rpe !== undefined ? { rpe: series.rpe } : {}) }];
    });
}

export interface BetSession {
  workoutId: string;
  date: string;
  sets: BetSet[];
}

/**
 * Les séances de force qui comptent : Muscu A faite, traction à
 * prescription complète (un jour de test, 2 séries seulement : exclu).
 */
export function betSessions(workouts: readonly WorkoutSession[]): BetSession[] {
  return workouts
    .filter((workout) => workout.status === "completed" && BET_FORCE_TEMPLATES.includes(workout.sessionTemplateId ?? ""))
    .flatMap((workout) => {
      const block = tractionBlock(workout);
      if (!block || block.reducedPrescription) return [];
      const sets = betSets(block);
      return sets.length > 0 ? [{ workoutId: workout.id, date: workout.date, sets }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** « 35 × 5 · 42 × 5 », « traction stricte × 1 ». */
export const formatBetSets = (sets: readonly BetSet[]) =>
  sets.map((set) => (set.assistKg === 0 ? `traction stricte × ${set.reps}` : `${set.assistKg} × ${set.reps}`)).join(" · ");
