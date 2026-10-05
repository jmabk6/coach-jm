import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareBackups, primaryKeyOf, verifyBackup as scriptVerify } from "../../../scripts/verify-backup.mjs";
import { db, VERSION_4_STORES } from "../../db/database";
import { readBackup, serializeBackup, type BackupContext } from "./exportBackup";
import { verifyBackupIntegrity } from "./restoreBackup";

/**
 * Vérificateur indépendant (scripts/verify-backup.mjs) : la clé primaire de
 * chaque store est celle du schéma Dexie de l'app — `key` pour les
 * réglages, `date` pour les journées d'Alimentation (nutritionDays), `id`
 * ailleurs. Une journée valide, identifiée par sa date, n'est pas un
 * problème (sauvegarde iPhone du 05/10/2026 à 21:36).
 */

const context: BackupContext = { now: new Date("2026-10-05T19:36:00.000Z"), buildTime: "build", userAgent: "test", standalone: true, appVersion: "0.0.0" };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

async function backupWithNutritionDay() {
  await db.nutritionDays.put({ date: "2026-10-05", complete: true, updatedAt: "2026-10-05T19:03:41.924Z" });
  await db.settings.put({ key: "preferences", value: { theme: "auto", timerSound: true, freeWorkoutRestSec: 90 } });
  await db.exercises.put({ id: "rowing-poulie-basse", name: "Rowing" } as never);
  return JSON.parse(serializeBackup(await readBackup(db, context)));
}

describe("verify-backup.mjs : clés primaires du schéma de l'app", () => {
  it("la clé de chaque store suit le schéma Dexie v4 (première clé) : settings → key, nutritionDays → date, les autres → id", () => {
    for (const [store, schema] of Object.entries(VERSION_4_STORES)) {
      expect(primaryKeyOf(store), store).toBe(schema.split(",")[0]!.trim());
    }
    expect([primaryKeyOf("settings"), primaryKeyOf("nutritionDays"), primaryKeyOf("workouts")]).toEqual(["key", "date", "id"]);
  });

  it("journée d'Alimentation valide, identifiée par sa date : OK pour le script comme pour l'app", async () => {
    const file = await backupWithNutritionDay();
    expect(file.stores.nutritionDays).toEqual([{ date: "2026-10-05", complete: true, updatedAt: "2026-10-05T19:03:41.924Z" }]);
    expect(file.stores.nutritionDays[0]).not.toHaveProperty("id");
    expect(scriptVerify(file)).toMatchObject({ ok: true, problems: [] });
    expect(await verifyBackupIntegrity(file)).toMatchObject({ ok: true });
  });

  it("journée sans sa date : rejetée ; deux journées à la même date : rejetées", async () => {
    const file = await backupWithNutritionDay();
    const withoutDate = structuredClone(file);
    delete withoutDate.stores.nutritionDays[0].date;
    expect(scriptVerify(withoutDate).problems).toContain("nutritionDays : enregistrement sans identifiant (date)");

    const twice = structuredClone(file);
    twice.stores.nutritionDays.push({ ...twice.stores.nutritionDays[0] });
    twice.counts.nutritionDays = 2;
    expect(scriptVerify(twice).problems).toContain("nutritionDays : identifiants en double (1)");
  });

  it("les autres tables gardent leurs contrôles : un exercice sans id, un réglage sans key sont toujours rejetés", async () => {
    const file = await backupWithNutritionDay();
    const exercise = structuredClone(file);
    delete exercise.stores.exercises[0].id;
    expect(scriptVerify(exercise).problems).toContain("exercises : enregistrement sans identifiant (id)");
    const setting = structuredClone(file);
    delete setting.stores.settings[0].key;
    expect(scriptVerify(setting).problems).toContain("settings : enregistrement sans identifiant (key)");
  });

  it("comparaison de deux sauvegardes : les journées se rapprochent par leur date", async () => {
    const before = await backupWithNutritionDay();
    await db.nutritionDays.put({ date: "2026-10-05", complete: false, updatedAt: "2026-10-05T20:00:00.000Z" });
    const after = JSON.parse(serializeBackup(await readBackup(db, context)));
    const diff = compareBackups(before, after);
    expect(JSON.stringify(diff)).toContain("2026-10-05");
    expect(JSON.stringify(diff)).not.toContain("undefined");
  });
});
