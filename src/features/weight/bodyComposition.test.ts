import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import {
  compositionSummary,
  formatComposition,
  MIN_READINGS_PER_MONTH,
  parseCompositionInput,
} from "../../domain/rules/bodyCompositionRules";
import { canonicalStringify } from "../backup/canonicalJson";
import { readBackup, readStores, serializeBackup } from "../backup/exportBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup, replaceWith } from "../backup/restoreBackup";
import { createTestDatabase } from "../backup/testDatabase";
import { correctWeight, recordWeight } from "./weightActions";

/**
 * Composition corporelle (26/09/2026) : masse grasse et masse musculaire
 * facultatives, bornes 3-60 % et 20-120 kg ; moyenne du mois à partir de
 * 4 relevés ; aucune migration — une sauvegarde sans ces champs se
 * restaure telle quelle.
 */

process.env.TZ = "Europe/Paris";

const NOW = new Date("2026-09-26T07:00:00.000Z");

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("saisie", () => {
  it("facultative : vide = rien ; virgule ou point, une décimale ; bornes 3-60 % et 20-120 kg", () => {
    expect(parseCompositionInput("fatPct", "")).toEqual({ ok: true });
    expect(parseCompositionInput("fatPct", "  ")).toEqual({ ok: true });
    expect(parseCompositionInput("fatPct", "18,44")).toEqual({ ok: true, value: 18.4 });
    expect(parseCompositionInput("fatPct", "3")).toEqual({ ok: true, value: 3 });
    expect(parseCompositionInput("fatPct", "60")).toEqual({ ok: true, value: 60 });
    expect(parseCompositionInput("fatPct", "2,9")).toEqual({ ok: false, message: "Masse grasse : entre 3 et 60 %." });
    expect(parseCompositionInput("fatPct", "60,1")).toMatchObject({ ok: false });
    expect(parseCompositionInput("muscleKg", "62.06")).toEqual({ ok: true, value: 62.1 });
    expect(parseCompositionInput("muscleKg", "20")).toEqual({ ok: true, value: 20 });
    expect(parseCompositionInput("muscleKg", "120")).toEqual({ ok: true, value: 120 });
    expect(parseCompositionInput("muscleKg", "19,9")).toEqual({ ok: false, message: "Masse musculaire : entre 20 et 120 kg." });
    expect(parseCompositionInput("muscleKg", "beaucoup")).toMatchObject({ ok: false });
    expect(formatComposition("fatPct", 18)).toBe("18,0 %");
    expect(formatComposition("muscleKg", 62.14)).toBe("62,1 kg");
  });
});

describe("moyennes mensuelles", () => {
  const reading = (date: string, fatPct?: number, muscleKg?: number) => ({ date, ...(fatPct !== undefined ? { fatPct } : {}), ...(muscleKg !== undefined ? { muscleKg } : {}) });

  it("moyenne exacte du mois ; valide à partir de 4 relevés ; les pesées sans composition ne comptent pas", () => {
    const entries = [
      reading("2026-08-03", 20, 60),
      reading("2026-08-10", 21, 60),
      reading("2026-08-17", 19),
      reading("2026-08-24", 20.5),
      reading("2026-09-01"), // poids seul
      reading("2026-09-02", 19.5, 61),
      reading("2026-09-09", 19.1, 61.4),
      reading("2026-09-16", 19.2),
    ];
    expect(MIN_READINGS_PER_MONTH).toBe(4);

    const fat = compositionSummary(entries, "fatPct", "2026-09-26");
    expect(fat.months.map((month) => [month.month, month.count, month.valid])).toEqual([
      ["2026-08", 4, true],
      ["2026-09", 3, false],
    ]);
    expect(fat.months[0]!.mean).toBeCloseTo(20.125, 10);
    expect(fat.current).toMatchObject({ month: "2026-09", count: 3, valid: false });
    expect(fat.lastValid?.month).toBe("2026-08");
    expect(fat.trend).toBeUndefined();

    /* Le 4e relevé de septembre valide le mois ; la tendance compare aux mois valides d'avant. */
    const withFourth = compositionSummary([...entries, reading("2026-09-23", 19)], "fatPct", "2026-09-26");
    expect(withFourth.current).toMatchObject({ count: 4, valid: true });
    expect(withFourth.current.mean).toBeCloseTo(19.2, 10);
    expect(withFourth.trend).toBe("down");

    const muscle = compositionSummary(entries, "muscleKg", "2026-09-26");
    expect(muscle.months.map((month) => [month.month, month.count, month.valid])).toEqual([
      ["2026-08", 2, false],
      ["2026-09", 2, false],
    ]);
    expect(muscle.lastValid).toBeUndefined();
  });

  it("mois sans relevé entre deux mois, relevé futur ignoré, tendance stable sous 0,1", () => {
    const month = (prefix: string, value: number) => [1, 8, 15, 22].map((day) => reading(`${prefix}-${String(day).padStart(2, "0")}`, undefined, value));
    const entries = [...month("2026-06", 60), ...month("2026-08", 60.05), reading("2026-10-02", undefined, 99)];

    const summary = compositionSummary(entries, "muscleKg", "2026-09-30");
    expect(summary.months.map((item) => [item.month, item.count])).toEqual([
      ["2026-06", 4],
      ["2026-07", 0],
      ["2026-08", 4],
      ["2026-09", 0],
    ]);
    expect(summary.months[1]).not.toHaveProperty("mean");
    expect(summary.trend).toBe("stable");
    expect(compositionSummary([...entries, ...month("2026-09", 61)], "muscleKg", "2026-09-30").trend).toBe("up");
  });

  it("aucun relevé : le seul mois en cours, vide", () => {
    const summary = compositionSummary([reading("2026-09-20")], "fatPct", "2026-09-26");
    expect(summary.months).toEqual([{ month: "2026-09", count: 0, valid: false }]);
    expect(summary.lastValid).toBeUndefined();
  });
});

