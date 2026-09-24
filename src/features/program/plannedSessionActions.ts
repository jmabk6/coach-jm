import { db } from "../../db/database";
import {
  getPlannedSession,
  savePlannedSession,
  updatePlannedSession,
  updatePlannedSessionStatus,
} from "../../db/repositories/programRepository";
import type { Id, PlannedSession } from "../../domain";
import {
  allowedMoveChoices,
  findMoveConflict,
  isLockedPlannedSession,
  type MoveChoice,
} from "../../domain/rules/programRules";

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
 * `Déplacer` avec conflit (conception V2 § 2.7, lot F.2), en une
 * transaction. Sans conflit au jour visé (même créneau), la séance est
 * simplement déplacée ; avec conflit, le choix est obligatoire :
 *
 * - `swap` : les deux instances échangent leurs dates — chacune emporte
 *   ses tests, qui vivent sur l'instance ;
 * - `both` : elles coexistent ;
 * - `replace` : l'instance visée est retirée (`removedAt`) ; ses tests
 *   restent attachés et deviennent « à replanifier » (état dérivé, D26).
 *
 * Une instance faite ou en cours n'est jamais échangée ni remplacée.
 */
export async function moveWithChoice(
  id: Id,
  date: string,
  choice?: MoveChoice,
  now: string = new Date().toISOString(),
): Promise<void> {
  await db.transaction("rw", db.plannedSessions, async () => {
    const moving = await db.plannedSessions.get(id);

    if (!moving || moving.removedAt) throw new Error("Séance planifiée introuvable");
    if (isLockedPlannedSession(moving)) {
      throw new Error("Une séance commencée ou réalisée ne peut pas être déplacée");
    }
    if (date === moving.date) throw new Error("La séance est déjà ce jour-là");

    const sameDay = await db.plannedSessions.where("date").equals(date).toArray();
    const target = findMoveConflict(moving, date, sameDay);

    if (!target) {
      await db.plannedSessions.put({ ...moving, date, updatedAt: now });
      return;
    }

    if (!choice) throw new Error("Ce jour a déjà une séance : choisissez que faire");
    if (!allowedMoveChoices(target).includes(choice)) {
      throw new Error("Une séance commencée ou réalisée n'est jamais échangée ni remplacée");
    }

    switch (choice) {
      case "swap":
        await db.plannedSessions.bulkPut([
          { ...moving, date, updatedAt: now },
          { ...target, date: moving.date, updatedAt: now },
        ]);
        return;
      case "both":
        await db.plannedSessions.put({ ...moving, date, updatedAt: now });
        return;
      case "replace":
        await db.plannedSessions.bulkPut([
          { ...moving, date, updatedAt: now },
          { ...target, removedAt: now, updatedAt: now },
        ]);
        return;
    }
  });
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
