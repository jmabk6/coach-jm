import {
  getPlannedSession,
  savePlannedSession,
  updatePlannedSession,
  updatePlannedSessionStatus,
} from "../../db/repositories/programRepository";
import type { Id, PlannedSession } from "../../domain";

/**
 * Actions sur une instance datée (§9). Aucune ne touche la règle
 * hebdomadaire : une occurrence déplacée, remplacée ou retirée reste
 * l'affaire de cette seule date.
 */

async function requireVisiblePlannedSession(id: Id): Promise<PlannedSession> {
  const plannedSession = await getPlannedSession(id);

  if (!plannedSession || plannedSession.removedAt) {
    throw new Error("Séance planifiée introuvable");
  }

  return plannedSession;
}

/**
 * `Ajouter une séance` : une instance ponctuelle, sans lien avec la règle.
 */
export async function addPlannedSession(
  date: string,
  sessionTemplateId: Id,
  now: string = new Date().toISOString(),
): Promise<PlannedSession> {
  const plannedSession: PlannedSession = {
    id: `manual-${crypto.randomUUID()}`,
    date,
    sessionTemplateId,
    status: "upcoming",
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };

  await savePlannedSession(plannedSession);

  return plannedSession;
}

/**
 * `Déplacer à un autre jour` : la date d'origine (`sourceDate`) reste
 * figée, la règle ne recréera pas la séance au jour quitté.
 */
export async function movePlannedSession(
  id: Id,
  date: string,
): Promise<void> {
  const plannedSession = await requireVisiblePlannedSession(id);

  if (
    plannedSession.status === "in_progress" ||
    plannedSession.status === "done"
  ) {
    throw new Error("Une séance commencée ou réalisée ne peut pas être déplacée");
  }

  await updatePlannedSession(id, { date });
}

/**
 * `Remplacer par une autre séance`.
 */
export async function replacePlannedSession(
  id: Id,
  sessionTemplateId: Id,
): Promise<void> {
  const plannedSession = await requireVisiblePlannedSession(id);

  if (
    plannedSession.status === "in_progress" ||
    plannedSession.status === "done"
  ) {
    throw new Error("Une séance commencée ou réalisée ne peut pas être remplacée");
  }

  await updatePlannedSession(id, { sessionTemplateId });
}

export async function skipPlannedSession(id: Id): Promise<void> {
  const plannedSession = await requireVisiblePlannedSession(id);

  if (plannedSession.status !== "upcoming") {
    throw new Error("Seule une séance à venir peut être marquée comme sautée");
  }

  await updatePlannedSessionStatus(id, "skipped");
}

export async function restorePlannedSession(id: Id): Promise<void> {
  const plannedSession = await requireVisiblePlannedSession(id);

  if (plannedSession.status !== "skipped") {
    throw new Error("Seule une séance sautée peut être remise en À venir");
  }

  await updatePlannedSessionStatus(id, "upcoming");
}

/**
 * `Dupliquer cette séance` : une nouvelle instance ponctuelle du même
 * modèle, à la date choisie. La séance d'origine n'est jamais modifiée —
 * c'est l'alternative proposée sur une séance faite (§9).
 */
export async function duplicatePlannedSession(
  id: Id,
  date: string,
  now: string = new Date().toISOString(),
): Promise<PlannedSession> {
  const plannedSession = await requireVisiblePlannedSession(id);

  return addPlannedSession(date, plannedSession.sessionTemplateId, now);
}
