import { db } from "../../db/database";
import type { BodyCompositionTargets, InstallMarkers } from "../../domain";

/**
 * Valeurs initiales de la cible personnelle indicative de composition
 * (phase 2.1, 05/10/2026) : des objectifs physiques personnels, jamais des
 * normes médicales. Écrites une fois dans les réglages, modifiables ensuite
 * depuis l'application ; aucun écran ne les lit ici.
 */
export const INITIAL_BODY_TARGETS: Omit<BodyCompositionTargets, "updatedAt"> = {
  weightKg: { min: 78, max: 80 },
  fatPct: { min: 12, max: 15 },
  fatKg: { min: 9, max: 12 },
  skeletalMuscleKg: { min: 39 },
};

/** Seed 36 : la cible initiale, seulement si aucune cible n'existe encore (jamais écrasée). */
export async function seedBodyTargets20261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.bodyTargets20261005 !== undefined) return;

    if (!(await db.settings.get("bodyCompositionTargets"))) {
      await db.settings.put({ key: "bodyCompositionTargets", value: { ...INITIAL_BODY_TARGETS, updatedAt: now } });
    }

    await db.settings.put({ key: "install", value: { ...install, bodyTargets20261005: now } });
  });
}
