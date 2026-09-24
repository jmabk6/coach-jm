import { db } from "../../db/database";
import type { Id, TestProtocolVersion } from "../../domain";

/**
 * Figeage des versions de protocole (conception V2 § 3.7.2) : comme les
 * cadres, une version se fige au **premier résultat officiel** ; ensuite,
 * toute modification d'un réglage ou d'une mesure crée la version
 * suivante. Deux versions ne se comparent pas (D17 : l'unité des sprints
 * se fixe ainsi au premier test).
 */

export type TestProtocolVersionPatch = Partial<
  Pick<TestProtocolVersion, "instructions" | "settings" | "measures" | "primaryMeasureKey">
>;

export function isVersionFrozen(version: Pick<TestProtocolVersion, "firstOfficialResultId">): boolean {
  return version.firstOfficialResultId !== undefined;
}

/**
 * Pose le figeage si la version ne l'est pas encore. À appeler **dans** la
 * transaction qui écrit le résultat (confirmation de séance, saisie d'un
 * test passé). Rend la version, figée ou déjà figée.
 */
export async function freezeVersionForResult(versionId: Id, resultId: Id, now: string): Promise<TestProtocolVersion> {
  const version = await db.testProtocolVersions.get(versionId);
  if (!version) throw new Error("Version de protocole introuvable");
  if (isVersionFrozen(version)) return version;

  const frozen: TestProtocolVersion = { ...version, firstOfficialResultId: resultId, frozenAt: now, updatedAt: now };
  await db.testProtocolVersions.put(frozen);
  return frozen;
}

/**
 * Modifie les réglages ou les mesures d'un protocole : sur place tant que
 * la version active n'est pas figée ; sinon, la version suivante devient
 * active et l'ancienne est archivée, en une transaction. Rend la version
 * active après modification.
 */
export async function reviseTestProtocol(
  protocolId: Id,
  patch: TestProtocolVersionPatch,
  now: string = new Date().toISOString(),
): Promise<TestProtocolVersion> {
  return db.transaction("rw", db.testProtocols, db.testProtocolVersions, async () => {
    const protocol = await db.testProtocols.get(protocolId);
    if (!protocol) throw new Error("Protocole introuvable");
    const active = await db.testProtocolVersions.get(protocol.activeVersionId);
    if (!active) throw new Error("Version de protocole introuvable");

    if (!isVersionFrozen(active)) {
      const edited: TestProtocolVersion = { ...active, ...structuredClone(patch), updatedAt: now };
      await db.testProtocolVersions.put(edited);
      return edited;
    }

    const versions = await db.testProtocolVersions.where("protocolId").equals(protocolId).toArray();
    const number = Math.max(...versions.map((version) => version.number)) + 1;
    const next: TestProtocolVersion = {
      ...structuredClone(active),
      ...structuredClone(patch),
      id: `${protocol.id}-v${number}`,
      number,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    delete next.firstOfficialResultId;
    delete next.frozenAt;

    await db.testProtocolVersions.bulkPut([{ ...active, status: "archived", updatedAt: now }, next]);
    await db.testProtocols.put({ ...protocol, activeVersionId: next.id, updatedAt: now });
    return next;
  });
}
