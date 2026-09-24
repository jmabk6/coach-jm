import { db } from "../database";
import type { Id, TestProtocol, TestProtocolVersion, TestResult } from "../../domain";

/**
 * Tests (conception V2 § 3.7) : protocoles stables, versions figées au
 * premier résultat officiel, résultats datés. `testResults` est la source
 * unique des mesures de test (D27). Aucune suppression de protocole ni de
 * version : un protocole se met en pause, une version s'archive.
 */

export async function getAllTestProtocols(): Promise<TestProtocol[]> {
  return db.testProtocols.toArray();
}

export async function getTestProtocol(id: Id): Promise<TestProtocol | undefined> {
  return db.testProtocols.get(id);
}

export async function getTestProtocolByKey(key: string): Promise<TestProtocol | undefined> {
  return db.testProtocols.where("key").equals(key).first();
}

export async function getTestProtocolVersion(id: Id): Promise<TestProtocolVersion | undefined> {
  return db.testProtocolVersions.get(id);
}

export async function getTestProtocolVersions(protocolId: Id): Promise<TestProtocolVersion[]> {
  const versions = await db.testProtocolVersions.where("protocolId").equals(protocolId).toArray();
  return versions.sort((a, b) => a.number - b.number);
}

/** La version active d'un protocole, celle que capture un démarrage de séance. */
export async function getActiveTestProtocolVersion(protocolId: Id): Promise<TestProtocolVersion | undefined> {
  const protocol = await db.testProtocols.get(protocolId);
  return protocol ? db.testProtocolVersions.get(protocol.activeVersionId) : undefined;
}

export async function getTestResult(id: Id): Promise<TestResult | undefined> {
  return db.testResults.get(id);
}

/** Les résultats d'un protocole, par date croissante (index `[protocolId+date]`). */
export async function getTestResultsForProtocol(protocolId: Id): Promise<TestResult[]> {
  return db.testResults
    .where("[protocolId+date]")
    .between([protocolId, ""], [protocolId, "￿"])
    .toArray();
}

/** Existe-t-il un résultat pour ce protocole à cette date ? (« à replanifier », D26). */
export async function hasTestResultOn(protocolId: Id, date: string): Promise<boolean> {
  return (await db.testResults.where("[protocolId+date]").equals([protocolId, date]).count()) > 0;
}

export async function getTestResultsForWorkout(workoutId: Id): Promise<TestResult[]> {
  return db.testResults.where("workoutId").equals(workoutId).toArray();
}

export async function getAllTestResults(): Promise<TestResult[]> {
  return db.testResults.toArray();
}
