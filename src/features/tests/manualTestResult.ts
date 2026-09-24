import { db } from "../../db/database";
import type { Id, TestResult } from "../../domain";
import { computeTestResult, type TestDraft } from "../../domain/rules/testResultRules";
import { releaseVersions } from "./settleTestBlocks";
import { freezeVersionForResult } from "./testProtocolVersioning";

/**
 * Saisie d'un test passé (conception V2 § 2.3, lot G.6) : un geste
 * distinct et explicite, jamais la conversion d'un test en retard. Le
 * résultat a pour origine `manual`, la date est choisie (pas dans le
 * futur) ; il se calcule comme en séance (§ 5.3) sur la version active du
 * protocole, qu'il fige s'il est son premier résultat. C'est le chemin des
 * tests du 27/09 au 03/10/2026, notés sur papier.
 */
export interface ManualTestInput {
  protocolId: Id;
  /** YYYY-MM-DD. */
  date: string;
  draft: TestDraft;
  conditionsRespected?: boolean;
  conditionsNote?: string;
}

export async function saveManualTestResult(
  input: ManualTestInput,
  today: string,
  now: string = new Date().toISOString(),
): Promise<TestResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Date invalide");
  if (input.date > today) throw new Error("Un test passé ne peut pas être daté dans le futur");

  return db.transaction("rw", db.testProtocols, db.testProtocolVersions, db.testResults, async () => {
    const protocol = await db.testProtocols.get(input.protocolId);
    if (!protocol) throw new Error("Protocole introuvable");
    if (protocol.status !== "active") throw new Error(`Le test ${protocol.name} est en pause`);

    const version = await db.testProtocolVersions.get(protocol.activeVersionId);
    if (!version) throw new Error("Version de protocole introuvable");

    if ((await db.testResults.where("[protocolId+date]").equals([protocol.id, input.date]).count()) > 0) {
      throw new Error("Un résultat de ce test existe déjà à cette date");
    }

    const computed = computeTestResult(version, input.draft);
    if (computed.measures.length === 0) throw new Error("Aucune mesure saisie");

    const note = input.draft.note?.trim();
    const conditionsNote = input.conditionsNote?.trim();
    const result: TestResult = {
      id: `manual-${protocol.id}-${input.date}-${crypto.randomUUID().slice(0, 8)}`,
      protocolId: protocol.id,
      versionId: version.id,
      date: input.date,
      origin: "manual",
      status: computed.status,
      measures: computed.measures,
      ...(computed.trials ? { trials: computed.trials } : {}),
      ...(input.conditionsRespected !== undefined ? { conditionsRespected: input.conditionsRespected } : {}),
      ...(conditionsNote ? { conditionsNote } : {}),
      ...(note ? { note } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await db.testResults.add(result);
    await freezeVersionForResult(version.id, result.id, now);
    return result;
  });
}

/**
 * Un résultat saisi se supprime depuis son détail (§ 3.7.3) ; un résultat
 * de séance, jamais : il part avec sa séance. La version se défige s'il ne
 * lui reste aucun résultat.
 */
export async function deleteManualTestResult(resultId: Id, now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.testProtocolVersions, db.testResults, async () => {
    const result = await db.testResults.get(resultId);
    if (!result) throw new Error("Résultat introuvable");
    if (result.origin !== "manual") throw new Error("Un résultat de séance se supprime avec sa séance");

    await db.testResults.delete(resultId);
    await releaseVersions([result], now);
  });
}
