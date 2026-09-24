import { db } from "../database";
import type { Id, WeightEntry } from "../../domain";

/**
 * Historique complet des pesées,
 * de la plus ancienne à la plus récente.
 */
export async function getWeightEntries(): Promise<WeightEntry[]> {
  return db.weightEntries
    .orderBy("date")
    .toArray();
}

/**
 * Dernière pesée connue.
 */
export async function getLatestWeightEntry(): Promise<
  WeightEntry | undefined
> {
  return db.weightEntries
    .orderBy("date")
    .last();
}

/**
 * Première pesée enregistrée.
 */
export async function getFirstWeightEntry(): Promise<
  WeightEntry | undefined
> {
  return db.weightEntries
    .orderBy("date")
    .first();
}

/**
 * Une pesée précise.
 */
export async function getWeightEntry(
  id: Id,
): Promise<WeightEntry | undefined> {
  return db.weightEntries.get(id);
}

/**
 * Crée ou remplace une pesée. Une seule par jour : une seconde saisie le
 * même jour remplace la valeur de la première (même id, même
 * `createdAt`). Lecture et écriture dans une transaction (lot I.1).
 */
export async function saveWeightEntry(
  entry: WeightEntry,
): Promise<void> {
  await db.transaction("rw", db.weightEntries, async () => {
    const existing = await db.weightEntries
      .where("date")
      .equals(entry.date)
      .first();

    if (existing && existing.id !== entry.id) {
      await db.weightEntries.update(existing.id, {
        kg: entry.kg,
        updatedAt: entry.updatedAt,
      });

      return;
    }

    await db.weightEntries.put(entry);
  });
}

/**
 * Mise à jour partielle d'une pesée.
 */
export async function updateWeightEntry(
  id: Id,
  changes: Omit<Partial<WeightEntry>, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  await db.transaction("rw", db.weightEntries, async () => {
    const entry = await db.weightEntries.get(id);

    if (!entry) {
      throw new Error("Pesée introuvable");
    }

    if (changes.date && changes.date !== entry.date) {
      const existingForDate = await db.weightEntries
        .where("date")
        .equals(changes.date)
        .first();

      if (existingForDate && existingForDate.id !== id) {
        throw new Error("Une pesée existe déjà à cette date");
      }
    }

    await db.weightEntries.update(id, {
      ...changes,
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Supprime une pesée.
 *
 * Le recalcul éventuel des objectifs sera géré
 * par la couche métier, pas par le repository.
 */
export async function deleteWeightEntry(
  id: Id,
): Promise<void> {
  const entry = await db.weightEntries.get(id);

  if (!entry) {
    throw new Error("Pesée introuvable");
  }

  await db.weightEntries.delete(id);
}



