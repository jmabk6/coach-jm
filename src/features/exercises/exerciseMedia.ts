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
  const entry: {
    readonly thumbnail: string;
    readonly photo: string;
    readonly frames?: readonly string[];
  } = exerciseMedia[id];
  const base = import.meta.env.BASE_URL;

  return {
    thumbnailUrl: `${base}${entry.thumbnail}`,
    photoUrl: `${base}${entry.photo}`,
    ...(entry.frames !== undefined
      ? { animationFrameUrls: entry.frames.map((frame) => `${base}${frame}`) }
      : {}),
  };
}
