import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../database";
import type { BodyMeasurement } from "../../domain";
import { weightBodyContradictions } from "../../domain/rules/bodyWeightRules";
import { correctWeight, recordWeight, removeWeight } from "../../features/weight/weightActions";
import { deleteBodyMeasurement, getBodyMeasurements, LINKED_WEIGHT_MESSAGE, ORIGIN_COPY_MESSAGE, saveBodyMeasurement } from "./bodyRepository";

/**
 * Corps (phase 1, option C) : enregistrer, déplacer ou supprimer une
 * mesure resynchronise la pesée du ou des jours touchés, dans la même
 * transaction ; jamais de composition sur une pesée liée ; aucune pesée
 * manuelle perdue ; une pesée liée ne se modifie pas à la main.
 */

const NOW = "2026-10-05T09:00:00.000Z";

function measure(id: string, date: string, time: string, weightKg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return { id, date, takenAt: `${date}T${time}:00.000Z`, device: "renpho", source: "manual", weightReference: true, weightKg, createdAt: NOW, updatedAt: NOW, ...extra };
}

async function consistent(): Promise<string[]> {
  return weightBodyContradictions(await db.weightEntries.toArray(), await db.bodyMeasurements.toArray());
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("mesures corporelles et pesée du jour", () => {
  it("la mesure de référence du 05/10 (RENPHO, détaillée) crée la pesée liée, sans composition ; une mesure du soir ne la change pas", async () => {
    const reference = measure("m1", "2026-10-05", "06:50", 91.9, {
      bmi: 29.3, fatKg: 25.27, fatPct: 27.5, fatFreeKg: 66.63, muscleKg: 62.12, skeletalMuscleKg: 38.06, waterKg: 48.8, boneKg: 4.5, proteinKg: 13.33,
      visceralFat: 10, bmrKcal: 1696, metabolicAge: 60, score: 73,
      segments: { leftArm: { fatKg: 1.6, muscleKg: 3.4 }, trunk: { fatPct: 28.1, muscleKg: 29.0 } },
      extra: { "Masse sous-cutanée (%)": 23.4 },
    });
    await saveBodyMeasurement(reference, NOW);
    expect(await db.bodyMeasurements.get("m1")).toEqual(reference);
    expect(await db.weightEntries.where("date").equals("2026-10-05").toArray()).toEqual([
      { id: "weight-body-2026-10-05", date: "2026-10-05", kg: 91.9, bodyMeasurementId: "m1", createdAt: NOW, updatedAt: NOW },
    ]);

    await saveBodyMeasurement(measure("m2", "2026-10-05", "19:30", 92.8), NOW);
    expect(await db.weightEntries.where("date").equals("2026-10-05").first()).toMatchObject({ kg: 91.9, bodyMeasurementId: "m1" });
    expect(await getBodyMeasurements()).toHaveLength(2);
    expect(await consistent()).toEqual([]);
  });

  it("pesée manuelle Withings remplacée : pesée liée sans composition, l'originale gardée ; références qui changent ; suppression : l'originale revient à l'identique", async () => {
    /* Pesée Withings d'avant la phase 2 (la saisie de la composition a quitté la pesée). */
    const manual = { id: "weight-manuel", date: "2026-10-05", kg: 91.6, fatPct: 27.0, muscleKg: 63.1, createdAt: "2026-10-05T05:10:00.000Z", updatedAt: "2026-10-05T05:10:00.000Z" };
    await db.weightEntries.add(manual);
    await saveBodyMeasurement(measure("m2", "2026-10-05", "08:00", 92.2), NOW);
    const linked = await db.weightEntries.get("weight-manuel");
    expect(linked).toEqual({ id: "weight-manuel", date: "2026-10-05", kg: 92.2, bodyMeasurementId: "m2", createdAt: manual.createdAt, updatedAt: NOW });
    expect(await db.bodyMeasurements.get("body-from-weight-manuel")).toMatchObject({
      device: "withings", weightReference: false, weightKg: 91.6, fatPct: 27.0, muscleKg: 63.1, originWeightEntry: manual,
    });

    /* La copie de la pesée d'origine ne se supprime pas à la main : rien ne se perd. */
    await expect(deleteBodyMeasurement("body-from-weight-manuel", NOW)).rejects.toThrow(ORIGIN_COPY_MESSAGE);

    /* Une mesure éligible plus tôt prend la place. */
    await saveBodyMeasurement(measure("m1", "2026-10-05", "07:00", 91.9), NOW);
    expect(await db.weightEntries.get("weight-manuel")).toMatchObject({ kg: 91.9, bodyMeasurementId: "m1" });
    expect(await consistent()).toEqual([]);

    await deleteBodyMeasurement("m1", NOW);
    expect(await db.weightEntries.get("weight-manuel")).toMatchObject({ kg: 92.2, bodyMeasurementId: "m2" });
    await deleteBodyMeasurement("m2", NOW);
    /* Plus aucune mesure éligible : la pesée manuelle d'origine, telle quelle ; sa copie disparaît. */
    expect(await db.weightEntries.get("weight-manuel")).toEqual(manual);
    expect(await db.bodyMeasurements.count()).toBe(0);
    expect(await consistent()).toEqual([]);
  });

  it("déplacer une mesure d'un jour à l'autre resynchronise les deux jours", async () => {
    await saveBodyMeasurement(measure("m1", "2026-10-05", "07:00", 91.9), NOW);
    await saveBodyMeasurement(measure("m1", "2026-10-06", "07:00", 91.9), NOW);
    expect(await db.weightEntries.where("date").equals("2026-10-05").count()).toBe(0);
    expect(await db.weightEntries.where("date").equals("2026-10-06").first()).toMatchObject({ kg: 91.9, bodyMeasurementId: "m1" });
    expect(await consistent()).toEqual([]);
  });

  it("une mesure non éligible (Withings, autre balance) ne touche jamais la pesée du jour", async () => {
    const manual = await recordWeight("2026-10-05", "91,6", new Date(NOW), () => "manuel");
    await saveBodyMeasurement(measure("w", "2026-10-05", "05:00", 92.4, { device: "withings", weightReference: false, fatPct: 27.0 }), NOW);
    expect(await db.weightEntries.get("weight-manuel")).toEqual(manual);
    expect(await consistent()).toEqual([]);
  });

  it("une pesée liée ne se modifie pas à la main (saisie, correction, suppression) ; un jour sans mesure, la pesée manuelle reste libre", async () => {
    await saveBodyMeasurement(measure("m1", "2026-10-05", "07:00", 91.9), NOW);
    const linkedId = (await db.weightEntries.where("date").equals("2026-10-05").first())!.id;
    await expect(recordWeight("2026-10-05", "90,0", new Date(NOW))).rejects.toThrow(LINKED_WEIGHT_MESSAGE);
    await expect(correctWeight(linkedId, "2026-10-05", "90,0", new Date(NOW))).rejects.toThrow(LINKED_WEIGHT_MESSAGE);
    await expect(removeWeight(linkedId)).rejects.toThrow(LINKED_WEIGHT_MESSAGE);
    expect(await db.weightEntries.get(linkedId)).toMatchObject({ kg: 91.9 });

    const manual = await recordWeight("2026-10-04", "91,6", new Date(NOW));
    await correctWeight(manual.id, "2026-10-04", "91,4", new Date(NOW));
    expect(await db.weightEntries.get(manual.id)).toMatchObject({ kg: 91.4 });
    await removeWeight(manual.id);
    expect(await db.weightEntries.get(manual.id)).toBeUndefined();
    expect(await consistent()).toEqual([]);
  });

  it("une mesure invalide (poids absent ou hors bornes, date mal formée, appareil vide) est refusée sans rien écrire", async () => {
    await expect(saveBodyMeasurement({ ...measure("m1", "2026-10-05", "07:00", 91.9), weightKg: Number.NaN }, NOW)).rejects.toThrow();
    await expect(saveBodyMeasurement({ ...measure("m1", "2026-10-05", "07:00", 91.9), weightKg: 0 }, NOW)).rejects.toThrow();
    await expect(saveBodyMeasurement({ ...measure("m1", "2026-10-05", "07:00", 91.9), date: "05/10/2026" }, NOW)).rejects.toThrow();
    await expect(saveBodyMeasurement({ ...measure("m1", "2026-10-05", "07:00", 91.9), device: " " }, NOW)).rejects.toThrow();
    expect(await db.bodyMeasurements.count()).toBe(0);
    expect(await db.weightEntries.count()).toBe(0);
  });
});
