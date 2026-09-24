import { db } from "../../db/database";
import type { InstallMarkers, PreferenceSettings, TestCycleSettings } from "../../domain";

/** Valeurs par défaut (conception V2 § 3.9). */
export const DEFAULT_PREFERENCES: PreferenceSettings = { theme: "auto", timerSound: true, freeWorkoutRestSec: 90 };
export const DEFAULT_TEST_CYCLE: TestCycleSettings = { anchorWeekStart: "2026-09-27", everyWeeks: 4 };

/**
 * Seed 3 (SCHEMA_DEXIE_V3_MIGRATION.md § 5.2) : crée les réglages
 * manquants — `preferences`, `testCycle`, `install` — et pose le marqueur
 * `install.settingsDefaults`, le tout dans **une** transaction. Un
 * enregistrement présent n'est jamais réécrit ; marqueur posé : aucune
 * écriture, même si l'utilisateur a depuis modifié ses réglages.
 */
export async function seedSettingsDefaults(now: Date = new Date()): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.settingsDefaults !== undefined) return;

    if ((await db.settings.get("preferences")) === undefined) {
      await db.settings.add({ key: "preferences", value: { ...DEFAULT_PREFERENCES } });
    }
    if ((await db.settings.get("testCycle")) === undefined) {
      await db.settings.add({ key: "testCycle", value: { ...DEFAULT_TEST_CYCLE } });
    }
    await db.settings.put({ key: "install", value: { ...install, settingsDefaults: now.toISOString() } });
  });
}
