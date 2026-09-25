import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { PlannedSession, TestCycleSettings, TestProtocol, TestResult, TestScheduleEntry, WeeklyProgram } from "../models";
import { formatLocalDate, getSourceDate, getWeekStartDate, isFutureWeek, listWeekDates, slotOf, weekdays } from "./programRules";

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

/**
 * Routines du soir d'une semaine (lot K.2, § 2.5 « chaque soir : routine
 * A / B / C en rotation ») : une instance par soir, dont la routine est
 * donnée par la date (N3). Sauter ou déplacer une routine ne décale donc
 * jamais les suivantes. Un soir qui a déjà eu son instance du programme —
 * même déplacée, sautée ou retirée — n'en reçoit pas d'autre ; seules les
 * semaines futures sont générées, comme les séances du jour.
 */
export function generateEveningRoutines({
  program,
  weekStartDate,
  existingSessions,
  now,
}: {
  program: Pick<WeeklyProgram, "eveningRotation" | "eveningRotationAnchor">;
  weekStartDate: string;
  existingSessions: ReadonlyArray<PlannedSession>;
  now: string;
}): PlannedSession[] {
  if (!isFutureWeek(weekStartDate, now)) return [];

  return listWeekDates(weekStartDate).flatMap((date, index): PlannedSession[] => {
    const routineId = eveningRoutineFor(program, date);
    if (!routineId) return [];
    const already = existingSessions.some(
      (session) => session.source === "weekly_program" && slotOf(session) === "evening" && getSourceDate(session) === date,
    );
    if (already) return [];
    return [
      {
        id: `weekly-${date}-evening`,
        date,
        sessionTemplateId: routineId,
        status: "upcoming",
        slot: "evening",
        sourceWeekday: weekdays[index]!,
        sourceDate: date,
        source: "weekly_program",
        createdAt: now,
        updatedAt: now,
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* Mensurations du matin (lot I.3)                                            */
/* -------------------------------------------------------------------------- */

export type MorningMeasurementState =
  /** Le jour prévu : invitation à côté de la pesée. */
  | "due"
  /** Plus tard dans la semaine de tests, sans résultat : encore à faire. */
  | "late"
  /** Un résultat existe dans la semaine de tests. */
  | "done";

export interface MorningMeasurement {
  state: MorningMeasurementState;
  /** Jour prévu, dans la semaine de tests en cours. */
  scheduledDate: string;
  /** Résultat de la semaine, s'il existe. */
  resultId?: string;
}

/**
 * Invitation aux mensurations (conception V2 § 2.3, § 2.4) : hors séance,
 * le matin du jour prévu par `testSchedule` (le lundi), dans une semaine de
 * tests. Avant ce jour, rien ; ensuite, tant que la semaine n'a pas de
 * résultat, elles restent à faire. En dehors d'une semaine de tests, rien.
 */
export function morningMeasurementFor({
  today,
  cycle,
  schedule,
  protocol,
  results,
}: {
  today: string;
  cycle: TestCycleSettings;
  schedule: ReadonlyArray<TestScheduleEntry>;
  protocol: Pick<TestProtocol, "id" | "key" | "status"> | undefined;
  results: ReadonlyArray<Pick<TestResult, "id" | "protocolId" | "date">>;
}): MorningMeasurement | undefined {
  if (!protocol || protocol.status !== "active") return undefined;
  const entry = schedule.find((item) => item.protocolKey === protocol.key);
  if (!entry) return undefined;

  const weekStart = getWeekStartDate(today);
  if (!isTestWeek(weekStart, cycle)) return undefined;

  const scheduledDate = formatLocalDate(addDays(parseISO(weekStart), weekdays.indexOf(entry.weekday)));
  const weekEnd = formatLocalDate(addDays(parseISO(weekStart), 6));
  const result = results.find((item) => item.protocolId === protocol.id && item.date >= weekStart && item.date <= weekEnd);

  if (result) return { state: "done", scheduledDate, resultId: result.id };
  if (today < scheduledDate) return undefined;
  return { state: today === scheduledDate ? "due" : "late", scheduledDate };
}
