import type { Id, PerformedSeries, WorkoutSession } from "../../domain";

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
