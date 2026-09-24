import type { NumberRange, RangeOrValue } from "../models";

/**
 * Consignes en plage (D16, conception V2 § 3.4.1). Une consigne ancienne
 * est un nombre ; une nouvelle peut être une plage `{ min, max }`. Le
 * réalisé reste toujours une valeur unique : on préremplit au **bas** de
 * la plage.
 */

export function isRange(value: RangeOrValue): value is NumberRange {
  return typeof value !== "number";
}

/** Bas de la plage : la valeur préremplie. */
export function lowOf(value: RangeOrValue): number {
  return isRange(value) ? value.min : value;
}

export function highOf(value: RangeOrValue): number {
  return isRange(value) ? value.max : value;
}

/** Milieu de la plage : pour une estimation de durée, jamais pour une saisie. */
export function midOf(value: RangeOrValue): number {
  return isRange(value) ? (value.min + value.max) / 2 : value;
}

/** Une plage dont les bornes sont égales se lit comme une valeur. */
export function asRange(value: RangeOrValue): NumberRange {
  return isRange(value) ? value : { min: value, max: value };
}

/** Somme de plages : `8-10 min` + `35 min` = `43-45 min`. */
export function sumRanges(values: RangeOrValue[]): NumberRange {
  return values.reduce<NumberRange>(
    (total, value) => ({ min: total.min + lowOf(value), max: total.max + highOf(value) }),
    { min: 0, max: 0 },
  );
}

/**
 * Borne haute proposée quand une valeur devient une plage : un écart
 * ordinaire, à ajuster aussitôt.
 */
export function widenToRange(value: number, gap: number): NumberRange {
  return { min: value, max: Math.round((value + gap) * 100) / 100 };
}
