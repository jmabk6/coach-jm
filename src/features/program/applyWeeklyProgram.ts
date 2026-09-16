import {
  deletePlannedSessions,
  getPlannedSessionsFromIncludingRemoved,
  getWeeklyProgram,
  savePlannedSessions,
  saveWeeklyProgram,
} from "../../db/repositories/programRepository";
import type { WeeklyProgram } from "../../domain";
import {
  getSourceDate,
  getWeekStartDate,
  resyncPlannedSessionsToProgram,
} from "../../domain/rules/programRules";
import { generateProgramWeek } from "./generateProgramWeek";

/**
 * Enregistre la règle hebdomadaire et la répercute sur les semaines
 * futures déjà générées (décision du 16/09/2026) : les instances intactes
 * suivent la nouvelle règle, celles que l'utilisateur a déplacées,
 * remplacées, sautées ou retirées gardent leurs modifications.
 * Le passé et la semaine en cours ne bougent jamais.
 */
export async function applyWeeklyProgram(
  next: Omit<WeeklyProgram, "id">,
  now: string = new Date().toISOString(),
): Promise<void> {
  const previous = await getWeeklyProgram();

  await saveWeeklyProgram(next);

  const currentWeekStart = getWeekStartDate(now.slice(0, 10));
  const sessions =
    await getPlannedSessionsFromIncludingRemoved(currentWeekStart);

  const { deleteIds, updates } = resyncPlannedSessionsToProgram({
    previous,
    next,
    sessions,
    now,
  });

  if (deleteIds.length > 0) {
    await deletePlannedSessions(deleteIds);
  }

  if (updates.length > 0) {
    await savePlannedSessions(updates);
  }

  /* Les semaines déjà visitées reçoivent les journées nouvellement
     affectées ; les autres seront générées à la navigation. */
  const visitedWeeks = new Set(
    sessions
      .filter((session) => session.source === "weekly_program")
      .map((session) => getWeekStartDate(getSourceDate(session))),
  );

  for (const weekStartDate of visitedWeeks) {
    await generateProgramWeek(weekStartDate, now);
  }
}
