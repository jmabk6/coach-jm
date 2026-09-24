import { db } from "../../db/database";
import type { Id } from "../../domain";
import { isLockedPlannedSession } from "../../domain/rules/programRules";
import { retargetTest } from "../../domain/rules/testPlanRules";

/**
 * « Replanifier » (D26) : attache un test « à replanifier » à une autre
 * instance planifiée, et marque le test d'origine
 * `rescheduledToPlannedSessionId` — il n'est plus en retard, et n'est
 * jamais converti en test passé. En une transaction.
 *
 * La séance libre ne contenant que la brique test, l'autre voie de la
 * conception, naît au démarrage d'un test (lot G.4).
 */
export async function rescheduleTest(
  fromPlannedSessionId: Id,
  protocolId: Id,
  toPlannedSessionId: Id,
  now: string = new Date().toISOString(),
): Promise<void> {
  await db.transaction("rw", db.plannedSessions, async () => {
    const [from, to] = await Promise.all([db.plannedSessions.get(fromPlannedSessionId), db.plannedSessions.get(toPlannedSessionId)]);
    if (!from) throw new Error("Séance d'origine introuvable");
    if (!to || to.removedAt) throw new Error("Séance visée introuvable");
    if (to.id === from.id) throw new Error("Choisissez une autre séance");
    if (isLockedPlannedSession(to) || to.status === "skipped") {
      throw new Error("Le test ne peut aller que sur une séance à venir");
    }

    const test = from.tests?.find((item) => item.protocolId === protocolId && item.rescheduledToPlannedSessionId === undefined);
    if (!test) throw new Error("Ce test n'est pas à replanifier");
    if (to.tests?.some((item) => item.protocolId === protocolId)) throw new Error("Cette séance porte déjà ce test");

    await db.plannedSessions.bulkPut([
      {
        ...from,
        tests: from.tests!.map((item) => (item === test ? { ...item, rescheduledToPlannedSessionId: to.id } : item)),
        updatedAt: now,
      },
      { ...to, tests: [...(to.tests ?? []), retargetTest(test, from, to)], updatedAt: now },
    ]);
  });
}
