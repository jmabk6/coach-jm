import { db } from "../../db/database";
import type { InstallMarkers, SessionTemplate } from "../../domain";
import { PROGRAM_V2_TEMPLATES } from "./programV2";

/**
 * Seed 28 (05/10/2026), pari traction V6 : les tractions négatives 2 × 2
 * entrent dans Muscu C, juste après la suspension et avant les sprints.
 * La brique est dans le modèle dès maintenant ; la séance ne la contient
 * qu'à partir du 01/11/2026 (décidé au démarrage, `v6SnapshotAdjustments`).
 * Seulement si le modèle n'a pas déjà de traction négative.
 */

const NEGATIVES_ID = "v2-muscu-c-negatives";

/** Muscu C avec les négatives après la suspension, ou `undefined` si elle en a déjà. */
export function muscuCWithNegatives(template: SessionTemplate, now: string): SessionTemplate | undefined {
  if (template.blocks.some((block) => block.id === NEGATIVES_ID || (block.kind === "exercise" && block.exerciseId === "traction-negative"))) return undefined;
  const negatives = PROGRAM_V2_TEMPLATES.find((item) => item.id === "v2-muscu-c")!.blocks.find((block) => block.id === NEGATIVES_ID)!;
  const anchor =
    template.blocks.find((block) => block.id === "v2-muscu-c-suspension") ??
    template.blocks.find((block) => block.kind === "exercise" && block.role === "warmup");
  const at = anchor ? anchor.position + 1 : 0;
  return {
    ...template,
    blocks: [...template.blocks.map((block) => (block.position >= at ? { ...block, position: block.position + 1 } : block)), { ...structuredClone(negatives), position: at }],
    updatedAt: now,
  };
}

export async function seedNegativesMuscuC20261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.negativesMuscuC20261005 !== undefined) return;

    const c = await db.sessionTemplates.get("v2-muscu-c");
    const next = c ? muscuCWithNegatives(c, now) : undefined;
    if (next) await db.sessionTemplates.put(next);

    await db.settings.put({ key: "install", value: { ...install, negativesMuscuC20261005: now } });
  });
}
