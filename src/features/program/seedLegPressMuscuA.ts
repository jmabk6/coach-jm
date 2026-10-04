import { db } from "../../db/database";
import type { InstallMarkers, SessionTemplate } from "../../domain";
import { PROGRAM_V2_TEMPLATES } from "./programV2";

/**
 * Seed 30 (05/10/2026) : la leg press entre dans Muscu A, après le curl EZ
 * et avant le leg curl couché — 2 × 10-12, 2 min de repos, environ 2 reps
 * en réserve. La charge n'est jamais une consigne du modèle : la séance
 * reprend la dernière charge connue de la leg press (Dernière fois, cadre),
 * et rien sans historique.
 * Seulement si Muscu A n'a pas déjà de leg press. Les séances faites ne
 * bougent pas : elles ont leur copie du modèle ; une Muscu A planifiée
 * prend le modèle à son démarrage.
 */

const PRESS_ID = "v2-muscu-a-presse";

/** Muscu A avec la leg press avant le leg curl, ou `undefined` si elle en a déjà une. */
export function muscuAWithLegPress(template: SessionTemplate, now: string): SessionTemplate | undefined {
  if (template.blocks.some((block) => block.id === PRESS_ID || (block.kind === "exercise" && block.exerciseId === "presse-cuisses"))) return undefined;
  const press = PROGRAM_V2_TEMPLATES.find((item) => item.id === "v2-muscu-a")!.blocks.find((block) => block.id === PRESS_ID)!;
  const legCurl = template.blocks.find((block) => block.id === "v2-muscu-a-leg-curl");
  const curl = template.blocks.find((block) => block.id === "v2-muscu-a-curl");
  const at = legCurl ? legCurl.position : curl ? curl.position + 1 : Math.max(-1, ...template.blocks.map((block) => block.position)) + 1;
  return {
    ...template,
    blocks: [...template.blocks.map((block) => (block.position >= at ? { ...block, position: block.position + 1 } : block)), { ...structuredClone(press), position: at }],
    updatedAt: now,
  };
}

export async function seedLegPressMuscuA20261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.legPressMuscuA20261005 !== undefined) return;

    const a = await db.sessionTemplates.get("v2-muscu-a");
    const next = a ? muscuAWithLegPress(a, now) : undefined;
    if (next) await db.sessionTemplates.put(next);

    await db.settings.put({ key: "install", value: { ...install, legPressMuscuA20261005: now } });
  });
}
