import { db } from "../database";
import type { BodyMeasurement, Id } from "../../domain";
import { DEFAULT_WEIGHT_REFERENCE_DEVICE, weightSyncFor } from "../../domain/rules/bodyWeightRules";
import { getSetting } from "./settingsRepository";
import { LINKED_WEIGHT_MESSAGE } from "./weightRepository";

/**
 * Mesures corporelles (phase 1, 05/10/2026, option C). Chaque écriture
 * resynchronise la pesée du ou des jours touchés **dans la même
 * transaction** (`bodyWeightRules.weightSyncFor`) : jamais deux poids
 * contradictoires pour un jour, jamais de composition sur une pesée liée,
 * aucune pesée manuelle perdue (copie, puis restitution).
 */

export { LINKED_WEIGHT_MESSAGE };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** La copie d'une pesée manuelle remplacée ne se supprime pas : la pesée d'origine revient seule quand la référence disparaît. */
export const ORIGIN_COPY_MESSAGE = "Copie d'une pesée d'origine : elle revient automatiquement quand la mesure de référence du jour est retirée.";

function checkMeasurement(measurement: BodyMeasurement): void {
  if (!DATE.test(measurement.date)) throw new Error(`Date de mesure illisible : ${measurement.date}`);
  if (typeof measurement.device !== "string" || measurement.device.trim() === "") throw new Error("Appareil de la mesure manquant");
  if (Number.isNaN(Date.parse(measurement.takenAt))) throw new Error(`Heure de mesure illisible : ${measurement.takenAt}`);
  if (!Number.isFinite(measurement.weightKg) || measurement.weightKg < 20 || measurement.weightKg > 300) {
    throw new Error("Poids de la mesure : entre 20 et 300 kg");
  }
}

/** Toutes les mesures, de la plus ancienne à la plus récente. */
export async function getBodyMeasurements(): Promise<BodyMeasurement[]> {
  return db.bodyMeasurements.orderBy("takenAt").toArray();
}

export async function getBodyMeasurement(id: Id): Promise<BodyMeasurement | undefined> {
  return db.bodyMeasurements.get(id);
}

/** L'appareil de référence du moment : le réglage, sinon RENPHO. */
export async function getWeightReferenceDevice(): Promise<string> {
  return (await getSetting("weightReferenceDevice")) ?? DEFAULT_WEIGHT_REFERENCE_DEVICE;
}

async function syncWeightOf(date: string, now: string): Promise<void> {
  const [measurements, existing] = await Promise.all([
    db.bodyMeasurements.where("date").equals(date).toArray(),
    db.weightEntries.where("date").equals(date).first(),
  ]);
  const plan = weightSyncFor(date, measurements, existing, now);
  /* La copie de la pesée remplacée d'abord : rien n'est perdu, même en cas d'échec plus loin (même transaction). */
  if (plan.createMeasurement) await db.bodyMeasurements.put(plan.createMeasurement);
  if (plan.put) await db.weightEntries.put(plan.put);
  if (plan.deleteId) await db.weightEntries.delete(plan.deleteId);
  if (plan.deleteMeasurementId) await db.bodyMeasurements.delete(plan.deleteMeasurementId);
}

/** Crée ou remplace une mesure ; resynchronise son jour (et l'ancien jour si elle a changé de date). */
export async function saveBodyMeasurement(measurement: BodyMeasurement, now: string = new Date().toISOString()): Promise<void> {
  checkMeasurement(measurement);
  await db.transaction("rw", db.bodyMeasurements, db.weightEntries, async () => {
    const previous = await db.bodyMeasurements.get(measurement.id);
    await db.bodyMeasurements.put(measurement);
    await syncWeightOf(measurement.date, now);
    if (previous && previous.date !== measurement.date) await syncWeightOf(previous.date, now);
  });
}

/** Supprime une mesure ; resynchronise son jour. */
export async function deleteBodyMeasurement(id: Id, now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.bodyMeasurements, db.weightEntries, async () => {
    const measurement = await db.bodyMeasurements.get(id);
    if (!measurement) throw new Error("Mesure introuvable");
    if (measurement.originWeightEntry !== undefined) throw new Error(ORIGIN_COPY_MESSAGE);
    await db.bodyMeasurements.delete(id);
    await syncWeightOf(measurement.date, now);
  });
}
