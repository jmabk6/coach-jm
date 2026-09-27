import type { PlannedSession } from "../../domain";
import { findMoveConflict, isLockedPlannedSession } from "../../domain/rules/programRules";

/**
 * Dépôt d'une séance sur un jour du Planning Semaine (27/09/2026) :
 * - même jour, ou séance faite / en cours : rien ;
 * - jour libre au même créneau : déplacement direct ;
 * - jour occupé au même créneau : la feuille Déplacer, jour choisi
 *   (Échanger / Faire les deux / Remplacer).
 * Le créneau ne change jamais : une routine reste le soir.
 */
export type DropPlan = { kind: "none" } | { kind: "move" } | { kind: "conflict"; target: PlannedSession };

export function planDrop(session: PlannedSession, date: string, sameDay: ReadonlyArray<PlannedSession>): DropPlan {
  if (date === session.date || session.removedAt || isLockedPlannedSession(session)) return { kind: "none" };
  const target = findMoveConflict(session, date, sameDay);
  return target ? { kind: "conflict", target } : { kind: "move" };
}
