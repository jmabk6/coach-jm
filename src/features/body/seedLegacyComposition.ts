import { db } from "../../db/database";
import type { BodyMeasurement, InstallMarkers, WeightEntry } from "../../domain";
import { legacyCompositionMeasurementOf } from "../../domain/rules/bodyWeightRules";

/**
 * Seed 35 (05/10/2026, module Corps, option C) : la masse grasse et la
 * masse musculaire notées sur les pesées (`fatPct`, `muscleKg`, relevés de
 * la Withings) passent dans `bodyMeasurements` — appareil « withings »,
 * non éligible comme poids de référence, lien vers la pesée d'origine.
 * La pesée garde son poids, sans composition. Rien n'est perdu : la copie
 * est écrite et relue avant de retirer les champs, dans une seule
 * transaction. Idempotent : identifiants déterministes, une pesée sans
 * composition n'est jamais touchée.
 */

export async function seedLegacyComposition20261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.weightEntries, db.bodyMeasurements, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.legacyComposition20261005 !== undefined) return;

    for (const entry of await db.weightEntries.toArray()) {
      const measurement = legacyCompositionMeasurementOf(entry, now);
      if (!measurement) continue;
      if (entry.bodyMeasurementId !== undefined) throw new Error(`Pesée liée avec composition (${entry.date}) : migration arrêtée, rien n'est modifié`);

      const existing = await db.bodyMeasurements.get(measurement.id);
      if (!existing) await db.bodyMeasurements.add(measurement);
      const copy = (existing ?? (await db.bodyMeasurements.get(measurement.id)))!;
      if (copy.weightKg !== entry.kg || copy.fatPct !== entry.fatPct || copy.muscleKg !== entry.muscleKg) {
        throw new Error(`Copie de la composition du ${entry.date} différente : migration arrêtée, rien n'est modifié`);
      }

      const next: WeightEntry = { ...entry, updatedAt: now };
      delete next.fatPct;
      delete next.muscleKg;
      await db.weightEntries.put(next);
    }

    await db.settings.put({ key: "install", value: { ...install, legacyComposition20261005: now } });
  });
}

/**
 * Les relevés Withings, pour la composition de l'objectif Poids : les
 * mesures « withings », plus les compositions encore notées sur des pesées
 * (pas encore migrées : convention Withings). Une pesée déjà migrée n'est
 * jamais comptée deux fois. Jamais de RENPHO ici : pas de mélange.
 */
export function withingsCompositionReadings(
  weights: readonly WeightEntry[],
  measurements: readonly BodyMeasurement[],
): Array<{ date: string; fatPct?: number; muscleKg?: number }> {
  const withings = measurements.filter((measurement) => measurement.device === "withings");
  const migrated = new Set(withings.map((measurement) => measurement.originWeightEntryId));
  return [
    ...withings.map((measurement) => ({ date: measurement.date, ...(measurement.fatPct !== undefined ? { fatPct: measurement.fatPct } : {}), ...(measurement.muscleKg !== undefined ? { muscleKg: measurement.muscleKg } : {}) })),
    ...weights
      .filter((entry) => entry.bodyMeasurementId === undefined && !migrated.has(entry.id) && (entry.fatPct !== undefined || entry.muscleKg !== undefined))
      .map((entry) => ({ date: entry.date, ...(entry.fatPct !== undefined ? { fatPct: entry.fatPct } : {}), ...(entry.muscleKg !== undefined ? { muscleKg: entry.muscleKg } : {}) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
