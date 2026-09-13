import {
  addDays,
  parseISO,
  startOfWeek,
} from "date-fns";
import type {
  PlannedSession,
  Weekday,
  WeeklyProgram,
} from "../models";

const weekdayOffsets: Record<Weekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export interface GeneratePlannedSessionsForWeekInput {
  program: WeeklyProgram;
  weekStartDate: string;
  existingSessions: PlannedSession[];
  now: string;
}

export function generatePlannedSessionsForWeek({
  program,
  weekStartDate,
  existingSessions,
  now,
}: GeneratePlannedSessionsForWeekInput): PlannedSession[] {
  const weekStart = parseISO(weekStartDate);

  const currentWeekStart = startOfWeek(
    parseISO(now),
    { weekStartsOn: 1 },
  );

  if (weekStart <= currentWeekStart) {
    return [];
  }

  return program.days.flatMap((day) => {
    if (!day.sessionTemplateId) {
      return [];
    }

    const date = formatLocalDate(
      addDays(weekStart, weekdayOffsets[day.weekday]),
    );

    const alreadyExists = existingSessions.some(
      (session) =>
        session.date === date &&
        session.source === "weekly_program" &&
        session.sourceWeekday === day.weekday,
    );

    if (alreadyExists) {
      return [];
    }

    return [
      {
        id: `weekly-${date}`,
        date,
        sessionTemplateId: day.sessionTemplateId,
        status: "upcoming",
        sourceWeekday: day.weekday,
        source: "weekly_program",
        createdAt: now,
        updatedAt: now,
      },
    ];
  });
}