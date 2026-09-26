import type { WeightEntry } from "../models";

/**
 * Composition corporelle (décision du 26/09/2026, balance Withings Body
 * Smart) : masse grasse (%) et masse musculaire (kg), facultatives, notées
 * avec la pesée. Ce sont des **estimations de la balance** : indicateurs
 * secondaires de l'objectif Poids, moyenne du mois à partir de 4 relevés,
 * jamais dans un calcul de statut.
 */

export type CompositionKey = "fatPct" | "muscleKg";

export interface CompositionSpec {
  key: CompositionKey;
  label: string;
  unit: string;
  min: number;
  max: number;
}

export const COMPOSITION_SPECS: Readonly<Record<CompositionKey, CompositionSpec>> = {
  fatPct: { key: "fatPct", label: "Masse grasse", unit: "%", min: 3, max: 60 },
  muscleKg: { key: "muscleKg", label: "Masse musculaire", unit: "kg", min: 20, max: 120 },
};

/** Une moyenne mensuelle n'est retenue qu'à partir de 4 relevés dans le mois. */
export const MIN_READINGS_PER_MONTH = 4;

/** Champ vide : `value` absent, rien à enregistrer. */
export type CompositionInput = { ok: true; value?: number } | { ok: false; message: string };

const frOne = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** « 18,4 % », « 62,0 kg » : toujours une décimale. */
export function formatComposition(key: CompositionKey, value: number): string {
  return `${frOne.format(value)} ${COMPOSITION_SPECS[key].unit}`;
}

/**
 * Lit une saisie facultative : vide = rien ; virgule ou point, arrondi à
 * une décimale, bornes 3-60 % et 20-120 kg.
 */
export function parseCompositionInput(key: CompositionKey, text: string): CompositionInput {
  const spec = COMPOSITION_SPECS[key];
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return { ok: true };

  const raw = Number(normalized);
  if (!Number.isFinite(raw)) return { ok: false, message: `${spec.label} illisible : utilisez des chiffres, par exemple ${key === "fatPct" ? "18,4" : "62,1"}.` };

  const value = Math.round(raw * 10) / 10;
  if (value < spec.min || value > spec.max) {
    return { ok: false, message: `${spec.label} : entre ${spec.min} et ${spec.max} ${spec.unit}.` };
  }

  return { ok: true, value };
}

export interface CompositionMonth {
  /** YYYY-MM */
  month: string;
  count: number;
  /** Moyenne exacte ; absente sans relevé. */
  mean?: number;
  /** Au moins 4 relevés dans le mois. */
  valid: boolean;
}

export type CompositionTrend = "up" | "down" | "stable";

export interface CompositionSummary {
  key: CompositionKey;
  /** Mois civils du premier relevé au mois de `today`, dans l'ordre. */
  months: CompositionMonth[];
  /** Le mois de `today`. */
  current: CompositionMonth;
  /** Dernier mois valide, le mois en cours compris. */
  lastValid?: CompositionMonth;
  /** Dernier mois valide comparé au mois valide qui le précède. */
  trend?: CompositionTrend;
}

type Reading = Pick<WeightEntry, "date"> & Partial<Pick<WeightEntry, CompositionKey>>;

function monthAfter(month: string): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, "0")}`;
}

/** Écart sous lequel deux moyennes sont « stables » : l'arrondi d'affichage. */
const STABLE_BELOW = 0.1;

/**
 * Moyennes mois par mois d'une grandeur de composition, pour le jour
 * local `today`. Les pesées sans cette grandeur et celles postérieures à
 * `today` n'entrent dans aucun mois.
 */
export function compositionSummary(entries: ReadonlyArray<Reading>, key: CompositionKey, today: string): CompositionSummary {
  const readings = entries.filter((entry) => entry.date <= today && typeof entry[key] === "number" && Number.isFinite(entry[key]));
  const currentMonth = today.slice(0, 7);
  const byMonth = new Map<string, number[]>();
  for (const entry of readings) {
    const month = entry.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), entry[key]!]);
  }

  const first = [...byMonth.keys()].sort()[0] ?? currentMonth;
  const months: CompositionMonth[] = [];
  for (let month = first; month <= currentMonth; month = monthAfter(month)) {
    const values = byMonth.get(month) ?? [];
    months.push({
      month,
      count: values.length,
      ...(values.length > 0 ? { mean: values.reduce((sum, value) => sum + value, 0) / values.length } : {}),
      valid: values.length >= MIN_READINGS_PER_MONTH,
    });
  }

  const valid = months.filter((month) => month.valid);
  const lastValid = valid[valid.length - 1];
  const previousValid = valid[valid.length - 2];
  let trend: CompositionTrend | undefined;
  if (lastValid && previousValid) {
    const delta = lastValid.mean! - previousValid.mean!;
    trend = Math.abs(delta) < STABLE_BELOW ? "stable" : delta > 0 ? "up" : "down";
  }

  return {
    key,
    months,
    current: months[months.length - 1]!,
    ...(lastValid ? { lastValid } : {}),
    ...(trend ? { trend } : {}),
  };
}

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « septembre 2026 » */
export function formatMonthLong(month: string): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  return `${MONTHS_FR[index - 1]} ${year}`;
}

/** « sept. » */
export function formatMonthShort(month: string): string {
  return MONTHS_SHORT_FR[Number(month.slice(5, 7)) - 1]!;
}

export function formatReadingCount(count: number): string {
  return count <= 1 ? `${count} relevé` : `${count} relevés`;
}
