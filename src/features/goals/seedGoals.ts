import { db } from "../../db/database";
import type { Goal, InstallMarkers } from "../../domain";
import { GOALS_V1 } from "./goalsV1";

/**
 * Seed 8 (conception V2 § 3.6.4, SCHEMA_DEXIE_V3_MIGRATION § 5.2) : les 7
 * objectifs, en une transaction avec le marqueur `install.goals`. Un
 * objectif dont la clé existe n'est jamais écrasé ; un marqueur posé ne se
 * rejoue plus.
 */
export async function seedGoals(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.goals, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.goals !== undefined) return;

    for (const content of GOALS_V1) {
      if ((await db.goals.where("key").equals(content.key).count()) > 0) continue;
      const goal: Goal = { ...structuredClone(content), createdAt: now, updatedAt: now };
      await db.goals.add(goal);
    }

    await db.settings.put({ key: "install", value: { ...install, goals: now } });
  });
}
