import type { Exercise } from "../../domain";

export type CardioKind = "steps" | "duration_distance" | "distance";

/**
 * Un exercice cardio est en mode paliers, ou en mesure simple de durée
 * et/ou distance (§16). Les tests de mobilité en centimètres sont des
 * mesures simples mais pas du cardio : ils n'entrent nulle part en
 * Progression.
 */
export function cardioKindOf(exercise: Pick<Exercise, "mode" | "measurementType">): CardioKind | undefined {
  if (exercise.mode === "steps") return "steps";
  if (exercise.mode !== "simple") return undefined;
  if (exercise.measurementType === "duration_distance") return "duration_distance";
  if (exercise.measurementType === "distance") return "distance";

  return undefined;
}

export function isCardioExercise(exercise: Pick<Exercise, "mode" | "measurementType">): boolean {
  return cardioKindOf(exercise) !== undefined;
}
