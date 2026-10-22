import type { WorkoutSession } from "../../domain";
import { getCompletedWorkouts, getInProgressWorkout } from "../../db/repositories/workoutRepository";
import { loadDayTargetContext } from "./dayTargets";
import { buildPerspectiveView, type PerspectiveView } from "./perspectiveView";

/**
 * Charge les perspectives (lot P3) : les pistes enregistrées, leurs
 * séances, et la séance en cours (son objectif figé compte comme
 * « présenté »). N'écrit rien.
 */
export async function loadPerspectives(today: string, now: string = new Date().toISOString()): Promise<PerspectiveView[]> {
  const [completed, current] = await Promise.all([getCompletedWorkouts(), getInProgressWorkout()]);
  const context = await loadDayTargetContext(completed as WorkoutSession[]);
  const all = current ? [...(completed as WorkoutSession[]), current] : (completed as WorkoutSession[]);
  return context.tracks
    .filter((track) => !track.closedAt)
    .map((track) => buildPerspectiveView(track, context.specs.find((spec) => spec.id === track.id), context, all, today, now));
}
