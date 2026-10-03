import { db } from "../../db/database";
import type { ExerciseBlock, InstallMarkers, SessionTemplate, StrengthFrameVersion } from "../../domain";
import { PROGRAM_V2_TEMPLATES } from "./programV2";

/**
 * Seed 26 (décision du 04/10/2026), pari traction V6 :
 * - Muscu A : la traction passe à 3 séries jusqu'à 5 reps propres, 3 min
 *   de repos — seulement si la brique a encore la consigne semée (3 × 6-8,
 *   2 min 30) ;
 * - Muscu B : la traction légère passe à 3 × 8-10, hors palier (ni
 *   validation du cadre, ni stagnation) — seulement si la brique a encore
 *   la consigne semée (2 × 8-10) ;
 * - cadre de la traction : nouvelle version (motif « changement de
 *   programme ») 3 × 1-5, RPE 9 au plus, 3 min, cran de 7 kg ; l'objectif
 *   en cours (42 kg) est effacé : le palier vient du moteur V6.
 * Les séances faites ne bougent pas : elles ont leur copie du modèle.
 */

const sameInstructions = (block: ExerciseBlock, sets: number, min: number, max: number, rest: number) =>
  block.instructions.shape === "reps" &&
  block.instructions.sets === sets &&
  block.instructions.reps.min === min &&
  block.instructions.reps.max === max &&
  block.instructions.restBetweenSetsSec === rest;

const SEEDED: Record<string, { sets: number; min: number; max: number; rest: number }> = {
  "v2-muscu-a-traction": { sets: 3, min: 6, max: 8, rest: 150 },
  "v2-muscu-b-traction": { sets: 2, min: 8, max: 10, rest: 120 },
};

const definitionBlock = (templateId: string, blockId: string) =>
  PROGRAM_V2_TEMPLATES.find((template) => template.id === templateId)!.blocks.find((block) => block.id === blockId) as ExerciseBlock;

/** Le modèle avec sa brique traction V6, ou `undefined` si la brique a été modifiée depuis le seed. */
export function withTractionV6(template: SessionTemplate, now: string): SessionTemplate | undefined {
  let changed = false;
  const blocks = template.blocks.map((block) => {
    const seeded = SEEDED[block.id];
    if (!seeded || block.kind !== "exercise" || !sameInstructions(block, seeded.sets, seeded.min, seeded.max, seeded.rest)) return block;
    const target = definitionBlock(template.id, block.id);
    changed = true;
    const next: ExerciseBlock = { ...block, instructions: structuredClone(target.instructions) };
    if (target.notes !== undefined) next.notes = target.notes;
    if (target.outsideFrame) next.outsideFrame = true;
    return next;
  });
  return changed ? { ...template, blocks, updatedAt: now } : undefined;
}

/** La version V6 du cadre traction, à partir de la version active ; `undefined` si elle y est déjà. */
export function tractionFrameV6(active: StrengthFrameVersion, now: string): { archived: StrengthFrameVersion; next: StrengthFrameVersion } | undefined {
  if (active.workSets === 3 && active.repRange?.min === 1 && active.repRange.max === 5 && active.rpeTarget === 9 && active.restSec === 180) return undefined;
  const archived: StrengthFrameVersion = { ...active, status: "archived", archivedAt: now, archiveReason: "changement_programme", updatedAt: now };
  delete archived.currentTarget;
  const next: StrengthFrameVersion = {
    ...active,
    id: `${active.frameId}-v${active.number + 1}`,
    number: active.number + 1,
    workSets: 3,
    repRange: { min: 1, max: 5 },
    rpeTarget: 9,
    restSec: 180,
    increment: { unit: "kg", value: 7 },
    createdAt: now,
    updatedAt: now,
  };
  delete next.currentTarget;
  delete next.firstOfficialWorkoutId;
  delete next.frozenAt;
  return { archived, next };
}

export async function seedTractionV620261004(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.sessionTemplates, db.strengthFrames, db.strengthFrameVersions, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.tractionV620261004 !== undefined) return;

    for (const id of ["v2-muscu-a", "v2-muscu-b"]) {
      const template = await db.sessionTemplates.get(id);
      const next = template ? withTractionV6(template, now) : undefined;
      if (next) await db.sessionTemplates.put(next);
    }

    const frame = await db.strengthFrames.where("exerciseId").equals("traction-assistee").first();
    const active = frame ? await db.strengthFrameVersions.get(frame.activeVersionId) : undefined;
    const change = frame && active && active.status === "active" ? tractionFrameV6(active, now) : undefined;
    if (frame && change) {
      await db.strengthFrameVersions.put(change.archived);
      await db.strengthFrameVersions.add(change.next);
      await db.strengthFrames.put({ ...frame, activeVersionId: change.next.id, updatedAt: now });
    }

    await db.settings.put({ key: "install", value: { ...install, tractionV620261004: now } });
  });
}
