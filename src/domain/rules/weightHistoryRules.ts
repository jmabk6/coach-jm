import { format, parseISO } from "date-fns";
import type { BodyMeasurement, WeightEntry } from "../models";
import { derivedComposition } from "./bodyMeasurementForm";
import { deviceSeries, formatCurrentValue } from "./bodyTargetRules";

/**
 * Objectif Poids — l'historique jour par jour (06/10/2026), en règles
 * pures : une ligne par pesée, la plus récente en haut.
 * - Le poids est celui de la pesée du jour (seule source de poids).
 * - % de graisse, masse grasse et muscle squelettique viennent de la
 *   mesure de l'appareil de référence ce jour-là : celle liée à la pesée,
 *   sinon la première du jour ; jamais un autre appareil ni la copie d'une
 *   pesée. La masse grasse se calcule (poids × %) si la balance ne la
 *   donne pas, comme dans le panneau de composition.
 * - Rien n'est stocké : le tableau se recalcule à chaque affichage.
 */

export interface WeightHistoryRow {
  date: string;
  weightKg: number;
  fatPct?: number;
  fatKg?: number;
  skeletalMuscleKg?: number;
}

export function weightHistoryRows(entries: readonly WeightEntry[], measurements: readonly BodyMeasurement[], device: string): WeightHistoryRow[] {
  const series = deviceSeries(measurements, device);
  const byId = new Map(series.map((measurement) => [measurement.id, measurement]));

  return [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => {
      const measurement =
        (entry.bodyMeasurementId !== undefined ? byId.get(entry.bodyMeasurementId) : undefined) ?? series.find((item) => item.date === entry.date);
      const row: WeightHistoryRow = { date: entry.date, weightKg: entry.kg };
      if (!measurement) return row;
      const { fatKg } = derivedComposition(measurement);
      if (measurement.fatPct !== undefined) row.fatPct = measurement.fatPct;
      if (fatKg !== undefined) row.fatKg = fatKg;
      if (measurement.skeletalMuscleKg !== undefined) row.skeletalMuscleKg = measurement.skeletalMuscleKg;
      return row;
    });
}

const oneDecimal = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** « 6/10 · 90,3 · 27,3 % · 24,7 kg · 37,6 kg » ; « — » sans valeur. */
export function formatWeightHistoryRow(row: WeightHistoryRow): { date: string; weight: string; fatPct: string; fatKg: string; muscle: string } {
  return {
    /* « 1/11 », jamais « 1er/11 » : la date courte d'un tableau. */
    date: format(parseISO(row.date), "d/MM"),
    weight: oneDecimal.format(row.weightKg),
    fatPct: formatCurrentValue(row.fatPct, "%"),
    fatKg: formatCurrentValue(row.fatKg, "kg"),
    muscle: formatCurrentValue(row.skeletalMuscleKg, "kg"),
  };
}
