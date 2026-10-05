import type { BodyCompositionTargets, BodyMeasurement, BodyTargetRange } from "../models";
import { derivedComposition, formatBodyNumber } from "./bodyMeasurementForm";

/**
 * Corps, phase 2.1 (05/10/2026) — cible personnelle indicative de
 * composition corporelle, en règles pures.
 *
 * - « Actuel » : la dernière mesure de l'appareil de référence ;
 *   « Évolution » : de la première à la dernière mesure de ce **même**
 *   appareil. Jamais de mélange entre appareils (Withings historique,
 *   future balance) ni de copie de pesée ; les pesées ne sont jamais lues.
 * - Une seule mesure : aucune évolution. Le % de graisse évolue en points.
 * - Pas de score global, pas de date d'arrivée.
 */

export type BodyTargetKey = "weightKg" | "fatPct" | "fatKg" | "skeletalMuscleKg";

export interface BodyTargetSpec {
  /** Libellé court du tableau. */
  label: string;
  /** Libellé complet (formulaire, messages). */
  name: string;
  unit: string;
  /** Bornes de saisie d'une cible. */
  min: number;
  max: number;
  /** Le maximum est facultatif (muscle : « au moins »). */
  maxOptional?: boolean;
}

export const BODY_TARGET_KEYS: readonly BodyTargetKey[] = ["weightKg", "fatPct", "fatKg", "skeletalMuscleKg"];

export const BODY_TARGET_SPECS: Record<BodyTargetKey, BodyTargetSpec> = {
  weightKg: { label: "Poids", name: "Poids", unit: "kg", min: 20, max: 300 },
  fatPct: { label: "% graisse", name: "% graisse", unit: "%", min: 3, max: 75 },
  fatKg: { label: "Masse grasse", name: "Masse grasse", unit: "kg", min: 1, max: 150 },
  skeletalMuscleKg: { label: "Muscle squel.", name: "Muscle squelettique", unit: "kg", min: 5, max: 150, maxOptional: true },
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** La valeur d'un indicateur pour une mesure ; la masse grasse en kg se calcule si besoin. */
function valueOf(measurement: BodyMeasurement, key: BodyTargetKey): number | undefined {
  return key === "fatKg" ? derivedComposition(measurement).fatKg : measurement[key];
}

/** Les mesures d'un appareil, de la plus ancienne à la plus récente ; jamais une copie de pesée. */
export function deviceSeries(measurements: readonly BodyMeasurement[], device: string): BodyMeasurement[] {
  return measurements
    .filter((measurement) => measurement.device === device && measurement.originWeightEntry === undefined)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id));
}

export function inTargetRange(value: number | undefined, range: BodyTargetRange | undefined): boolean {
  if (value === undefined || !range || (range.min === undefined && range.max === undefined)) return false;
  return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
}

export interface BodyComparisonRow {
  key: BodyTargetKey;
  label: string;
  unit: string;
  current?: number;
  target?: BodyTargetRange;
  inTarget: boolean;
  /** Dernière − première valeur de la série ; en points pour le % de graisse. */
  evolution?: number;
}

export interface BodyComparison {
  device: string;
  /** Jour de la première mesure de la série. */
  since: string;
  rows: BodyComparisonRow[];
}

/** La comparaison avec la cible ; `undefined` sans aucune mesure de l'appareil. */
export function compositionComparison(
  measurements: readonly BodyMeasurement[],
  device: string,
  targets: BodyCompositionTargets | undefined,
): BodyComparison | undefined {
  const series = deviceSeries(measurements, device);
  const last = series.at(-1);
  if (!last) return undefined;

  return {
    device,
    since: series[0]!.date,
    rows: BODY_TARGET_KEYS.map((key) => {
      const current = valueOf(last, key);
      const known = series.filter((measurement) => valueOf(measurement, key) !== undefined);
      const first = known[0];
      const latest = known.at(-1);
      const target = targets?.[key];
      return {
        key,
        label: BODY_TARGET_SPECS[key].label,
        unit: BODY_TARGET_SPECS[key].unit,
        ...(current !== undefined ? { current } : {}),
        ...(target ? { target } : {}),
        inTarget: inTargetRange(current, target),
        ...(first && latest && first !== latest && latest === last ? { evolution: round2(valueOf(latest, key)! - valueOf(first, key)!) } : {}),
      };
    }),
  };
}

