import { addDays, parseISO } from "date-fns";
import type {
  Id,
  PlannedSession,
  PlannedTest,
  TestCycleSettings,
  TestResult,
  TestScheduleEntry,
  WeeklyProgram,
} from "../models";
import { formatLocalDate, getSourceDate, slotOf, weekdays } from "./programRules";
import { eveningRoutineFor, isTestWeek } from "./testCycleRules";

/**
 * Tests d'une semaine de tests (conception V2 § 2.3, § 3.5.1, D26).
 *
 * À la génération d'une semaine de tests, chaque entrée de
 * `settings.testSchedule` s'attache à l'instance **nouvellement créée**
 * qui lui correspond (jamais à une instance existante : elle appartient
 * déjà à l'utilisateur) :
 *
 * - journée : l'instance du jour, du modèle indiqué ;
 * - soir : l'instance du soir, créée pour l'occasion avec la routine du
 *   jour (N3), dont le test remplace le contenu (Souplesse, Tronc, N2) ;
 * - matin (mensurations) : aucune instance, l'Accueil lit le calendrier.
 *
 * Un protocole absent ou en pause n'est jamais attaché.
 */

export interface TestPlan {
  cycle: TestCycleSettings;
  schedule: TestScheduleEntry[];
  /** Protocoles actifs seulement, par clé. */
  protocolIdByKey: ReadonlyMap<string, Id>;
}

export function eveningSessionId(date: string): string {
  return `weekly-${date}-evening`;
}

function testOf(entry: TestScheduleEntry, protocolId: Id): PlannedTest {
  const test: PlannedTest = { protocolId, placement: entry.placement ?? "before_all" };
  if (entry.targetBlockId) test.targetBlockId = entry.targetBlockId;
  if (entry.targetStepId) test.targetStepId = entry.targetStepId;
  if (entry.adjustments) test.adjustments = structuredClone(entry.adjustments);
  return test;
}

export function attachTestPlan({
  weekStartDate,
  generated,
  existingSessions,
  program,
  plan,
  now,
}: {
  weekStartDate: string;
  generated: PlannedSession[];
  existingSessions: ReadonlyArray<PlannedSession>;
  program: Pick<WeeklyProgram, "eveningRotation" | "eveningRotationAnchor">;
  plan: TestPlan | undefined;
  now: string;
}): PlannedSession[] {
  if (!plan || !isTestWeek(weekStartDate, plan.cycle)) return generated;

  const sessions = generated.map((session) => ({ ...session }));
  const dateOf = (weekday: TestScheduleEntry["weekday"]) =>
    formatLocalDate(addDays(parseISO(weekStartDate), weekdays.indexOf(weekday)));
  const attach = (session: PlannedSession, test: PlannedTest) => {
    session.tests = [...(session.tests ?? []), test];
  };

  for (const entry of plan.schedule) {
    const protocolId = plan.protocolIdByKey.get(entry.protocolKey);
    if (!protocolId || entry.slot === "morning") continue;

    const date = dateOf(entry.weekday);

    if (entry.slot === "day") {
      const target = sessions.find(
        (session) =>
          session.date === date &&
          slotOf(session) === "day" &&
          (entry.templateId === undefined || session.sessionTemplateId === entry.templateId),
      );
      if (target) attach(target, testOf(entry, protocolId));
      continue;
    }

    /* Soir : l'instance du soir déjà générée n'est jamais retouchée. */
    const alreadyGenerated = existingSessions.some(
      (session) => session.source === "weekly_program" && slotOf(session) === "evening" && getSourceDate(session) === date,
    );
    if (alreadyGenerated) continue;

    let evening = sessions.find((session) => session.date === date && slotOf(session) === "evening");
    if (!evening) {
      const routineId = eveningRoutineFor(program, date);
      if (!routineId) continue;
      evening = {
        id: eveningSessionId(date),
        date,
        sessionTemplateId: routineId,
        status: "upcoming",
        slot: "evening",
        sourceWeekday: entry.weekday,
        sourceDate: date,
        source: "weekly_program",
        createdAt: now,
        updatedAt: now,
      };
      sessions.push(evening);
    }
    attach(evening, testOf(entry, protocolId));
  }

  return sessions;
}

/* -------------------------------------------------------------------------- */
/* « À replanifier » (D26) — état dérivé, sans champ stocké                   */
/* -------------------------------------------------------------------------- */

export interface TestToReschedule {
  session: PlannedSession;
  test: PlannedTest;
}

/**
 * Un test attaché devient « à replanifier » quand son instance est
 * sautée, retirée, passée sans avoir été faite, ou faite sans que le test
 * le soit (brique sautée ou non réalisée, I-13) ; qu'aucun résultat de ce
 * protocole n'existe à cette date ; et qu'il n'a pas déjà été replanifié.
 * Il n'est **jamais** converti en test passé.
 */
export function listTestsToReschedule(
  sessions: ReadonlyArray<PlannedSession>,
  results: ReadonlyArray<Pick<TestResult, "protocolId" | "date">>,
  today: string,
): TestToReschedule[] {
  const done = new Set(results.map((result) => `${result.protocolId}|${result.date}`));

  return sessions.flatMap((session) => {
    const missed =
      session.status === "skipped" ||
      session.status === "done" ||
      session.removedAt !== undefined ||
      (session.status === "upcoming" && session.date < today);
    if (!missed) return [];

    return (session.tests ?? [])
      .filter((test) => test.rescheduledToPlannedSessionId === undefined && !done.has(`${test.protocolId}|${session.date}`))
      .map((test) => ({ session, test }));
  });
}

/**
 * Le test recopié sur une autre instance : placement et ajustements ne
 * valent que pour le modèle d'origine ; ailleurs, le test se place en
 * tête (après l'échauffement s'il y en a un).
 */
export function retargetTest(test: PlannedTest, from: PlannedSession, to: PlannedSession): PlannedTest {
  const { protocolId, placement } = test;
  if (from.sessionTemplateId === to.sessionTemplateId) {
    const copy = structuredClone(test);
    delete copy.rescheduledToPlannedSessionId;
    return copy;
  }
  return { protocolId, placement: placement === "replace_all" ? "replace_all" : "after_warmup" };
}
