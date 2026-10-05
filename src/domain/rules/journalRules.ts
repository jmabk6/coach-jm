import { addDays, format, isValid, parseISO } from "date-fns";
import type { FoodUnit, Nutrients } from "../models";
import { formatFr } from "./dateFr";
import { formatGrams, nutrientsError, quantityError } from "./nutritionRules";

/**
 * Journal (phase 3A.2, 05/10/2026) — règles pures de l'écran : le jour
 * affiché (aujourd'hui au plus tard, passé libre), la saisie d'une
 * estimation et d'une quantité, les libellés.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Le jour d'une adresse : passé ou aujourd'hui gardé ; absent : aujourd'hui ; futur ou illisible : aujourd'hui, adresse à corriger. */
export function resolveJournalDate(param: string | null, today: string): { date: string; corrected: boolean } {
  if (param === null) return { date: today, corrected: false };
  const parsed = parseISO(param);
  const valid = DATE.test(param) && isValid(parsed) && format(parsed, "yyyy-MM-dd") === param;
  if (!valid || param > today) return { date: today, corrected: true };
  return { date: param, corrected: false };
}

export function journalDayBefore(date: string): string {
  return format(addDays(parseISO(date), -1), "yyyy-MM-dd");
}

/** Le jour suivant, jamais au-delà d'aujourd'hui ; `undefined` sur aujourd'hui. */
export function journalDayAfter(date: string, today: string): string | undefined {
  const next = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  return next > today ? undefined : next;
}

/** « Lundi 5 octobre », « Jeudi 1er octobre ». */
export function formatJournalDay(date: string): string {
  const label = formatFr(date, "EEEE d MMMM");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type ReadNumber = { ok: true; value?: number } | { ok: false; message: string };

function readNumber(text: string, label: string): ReadNumber {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return { ok: true };
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, message: `${label} : nombre illisible.` };
  return { ok: true, value: Number(normalized) };
}

export interface EstimateFormValues {
  name: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

export type ParsedEstimate = { ok: true; name?: string; nutrients: Nutrients } | { ok: false; message: string };

/** Estimation : kcal obligatoires (> 0) ; nom, protéines, glucides, lipides facultatifs. */
export function parseEstimateForm(form: EstimateFormValues): ParsedEstimate {
  const kcal = readNumber(form.kcal, "Calories estimées");
  if (!kcal.ok) return kcal;
  if (kcal.value === undefined) return { ok: false, message: "Calories estimées : obligatoires." };
  if (kcal.value <= 0) return { ok: false, message: "Calories estimées : supérieures à 0." };
  const nutrients: Nutrients = { kcal: kcal.value };
  for (const [key, label] of [["proteinG", "Protéines"], ["carbsG", "Glucides"], ["fatG", "Lipides"]] as const) {
    const read = readNumber(form[key], label);
    if (!read.ok) return read;
    if (read.value !== undefined) nutrients[key] = read.value;
  }
  const error = nutrientsError(nutrients);
  if (error) return { ok: false, message: error };
  const name = form.name.trim();
  return { ok: true, ...(name ? { name } : {}), nutrients };
}

export type ParsedQuantity = { ok: true; quantity: number } | { ok: false; message: string };

export function parseQuantityInput(text: string): ParsedQuantity {
  const read = readNumber(text, "Quantité");
  if (!read.ok) return read;
  if (read.value === undefined) return { ok: false, message: "Quantité : obligatoire." };
  const error = quantityError(read.value);
  return error ? { ok: false, message: error } : { ok: true, quantity: read.value };
}

const quantityFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** « 250 g », « 1 portion », « 2 portions », « 1,5 pièce », « 3 pièces ». */
export function formatQuantity(quantity: number, unit: FoodUnit): string {
  const number = quantityFormat.format(quantity);
  if (unit === "g" || unit === "ml") return `${number} ${unit}`;
  const word = unit === "piece" ? "pièce" : "portion";
  return `${number} ${quantity >= 2 ? `${word}s` : word}`;
}

/** Total d'une macro : « ≥ » quand une ligne ne la renseigne pas (jamais comptée comme 0). */
export function formatTotalGrams(value: number, partial: boolean): string {
  return `${partial ? "≥ " : ""}${formatGrams(value)}`;
}
