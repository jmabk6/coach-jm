import { db } from "../../db/database";
import type { InstallMarkers } from "../../domain";

/**
 * Seed 18 (demande du 26/09/2026) : supprime le modèle « Muscu A » créé à
 * la main le 17/09, pendant la construction de l'application, jamais
 * utilisé et source de confusion avec « Muscu A — Traction force / dos ».
 *
 * Suppression seulement s'il est toujours inutilisé : aucune séance faite
 * ou en cours, aucune séance planifiée, absent du programme hebdomadaire.
 * Sinon il est laissé tel quel.
 */

export const OLD_MUSCU_A_ID = "d6b12816-4681-4030-9380-8c44fb3477a6";

export async function seedRemoveOldMuscuA(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.sessionTemplates, db.workouts, db.plannedSessions, db.weeklyPrograms, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.removeOldMuscuA !== undefined) return;

    const template = await db.sessionTemplates.get(OLD_MUSCU_A_ID);
    if (template && template.name === "Muscu A") {
      const workouts = await db.workouts.where("sessionTemplateId").equals(OLD_MUSCU_A_ID).count();
      const planned = await db.plannedSessions.where("sessionTemplateId").equals(OLD_MUSCU_A_ID).count();
      const inProgram = (await db.weeklyPrograms.toArray()).some((program) => JSON.stringify(program).includes(OLD_MUSCU_A_ID));
      if (workouts === 0 && planned === 0 && !inProgram) await db.sessionTemplates.delete(OLD_MUSCU_A_ID);
    }

    await db.settings.put({ key: "install", value: { ...install, removeOldMuscuA: now } });
  });
}
