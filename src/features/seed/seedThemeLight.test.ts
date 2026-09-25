import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers } from "../../domain";
import { DEFAULT_PREFERENCES, seedThemeLight } from "./seedSettingsDefaults";

/**
 * Thème Clair par défaut (décision du 25/09/2026) : une base neuve démarre
 * en Clair ; l'ancien « Auto » par défaut passe à « Clair » une seule fois ;
 * un thème choisi n'est jamais touché.
 */

const T = new Date("2026-09-25T20:00:00.000Z");

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

async function installWith(theme: "auto" | "light" | "dark") {
  await db.settings.put({ key: "preferences", value: { theme, timerSound: true, freeWorkoutRestSec: 60 } });
  await db.settings.put({ key: "install", value: { settingsDefaults: "2026-09-24T08:00:00.000Z" } });
}

describe("thème Clair par défaut", () => {
  it("valeur par défaut : Clair", () => {
    expect(DEFAULT_PREFERENCES.theme).toBe("light");
  });

  it("l'ancien Auto par défaut passe à Clair, le reste des réglages est gardé ; une seule fois", async () => {
    await installWith("auto");
    await seedThemeLight(T);
    expect((await db.settings.get("preferences"))?.value).toEqual({ theme: "light", timerSound: true, freeWorkoutRestSec: 60 });
    expect(((await db.settings.get("install"))?.value as InstallMarkers).themeLight).toBe(T.toISOString());

    /* Choisi ensuite dans Réglages : jamais réécrit. */
    await db.settings.put({ key: "preferences", value: { theme: "auto", timerSound: true, freeWorkoutRestSec: 60 } });
    await seedThemeLight(new Date("2026-09-26T08:00:00.000Z"));
    expect((await db.settings.get("preferences"))?.value).toMatchObject({ theme: "auto" });
  });

  it("un thème Sombre n'est pas touché", async () => {
    await installWith("dark");
    await seedThemeLight(T);
    expect((await db.settings.get("preferences"))?.value).toMatchObject({ theme: "dark" });
  });
});
