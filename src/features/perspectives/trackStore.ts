import { db } from "../../db/database";
import type { Id, ProgressionTrack } from "../../domain";

/** Les pistes des perspectives (réglage `progressionTracks`) ; vide avant le seed 44. */
export async function getProgressionTracks(): Promise<ProgressionTrack[]> {
  return ((await db.settings.get("progressionTracks"))?.value as ProgressionTrack[] | undefined) ?? [];
}

/**
 * Exercices dont la hausse automatique est suspendue (douleur signalée) :
 * ni « Augmentation proposée » ni encart de stagnation pour eux, dans
 * aucune séance.
 */
export function suspendedExerciseIds(tracks: ReadonlyArray<ProgressionTrack>): Set<Id> {
  return new Set(tracks.filter((track) => track.suspension && !track.closedAt).map((track) => track.exerciseId));
}