describe("enregistrement (Corps, phase 2 : la pesée ne porte plus que le poids)", () => {
  it("poids seul : aucune clé de composition, même si un ancien formulaire en envoie", async () => {
    const plain = await recordWeight("2026-09-24", "81,4", NOW);
    expect(Object.keys(plain).sort()).toEqual(["createdAt", "date", "id", "kg", "updatedAt"]);

    const legacy = await recordWeight("2026-09-25", { kg: "81,2", fatPct: "18,44", muscleKg: "62,06" } as unknown as string, NOW);
    expect(Object.keys(legacy).sort()).toEqual(["createdAt", "date", "id", "kg", "updatedAt"]);
    expect(legacy.kg).toBe(81.2);
  });

  it("une ancienne composition reste lisible : seconde saisie du jour et correction ne changent que le poids", async () => {
    await db.weightEntries.add({ id: "w-old", date: "2026-09-24", kg: 81.4, fatPct: 18.4, muscleKg: 62, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    await recordWeight("2026-09-24", "81,1", NOW);
    expect(await db.weightEntries.get("w-old")).toMatchObject({ kg: 81.1, fatPct: 18.4, muscleKg: 62 });

    await correctWeight("w-old", "2026-09-24", "80,8", NOW);
    expect(await db.weightEntries.get("w-old")).toMatchObject({ kg: 80.8, fatPct: 18.4, muscleKg: 62 });
    expect(await db.weightEntries.count()).toBe(1);
  });
});

describe("sauvegarde", () => {
  it("une sauvegarde sans ces champs se restaure à l'identique ; la composition est vide ; une pesée complète s'ajoute ensuite", async () => {
    const legacy = createTestDatabase("coach-jm-pesees-anciennes", 3);
    await legacy.open();
    await legacy.weightEntries.bulkAdd([
      { id: "p1", date: "2026-09-21", kg: 82.3, createdAt: "x", updatedAt: "x" },
      { id: "p2", date: "2026-09-22", kg: 82, createdAt: "x", updatedAt: "x" },
    ]);
    const file = parseBackup(serializeBackup(await readBackup(legacy, { now: NOW, buildTime: "b", userAgent: "t", standalone: true })));
    legacy.close();
    await Dexie.delete(legacy.name);

    await replaceWith(file, db);
    expect(canonicalStringify((await readStores(db)).stores.weightEntries)).toBe(canonicalStringify(file.stores.weightEntries));
    const restored = await db.weightEntries.toArray();
    expect(compositionSummary(restored, "fatPct", "2026-09-26").current.count).toBe(0);

    await db.weightEntries.add({ id: "w-complete", date: "2026-09-26", kg: 81.5, fatPct: 18.4, muscleKg: 62, createdAt: "x", updatedAt: "x" });
    const roundTrip = parseBackup(serializeBackup(await readBackup(db, { now: NOW, buildTime: "b", userAgent: "t", standalone: true })));
    expect(roundTrip.stores.weightEntries).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2026-09-26", fatPct: 18.4, muscleKg: 62 })]));
  });

  const path = process.env.COACH_JM_BACKUP;
  it.skipIf(!path)("sauvegarde réelle : restaurée sans erreur, pesées intactes, composition vide ou lisible", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const file = parseBackup(await readFile(path!, "utf8"));
    await resetAndRestore(file, db);
    const entries = await db.weightEntries.toArray();
    expect(canonicalStringify((await readStores(db)).stores.weightEntries)).toBe(canonicalStringify(file.stores.weightEntries ?? []));
    for (const key of ["fatPct", "muscleKg"] as const) {
      const summary = compositionSummary(entries, key, "2026-09-26");
      expect(summary.months.length).toBeGreaterThan(0);
    }
  });
});
