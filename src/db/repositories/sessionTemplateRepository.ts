import { db } from "../database";
import type { Id, SessionTemplate } from "../../domain";

/**
 * Tous les modèles, actifs et archivés,
 * dans leur ordre manuel.
 */
export async function getAllSessionTemplates(): Promise<SessionTemplate[]> {
  return db.sessionTemplates
    .orderBy("position")
    .toArray();
}

/**
 * Modèles actifs uniquement,
 * dans leur ordre manuel.
 */
export async function getActiveSessionTemplates(): Promise<SessionTemplate[]> {
  return db.sessionTemplates
    .where("status")
    .equals("active")
    .sortBy("position");
}

/**
 * Retourne un modèle précis.
 */
export async function getSessionTemplate(
  id: Id,
): Promise<SessionTemplate | undefined> {
  return db.sessionTemplates.get(id);
}

/**
 * Crée ou remplace un modèle.
 */
export async function saveSessionTemplate(
  sessionTemplate: SessionTemplate,
): Promise<void> {
  await db.sessionTemplates.put(sessionTemplate);
}

/**
 * Archive un modèle.
 *
 * Un modèle ayant déjà servi ne doit pas être supprimé,
 * afin que les anciennes réalisations gardent leur référence.
 */
export async function archiveSessionTemplate(
  id: Id,
): Promise<void> {
  const sessionTemplate = await db.sessionTemplates.get(id);

  if (!sessionTemplate) {
    throw new Error("Modèle de séance introuvable");
  }

  await db.sessionTemplates.update(id, {
    status: "archived",
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Met à jour l'ordre manuel des modèles.
 */
export async function updateSessionTemplatePositions(
  orderedIds: Id[],
): Promise<void> {
  await db.transaction(
    "rw",
    db.sessionTemplates,
    async () => {
      await Promise.all(
        orderedIds.map((id, index) =>
          db.sessionTemplates.update(id, {
            position: index,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
    },
  );
}
