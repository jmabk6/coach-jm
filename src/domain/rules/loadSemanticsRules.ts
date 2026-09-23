import type { Exercise, LoadSemantics } from "../models";

/**
 * Sens de la charge d'un exercice (lot a, 23/09/2026). Seul endroit qui
 * interprète `Exercise.loadSemantics` : volume, meilleure série,
 * tendances et libellés passent par ici.
 *
 * Absent — ou exercice inconnu, par exemple supprimé — vaut `external` :
 * le comportement historique, sans aucune exception.
 */
export function loadSemanticsOf(
  exercise: Pick<Exercise, "loadSemantics"> | undefined,
): LoadSemantics {
  return exercise?.loadSemantics ?? "external";
}

export function isAssistanceExercise(
  exercise: Pick<Exercise, "loadSemantics"> | undefined,
): boolean {
  return loadSemanticsOf(exercise) === "assistance";
}

/**
 * Libellé de la valeur saisie : « Charge » ou « Assistance ».
 */
export function loadLabelOf(semantics: LoadSemantics): string {
  return semantics === "assistance" ? "Assistance" : "Charge";
}

/**
 * Libellé de la métrique « meilleure charge » : la plus haute pour une
 * charge (« Charge max »), la plus basse pour une assistance
 * (« Assistance min »).
 */
export function bestLoadMetricLabelOf(semantics: LoadSemantics): string {
  return semantics === "assistance" ? "Assistance min" : "Charge max";
}

/**
 * Compare deux séries en charge × répétitions selon le sens :
 * négatif si `a` est meilleure que `b`.
 *
 * Assistance : la plus **basse** gagne ; à égalité, le plus de
 * répétitions. (Pour `external`, la règle historique de
 * `pickBestSeries` — charge × reps — reste la seule en vigueur.)
 */
export function compareAssistedSeries(
  a: { kg: number; reps: number },
  b: { kg: number; reps: number },
): number {
  if (a.kg !== b.kg) return a.kg - b.kg;

  return b.reps - a.reps;
}
