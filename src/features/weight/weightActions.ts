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

/**
 * La pesée ne porte que le poids (Corps, phase 2, 05/10/2026) : la
 * composition se saisit dans une mesure corporelle. Seul le poids est lu,
 * même si un ancien appelant envoie un objet avec une composition.
 */
function parseKg(input: string | { kg: string }): number {
  const parsed = parseWeightInput(typeof input === "string" ? input : input.kg);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.kg;
}

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

  const kg = parseKg(input);

  const at = now.toISOString();
  await saveWeightEntry({ id: `weight-${newId()}`, date, kg, createdAt: at, updatedAt: at });

  const saved = (await getWeightEntries()).find((entry) => entry.date === date);
  if (!saved) throw new Error("La pesée n'a pas été enregistrée");

  return saved;
}

/** Corrige une pesée : son poids et, au besoin, son jour (jamais un jour déjà pesé, jamais le futur) ; une ancienne composition reste telle quelle. */
export async function correctWeight(id: Id, date: string, input: string, now: Date = new Date()): Promise<void> {
  const dateError = weightDateError(date, todayForWeight(now));
  if (dateError) throw new Error(dateError);

  await updateWeightEntry(id, { date, kg: parseKg(input) });
}

export async function removeWeight(id: Id): Promise<void> {
  await deleteWeightEntry(id);
}
