import { db } from "../../db/database";
import type { Goal, InstallMarkers } from "../../domain";
import { goalId } from "./goalsV1";

/**
 * Seed 37 (05/10/2026, phase 2.1) : l'objectif Poids passe de 75 à 80 kg,
 * échéance 31/03/2027 gardée — décision de l'utilisateur. Seule la cible
 * du segment change, et seulement si elle vaut encore 75 kg (un objectif
 * déjà modifié n'est pas touché). Aucun lien avec la cible de
 * composition ; le pari traction V6 (92 → 75 kg) reste figé ; les pesées
 * ne sont pas touchées.
 */
export const WEIGHT_GOAL_FORMER_TARGET = 75;
export const WEIGHT_GOAL_TARGET_20261005 = 80;

export async function seedWeightGoal8020261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.goals, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.weightGoalTarget20261005 !== undefined) return;

    const goal = await db.goals.get(goalId("weight"));
    const next = goal && weightGoalAfterSeed37(goal, now);
    if (next) await db.goals.put(next);

    await db.settings.put({ key: "install", value: { ...install, weightGoalTarget20261005: now } });
  });
}

/** L'objectif Poids après le seed 37 ; `undefined` s'il n'est pas à 75 kg (rien à faire). */
export function weightGoalAfterSeed37(goal: Goal, now: string): Goal | undefined {
  if (!goal.segments.some((segment) => segment.target === WEIGHT_GOAL_FORMER_TARGET)) return undefined;
  return {
    ...goal,
    segments: goal.segments.map((segment) => (segment.target === WEIGHT_GOAL_FORMER_TARGET ? { ...segment, target: WEIGHT_GOAL_TARGET_20261005 } : segment)),
    updatedAt: now,
  };
}
