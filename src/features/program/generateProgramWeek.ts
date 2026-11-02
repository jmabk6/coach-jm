import {
  getPlannedSessionsByDateIncludingRemoved,
  getWeeklyProgram,
  savePlannedSessions,
} from "../../db/repositories/programRepository";
import { getSetting } from "../../db/repositories/settingsRepository";
import { getAllTestProtocols } from "../../db/repositories/testRepository";
import type { PlannedSession } from "../../domain";
import { addDays, parseISO } from "date-fns";
import {
  formatLocalDate,
  generatePlannedSessionsForWeek,
  listWeekDates,
} from "../../domain/rules/programRules";
import { generateEveningRoutines } from "../../domain/rules/testCycleRules";
import { attachTestPlan, type TestPlan } from "../../domain/rules/testPlanRules";

/** Le calendrier des tests : cycle, place de chaque test, protocoles actifs. */
export async function loadTestPlan(): Promise<TestPlan | undefined> {
  const [cycle, schedule, protocols] = await Promise.all([
    getSetting("testCycle"),
    getSetting("testSchedule"),
    getAllTestProtocols(),
  ]);
  if (!cycle || !schedule) return undefined;

  return {
    cycle,
    schedule,
    protocolIdByKey: new Map(
      protocols.filter((protocol) => protocol.status === "active").map((protocol) => [protocol.key, protocol.id]),
    ),
  };
}

/**
 * Génère à la volée les instances d'une semaine future (§9) : appelée
 * quand l'utilisateur navigue vers cette semaine. Ne fait rien pour la
 * semaine en cours ni pour le passé. Une semaine de tests reçoit ses
 * tests (lot G.2), attachés aux seules instances qu'elle crée.
 */
export async function generateProgramWeek(
  weekStartDate: string,
  now: string = new Date().toISOString(),
  /**
   * Programme V4 (lot L4) : complète aussi la semaine **en cours**, à partir
   * de cette date seulement (la semaine d'activation, si elle n'avait pas
   * encore été générée) ; les jours d'avant ne reçoivent rien.
   */
  fromDate?: string,
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

  const existingSessions = existingByDay.flat();
  /* Semaine en cours (V4) : la règle la traite comme une semaine à venir, vue de la veille. */
  const ruleNow = fromDate !== undefined ? `${formatLocalDate(addDays(parseISO(weekStartDate), -1))}T12:00:00.000Z` : now;
  const generated = attachTestPlan({
    weekStartDate,
    generated: [
      ...generatePlannedSessionsForWeek({
        program,
        weekStartDate,
        existingSessions,
        now: ruleNow,
      }),
      /* Lot K.2 : une routine chaque soir, en rotation. */
      ...generateEveningRoutines({ program, weekStartDate, existingSessions, now: ruleNow }),
    ],
    existingSessions,
    program,
    plan: await loadTestPlan(),
    now,
  });
  const generatedSessions =
    fromDate === undefined ? generated : generated.filter((session) => session.date >= fromDate).map((session) => ({ ...session, createdAt: now, updatedAt: now }));

  if (generatedSessions.length > 0) {
    await savePlannedSessions(generatedSessions);
  }

  return generatedSessions;
}
