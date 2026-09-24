import type { Exercise, PowerUnit } from "../models";

/**
 * Unité d'un effort `duration_power` (D17) : fixée à la première saisie,
 * ensuite imposée. L'exercice la porte dès qu'elle a été enregistrée ;
 * avant cela, un résultat déjà saisi (dans la séance en cours ou la
 * dernière fois) suffit à l'imposer. Absente : les deux unités sont
 * proposées.
 */
export function effectivePowerUnit(
  exercise: Exercise | undefined,
  knownResults: Array<{ result?: { unit: PowerUnit } } | undefined>,
): PowerUnit | undefined {
  if (exercise?.measurementType !== "duration_power") return undefined;
  if (exercise.powerUnit !== undefined) return exercise.powerUnit;

  return knownResults.find((series) => series?.result !== undefined)?.result?.unit;
}

export const POWER_UNIT_LABELS: Record<PowerUnit, { short: string; long: string }> = {
  watts: { short: "W", long: "Watts" },
  meters: { short: "m", long: "Mètres" },
};

/**
 * Durée par répétition (D25) : la série garde aussi `durationSec`, la
 * plus longue, pour que les métriques existantes (`durationMax`) la
 * lisent sans rien connaître de la nouvelle mesure.
 */
export function slowestRepSec(repDurationsSec: number[] | undefined): number | undefined {
  const values = (repDurationsSec ?? []).filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0 ? Math.max(...values) : undefined;
}
