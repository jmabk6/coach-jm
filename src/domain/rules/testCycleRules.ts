import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { TestCycleSettings, WeeklyProgram } from "../models";
import { formatLocalDate, getWeekStartDate } from "./programRules";

/**
 * Semaine de tests (conception V2 § 2.3, § 5.9) : toutes les
 * `everyWeeks` semaines à partir de l'ancre (dimanche 27/09/2026).
 *
 * `isTestWeek(w) = w ≥ anchor ∧ ((w − anchor) / 7) mod everyWeeks = 0`.
 */
export function isTestWeek(weekStartDate: string, cycle: TestCycleSettings): boolean {
  const days = differenceInCalendarDays(parseISO(weekStartDate), parseISO(cycle.anchorWeekStart));
  if (days < 0 || days % 7 !== 0) return false;
  return (days / 7) % cycle.everyWeeks === 0;
}

/** Le dimanche de la semaine de tests en cours ou de la prochaine, à partir d'une date. */
export function nextTestWeekStart(date: string, cycle: TestCycleSettings): string {
  const weekStart = getWeekStartDate(date);
  if (weekStart <= cycle.anchorWeekStart) return cycle.anchorWeekStart;

  const weeks = differenceInCalendarDays(parseISO(weekStart), parseISO(cycle.anchorWeekStart)) / 7;
  const offset = (cycle.everyWeeks - (weeks % cycle.everyWeeks)) % cycle.everyWeeks;
  return formatLocalDate(addDays(parseISO(weekStart), offset * 7));
}

/** « Dans N jours » : jours jusqu'au prochain dimanche de semaine de tests (0 pendant la semaine). */
export function daysUntilNextTestWeek(today: string, cycle: TestCycleSettings): number {
  const start = nextTestWeekStart(today, cycle);
  return Math.max(0, differenceInCalendarDays(parseISO(start), parseISO(today)));
}

/**
 * Routine du soir d'une date (N3 : la rotation suit les jours) : la
 * rotation part de l'ancre et avance d'une routine par jour.
 */
export function eveningRoutineFor(program: Pick<WeeklyProgram, "eveningRotation" | "eveningRotationAnchor">, date: string): string | undefined {
  const rotation = program.eveningRotation ?? [];
  if (rotation.length === 0 || !program.eveningRotationAnchor) return undefined;

  const days = differenceInCalendarDays(parseISO(date), parseISO(program.eveningRotationAnchor));
  const index = ((days % rotation.length) + rotation.length) % rotation.length;
  return rotation[index];
}
