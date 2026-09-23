import { db } from "../database";
import type { Goal, GoalKey, Id } from "../../domain";

/**
 * Objectifs V2 (conception V2 § 3.6, store `goals` refondu en v3). Sept
 * objectifs installés d'office au lot H : pas de suppression en V1,
 * édition seule.
 */

export async function getAllGoals(): Promise<Goal[]> {
  return db.goals.orderBy("position").toArray();
}

export async function getGoal(id: Id): Promise<Goal | undefined> {
  return db.goals.get(id);
}

export async function getGoalByKey(key: GoalKey): Promise<Goal | undefined> {
  return db.goals.where("key").equals(key).first();
}

export async function saveGoal(goal: Goal): Promise<void> {
  await db.goals.put(goal);
}
