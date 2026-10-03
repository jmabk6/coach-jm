import { db } from "../../db/database";
import type { InstallMarkers, SessionTemplate } from "../../domain";
import { PROGRAM_V2_TEMPLATES, TRACTION_LIGHT_NOTE } from "./programV2";

/**
 * Seed 24 (décision du 03/10/2026) : priorité à la traction jusqu'au
 * 31/03/2027, sans troisième séance lourde.
 * - Muscu B : la traction légère passe en premier après l'échauffement
 *   (l'ordre des autres exercices ne change pas) — seulement si le modèle
 *   est encore dans l'ordre semé ;
 * - Muscu C : « suspension + activation des omoplates » 3 × 20-30 s,
 *   facile et technique, en premier après l'échauffement — seulement si
 *   le modèle n'en a pas.
 * Les séances faites ne bougent pas : elles ont leur copie du modèle.
 */

const OLD_B_ORDER = [
  "v2-muscu-b-echauffement",
  "v2-muscu-b-chest-press",
  "v2-muscu-b-developpe-incline",
  "v2-muscu-b-traction",
  "v2-muscu-b-developpe-epaules",
  "v2-muscu-b-elevations",
  "v2-muscu-b-extension-triceps",
  "v2-muscu-b-presse",
];
const OLD_TRACTION_NOTE = "Traction légère : plus d'assistance qu'en A, à ajuster après le test.";

const definition = (id: string) => PROGRAM_V2_TEMPLATES.find((template) => template.id === id)!;

/** Muscu B réordonnée, ou `undefined` si elle n'est plus dans l'ordre semé. */
export function muscuBTractionFirst(template: SessionTemplate, now: string): SessionTemplate | undefined {
  const ordered = [...template.blocks].sort((a, b) => a.position - b.position);
  if (ordered.map((block) => block.id).join() !== OLD_B_ORDER.join()) return undefined;
  const target = new Map(definition("v2-muscu-b").blocks.map((block) => [block.id, block.position]));
  return {
    ...template,
    blocks: template.blocks.map((block) => {
      const moved = { ...block, position: target.get(block.id) ?? block.position };
      return moved.kind === "exercise" && moved.id === "v2-muscu-b-traction" && moved.notes === OLD_TRACTION_NOTE ? { ...moved, notes: TRACTION_LIGHT_NOTE } : moved;
    }),
    updatedAt: now,
  };
}

/** Muscu C avec la suspension en premier, ou `undefined` si elle en a déjà une. */
export function muscuCWithSuspension(template: SessionTemplate, now: string): SessionTemplate | undefined {
  if (template.blocks.some((block) => block.id === "v2-muscu-c-suspension" || (block.kind === "exercise" && block.exerciseId === "suspension-omoplates"))) return undefined;
  const suspension = definition("v2-muscu-c").blocks.find((block) => block.id === "v2-muscu-c-suspension")!;
  const warmup = template.blocks.find((block) => block.kind === "exercise" && block.role === "warmup");
  const at = warmup ? warmup.position + 1 : 0;
  return {
    ...template,
    blocks: [...template.blocks.map((block) => (block.position >= at ? { ...block, position: block.position + 1 } : block)), { ...structuredClone(suspension), position: at }],
    updatedAt: now,
  };
}

export async function seedTractionPriority20261003(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionPriority20261003 !== undefined) return;

    const b = await db.sessionTemplates.get("v2-muscu-b");
    const nextB = b ? muscuBTractionFirst(b, now) : undefined;
    if (nextB) await db.sessionTemplates.put(nextB);

    const c = await db.sessionTemplates.get("v2-muscu-c");
    const nextC = c ? muscuCWithSuspension(c, now) : undefined;
    if (nextC) await db.sessionTemplates.put(nextC);

    await db.settings.put({ key: "install", value: { ...install, tractionPriority20261003: now } });
  });
}
