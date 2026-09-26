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
      /* La composition suit la nouvelle saisie : une grandeur absente est effacée. */
      await db.weightEntries.put(merged(existing, {
        kg: entry.kg,
        fatPct: entry.fatPct,
        muscleKg: entry.muscleKg,
        updatedAt: entry.updatedAt,
      }));

      return;
    }

    await db.weightEntries.put(entry);
  });
}

type WeightChanges = { [K in Exclude<keyof WeightEntry, "id" | "createdAt">]?: K extends "fatPct" | "muscleKg" ? WeightEntry[K] | undefined : WeightEntry[K] };

/** Applique des changements ; une clé à `undefined` disparaît de l'enregistrement (composition effacée). */
function merged(entry: WeightEntry, changes: WeightChanges): WeightEntry {
  const next: Record<string, unknown> = { ...entry, ...changes };
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  return next as unknown as WeightEntry;
}

/**
 * Mise à jour partielle d'une pesée.
 */
export async function updateWeightEntry(
  id: Id,
  /* `undefined` sur une grandeur de composition l'efface. */
  changes: Omit<WeightChanges, "updatedAt">,
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

    await db.weightEntries.put(merged(entry, {
      ...changes,
      updatedAt: new Date().toISOString(),
    }));
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



