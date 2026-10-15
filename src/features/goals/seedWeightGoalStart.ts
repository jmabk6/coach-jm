import { db } from "../../db/database";
import { DEFAULT_WEIGHT_REFERENCE_DEVICE } from "../../domain/rules/bodyWeightRules";
import type { Goal, InstallMarkers } from "../../domain";
import { deviceSeries } from "../../domain/rules/bodyTargetRules";

/**
 * Seed 40 (décision du 15/10/2026) : le départ de l'objectif Poids est
 * enregistré une fois pour toutes — la première mesure de la balance de
 * référence (chez l'utilisateur : 91,15 kg le 5/10/2026). Ajouter ou
 * supprimer ensuite une ancienne pesée ne le déplace plus.
 *
 * Seulement si le segment courant de l'objectif Poids n'a pas déjà de
 * départ ; sans aucune mesure, rien n'est écrit (l'écran dit alors « départ
 * provisoire » dès la première pesée). Aucune pesée, aucune mesure, aucune
 * autre donnée de l'objectif n'est touchée.
 */
export async function seedWeightGoalStart20261015(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.goals, db.bodyMeasurements, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.weightGoalStart20261015 !== undefined) return;

    const goal = (await db.goals.where("key").equals("weight").first()) as Goal | undefined;
    const segment = goal?.segments.find((item) => item.id === goal.currentSegmentId);
    if (goal && segment && segment.start === undefined) {
      const device = ((await db.settings.get("weightReferenceDevice"))?.value as string | undefined) ?? DEFAULT_WEIGHT_REFERENCE_DEVICE;
      const first = deviceSeries(await db.bodyMeasurements.toArray(), device)[0];
      if (first) {
        await db.goals.put({
          ...goal,
          segments: goal.segments.map((item) => (item.id === segment.id ? { ...item, start: { date: first.date, value: first.weightKg } } : item)),
          updatedAt: now,
        });
      }
    }

    await db.settings.put({ key: "install", value: { ...install, weightGoalStart20261015: now } });
  });
}
