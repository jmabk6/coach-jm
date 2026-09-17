import { getPlannedSessionsByDate } from "../../db/repositories/programRepository";
import type { Id, PlannedSession } from "../../domain";

/**
 * Feuille de choix du §10 : depuis `Plus → Séances → <modèle>`, une
 * planifiée du même modèle aujourd'hui (à venir ou sautée) donne le
 * choix entre démarrer la séance prévue et une séance supplémentaire ;
 * sans planifiée, la réalisation libre part directement.
 */
export async function findPlannedTodayForTemplate(
  templateId: Id,
  today: string,
): Promise<PlannedSession | undefined> {
  const sessions = await getPlannedSessionsByDate(today);

  return sessions
    .filter(
      (session) =>
        session.sessionTemplateId === templateId &&
        (session.status === "upcoming" || session.status === "skipped"),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}
