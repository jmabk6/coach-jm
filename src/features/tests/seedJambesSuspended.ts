import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, TestScheduleEntry } from "../../domain";
import { JAMBES_SUSPENDED_FROM, JAMBES_SUSPENDED_UNTIL } from "../program/programV2";

/**
 * Seed 29 (05/10/2026), pari traction V6 : le test jambes (6 sprints
 * maximaux + chaise maximale) n'est pas planifié pendant le pari — les
 * jeudis des semaines de test sont allégés. Ni version allégée, ni
 * suppression : le protocole et ses résultats restent, et le test revient
 * seul à la première semaine de tests après le 31/03/2027.
 * - le calendrier des tests : l'entrée jambes reçoit `suspendedFrom` et `suspendedUntil` ;
 * - les séances à venir déjà générées du 04/10 au 31/03 perdent ce test
 *   (le bloc sprints normal reprend sa place, allégé en semaine test) ;
 *   celles d'avant le pari ne bougent pas.
 */

export async function seedJambesSuspended20261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.testProtocols, db.settings, db.plannedSessions], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.jambesSuspended20261005 !== undefined) return;

    const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
    if (schedule?.some((entry) => entry.protocolKey === "jambes" && entry.suspendedUntil === undefined)) {
      await db.settings.put({
        key: "testSchedule",
        value: schedule.map((entry) => (entry.protocolKey === "jambes" ? { ...entry, suspendedFrom: JAMBES_SUSPENDED_FROM, suspendedUntil: JAMBES_SUSPENDED_UNTIL } : entry)),
      });
    }

    const protocol = await db.testProtocols.where("key").equals("jambes").first();
    if (protocol) {
      const upcoming = await db.plannedSessions.where("status").equals("upcoming").toArray();
      for (const session of upcoming) {
        if (session.date < JAMBES_SUSPENDED_FROM || session.date > JAMBES_SUSPENDED_UNTIL || !session.tests?.some((test) => test.protocolId === protocol.id)) continue;
        const tests = session.tests.filter((test) => test.protocolId !== protocol.id);
        const next: PlannedSession = { ...session, updatedAt: now };
        if (tests.length > 0) next.tests = tests;
        else delete next.tests;
        await db.plannedSessions.put(next);
      }
    }

    await db.settings.put({ key: "install", value: { ...install, jambesSuspended20261005: now } });
  });
}
