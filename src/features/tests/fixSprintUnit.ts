import { db } from "../../db/database";
import type { Id } from "../../domain";
import { SPRINT_UNIT_SETTING } from "./testProtocolsV1";
import { isVersionFrozen, reviseTestProtocol } from "./testProtocolVersioning";

export type SprintUnit = "watts" | "meters";

/**
 * D17 : l'unité des sprints se fixe au premier test. Tant que la version
 * n'est pas figée, elle se règle **sur place** : la brique qui l'a
 * capturée garde la même version. Une version figée, ou dont l'unité est
 * déjà fixée, n'est pas touchée (changer d'unité ensuite crée une
 * nouvelle version, jamais depuis la séance).
 */
export async function fixSprintUnit(protocolId: Id, versionId: Id, unit: SprintUnit, now: string = new Date().toISOString()): Promise<void> {
  const version = await db.testProtocolVersions.get(versionId);
  if (!version) throw new Error("Version de protocole introuvable");
  if (version.settings?.[SPRINT_UNIT_SETTING]) return;
  if (isVersionFrozen(version)) throw new Error("Cette version est figée : l'unité ne se change plus ici");

  const protocol = await db.testProtocols.get(protocolId);
  if (protocol?.activeVersionId !== versionId) throw new Error("Cette version n'est plus la version active");

  await reviseTestProtocol(protocolId, { settings: { ...version.settings, [SPRINT_UNIT_SETTING]: unit } }, now);
}
