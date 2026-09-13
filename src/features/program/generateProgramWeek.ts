import { addDays, parseISO } from "date-fns";

import {
  getPlannedSessionsByDateIncludingRemoved,
  getWeeklyProgram,
  savePlannedSessions,
} from "../../db/repositories/programRepository";
import type { PlannedSession } from "../../domain";
import { generatePlannedSessionsForWeek } from "../../domain/rules/programRules";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function generateProgramWeek(
  weekStartDate: string,
  now: string = new Date().toISOString(),
): Promise<PlannedSession[]> {
  const program = await getWeeklyProgram();

  if (!program) {
    return [];
  }

  const weekStart = parseISO(weekStartDate);

  const existingByDay = await Promise.all(
    Array.from({ length: 7 }, (_, offset) => {
      const date = formatLocalDate(addDays(weekStart, offset));

      return getPlannedSessionsByDateIncludingRemoved(date);
    }),
  );

  const existingSessions = existingByDay.flat();

  const generatedSessions = generatePlannedSessionsForWeek({
    program,
    weekStartDate,
    existingSessions,
    now,
  });

  if (generatedSessions.length > 0) {
    await savePlannedSessions(generatedSessions);
  }

  return generatedSessions;
}