import { db } from "../database";
import type {
  Id,
  PlannedSession,
  PlannedSessionStatus,
  WeeklyProgram,
} from "../../domain";

/* -------------------------------------------------------------------------- */
/* Règle hebdomadaire                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Coach JM V1 possède une seule règle hebdomadaire.
 *
 * L'identifiant est technique et n'est jamais choisi
 * par l'utilisateur.
 */
export const WEEKLY_PROGRAM_ID: Id = "weekly-program";

export async function getWeeklyProgram(): Promise<
  WeeklyProgram | undefined
> {
  return db.weeklyPrograms.get(WEEKLY_PROGRAM_ID);
}

export async function saveWeeklyProgram(
  program: Omit<WeeklyProgram, "id">,
): Promise<void> {
  await db.weeklyPrograms.put({
    ...program,
    id: WEEKLY_PROGRAM_ID,
  });
}

/* -------------------------------------------------------------------------- */
/* Instances datées                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Lecture technique par identifiant.
 *
 * Peut retourner une occurrence retirée.
 * Utile notamment pour la génération du Programme.
 */
export async function getPlannedSession(
  id: Id,
): Promise<PlannedSession | undefined> {
  return db.plannedSessions.get(id);
}

/**
 * Occurrences visibles d'une journée.
 *
 * Les occurrences retirées restent en base
 * mais ne doivent plus apparaître dans le Programme.
 */
export async function getPlannedSessionsByDate(
  date: string,
): Promise<PlannedSession[]> {
  const sessions = await db.plannedSessions
    .where("date")
    .equals(date)
    .toArray();

  return sessions.filter((session) => !session.removedAt);
}

/**
 * Occurrences visibles sur une période.
 */
export async function getPlannedSessionsBetween(
  startDate: string,
  endDate: string,
): Promise<PlannedSession[]> {
  const sessions = await db.plannedSessions
    .where("date")
    .between(startDate, endDate, true, true)
    .toArray();

  return sessions.filter((session) => !session.removedAt);
}

/**
 * Lecture technique d'une journée, occurrences retirées incluses.
 *
 * Cette fonction servira au générateur automatique :
 * une occurrence retirée compte comme déjà générée
 * et ne doit jamais être recréée.
 */
export async function getPlannedSessionsByDateIncludingRemoved(
  date: string,
): Promise<PlannedSession[]> {
  return db.plannedSessions
    .where("date")
    .equals(date)
    .toArray();
}

export async function savePlannedSession(
  plannedSession: PlannedSession,
): Promise<void> {
  await db.plannedSessions.put(plannedSession);
}

export async function savePlannedSessions(
  plannedSessions: PlannedSession[],
): Promise<void> {
  await db.plannedSessions.bulkPut(plannedSessions);
}

/**
 * Toutes les occurrences à partir d'une date, retirées comprises.
 *
 * Sert à la resynchronisation des semaines futures quand la règle change.
 */
export async function getPlannedSessionsFromIncludingRemoved(
  startDate: string,
): Promise<PlannedSession[]> {
  return db.plannedSessions
    .where("date")
    .aboveOrEqual(startDate)
    .toArray();
}

/**
 * Suppression physique, réservée aux instances intactes que la règle
 * ne veut plus : elles n'ont jamais porté de décision de l'utilisateur,
 * rien n'a besoin d'être conservé.
 */
export async function deletePlannedSessions(ids: Id[]): Promise<void> {
  await db.plannedSessions.bulkDelete(ids);
}

/**
 * Mise à jour partielle d'une occurrence visible.
 */
export async function updatePlannedSession(
  id: Id,
  changes: Omit<
    Partial<PlannedSession>,
    "id" | "createdAt" | "updatedAt" | "source" | "sourceWeekday" | "sourceDate"
  >,
): Promise<void> {
  const plannedSession = await db.plannedSessions.get(id);

  if (!plannedSession) {
    throw new Error("Séance planifiée introuvable");
  }

  if (plannedSession.removedAt) {
    throw new Error("Cette séance a été retirée du Programme");
  }

  await db.plannedSessions.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export async function updatePlannedSessionStatus(
  id: Id,
  status: PlannedSessionStatus,
): Promise<void> {
  const plannedSession = await db.plannedSessions.get(id);

  if (!plannedSession) {
    throw new Error("Séance planifiée introuvable");
  }

  if (plannedSession.removedAt) {
    throw new Error("Cette séance a été retirée du Programme");
  }

  await db.plannedSessions.update(id, {
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Retire uniquement une occurrence du Programme.
 *
 * L'occurrence n'est pas supprimée physiquement :
 * elle reste en base afin que la génération automatique
 * sache qu'elle a déjà existé et ne la recrée pas.
 *
 * Cette fonction ne modifie jamais la règle hebdomadaire.
 */
export async function removePlannedSession(
  id: Id,
): Promise<void> {
  const plannedSession = await db.plannedSessions.get(id);

  if (!plannedSession) {
    throw new Error("Séance planifiée introuvable");
  }

  if (
    plannedSession.status === "in_progress" ||
    plannedSession.status === "done"
  ) {
    throw new Error(
      "Une séance commencée ou réalisée ne peut pas être retirée du Programme",
    );
  }

  const now = new Date().toISOString();

  await db.plannedSessions.update(id, {
    removedAt: now,
    updatedAt: now,
  });
}

