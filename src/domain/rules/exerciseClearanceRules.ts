import type { Exercise, ExerciseClearanceStatus } from "../models";

/**
 * Statut de pratique des exercices (programme V4, lot L2 ; D10 adapté par
 * Q5) : « À valider » (avis du kiné attendu) et « Suspendu » rendent
 * l'exercice non exécutable en séance ; « Validé » est la valeur par
 * défaut, y compris pour tout exercice sans statut. Aucun changement
 * automatique : seul l'utilisateur change un statut.
 */

export const CLEARANCE_LABELS: Readonly<Record<ExerciseClearanceStatus, string>> = {
  a_valider: "À valider",
  valide: "Validé",
  suspendu: "Suspendu",
};

/** Ce qu'affiche une brique verrouillée en séance. */
export const LOCKED_LABELS: Readonly<Record<Exclude<ExerciseClearanceStatus, "valide">, string>> = {
  a_valider: "En attente de l'avis du kiné",
  suspendu: "Exercice suspendu",
};

export const CLEARANCE_HINTS: Readonly<Record<ExerciseClearanceStatus, string>> = {
  a_valider: "Non exécutable en séance tant que tu ne l'as pas validé après l'avis du kiné.",
  valide: "Exercice pratiqué normalement.",
  suspendu: "Retiré temporairement de la pratique : sauté dans les séances, sans retard compté.",
};

export function clearanceStatusOf(exercise: Pick<Exercise, "clearance"> | undefined): ExerciseClearanceStatus {
  return exercise?.clearance?.status ?? "valide";
}

/**
 * Les exercices verrouillés d'une liste de briques de modèle (briques
 * autonomes seulement), dans l'ordre : la carte du jour les signale.
 */
export function lockedTemplateExerciseIds(blocks: ReadonlyArray<{ kind: string; exerciseId?: string }>, exerciseById: ReadonlyMap<string, Pick<Exercise, "clearance">>): string[] {
  return blocks.flatMap((block) => (block.kind === "exercise" && block.exerciseId && practiceLockOf(exerciseById.get(block.exerciseId)) ? [block.exerciseId] : []));
}

/** « 1 exercice à valider ou suspendu : sauté » ; rien si aucun. */
export function formatLockedCount(count: number): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? "1 exercice à valider ou suspendu : il sera sauté" : `${count} exercices à valider ou suspendus : ils seront sautés`;
}

/** Le verrou à poser sur une brique de cet exercice, ou `undefined` s'il se pratique. */
export function practiceLockOf(exercise: Pick<Exercise, "clearance"> | undefined): "a_valider" | "suspendu" | undefined {
  const status = clearanceStatusOf(exercise);
  return status === "valide" ? undefined : status;
}
