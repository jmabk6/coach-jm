import {
  deleteWeightEntry,
  getWeightEntries,
  saveWeightEntry,
  updateWeightEntry,
} from "../../db/repositories/weightRepository";
import type { Id, WeightEntry } from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { parseWeightInput, weightDateError } from "../../domain/rules/weightRules";

/**
 * Pesées (lot I.1) : la couche métier valide, le repository écrit. Une
 * saisie refusée lève une `Error` dont le message s'affiche tel quel.
 */

/** Le jour local courant (jamais dérivé de l'UTC). */
export function todayForWeight(now: Date = new Date()): string {
  return formatLocalDate(now);
}

/**
 * Enregistre la pesée d'un jour : crée, ou remplace la valeur du jour
 * s'il en a déjà une (jamais de doublon).
 */
export async function recordWeight(
  date: string,
  input: string,
  now: Date = new Date(),
  newId: () => Id = () => crypto.randomUUID(),
): Promise<WeightEntry> {
  const dateError = weightDateError(date, todayForWeight(now));
  if (dateError) throw new Error(dateError);

  const parsed = parseWeightInput(input);
  if (!parsed.ok) throw new Error(parsed.message);

  const at = now.toISOString();
  await saveWeightEntry({ id: `weight-${newId()}`, date, kg: parsed.kg, createdAt: at, updatedAt: at });

  const saved = (await getWeightEntries()).find((entry) => entry.date === date);
  if (!saved) throw new Error("La pesée n'a pas été enregistrée");

  return saved;
}

/** Corrige une pesée : sa valeur et, au besoin, son jour (jamais un jour déjà pesé, jamais le futur). */
export async function correctWeight(id: Id, date: string, input: string, now: Date = new Date()): Promise<void> {
  const dateError = weightDateError(date, todayForWeight(now));
  if (dateError) throw new Error(dateError);

  const parsed = parseWeightInput(input);
  if (!parsed.ok) throw new Error(parsed.message);

  await updateWeightEntry(id, { date, kg: parsed.kg });
}

export async function removeWeight(id: Id): Promise<void> {
  await deleteWeightEntry(id);
}
