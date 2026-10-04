import { describe, expect, it } from "vitest";
import type { BodyMeasurement, WeightEntry } from "../models";
import {
  DEFAULT_WEIGHT_REFERENCE_DEVICE, legacyCompositionMeasurementOf, originCopyOf, referenceMeasurementOf, weightBodyContradictions, weightReferenceEligible, weightSyncFor,
} from "./bodyWeightRules";

/**
 * Corps (phase 1, 05/10/2026, option C) : `bodyMeasurements` est la seule
 * source de toute composition, chaque mesure avec son appareil, sa source
 * et son éligibilité comme poids de référence ; `weightEntries` ne porte
 * que le poids des moteurs sportifs. La référence d'un jour est la
 * première mesure **éligible** du jour ; elle synchronise la pesée, sans
 * jamais de composition. Une pesée manuelle remplacée est conservée
 * intégralement et revient si la référence disparaît.
 */

const NOW = "2026-10-05T09:00:00.000Z";

function measure(id: string, date: string, time: string, weightKg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return { id, date, takenAt: `${date}T${time}:00.000Z`, device: "renpho", source: "manual", weightReference: true, weightKg, createdAt: NOW, updatedAt: NOW, ...extra };
}

const weight = (id: string, date: string, kg: number, extra: Partial<WeightEntry> = {}): WeightEntry => ({ id, date, kg, createdAt: "2026-10-05T05:10:00.000Z", updatedAt: "x", ...extra });

describe("éligibilité comme poids de référence", () => {
  it("par défaut, la RENPHO ; une autre balance devient la référence sans toucher au moteur", () => {
    expect(DEFAULT_WEIGHT_REFERENCE_DEVICE).toBe("renpho");
    expect(weightReferenceEligible("renpho")).toBe(true);
    expect(weightReferenceEligible("withings")).toBe(false);
    expect(weightReferenceEligible("other")).toBe(false);
    expect(weightReferenceEligible("garmin-index-s2", "garmin-index-s2")).toBe(true);
    expect(weightReferenceEligible("renpho", "garmin-index-s2")).toBe(false);
  });

  it("le moteur ne lit que l'indicateur stocké sur la mesure : une future balance « garmin » éligible devient la référence, la RENPHO d'avant reste lisible", () => {
    const list = [
      measure("r", "2027-05-02", "06:00", 80.5, { device: "renpho", weightReference: false }),
      measure("g", "2027-05-02", "07:00", 80.2, { device: "garmin-index-s2", weightReference: true }),
    ];
    expect(referenceMeasurementOf(list, "2027-05-02")?.id).toBe("g");
    expect(weightSyncFor("2027-05-02", list, undefined, NOW).put).toMatchObject({ kg: 80.2, bodyMeasurementId: "g" });
  });
});

describe("mesure de référence du jour", () => {
  it("la première mesure éligible du jour ; une mesure Withings ou non éligible plus tôt ne compte pas ; à égalité, l'identifiant", () => {
    const list = [
      measure("b", "2026-10-05", "07:40", 91.9),
      measure("a", "2026-10-05", "06:55", 92.1),
      measure("w", "2026-10-05", "05:00", 92.4, { device: "withings", weightReference: false, fatPct: 27.0 }),
      measure("c", "2026-10-06", "07:00", 91.5),
    ];
    expect(referenceMeasurementOf(list, "2026-10-05")?.id).toBe("a");
    expect(referenceMeasurementOf(list, "2026-10-06")?.id).toBe("c");
    expect(referenceMeasurementOf(list, "2026-10-07")).toBeUndefined();
    expect(referenceMeasurementOf([measure("z", "2026-10-05", "07:00", 92), measure("y", "2026-10-05", "07:00", 91)], "2026-10-05")?.id).toBe("y");
    expect(referenceMeasurementOf([list[2]!], "2026-10-05")).toBeUndefined();
  });
});

