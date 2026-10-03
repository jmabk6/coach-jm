import { db } from "../../db/database";
import type { InstallMarkers, TestProtocolVersion } from "../../domain";

/**
 * Seed 25 (03/10/2026) : le test traction calé sur la machine, qui ne
 * règle l'aide que par paliers de 7 kg. La version 1 (« 2 à 3 kg d'aide en
 * moins ») a un résultat (27/09) : elle est figée, donc une **version 2**
 * est créée, mêmes mesures, consignes et réglages par paliers de 7 kg. Le
 * test cherche le premier palier plus dur pertinent, pas tous les paliers
 * jusqu'à 0 kg.
 *
 * Seulement si la version active est encore la version 1 d'origine.
 */

export const TRACTION_TEST_7KG_INSTRUCTIONS = [
  "Échauffement : 2 séries faciles à 56 kg d'aide, non enregistrées.",
  "Premier essai au palier de travail de la Muscu A (indiqué dans le bandeau de la traction).",
  "Puis un palier de moins (7 kg d'aide en moins) après chaque essai réussi.",
  "3 min de repos entre deux essais.",
  "Essai réussi = menton au-dessus de la barre, bras tendus au départ, sans élan.",
  "Arrêt au premier échec. Inutile de descendre tous les paliers : un palier sous le palier de travail suffit, sauf si l'essai a été facile.",
  "Essai à 0 kg (traction stricte) seulement quand vous travaillez à 7 kg avec de bonnes répétitions.",
  "Toujours la même machine.",
];

export const TRACTION_TEST_7KG_SETTINGS = { warmupAssistKg: 56, warmupSets: 2, firstTrialKg: 42, stepMinKg: 7, stepMaxKg: 7, restSec: 180 };

export async function seedTractionTest7kg20261003(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.testProtocols, db.testProtocolVersions, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionTest7kg20261003 !== undefined) return;

    const protocol = await db.testProtocols.get("protocol-traction");
    const active = protocol ? await db.testProtocolVersions.get(protocol.activeVersionId) : undefined;
    if (protocol && active && active.number === 1 && active.settings?.stepMinKg === 2) {
      const versions = await db.testProtocolVersions.where("protocolId").equals(protocol.id).toArray();
      const number = Math.max(...versions.map((version) => version.number)) + 1;
      const next: TestProtocolVersion = {
        ...structuredClone(active),
        id: `${protocol.id}-v${number}`,
        number,
        status: "active",
        instructions: [...TRACTION_TEST_7KG_INSTRUCTIONS],
        settings: { ...active.settings, ...TRACTION_TEST_7KG_SETTINGS },
        createdAt: now,
        updatedAt: now,
      };
      delete next.firstOfficialResultId;
      delete next.frozenAt;
      /* La version 1 est figée par son résultat : on ne l'écrase jamais, elle est archivée. */
      await db.testProtocolVersions.put({ ...active, status: "archived", updatedAt: now });
      await db.testProtocolVersions.add(next);
      await db.testProtocols.put({ ...protocol, activeVersionId: next.id, updatedAt: now });
    }

    await db.settings.put({ key: "install", value: { ...install, tractionTest7kg20261003: now } });
  });
}
