import { addDays, format, parseISO } from "date-fns";
import type { WeightEntry } from "../models";
import { formatLocalDate, getWeekStartDate, listWeekDates } from "./programRules";

/**
 * Pesée quotidienne (conception V2 § 2.4, lot I.1) : une pesée par jour
 * local, en kg à une décimale, entre 30 et 250 kg, jamais dans le futur.
 * Les dates sont des dates **locales** (YYYY-MM-DD) : une pesée à 00 h 30
 * appartient au jour qui commence.
 */

export const WEIGHT_MIN_KG = 30;
export const WEIGHT_MAX_KG = 250;

export type WeightInput = { ok: true; kg: number } | { ok: false; message: string };

const frKg = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** « 81,2 kg » : toujours une décimale. */
export function formatWeightKg(kg: number): string {
  return `${frKg.format(kg)} kg`;
}

/**
 * Lit une saisie : virgule ou point, espaces tolérés, arrondi à 0,1 kg.
 * Refuse le vide, le non-numérique et ce qui sort de 30-250 kg.
 */
export function parseWeightInput(text: string): WeightInput {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return { ok: false, message: "Indiquez votre poids en kg." };

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, message: "Poids illisible : utilisez des chiffres, par exemple 81,4." };

  const kg = Math.round(value * 10) / 10;
  if (kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
    return { ok: false, message: `Le poids doit être compris entre ${WEIGHT_MIN_KG} et ${WEIGHT_MAX_KG} kg.` };
  }

  return { ok: true, kg };
}

/** Pourquoi une date de pesée est refusée, ou rien : format YYYY-MM-DD, jamais après aujourd'hui. */
export function weightDateError(date: string, today: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Choisissez un jour.";
  if (date > today) return "Pas de pesée dans le futur.";

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Moyenne de la semaine (lot I.2, D9, conception V2 § 5.4)                   */
/* -------------------------------------------------------------------------- */

/** Une semaine n'est valide qu'avec au moins 3 pesées (D9). */
export const MIN_WEIGHINGS_PER_WEEK = 3;

export interface WeekAverage {
  /** Dimanche de la semaine (WEEK_STARTS_ON). */
  weekStart: string;
  /** Samedi de la semaine. */
  weekEnd: string;
  count: number;
  /** Moyenne **exacte** ; l'arrondi à 0,1 kg n'est qu'un affichage. Absente sans pesée. */
  mean?: number;
  valid: boolean;
}

/** Moyenne arithmétique des pesées de la semaine qui commence le dimanche `weekStart`. */
export function weekAverage(entries: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>, weekStart: string): WeekAverage {
  const days = listWeekDates(weekStart);
  const inWeek = entries.filter((entry) => days.includes(entry.date));
  const weekEnd = days[days.length - 1]!;

  if (inWeek.length === 0) return { weekStart, weekEnd, count: 0, valid: false };

  const mean = inWeek.reduce((sum, entry) => sum + entry.kg, 0) / inWeek.length;

  return { weekStart, weekEnd, count: inWeek.length, mean, valid: inWeek.length >= MIN_WEIGHINGS_PER_WEEK };
}

export interface WeightWeekSummary {
  /** La dernière semaine complète : celle qui précède la semaine en cours. */
  lastComplete: WeekAverage;
  /** La semaine en cours : toujours provisoire, quel que soit le nombre de pesées. */
  current: WeekAverage;
}

/**
 * Les deux moyennes de la carte, pour le jour local `today`. Une pesée
 * postérieure à `today` (impossible à la saisie) n'entre dans aucune.
 */
export function weightWeekSummary(entries: ReadonlyArray<Pick<WeightEntry, "date" | "kg">>, today: string): WeightWeekSummary {
  const currentStart = getWeekStartDate(today);
  const previousStart = formatLocalDate(addDays(parseISO(currentStart), -7));
  const known = entries.filter((entry) => entry.date <= today);

  return { lastComplete: weekAverage(known, previousStart), current: weekAverage(known, currentStart) };
}

/** « 20 → 26 sept. » */
export function formatWeekSpan(week: Pick<WeekAverage, "weekStart" | "weekEnd">): string {
  const start = parseISO(week.weekStart);
  const end = parseISO(week.weekEnd);
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const startLabel = start.getMonth() === end.getMonth() ? format(start, "d") : `${format(start, "d")} ${months[start.getMonth()]}`;

  return `${startLabel} → ${format(end, "d")} ${months[end.getMonth()]}`;
}

export function formatWeighingCount(count: number): string {
  return count <= 1 ? `${count} pesée` : `${count} pesées`;
}
