import { db } from "../../db/database";
import type { Goal, GoalDirection, GoalSegment, Id } from "../../domain";
import { testProtocolId } from "../tests/testProtocolsV1";

/**
 * Écritures de M5 (lot H.4) : la cible, l'échéance et, pour Jambes, la
 * mesure du segment courant ; « Passer à la traction stricte » (N12).
 * Rien de dérivé n'est stocké : statut, départ et atteinte se recalculent.
 */

/** Mesures de Jambes proposées au choix (§ 2.2), avec leur sens. */
export const LEGS_MEASURES: ReadonlyArray<{ measureKey: string; direction: GoalDirection }> = [
  { measureKey: "sprint_puissance_moy", direction: "increase" },
  { measureKey: "sprint_baisse_pct", direction: "decrease" },
  { measureKey: "chaise_duree_s", direction: "increase" },
];

export interface SegmentEdit {
  target?: number;
  dueDate?: string;
  /** Jambes seulement : la mesure choisie, et son libellé (celui du protocole). */
  measureKey?: string;
  measureLabel?: string;
}

export function applySegmentEdit(goal: Goal, segmentId: Id, edit: SegmentEdit, now: string): Goal {
  if (edit.target !== undefined && !Number.isFinite(edit.target)) throw new Error("Cible invalide");
  if (edit.dueDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(edit.dueDate)) throw new Error("Échéance invalide");

  const segments = goal.segments.map((segment): GoalSegment => {
    if (segment.id !== segmentId) return segment;
    const next: GoalSegment = { ...segment };

    if (goal.key === "legs" && edit.measureKey !== undefined) {
      const choice = LEGS_MEASURES.find((item) => item.measureKey === edit.measureKey);
      if (!choice) throw new Error("Mesure inconnue");
      next.measure = { source: "test", protocolId: testProtocolId("jambes"), measureKey: choice.measureKey };
      next.direction = choice.direction;
      if (edit.measureLabel) next.label = edit.measureLabel;
    }

    if (edit.target === undefined) delete next.target;
    else next.target = edit.target;
    if (edit.dueDate === undefined) delete next.dueDate;
    else next.dueDate = edit.dueDate;
    return next;
  });
  if (!segments.some((segment) => segment.id === segmentId)) throw new Error("Segment introuvable");

  return { ...goal, segments, updatedAt: now };
}

export async function editGoalSegment(goalId: Id, segmentId: Id, edit: SegmentEdit, now: string = new Date().toISOString()): Promise<Goal> {
  return db.transaction("rw", db.goals, async () => {
    const goal = await db.goals.get(goalId);
    if (!goal) throw new Error("Objectif introuvable");
    const next = applySegmentEdit(goal, segmentId, edit, now);
    await db.goals.put(next);
    return next;
  });
}

/**
 * « Passer à la traction stricte » (N12) : seulement quand le segment
 * courant est atteint — l'écran ne propose le bouton qu'alors. L'échéance
 * du segment suivant est saisie à ce moment (N1).
 */
export async function activateNextSegment(goalId: Id, dueDate: string, now: string = new Date().toISOString()): Promise<Goal> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Échéance invalide");
  return db.transaction("rw", db.goals, async () => {
    const goal = await db.goals.get(goalId);
    if (!goal) throw new Error("Objectif introuvable");
    const index = goal.segments.findIndex((segment) => segment.id === goal.currentSegmentId);
    const following = goal.segments[index + 1];
    if (!following) throw new Error("Aucun segment suivant");
    const next: Goal = {
      ...goal,
      currentSegmentId: following.id,
      segments: goal.segments.map((segment) => (segment.id === following.id ? { ...segment, dueDate } : segment)),
      updatedAt: now,
    };
    await db.goals.put(next);
    return next;
  });
}
