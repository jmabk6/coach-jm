import "fake-indexeddb/auto";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, WeightEntry } from "../../domain";
import { compositionSummary } from "../../domain/rules/bodyCompositionRules";
import { weightBodyContradictions } from "../../domain/rules/bodyWeightRules";
import { canonicalStringify } from "../backup/canonicalJson";
import { readBackup, serializeBackup } from "../backup/exportBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup, restoreInto } from "../backup/restoreBackup";
import { createTestDatabase } from "../backup/testDatabase";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { seedLegacyComposition20261005, withingsCompositionReadings } from "./seedLegacyComposition";

/**
 * Seed 35 (05/10/2026, option C) : les compositions Withings notées sur
 * les pesées (`fatPct`, `muscleKg`) passent dans `bodyMeasurements`
 * (appareil « withings », non éligible comme poids de référence) ; la
 * pesée garde son poids, sans composition. Rien n'est perdu ; une seule
 * fois ; une seconde exécution ne change rien.
 */

const NOW = "2026-10-05T09:00:00.000Z";
const T = "2026-09-27T05:12:00.000Z";
const withComposition: WeightEntry = { id: "w-a", date: "2026-09-27", kg: 92.4, fatPct: 27.9, muscleKg: 63.0, createdAt: T, updatedAt: T };
const fatOnly: WeightEntry = { id: "w-b", date: "2026-09-28", kg: 92.1, fatPct: 27.7, createdAt: "x", updatedAt: "x" };
const plain: WeightEntry = { id: "w-c", date: "2026-09-29", kg: 92.0, createdAt: T, updatedAt: T };

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("migration des compositions Withings vers les mesures corporelles", () => {
  it("chaque composition devient une mesure Withings non éligible ; la pesée garde son poids sans composition ; une pesée sans composition ne bouge pas", async () => {
    await db.weightEntries.bulkAdd([withComposition, fatOnly, plain]);
    await seedLegacyComposition20261005(NOW);

    expect(await db.bodyMeasurements.toArray()).toEqual([
      { id: "body-withings-w-a", date: "2026-09-27", takenAt: T, device: "withings", source: "weight_entry", weightReference: false, weightKg: 92.4, fatPct: 27.9, muscleKg: 63.0, originWeightEntryId: "w-a", createdAt: NOW, updatedAt: NOW },
      { id: "body-withings-w-b", date: "2026-09-28", takenAt: "2026-09-28T12:00:00.000Z", device: "withings", source: "weight_entry", weightReference: false, weightKg: 92.1, fatPct: 27.7, originWeightEntryId: "w-b", createdAt: NOW, updatedAt: NOW },
    ]);
    expect(await db.weightEntries.toArray()).toEqual([
      { id: "w-a", date: "2026-09-27", kg: 92.4, createdAt: T, updatedAt: NOW },
      { id: "w-b", date: "2026-09-28", kg: 92.1, createdAt: "x", updatedAt: NOW },
      plain,
    ]);
    expect(weightBodyContradictions(await db.weightEntries.toArray(), await db.bodyMeasurements.toArray())).toEqual([]);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).legacyComposition20261005).toBe(NOW);
  });

  it("aucune perte : la tendance Withings de l'objectif Poids est identique avant et après la migration", async () => {
    const entries = Array.from({ length: 5 }, (_, index): WeightEntry => ({
      id: `w-${index}`, date: `2026-09-2${index + 1}`, kg: 92 - index / 10, fatPct: 28 - index / 10, muscleKg: 63 + index / 10, createdAt: T, updatedAt: T,
    }));
    await db.weightEntries.bulkAdd(entries);
    const before = (["fatPct", "muscleKg"] as const).map((key) => compositionSummary(withingsCompositionReadings(entries, []), key, "2026-10-05"));
    await seedLegacyComposition20261005(NOW);
    const weights = await db.weightEntries.toArray();
    const measures = await db.bodyMeasurements.toArray();
    /* Plus aucune composition sur les pesées : tout vient des mesures Withings. */
    expect(weights.some((entry) => entry.fatPct !== undefined || entry.muscleKg !== undefined)).toBe(false);
    expect(measures.map((measure) => [measure.date, measure.weightKg, measure.fatPct, measure.muscleKg])).toEqual(entries.map((entry) => [entry.date, entry.kg, entry.fatPct, entry.muscleKg]));
    const migrated = (["fatPct", "muscleKg"] as const).map((key) => compositionSummary(withingsCompositionReadings(weights, measures), key, "2026-10-05"));
    expect(migrated).toEqual(before);
  });

  it("idempotente : un second passage ne change rien, même marqueur effacé ; rien de dupliqué", async () => {
    await db.weightEntries.bulkAdd([withComposition, fatOnly, plain]);
    await seedLegacyComposition20261005(NOW);
    const snapshot = canonicalStringify({ weights: await db.weightEntries.toArray(), measures: await db.bodyMeasurements.toArray() });

    await seedLegacyComposition20261005("2026-10-06T09:00:00.000Z");
    expect(canonicalStringify({ weights: await db.weightEntries.toArray(), measures: await db.bodyMeasurements.toArray() })).toBe(snapshot);

    const install = (await db.settings.get("install"))!.value as InstallMarkers;
    delete install.legacyComposition20261005;
    await db.settings.put({ key: "install", value: install });
    await seedLegacyComposition20261005("2026-10-07T09:00:00.000Z");
    expect(canonicalStringify({ weights: await db.weightEntries.toArray(), measures: await db.bodyMeasurements.toArray() })).toBe(snapshot);
  });

  it("sauvegarde → restauration après migration : mesures et pesées identiques, cohérentes", async () => {
    await db.weightEntries.bulkAdd([withComposition, fatOnly, plain]);
    await seedLegacyComposition20261005(NOW);
    const envelope = await readBackup(db, { now: new Date(NOW), buildTime: NOW, userAgent: "test", standalone: false, appVersion: "0.9.0" });
    const target = createTestDatabase("coach-jm-legacy-composition", 3);
    await target.open();
    try {
      await restoreInto(parseBackup(serializeBackup(envelope)), target);
      expect(canonicalStringify(await target.bodyMeasurements.toArray())).toBe(canonicalStringify(envelope.stores.bodyMeasurements));
      expect(canonicalStringify(await target.weightEntries.toArray())).toBe(canonicalStringify(envelope.stores.weightEntries));
      expect(weightBodyContradictions(await target.weightEntries.toArray(), await target.bodyMeasurements.toArray())).toEqual([]);
    } finally {
      target.close();
      await Dexie.delete(target.name);
    }
  });
});

/* Les sauvegardes réelles (sans composition) : la migration n'a rien à faire, rien ne bouge. */
const REAL = ["C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-02-1323.json", "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-04-1806.json"].filter((path) => existsSync(path));

describe("anciennes sauvegardes réelles", () => {
  it.skipIf(REAL.length === 0)("restauration puis seeds : pesées identiques, aucune mesure créée, aucune contradiction", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const path of REAL) {
      await resetAndRestore(parseBackup(await readFile(path, "utf8")), db);
      resumeSeedsForTests();
      const before = await db.weightEntries.toArray();
      expect(await runSeeds()).toMatchObject({ failed: [] });
      expect(await db.weightEntries.toArray(), path).toEqual(before);
      expect(await db.bodyMeasurements.count(), path).toBe(0);
      expect(weightBodyContradictions(await db.weightEntries.toArray(), await db.bodyMeasurements.toArray()), path).toEqual([]);
    }
  }, 30000);
});
