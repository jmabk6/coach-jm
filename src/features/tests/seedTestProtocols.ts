import { db } from "../../db/database";
import type { InstallMarkers, TestProtocol, TestProtocolVersion } from "../../domain";
import { TEST_PROTOCOLS_V1, testProtocolId, testProtocolVersionId } from "./testProtocolsV1";

/**
 * Seed 4 (SCHEMA_DEXIE_V3_MIGRATION § 5.2) : les 7 protocoles V1 et leur
 * version 1, en une transaction avec le marqueur `install.testProtocols`.
 * Un protocole dont la `key` existe déjà n'est pas recréé ; un marqueur
 * posé ne se rejoue plus.
 */
export async function seedTestProtocols(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.testProtocols, db.testProtocolVersions, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.testProtocols !== undefined) return;

    for (const content of TEST_PROTOCOLS_V1) {
      if ((await db.testProtocols.where("key").equals(content.key).count()) > 0) continue;

      const protocol: TestProtocol = {
        id: testProtocolId(content.key),
        key: content.key,
        name: content.name,
        status: content.status,
        activeVersionId: testProtocolVersionId(content.key, 1),
        createdAt: now,
        updatedAt: now,
      };
      const version: TestProtocolVersion = {
        ...structuredClone(content.version),
        id: protocol.activeVersionId,
        protocolId: protocol.id,
        number: 1,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      await db.testProtocols.add(protocol);
      await db.testProtocolVersions.add(version);
    }

    await db.settings.put({ key: "install", value: { ...install, testProtocols: now } });
  });
}
