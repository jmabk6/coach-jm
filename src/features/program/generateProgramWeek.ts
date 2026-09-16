import {
  getPlannedSessionsByDateIncludingRemoved,
  getWeeklyProgram,
  savePlannedSessions,
} from "../../db/repositories/programRepository";
import type { PlannedSession } from "../../domain";
import {
  generatePlannedSessionsForWeek,
  listWeekDates,
} from "../../domain/rules/programRules";

/**
 * Génère à la volée les instances d'une semaine future (§9) : appelée
 * quand l'utilisateur navigue vers cette semaine. Ne fait rien pour la
 * semaine en cours ni pour le passé.
 */
export async function generateProgramWeek(
  weekStartDate: string,
  now: string = new Date().toISOString(),
): Promise<PlannedSession[]> {
  const program = await getWeeklyProgram();

  if (!program) {
    return [];
  }

  const existingByDay = await Promise.all(
    listWeekDates(weekStartDate).map((date) =>
      getPlannedSessionsByDateIncludingRemoved(date),
    ),
  );

  const generatedSessions = generatePlannedSessionsForWeek({
    program,
    weekStartDate,
    existingSessions: existingByDay.flat(),
    now,
  });

  if (generatedSessions.length > 0) {
    await savePlannedSessions(generatedSessions);
  }

  return generatedSessions;
}
