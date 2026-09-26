import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession } from "../../domain";
import { listWeekDates, slotOf } from "../../domain/rules/programRules";
import { attachTestPlan } from "../../domain/rules/testPlanRules";
import { loadTestPlan } from "./generateProgramWeek";

/**
 * Seed 17 (26/09/2026) : les séances de journée de la semaine de tests du
 * 27/09 ont été générées le 24/09, avant le lot G ; elles n'ont reçu
 * aucun test (traction dimanche, cardio mercredi, jambes jeudi). Les
 * routines du soir, générées après, ont les leurs (souplesse et tronc le
 * lundi).
 *
 * Correction ponctuelle : la règle de génération (`attachTestPlan`) est
 * rejouée sur cette semaine, et un test n'est posé que sur une séance de
 * journée **intacte** — à venir, sans test, sans séance démarrée. Toute
 * autre séance est laissée telle quelle (D26 : une instance existante
 * appartient à l'utilisateur).
 */

export const TESTS_WEEK_START = "2026-09-27";

export async function seedTestsWeek20260927(now: string = new Date().toISOString()): Promise<void> {
  const plan = await loadTestPlan();

  await db.transaction("rw", [db.plannedSessions, db.workouts, db.weeklyPrograms, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.testsWeek20260927 !== undefined) return;

    const program = (await db.weeklyPrograms.toArray())[0];
    const dates = listWeekDates(TESTS_WEEK_START);
    const week = (await db.plannedSessions.where("date").anyOf(dates).toArray()) as PlannedSession[];

    if (program && plan) {
      const started = new Set(
        (await db.workouts.where("plannedSessionId").anyOf(week.map((session) => session.id)).toArray()).map(
          (workout) => workout.plannedSessionId,
        ),
      );
      const intact = week.filter(
        (session) =>
          slotOf(session) === "day" &&
          session.status === "upcoming" &&
          (session.tests ?? []).length === 0 &&
          !started.has(session.id),
      );
      const withTests = attachTestPlan({
        weekStartDate: TESTS_WEEK_START,
        generated: intact,
        existingSessions: week,
        program,
        plan,
        now,
      });

      for (const session of withTests) {
        if (!intact.some((candidate) => candidate.id === session.id)) continue;
        if ((session.tests ?? []).length === 0) continue;
        await db.plannedSessions.put({ ...session, updatedAt: now });
      }
    }

    await db.settings.put({ key: "install", value: { ...install, testsWeek20260927: now } });
  });
}
