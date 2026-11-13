import { db } from "../../db/database";
import type { Goal, GoalSecondaryIndicator, InstallMarkers, PlannedSession, PlannedTest, SessionTemplate, TestProtocol, TestProtocolVersion, TestScheduleEntry } from "../../domain";
import { formatLocalDate, getSourceDate, slotOf } from "../../domain/rules/programRules";
import { isTestWeek } from "../../domain/rules/testCycleRules";
import { testOf } from "../../domain/rules/testPlanRules";
import { getWeekStartDate } from "../../domain/rules/programRules";
import { JAMBES_PROTOCOL_ID, JAMBES_V2_ID, JAMBES_V2_SCHEDULE_ENTRY, LEG_BLOCK_IDS, TEST_JAMBES_V2, TEST_JAMBES_V2_START } from "./testJambesV2";

/**
 * Seed 63 — test jambes V2 (13/11/2026), à partir du 13/11 seulement :
 * - la version 2 du protocole devient active, la v1 est archivée (jamais
 *   supprimée ; elle n'a aucun résultat) ;
 * - le test revient au calendrier (suspension du pari traction levée) : le
 *   mardi de la semaine de tests, à la place du fractionné et du bloc
 *   jambes du Cardio A, retour au calme à 10 min ;
 * - l'objectif Jambes suit les squats sur chaise ;
 * - les mardis intacts des semaines de tests déjà prévues reçoivent le test.
 * Les séances faites ou démarrées ne bougent pas.
 */

/** La version 2 du protocole (fonction pure). */
export function jambesV2Version(versions: ReadonlyArray<TestProtocolVersion>, now: string): TestProtocolVersion {
  const number = Math.max(0, ...versions.map((version) => version.number)) + 1;
  return { id: number === 2 ? JAMBES_V2_ID : `${JAMBES_PROTOCOL_ID}-v${number}`, protocolId: JAMBES_PROTOCOL_ID, number, status: "active", ...structuredClone(TEST_JAMBES_V2), createdAt: now, updatedAt: now };
}

/** Le calendrier des tests avec le test jambes V2 au mardi (fonction pure). */
export function testScheduleJambesV2(schedule: ReadonlyArray<TestScheduleEntry>): TestScheduleEntry[] {
  const others = schedule.filter((entry) => entry.protocolKey !== "jambes");
  return [...others, structuredClone(JAMBES_V2_SCHEDULE_ENTRY)];
}

/** L'objectif Jambes suivi par les squats sur chaise (fonction pure). */
export function legsGoalV2(goal: Goal, now: string): Goal {
  const segments = goal.segments.map((segment) =>
    segment.id === goal.currentSegmentId
      ? { ...segment, measure: { source: "test" as const, protocolId: JAMBES_PROTOCOL_ID, measureKey: "squat_reps" }, direction: "increase" as const, label: "Squats sur chaise" }
      : segment,
  );
  const ids = goal.linkedExercises.map((link) => link.exerciseId).filter((id) => id !== "sprint-velo");
  for (const id of ["squat-chaise", "presse-cuisses-une-jambe"]) if (!ids.includes(id)) ids.push(id);
  const secondary: GoalSecondaryIndicator[] = goal.secondaryIndicators.filter((indicator) => !(indicator.kind === "test_measure" && indicator.measureKey.startsWith("sprint_")));
  if (!secondary.some((indicator) => indicator.kind === "test_measure" && indicator.measureKey === "step_fc_fin")) {
    secondary.unshift({ kind: "test_measure", protocolId: JAMBES_PROTOCOL_ID, measureKey: "step_fc_fin" });
  }
  return { ...goal, segments, linkedExercises: ids.map((exerciseId) => ({ exerciseId })), secondaryIndicators: secondary, updatedAt: now };
}

/** Les mardis des semaines de tests, intacts, à partir de `from`, qui reçoivent le test (fonction pure). */
export function tuesdaysWithJambesTest(sessions: ReadonlyArray<PlannedSession>, from: string, cycle: { anchorWeekStart: string; everyWeeks: number }, test: PlannedTest, now: string): PlannedSession[] {
  return sessions
    .filter(
      (session) =>
        session.date >= from &&
        session.sessionTemplateId === JAMBES_V2_SCHEDULE_ENTRY.templateId &&
        slotOf(session) === "day" &&
        session.source === "weekly_program" &&
        session.status === "upcoming" &&
        !session.workoutId &&
        !session.removedAt &&
        getSourceDate(session) === session.date &&
        isTestWeek(getWeekStartDate(session.date), cycle) &&
        !(session.tests ?? []).some((item) => item.protocolId === JAMBES_PROTOCOL_ID),
    )
    .map((session) => ({ ...session, tests: [...(session.tests ?? []), structuredClone(test)], updatedAt: now }));
}

export async function seedTestJambesV2(now: string = new Date().toISOString()): Promise<void> {
  const today = formatLocalDate(new Date(now));
  if (today < TEST_JAMBES_V2_START) return;
  await db.transaction("rw", [db.testProtocols, db.testProtocolVersions, db.settings, db.goals, db.plannedSessions, db.sessionTemplates], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.testJambesV2_20261113 !== undefined) return;
    const done = async () => db.settings.put({ key: "install", value: { ...install, testJambesV2_20261113: now } });

    /* Le mardi de test vit dans le Cardio A du programme 4+2 : sans lui (modèle modifié à la main), rien n'est touché. */
    const cardioA = (await db.sessionTemplates.get(JAMBES_V2_SCHEDULE_ENTRY.templateId!)) as SessionTemplate | undefined;
    const blockIds = new Set(cardioA?.blocks.map((block) => block.id) ?? []);
    if (!cardioA || cardioA.status !== "active" || !LEG_BLOCK_IDS.every((id) => blockIds.has(id))) return done();

    const protocol = (await db.testProtocols.get(JAMBES_PROTOCOL_ID)) as TestProtocol | undefined;
    if (!protocol) return done();
    const versions = (await db.testProtocolVersions.where("protocolId").equals(JAMBES_PROTOCOL_ID).toArray()) as TestProtocolVersion[];
    const v2 = jambesV2Version(versions, now);
    for (const version of versions) if (version.status === "active") await db.testProtocolVersions.put({ ...version, status: "archived", updatedAt: now });
    await db.testProtocolVersions.add(v2);
    await db.testProtocols.put({ ...protocol, status: "active", activeVersionId: v2.id, updatedAt: now });

    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
    if (schedule) await db.settings.put({ key: "testSchedule", value: testScheduleJambesV2(schedule) });

    const goal = (await db.goals.where("key").equals("legs").first()) as Goal | undefined;
    if (goal) await db.goals.put(legsGoalV2(goal, now));

    const cycle = (await db.settings.get("testCycle"))?.value as { anchorWeekStart: string; everyWeeks: number } | undefined;
    if (cycle) {
      const sessions = (await db.plannedSessions.where("date").aboveOrEqual(today).toArray()) as PlannedSession[];
      const updates = tuesdaysWithJambesTest(sessions, today, cycle, testOf(JAMBES_V2_SCHEDULE_ENTRY, JAMBES_PROTOCOL_ID), now);
      if (updates.length > 0) await db.plannedSessions.bulkPut(updates);
    }

    await done();
  });
}
