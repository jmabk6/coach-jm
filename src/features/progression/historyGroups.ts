import type { WorkoutSession } from "../../domain";
import { formatMonthTitle } from "../../domain/rules/programRules";

export interface HistoryMonth {
  key: string;
  title: string;
  workouts: WorkoutSession[];
}

/**
 * Regroupe les séances terminées par mois, du plus récent au plus
 * ancien ; dans un mois, de la plus récente à la plus ancienne.
 */
export function groupWorkoutsByMonth(workouts: WorkoutSession[]): HistoryMonth[] {
  const months = new Map<string, WorkoutSession[]>();

  for (const workout of [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const key = workout.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), workout]);
  }

  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ key, title: formatMonthTitle(`${key}-01`), workouts: items }));
}
