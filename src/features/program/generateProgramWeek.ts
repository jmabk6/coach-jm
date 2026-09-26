import {
  getPlannedSessionsByDateIncludingRemoved,
  getWeeklyProgram,
  savePlannedSessions,
} from "../../db/repositories/programRepository";
import { getSetting } from "../../db/repositories/settingsRepository";
import { getAllTestProtocols } from "../../db/repositories/testRepository";
import type { PlannedSession } from "../../domain";
import {
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
  const generatedSessions = attachTestPlan({
    weekStartDate,
    generated: [
      ...generatePlannedSessionsForWeek({
        program,
        weekStartDate,
        existingSessions,
        now,
      }),
      /* Lot K.2 : une routine chaque soir, en rotation. */
      ...generateEveningRoutines({ program, weekStartDate, existingSessions, now }),
    ],
    existingSessions,
    program,
    plan: await loadTestPlan(),
    now,
  });

  if (generatedSessions.length > 0) {
    await savePlannedSessions(generatedSessions);
  }

  return generatedSessions;
}
