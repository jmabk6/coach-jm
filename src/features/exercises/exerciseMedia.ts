import type { ExerciseMedia } from "../../domain";
import {
  exerciseMedia,
  type ExerciseMediaId,
} from "./exerciseMedia.generated";

/**
 * Médias officiels d'un exercice du catalogue.
 *
 * Les fichiers et le manifeste sont produits par
 * `npm run media:normalize` à partir de `media-src/exercises/`.
 * Un identifiant sans illustration ne compile pas : impossible de
 * référencer une image qui n'existe pas.
 */
export function officialExerciseMedia(
  id: ExerciseMediaId,
): ExerciseMedia {
  const entry = exerciseMedia[id];

  return {
    thumbnailUrl: `${import.meta.env.BASE_URL}${entry.thumbnail}`,
    photoUrl: `${import.meta.env.BASE_URL}${entry.photo}`,
  };
}
