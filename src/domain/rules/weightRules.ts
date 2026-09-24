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
