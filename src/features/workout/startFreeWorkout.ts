import {
  getInProgressWorkout,
  saveWorkout,
} from "../../db/repositories/workoutRepository";
import type { WorkoutSession } from "../../domain";

export async function startFreeWorkout(
  date: string,
  now: string = new Date().toISOString(),
): Promise<WorkoutSession> {
  const inProgressWorkout =
    await getInProgressWorkout();

  if (inProgressWorkout) {
    throw new Error(
      "Une séance est déjà en cours",
    );
  }

  const workout: WorkoutSession = {
    id: `free-${date}-${now}`,
    source: "free",
    status: "in_progress",
    date,
    startedAt: now,
    lastActionAt: now,
    activeDurationSec: 0,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveWorkout(workout);

  return workout;
}