describe("synchronisation de la pesée du jour", () => {
  it("première mesure éligible du jour, sans pesée : une pesée liée, sans composition", () => {
    const plan = weightSyncFor("2026-10-05", [measure("m1", "2026-10-05", "07:00", 91.9, { fatPct: 27.5, muscleKg: 62.12 })], undefined, NOW);
    expect(plan).toEqual({ put: { id: "weight-body-2026-10-05", date: "2026-10-05", kg: 91.9, bodyMeasurementId: "m1", createdAt: NOW, updatedAt: NOW } });
  });

  it("changement de référence dans la journée : une mesure plus tard ne change rien ; une mesure plus tôt devient la référence", () => {
    const linked = weight("w1", "2026-10-05", 91.9, { bodyMeasurementId: "m1" });
    const later = [measure("m1", "2026-10-05", "07:00", 91.9), measure("m2", "2026-10-05", "19:00", 92.8)];
    expect(weightSyncFor("2026-10-05", later, linked, NOW)).toEqual({});
    const earlier = [...later, measure("m0", "2026-10-05", "06:30", 92.0)];
    expect(weightSyncFor("2026-10-05", earlier, linked, NOW)).toEqual({ put: { ...linked, kg: 92.0, bodyMeasurementId: "m0", updatedAt: NOW } });
  });

  it("une pesée manuelle (avec composition Withings) remplacée : la pesée devient liée SANS composition, l'originale est conservée intégralement dans une mesure non éligible", () => {
    const manual = weight("w1", "2026-10-05", 91.6, { fatPct: 27.0, muscleKg: 63.1 });
    const plan = weightSyncFor("2026-10-05", [measure("m1", "2026-10-05", "07:00", 91.9)], manual, NOW);
    expect(plan.put).toEqual({ id: "w1", date: "2026-10-05", kg: 91.9, bodyMeasurementId: "m1", createdAt: manual.createdAt, updatedAt: NOW });
    expect(plan.put).not.toHaveProperty("fatPct");
    expect(plan.put).not.toHaveProperty("muscleKg");
    expect(plan.createMeasurement).toEqual(originCopyOf(manual, NOW));
    expect(plan.createMeasurement).toMatchObject({
      id: "body-from-w1", date: "2026-10-05", takenAt: manual.createdAt, device: "withings", source: "weight_entry", weightReference: false,
      weightKg: 91.6, fatPct: 27.0, muscleKg: 63.1, originWeightEntryId: "w1", originWeightEntry: manual,
    });
    /* Sans composition, l'appareil d'origine est inconnu. */
    expect(originCopyOf(weight("w2", "2026-10-05", 91.6), NOW)).toMatchObject({ device: "unknown", weightReference: false, weightKg: 91.6 });
  });

  it("la référence disparaît : la suivante prend la place ; plus aucune éligible : la pesée manuelle d'origine revient à l'identique, sa copie disparaît", () => {
    const manual = weight("w1", "2026-10-05", 91.6, { fatPct: 27.0, muscleKg: 63.1 });
    const copy = originCopyOf(manual, NOW);
    const linked = weight("w1", "2026-10-05", 92.0, { bodyMeasurementId: "m0", createdAt: manual.createdAt });
    expect(weightSyncFor("2026-10-05", [copy, measure("m1", "2026-10-05", "07:00", 91.9)], linked, NOW)).toEqual({ put: { ...linked, kg: 91.9, bodyMeasurementId: "m1", updatedAt: NOW } });
    expect(weightSyncFor("2026-10-05", [copy], linked, NOW)).toEqual({ put: manual, deleteMeasurementId: "body-from-w1" });
    /* Sans pesée d'origine : la pesée liée disparaît ; une pesée manuelle reste. */
    expect(weightSyncFor("2026-10-05", [], linked, NOW)).toEqual({ deleteId: "w1" });
    expect(weightSyncFor("2026-10-05", [], weight("w2", "2026-10-05", 91.6), NOW)).toEqual({});
  });

  it("une pesée liée qui porterait encore une composition est nettoyée (jamais d'hybride)", () => {
    const hybrid = weight("w1", "2026-10-05", 91.9, { bodyMeasurementId: "m1", fatPct: 27.0 });
    expect(weightSyncFor("2026-10-05", [measure("m1", "2026-10-05", "07:00", 91.9)], hybrid, NOW)).toEqual({
      put: { id: "w1", date: "2026-10-05", kg: 91.9, bodyMeasurementId: "m1", createdAt: hybrid.createdAt, updatedAt: NOW },
    });
  });
});

describe("migration des compositions Withings des pesées", () => {
  it("une pesée avec composition donne une mesure Withings non éligible, poids et composition intacts ; sans composition : rien", () => {
    const entry = weight("w9", "2026-09-27", 92.4, { fatPct: 27.9, muscleKg: 63.0, createdAt: "2026-09-27T05:12:00.000Z" });
    expect(legacyCompositionMeasurementOf(entry, NOW)).toEqual({
      id: "body-withings-w9", date: "2026-09-27", takenAt: "2026-09-27T05:12:00.000Z", device: "withings", source: "weight_entry", weightReference: false,
      weightKg: 92.4, fatPct: 27.9, muscleKg: 63.0, originWeightEntryId: "w9", createdAt: NOW, updatedAt: NOW,
    });
    expect(legacyCompositionMeasurementOf(weight("w8", "2026-09-28", 92.0), NOW)).toBeUndefined();
    /* Une date de création illisible (sauvegardes anciennes) : midi du jour. */
    expect(legacyCompositionMeasurementOf({ ...entry, createdAt: "x" }, NOW)?.takenAt).toBe("2026-09-27T12:00:00.000Z");
  });
});

describe("contradictions poids / mesures", () => {
  it("aucune quand chaque jour mesuré a sa pesée liée à la référence au même poids, sans composition ; sinon la date est signalée", () => {
    const measures = [measure("m1", "2026-10-05", "07:00", 91.9), measure("m2", "2026-10-05", "19:00", 92.8), measure("m3", "2026-10-06", "07:00", 91.5)];
    const ok = [weight("w1", "2026-10-05", 91.9, { bodyMeasurementId: "m1" }), weight("w2", "2026-10-06", 91.5, { bodyMeasurementId: "m3" }), weight("w3", "2026-10-04", 91.6, { fatPct: 27 })];
    expect(weightBodyContradictions(ok, measures)).toEqual([]);
    expect(weightBodyContradictions([ok[0]!, weight("w2", "2026-10-06", 91.0, { bodyMeasurementId: "m3" })], measures)).toEqual(["2026-10-06"]);
    expect(weightBodyContradictions([ok[0]!], measures)).toEqual(["2026-10-06"]);
    expect(weightBodyContradictions([ok[0]!, weight("w2", "2026-10-06", 91.5)], measures)).toEqual(["2026-10-06"]);
    /* Hybride : pesée liée avec une composition. */
    expect(weightBodyContradictions([ok[0]!, weight("w2", "2026-10-06", 91.5, { bodyMeasurementId: "m3", muscleKg: 63 })], measures)).toEqual(["2026-10-06"]);
    /* Une pesée liée à une mesure disparue ou non éligible : contradiction aussi. */
    expect(weightBodyContradictions([weight("w9", "2026-10-07", 90, { bodyMeasurementId: "gone" })], measures)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    /* Un jour avec seulement une mesure non éligible : pas de pesée liée attendue. */
    expect(weightBodyContradictions([weight("w4", "2026-10-08", 90.5)], [measure("x", "2026-10-08", "07:00", 90.4, { device: "withings", weightReference: false })])).toEqual([]);
  });
});
