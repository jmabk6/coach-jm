import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import { groupWorkoutsByMonth } from "./historyGroups";

const w = (id: string, date: string, hour: string): WorkoutSession => ({
  id,
  source: "free",
  status: "completed",
  date,
  startedAt: `${date}T${hour}:00:00.000Z`,
  lastActionAt: `${date}T${hour}:30:00.000Z`,
  completedAt: `${date}T${hour}:30:00.000Z`,
  activeDurationSec: 1800,
  blocks: [],
  createdAt: `${date}T${hour}:00:00.000Z`,
  updatedAt: `${date}T${hour}:30:00.000Z`,
});

describe("historique par mois", () => {
  it("regroupe par mois du plus récent au plus ancien, et dans le mois de la plus récente à la plus ancienne", () => {
    const months = groupWorkoutsByMonth([
      w("a", "2026-08-30", "10"),
      w("b", "2026-09-02", "09"),
      w("c", "2026-09-02", "18"),
      w("d", "2026-07-15", "10"),
    ]);

    expect(months.map((month) => [month.title, month.workouts.map((item) => item.id)])).toEqual([
      ["Septembre 2026", ["c", "b"]],
      ["Août 2026", ["a"]],
      ["Juillet 2026", ["d"]],
    ]);
    expect(groupWorkoutsByMonth([])).toEqual([]);
  });
});
