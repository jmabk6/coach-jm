import type { Exercise } from "../../domain";

/**
 * Alternatives d'un exercice (§2) : épinglages manuels d'abord, puis les
 * alternatives automatiques — même zone, même mouvement, équipement
 * différent — dans l'ordre alphabétique. Exercices archivés exclus.
 */
export function listExerciseAlternatives(
  exercise: Exercise,
  allExercises: Exercise[],
): Exercise[] {
  const pinnedIds = new Set(exercise.pinnedAlternativeExerciseIds ?? []);
  const candidates = allExercises.filter(
    (candidate) => candidate.id !== exercise.id && candidate.status === "active",
  );

  const pinned = candidates
    .filter((candidate) => pinnedIds.has(candidate.id))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const automatic =
    exercise.category === "Musculation"
      ? candidates
          .filter(
            (candidate) =>
              !pinnedIds.has(candidate.id) &&
              candidate.category === "Musculation" &&
              candidate.zone === exercise.zone &&
              candidate.movement === exercise.movement &&
              candidate.equipment !== exercise.equipment,
          )
          .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      : [];

  return [...pinned, ...automatic];
}
