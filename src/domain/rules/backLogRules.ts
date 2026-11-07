import { addDays, parseISO } from "date-fns";
import type { BackDayEntry } from "../models";
import { formatLocalDate, getWeekStartDate } from "./programRules";

/**
 * « Dos du jour » (programme V5, 07/11/2026) : un relevé par jour, et un
 * résumé par semaine (dimanche → samedi) pour les bilans des semaines 2, 4
 * et 8. Fonctions pures.
 */

/** Un champ à `undefined` efface la valeur. */
export type BackDayPatch = { [K in keyof Omit<BackDayEntry, "date" | "updatedAt">]?: BackDayEntry[K] | undefined };

/** Le relevé du jour mis à jour (créé s'il n'existe pas) ; un champ `undefined` dans le patch est effacé. */
export function upsertBackDay(entries: ReadonlyArray<BackDayEntry>, date: string, patch: BackDayPatch, now: string): BackDayEntry[] {
  const current = entries.find((entry) => entry.date === date);
  const next = { ...(current ?? { date }), ...patch, date, updatedAt: now } as BackDayEntry;
  for (const key of Object.keys(patch) as Array<keyof BackDayPatch>) {
    if (patch[key] === undefined) delete next[key];
  }
  return [...entries.filter((entry) => entry.date !== date), next].sort((a, b) => a.date.localeCompare(b.date));
}

export interface BackWeekSummary {
  weekStart: string;
  /** Jours avec au moins un champ rempli. */
  days: number;
  /** Moyenne de la douleur au réveil, arrondie au dixième ; absente sans relevé. */
  morningPainAvg?: number;
  discharges: number;
  painfulSitting: number;
}

function filled(entry: BackDayEntry): boolean {
  return entry.morningPain !== undefined || entry.walk !== undefined || entry.discharge !== undefined || entry.sitting !== undefined;
}

export function backWeekSummary(entries: ReadonlyArray<BackDayEntry>, weekStart: string): BackWeekSummary {
  const end = formatLocalDate(addDays(parseISO(weekStart), 6));
  const week = entries.filter((entry) => entry.date >= weekStart && entry.date <= end && filled(entry));
  const pains = week.flatMap((entry) => (entry.morningPain === undefined ? [] : [entry.morningPain]));
  return {
    weekStart,
    days: week.length,
    ...(pains.length > 0 ? { morningPainAvg: Math.round((pains.reduce((sum, value) => sum + value, 0) / pains.length) * 10) / 10 } : {}),
    discharges: week.filter((entry) => entry.discharge === true).length,
    painfulSitting: week.filter((entry) => entry.sitting === "painful").length,
  };
}

/** La semaine de `date` et la précédente. */
export function backWeeksAround(entries: ReadonlyArray<BackDayEntry>, date: string): { current: BackWeekSummary; previous: BackWeekSummary } {
  const weekStart = getWeekStartDate(date);
  return { current: backWeekSummary(entries, weekStart), previous: backWeekSummary(entries, formatLocalDate(addDays(parseISO(weekStart), -7))) };
}

const decimal = (value: number) => String(value).replace(".", ",");

/** « Réveil 4,2/10 en moyenne · 1 décharge · 3 jours notés » ; rien sans relevé. */
export function formatBackWeek(summary: BackWeekSummary): string | undefined {
  if (summary.days === 0) return undefined;
  const parts = [
    ...(summary.morningPainAvg !== undefined ? [`réveil ${decimal(summary.morningPainAvg)}/10 en moyenne`] : []),
    `${summary.discharges} décharge${summary.discharges > 1 ? "s" : ""}`,
    `${summary.days} jour${summary.days > 1 ? "s" : ""} noté${summary.days > 1 ? "s" : ""}`,
  ];
  return parts.join(" · ");
}
