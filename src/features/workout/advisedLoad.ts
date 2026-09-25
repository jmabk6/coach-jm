import type { Exercise, PerformedSeries, StrengthFrameVersion } from "../../domain";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { formatStrengthValue, isWorkSeries, loadToWork } from "../../domain/rules/strengthRules";
import { getLoadKg } from "../../domain/rules/workoutRules";

/**
 * « Charge conseillée » chiffrée (lot M.2, maquette M9) : la même valeur
 * que la fiche exercice — pour un exercice cadré, la charge à travailler
 * (objectif accepté, sinon dernière séance, v1.6 § 4.2 bis) ; sinon la
 * charge de la dernière série de travail. Rien sans historique : jamais de
 * valeur inventée.
 */
export interface AdvisedLoad {
  value: number;
  unit: "kg" | "sec";
  assistance: boolean;
  /** Barre connue : ce qu'il faut charger de chaque côté. */
  perSideKg?: number;
}

export function advisedLoadOf(
  exercise: Exercise | undefined,
  frameVersion: StrengthFrameVersion | undefined,
  lastSeries: ReadonlyArray<PerformedSeries> | undefined,
): AdvisedLoad | undefined {
  const assistance = exercise ? loadSemanticsOf(exercise) === "assistance" : false;

  if (frameVersion) {
    const toWork = loadToWork(frameVersion, lastSeries);
    if (!toWork) return undefined;
    const bar = frameVersion.barWeightKg;
    const perSideKg = toWork.unit === "kg" && bar !== undefined && toWork.value > bar ? (toWork.value - bar) / 2 : undefined;
    return {
      value: toWork.value,
      unit: toWork.unit,
      assistance: frameVersion.progressionType === "assistance_decroissante",
      ...(perSideKg !== undefined ? { perSideKg } : {}),
    };
  }

  const work = [...(lastSeries ?? [])].reverse().find((series) => series.status === "completed" && isWorkSeries(series));
  const kg = work ? getLoadKg(work.load) : undefined;
  return kg !== undefined ? { value: kg, unit: "kg", assistance } : undefined;
}

/** « 35 kg (barre + 7,5 kg de chaque côté) », « 52 kg d'assistance », « 45 s ». */
export function formatAdvisedLoad(advised: AdvisedLoad): string {
  const value = formatStrengthValue(advised.value, advised.unit);
  if (advised.assistance) return `${value} d'assistance`;
  if (advised.perSideKg !== undefined) return `${value} (barre + ${formatStrengthValue(advised.perSideKg, "kg")} de chaque côté)`;
  return value;
}
