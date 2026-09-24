import type {
  CardioStepSettings,
  Id,
  PerformedCardioStep,
  PerformedSeries,
  WorkoutSession,
} from "../../domain";
import { isCardioStepComparable } from "../../domain/rules/workoutRules";

export interface LastPerformance {
  workoutId: Id;
  date: string;
  /**
   * Dernière série validée de l'exercice ce jour-là : la référence
   * `Dernière fois` du bloc de lecture (§11).
   */
  series: PerformedSeries;
  /**
   * Toutes les séries validées de cette réalisation, pour le conseil.
   */
  allSeries: PerformedSeries[];
}

/**
 * `Dernière fois` par exercice : la réalisation terminée la plus récente
 * où l'exercice porte au moins une série validée — brique autonome ou
 * enfant de groupe, quel que soit le modèle (§1 : l'exercice est
 * référencé, jamais copié). Une réalisation exclue (`exceptWorkoutId`)
 * permet d'ignorer la séance en cours.
 */
export function findLastPerformances(
  completedWorkouts: WorkoutSession[],
  exceptWorkoutId?: Id,
): Map<Id, LastPerformance> {
  const byExercise = new Map<Id, LastPerformance>();

  const ordered = [...completedWorkouts]
    .filter((workout) => workout.status === "completed" && workout.id !== exceptWorkoutId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const workout of ordered) {
    const seriesByExercise = listSeriesByExercise(workout);

    for (const [exerciseId, series] of seriesByExercise) {
      if (byExercise.has(exerciseId)) continue;

      const last = series[series.length - 1]!;

      byExercise.set(exerciseId, {
        workoutId: workout.id,
        date: workout.date,
        series: last,
        allSeries: series,
      });
    }
  }

  return byExercise;
}

/**
 * Séries validées d'une réalisation, par exercice **réellement effectué** :
 * brique autonome ou enfant de groupe (chaque tour compte pour une
 * série). Une substitution alimente donc le remplaçant, jamais
 * l'exercice initial.
 */
export function listSeriesByExercise(workout: WorkoutSession): Map<Id, PerformedSeries[]> {
  const seriesByExercise = new Map<Id, PerformedSeries[]>();

  for (const block of workout.blocks) {
    if (block.kind === "exercise") {
      const completed = (block.series ?? []).filter(
        (series) => series.status === "completed",
      );

      if (completed.length > 0) {
        seriesByExercise.set(block.exerciseId, [
          ...(seriesByExercise.get(block.exerciseId) ?? []),
          ...completed,
        ]);
      }

      continue;
    }

    if (block.kind === "group") {
      for (const round of block.rounds) {
        for (const child of round.children) {
          if (child.completedAt === undefined) continue;

          const series: PerformedSeries = {
            id: child.id,
            position: round.roundNumber - 1,
            status: "completed",
            ...(child.load !== undefined ? { load: child.load } : {}),
            ...(child.reps !== undefined ? { reps: child.reps } : {}),
            ...(child.durationSec !== undefined ? { durationSec: child.durationSec } : {}),
            ...(child.sideValues !== undefined ? { sideValues: child.sideValues } : {}),
            ...(child.rpe !== undefined ? { rpe: child.rpe } : {}),
            ...(child.note !== undefined ? { note: child.note } : {}),
            completedAt: child.completedAt,
          };

          seriesByExercise.set(child.exerciseId, [
            ...(seriesByExercise.get(child.exerciseId) ?? []),
            series,
          ]);
        }
      }
    }
  }

  return seriesByExercise;
}

export interface LastComparableStep {
  workoutId: Id;
  date: string;
  step: PerformedCardioStep;
}

/**
 * `Dernière fois comparable` (§11) : le dernier palier validé de cet
 * exercice ayant les **mêmes réglages** — vitesse et pente, durée
 * comparable — et non le palier de même rang. Sans palier comparable,
 * rien : la ligne disparaît plutôt que d'afficher une fausse référence.
 * Pour un palier en distance, même distance et durée comparable.
 */
export function findLastComparableStep(
  exerciseId: Id,
  settings: CardioStepSettings,
  completedWorkouts: WorkoutSession[],
  exceptWorkoutId?: Id,
): LastComparableStep | undefined {
  const ordered = [...completedWorkouts]
    .filter((workout) => workout.status === "completed" && workout.id !== exceptWorkoutId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const workout of ordered) {
    for (const block of workout.blocks) {
      if (block.kind !== "exercise" || block.exerciseId !== exerciseId) continue;

      const candidates = [...(block.cardioSteps ?? [])]
        .filter((step) => step.status === "completed")
        .reverse();

      for (const step of candidates) {
        if (areStepSettingsComparable(settings, step.settings)) {
          return { workoutId: workout.id, date: workout.date, step };
        }
      }
    }
  }

  return undefined;
}

function areStepSettingsComparable(
  reference: CardioStepSettings,
  candidate: CardioStepSettings,
): boolean {
  if ("speedKmh" in reference && "speedKmh" in candidate) {
    return isCardioStepComparable(reference, candidate);
  }

  if (!("speedKmh" in reference) && !("speedKmh" in candidate)) {
    return (
      reference.distanceKm === candidate.distanceKm &&
      candidate.durationSec >= reference.durationSec * 0.9 &&
      candidate.durationSec <= reference.durationSec * 1.1
    );
  }

  return false;
}
