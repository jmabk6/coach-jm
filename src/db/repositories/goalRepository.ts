import { db } from "../database";
import type { Goal, Id } from "../../domain";

/**
 * Tous les objectifs.
 */
export async function getAllGoals(): Promise<Goal[]> {
  return db.goals.toArray();
}

/**
 * Objectifs en cours.
 */
export async function getActiveGoals(): Promise<Goal[]> {
  return db.goals
    .where("status")
    .equals("active")
    .toArray();
}

/**
 * Objectifs atteints.
 */
export async function getAchievedGoals(): Promise<Goal[]> {
  return db.goals
    .where("status")
    .equals("achieved")
    .toArray();
}

/**
 * Un objectif précis.
 */
export async function getGoal(
  id: Id,
): Promise<Goal | undefined> {
  return db.goals.get(id);
}

/**
 * Crée ou remplace un objectif.
 */
export async function saveGoal(
  goal: Goal,
): Promise<void> {
  await db.goals.put(goal);
}

/**
 * Mise à jour partielle.
 */
export async function updateGoal(
  id: Id,
  changes: Omit<Partial<Goal>, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  const goal = await db.goals.get(id);

  if (!goal) {
    throw new Error("Objectif introuvable");
  }

  await db.goals.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Supprime un objectif.
 *
 * Cela ne supprime jamais les données sportives
 * ou les pesées sur lesquelles il s'appuyait.
 */
export async function deleteGoal(
  id: Id,
): Promise<void> {
  const goal = await db.goals.get(id);

  if (!goal) {
    throw new Error("Objectif introuvable");
  }

  await db.goals.delete(id);
}

