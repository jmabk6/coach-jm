import type { BodyMeasurement, WeightEntry } from "../models";

/**
 * Corps et pesée du jour (phase 1, 05/10/2026, option C) — règles pures.
 *
 * `weightEntries` reste la **seule** source de poids des moteurs sportifs
 * (objectif Poids, pari traction V6, charge effective) ;
 * `bodyMeasurements` est la **seule** source de composition corporelle.
 *
 * Pour un jour qui a au moins une mesure **éligible** (`weightReference`) :
 * - la référence est la première mesure éligible du jour (heure de prise ;
 *   à égalité, l'identifiant) ;
 * - la pesée du jour existe, liée à la référence (`bodyMeasurementId`), au
 *   poids de la référence, **sans aucune composition** ;
 * - une pesée manuelle remplacée est gardée intégralement dans une mesure
 *   non éligible (`originWeightEntry`) et revient telle quelle quand plus
 *   aucune mesure éligible ne reste ce jour-là.
 * Les mesures non éligibles (Withings historique, autres) ne touchent
 * jamais la pesée. Un jour sans mesure éligible garde sa pesée manuelle.
 */

/** L'appareil de référence par défaut (05/10/2026) : la RENPHO 8 électrodes. */
export const DEFAULT_WEIGHT_REFERENCE_DEVICE = "renpho";

/**
 * Éligibilité d'un appareil comme poids de référence, d'après l'appareil
 * de référence du moment (réglable). À appliquer **à l'enregistrement**
 * d'une mesure ; le moteur, lui, ne lit que `weightReference`.
 */
export function weightReferenceEligible(device: string, referenceDevice: string = DEFAULT_WEIGHT_REFERENCE_DEVICE): boolean {
  return device === referenceDevice;
}

/** La mesure de référence d'un jour : la première mesure éligible du jour. */
export function referenceMeasurementOf(measurements: readonly BodyMeasurement[], date: string): BodyMeasurement | undefined {
  return measurements
    .filter((measurement) => measurement.date === date && measurement.weightReference)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id))[0];
}

/** L'heure de prise d'une copie : la création de la pesée, ou midi du jour si elle est illisible. */
function takenAtOf(entry: WeightEntry): string {
  return Number.isNaN(Date.parse(entry.createdAt)) ? `${entry.date}T12:00:00.000Z` : entry.createdAt;
}

const hasComposition = (entry: WeightEntry) => entry.fatPct !== undefined || entry.muscleKg !== undefined;

/** La pesée sans ses champs de composition. */
function withoutComposition(entry: WeightEntry): WeightEntry {
  const next = { ...entry };
  delete next.fatPct;
  delete next.muscleKg;
  return next;
}

/**
 * La copie, dans une mesure non éligible, d'une pesée manuelle que la
 * référence remplace : poids et composition (appareil « withings » si elle
 * en a une — par convention, la composition des pesées est celle de la
 * Withings —, sinon « unknown ») et l'état exact de la pesée.
 */
export function originCopyOf(entry: WeightEntry, now: string): BodyMeasurement {
  return {
    id: `body-from-${entry.id}`,
    date: entry.date,
    takenAt: takenAtOf(entry),
    device: hasComposition(entry) ? "withings" : "unknown",
    source: "weight_entry",
    weightReference: false,
    weightKg: entry.kg,
    ...(entry.fatPct !== undefined ? { fatPct: entry.fatPct } : {}),
    ...(entry.muscleKg !== undefined ? { muscleKg: entry.muscleKg } : {}),
    originWeightEntryId: entry.id,
    originWeightEntry: { ...entry },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Migration (seed 35) : la composition Withings d'une pesée devient une
 * mesure Withings non éligible ; `undefined` sans composition.
 */
export function legacyCompositionMeasurementOf(entry: WeightEntry, now: string): BodyMeasurement | undefined {
  if (!hasComposition(entry)) return undefined;
  return {
    id: `body-withings-${entry.id}`,
    date: entry.date,
    takenAt: takenAtOf(entry),
    device: "withings",
    source: "weight_entry",
    weightReference: false,
    weightKg: entry.kg,
    ...(entry.fatPct !== undefined ? { fatPct: entry.fatPct } : {}),
    ...(entry.muscleKg !== undefined ? { muscleKg: entry.muscleKg } : {}),
    originWeightEntryId: entry.id,
    createdAt: now,
    updatedAt: now,
  };
}

export interface WeightSync {
  /** Pesée à écrire (créée, liée, ou rendue telle qu'à l'origine). */
  put?: WeightEntry;
  /** Pesée liée à supprimer : plus aucune mesure éligible, pas de pesée d'origine. */
  deleteId?: string;
  /** Copie de la pesée manuelle remplacée, à garder. */
  createMeasurement?: BodyMeasurement;
  /** Copie à retirer : la pesée d'origine est rendue. */
  deleteMeasurementId?: string;
}

/**
 * Ce qu'il faut écrire pour un jour, d'après ses mesures et sa pesée
 * actuelle. Rien si tout est déjà cohérent.
 */
export function weightSyncFor(date: string, measurements: readonly BodyMeasurement[], existing: WeightEntry | undefined, now: string): WeightSync {
  const reference = referenceMeasurementOf(measurements, date);

  if (!reference) {
    if (existing?.bodyMeasurementId === undefined) return {};
    const copy = measurements.find((measurement) => measurement.date === date && measurement.originWeightEntry !== undefined);
    return copy ? { put: copy.originWeightEntry!, deleteMeasurementId: copy.id } : { deleteId: existing.id };
  }

  if (!existing) {
    return { put: { id: `weight-body-${date}`, date, kg: reference.weightKg, bodyMeasurementId: reference.id, createdAt: now, updatedAt: now } };
  }
  if (existing.bodyMeasurementId === undefined) {
    return {
      put: { ...withoutComposition(existing), kg: reference.weightKg, bodyMeasurementId: reference.id, updatedAt: now },
      createMeasurement: originCopyOf(existing, now),
    };
  }
  if (existing.kg === reference.weightKg && existing.bodyMeasurementId === reference.id && !hasComposition(existing)) return {};
  return { put: { ...withoutComposition(existing), kg: reference.weightKg, bodyMeasurementId: reference.id, updatedAt: now } };
}

/**
 * Les jours où poids et mesures se contredisent (triés) : un jour avec une
 * mesure éligible sans pesée liée à sa référence au même poids ; une pesée
 * liée qui porte une composition (hybride) ; une pesée liée à une mesure
 * absente ou qui n'est pas la référence de son jour. Vide : cohérent.
 */
export function weightBodyContradictions(weights: readonly WeightEntry[], measurements: readonly BodyMeasurement[]): string[] {
  const dates = new Set<string>();
  for (const date of new Set(measurements.filter((measurement) => measurement.weightReference).map((measurement) => measurement.date))) {
    const reference = referenceMeasurementOf(measurements, date)!;
    const entry = weights.find((weight) => weight.date === date);
    if (!entry || entry.bodyMeasurementId !== reference.id || entry.kg !== reference.weightKg) dates.add(date);
  }
  for (const weight of weights) {
    if (weight.bodyMeasurementId === undefined) continue;
    if (hasComposition(weight) || referenceMeasurementOf(measurements, weight.date)?.id !== weight.bodyMeasurementId) dates.add(weight.date);
  }
  return [...dates].sort();
}
