import {
  deleteWeightEntry,
  getWeightEntries,
  saveWeightEntry,
  updateWeightEntry,
} from "../../db/repositories/weightRepository";
import type { Id, WeightEntry } from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { parseCompositionInput, type CompositionKey } from "../../domain/rules/bodyCompositionRules";
import { parseWeightInput, weightDateError } from "../../domain/rules/weightRules";

/**
 * Pesées (lot I.1) : la couche métier valide, le repository écrit. Une
 * saisie refusée lève une `Error` dont le message s'affiche tel quel.
 */

/**
 * Saisie de la carte : le poids, et la composition corporelle facultative
 * (champ vide = rien ; 26/09/2026). Une chaîne seule = le poids seul.
 */
export interface WeightForm {
  kg: string;
  fatPct?: string;
  muscleKg?: string;
}

/** Une grandeur absente vaut `undefined` : à l'écriture, elle efface l'ancienne valeur. */
type ParsedForm = { kg: number } & { [K in CompositionKey]: number | undefined };

/** Valide toute la saisie, ou lève le premier message d'erreur. */
function parseForm(input: string | WeightForm): ParsedForm {
  const form = typeof input === "string" ? { kg: input } : input;
  const parsed = parseWeightInput(form.kg);
  if (!parsed.ok) throw new Error(parsed.message);

  const values: ParsedForm = { kg: parsed.kg, fatPct: undefined, muscleKg: undefined };
  for (const key of ["fatPct", "muscleKg"] as const satisfies readonly CompositionKey[]) {
    const read = parseCompositionInput(key, form[key] ?? "");
    if (!read.ok) throw new Error(read.message);
    values[key] = read.value;
  }

  return values;
}

/** Sans les clés vides : une pesée sans composition reste identique à celles d'avant. */
function withoutEmpty(values: ParsedForm): Pick<WeightEntry, "kg" | CompositionKey> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Pick<WeightEntry, "kg" | CompositionKey>;
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
  input: string | WeightForm,
  now: Date = new Date(),
  newId: () => Id = () => crypto.randomUUID(),
): Promise<WeightEntry> {
  const dateError = weightDateError(date, todayForWeight(now));
  if (dateError) throw new Error(dateError);

  const values = parseForm(input);

  const at = now.toISOString();
  await saveWeightEntry({ id: `weight-${newId()}`, date, ...withoutEmpty(values), createdAt: at, updatedAt: at });

  const saved = (await getWeightEntries()).find((entry) => entry.date === date);
  if (!saved) throw new Error("La pesée n'a pas été enregistrée");

  return saved;
}

/** Corrige une pesée : sa valeur (et sa composition) et, au besoin, son jour (jamais un jour déjà pesé, jamais le futur). */
export async function correctWeight(id: Id, date: string, input: string | WeightForm, now: Date = new Date()): Promise<void> {
  const dateError = weightDateError(date, todayForWeight(now));
  if (dateError) throw new Error(dateError);

  /* Une chaîne seule ne corrige que le poids ; un formulaire remplace aussi la composition. */
  const values = parseForm(input);
  await updateWeightEntry(id, typeof input === "string" ? { date, kg: values.kg } : { date, ...values });
}

export async function removeWeight(id: Id): Promise<void> {
  await deleteWeightEntry(id);
}