/** « 78–80 kg », « ≥ 39 kg », « ≤ 12 kg », « — ». */
export function formatTargetRange(range: BodyTargetRange | undefined, unit: string): string {
  if (!range || (range.min === undefined && range.max === undefined)) return "—";
  const number = (value: number) => formatBodyNumber(value, 2);
  if (range.min !== undefined && range.max !== undefined) return `${number(range.min)}–${number(range.max)} ${unit}`;
  return range.min !== undefined ? `≥ ${number(range.min)} ${unit}` : `≤ ${number(range.max!)} ${unit}`;
}

const oneDecimal = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Valeur actuelle au dixième : « 91,2 kg », « 27,5 % », « — ». */
export function formatCurrentValue(value: number | undefined, unit: string): string {
  return value === undefined ? "—" : `${oneDecimal.format(value)} ${unit}`;
}

/** « −4,2 kg », « +0,3 kg », « −3,1 points » (le % de graisse évolue en points), « — » sans évolution. */
export function formatBodyEvolution(value: number | undefined, key: BodyTargetKey): string {
  if (value === undefined) return "—";
  /* Arrondi symétrique : −3,85 → −3,9, comme +3,85 → +3,9. */
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * 10)) / 10;
  const unit = key === "fatPct" ? (Math.abs(rounded) >= 2 ? "points" : "point") : "kg";
  if (rounded === 0) return `0 ${unit}`;
  return `${rounded < 0 ? "−" : "+"}${oneDecimal.format(Math.abs(rounded))} ${unit}`;
}

/** La saisie de l'écran « Modifier la cible ». */
export type BodyTargetsFormValues = Record<`${BodyTargetKey}${"Min" | "Max"}`, string>;

const input = (value: number | undefined) => (value === undefined ? "" : String(value).replace(".", ","));

export function bodyTargetsFormOf(targets: BodyCompositionTargets | undefined): BodyTargetsFormValues {
  const values = {} as BodyTargetsFormValues;
  for (const key of BODY_TARGET_KEYS) {
    values[`${key}Min`] = input(targets?.[key]?.min);
    values[`${key}Max`] = input(targets?.[key]?.max);
  }
  return values;
}

type Read = { ok: true; value?: number } | { ok: false; message: string };

function readBound(raw: string, spec: BodyTargetSpec): Read {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return { ok: true };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, message: `${spec.name} : nombre illisible.` };
  const value = round2(Number(text));
  if (value < spec.min || value > spec.max) return { ok: false, message: `${spec.name} : entre ${spec.min} et ${spec.max} ${spec.unit}.` };
  return { ok: true, value };
}

export type ParsedBodyTargets = { ok: true; targets: BodyCompositionTargets } | { ok: false; message: string };

/** Valide la cible : bornes obligatoires (sauf le maximum du muscle), minimum ≤ maximum. */
export function parseBodyTargetsForm(form: BodyTargetsFormValues, now: string): ParsedBodyTargets {
  const targets = { updatedAt: now } as BodyCompositionTargets;
  for (const key of BODY_TARGET_KEYS) {
    const spec = BODY_TARGET_SPECS[key];
    const min = readBound(form[`${key}Min`], spec);
    if (!min.ok) return min;
    const max = readBound(form[`${key}Max`], spec);
    if (!max.ok) return max;
    if (min.value === undefined) return { ok: false, message: `${spec.name} : minimum obligatoire.` };
    if (max.value === undefined && !spec.maxOptional) return { ok: false, message: `${spec.name} : maximum obligatoire.` };
    if (max.value !== undefined && min.value > max.value) return { ok: false, message: `${spec.name} : le minimum dépasse le maximum.` };
    targets[key] = { min: min.value, ...(max.value !== undefined ? { max: max.value } : {}) };
  }
  return { ok: true, targets };
}
