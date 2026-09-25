import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { formatLocalDate } from "../../domain/rules/programRules";
import { formatFr } from "../../domain/rules/dateFr";

/**
 * Périodes de Progression (§16) : glissantes, **en jours**, terminées
 * aujourd'hui inclus — jamais de semaines calendaires, dont la semaine en
 * cours, incomplète, biaiserait toute comparaison à la baisse. La période
 * précédente a la même durée et se termine la veille du premier jour.
 */

export type PeriodKey = "4w" | "12w" | "1y";

export const PERIOD_DAYS: Record<PeriodKey, number> = {
  "4w": 28,
  "12w": 84,
  "1y": 365,
};

export const periodLabels: Record<PeriodKey, string> = {
  "4w": "4 semaines",
  "12w": "12 dernières semaines",
  "1y": "1 an",
};

/** Base des variations : `vs 12 sem. précédentes`. */
export const periodBaseLabels: Record<PeriodKey, string> = {
  "4w": "vs 4 sem. précédentes",
  "12w": "vs 12 sem. précédentes",
  "1y": "vs 12 mois précédents",
};

export interface DateRange {
  /** Premier jour, inclus (`YYYY-MM-DD`). */
  start: string;
  /** Dernier jour, inclus. */
  end: string;
}

export interface Period extends DateRange {
  key: PeriodKey;
  days: number;
  previous: DateRange;
}

export function shiftDate(date: string, days: number): string {
  return formatLocalDate(addDays(parseISO(date), days));
}

export function resolvePeriod(key: PeriodKey, today: string): Period {
  const days = PERIOD_DAYS[key];
  const start = shiftDate(today, -(days - 1));

  return {
    key,
    days,
    start,
    end: today,
    previous: { start: shiftDate(start, -days), end: shiftDate(start, -1) },
  };
}

export function isWithin(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/**
 * `19 juin – 10 septembre 2026 (84 jours)`.
 */
export function formatPeriodRange(period: Period): string {
  const start = parseISO(period.start);
  const end = parseISO(period.end);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatFr(start, sameYear ? "d MMMM" : "d MMMM yyyy")} – ${formatFr(end, "d MMMM yyyy")} (${period.days} jours)`;
}

/**
 * La variation `vs période précédente` n'a de sens que si la collecte
 * couvre **entièrement** la période précédente : sinon on comparerait
 * une période pleine à une période à moitié vide. `coverageStart` est la
 * date de collecte complète, pas la première séance.
 */
export function coversPreviousPeriod(period: Period, coverageStart: string | undefined): boolean {
  return coverageStart !== undefined && coverageStart <= period.previous.start;
}

/**
 * Nombre de jours d'une plage, bornes incluses.
 */
export function rangeDays(range: DateRange): number {
  return differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1;
}
