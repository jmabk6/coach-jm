import { db } from "../../db/database";
import type { Goal, InstallMarkers, SessionBlock, SessionTemplate, StrengthFrame, StrengthFrameVersion } from "../../domain";
import { ROUTINE_A_20261009 } from "./programV1";
import { MUSCU_C_BLOCKS_BEFORE_20261009, PROGRAM_MUSCU_C_20261009_FRAMES, PROGRAM_V2_TEMPLATES, type FrameSpec20261005 } from "./programV2";

/**
 * Seed 39 (décision du 09/10/2026) — Muscu C orientée haut du corps :
 * - Muscu C : sans sprints vélo, montée sur banc ni circuit « Rester bas » ;
 *   avec l'écarté à la poulie (3 × 12-15) et les élévations latérales
 *   (3 × 12-15) ; 20 min de tapis incliné en fin de séance, la pente réglée
 *   sur les bpm (cible de départ 115-125). Les négatives du pari V6 (dès le
 *   01/11/2026, juste après l'échauffement), la suspension et les
 *   allègements des semaines test ne changent pas. Nom et sous-titre suivent.
 * - Routine A du soir : la montée sur support (3 × 8-10 par jambe) et le
 *   circuit « Rester bas » (3 tours), après le dead bug et avant les
 *   étirements — le travail jambes padel se fait à la maison.
 * - Cadre de l'écarté à la poulie : créé (3 × 12-15, RPE 8, 90 s), sans
 *   objectif en cours ; objectif Haut du corps : l'écarté devient un
 *   exercice lié (affichage).
 *
 * Un modèle n'est changé que s'il a encore exactement les briques
 * attendues ; sinon il reste tel quel. Les séances faites et démarrées ne
 * bougent pas (elles ont leur copie du modèle) ; séances planifiées,
 * cardios, autres routines et pari V6 non plus.
 */

/** Les briques de la Routine A avant le seed 39 (seed 13). */
export const ROUTINE_A_BLOCKS_BEFORE_20261009 = [
  "v1-routine-a-planche",
  "v1-routine-a-dead-bug",
  "v1-routine-a-flechisseurs",
  "v1-routine-a-ischios",
  "v1-routine-a-enfant",
] as const;

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Les briques du modèle selon sa définition : contenu existant gardé, place de la définition, nouvelles briques ajoutées. */
function rebuilt(template: SessionTemplate, definition: Pick<SessionTemplate, "blocks">): SessionBlock[] {
  const current = new Map(template.blocks.map((block) => [block.id, block]));
  return definition.blocks.map((target) => {
    const existing = current.get(target.id);
    return existing ? { ...existing, position: target.position } : structuredClone(target);
  });
}

const muscuCDefinition = () => PROGRAM_V2_TEMPLATES.find((item) => item.id === "v2-muscu-c")!;

/**
 * Muscu C selon le programme du 09/10/2026, ou `undefined` si elle n'a ni
 * les briques d'avant, ni déjà celles du programme. Briques du programme
 * déjà en place (installation passée par le seed 38 avec la nouvelle
 * définition) : seuls le nom, le sous-titre, les étiquettes et la durée
 * annoncée suivent.
 */
export function toMuscuC20261009(template: SessionTemplate, now: string): SessionTemplate | undefined {
  const definition = muscuCDefinition();
  const ids = template.blocks.map((block) => block.id);
  const blocks = sameIds(ids, MUSCU_C_BLOCKS_BEFORE_20261009)
    ? rebuilt(template, definition)
    : sameIds(ids, definition.blocks.map((block) => block.id))
      ? template.blocks
      : undefined;
  if (!blocks) return undefined;
  const next: SessionTemplate = {
    ...template,
    blocks,
    name: definition.name,
    category: definition.category,
    tags: [...(definition.tags ?? [])],
    ...(definition.description !== undefined ? { description: definition.description } : {}),
    ...(definition.subtitle !== undefined ? { subtitle: definition.subtitle } : {}),
  };
  if (blocks === template.blocks && JSON.stringify({ ...next, updatedAt: "" }) === JSON.stringify({ ...template, updatedAt: "" })) return undefined;
  return { ...next, updatedAt: now };
}

/** La Routine A avec la montée et « Rester bas », ou `undefined` si elle n'a plus les briques d'avant. */
export function routineAWithLegs(template: SessionTemplate, now: string): SessionTemplate | undefined {
  if (!sameIds(template.blocks.map((block) => block.id), ROUTINE_A_BLOCKS_BEFORE_20261009)) return undefined;
  const definition = ROUTINE_A_20261009;
  return { ...template, blocks: rebuilt(template, definition), ...(definition.description !== undefined ? { description: definition.description } : {}), updatedAt: now };
}

/** L'objectif Haut du corps avec l'écarté à la poulie, juste après le développé incliné ; `undefined` s'il l'a déjà. */
export function upperBodyGoalWithEcarte(goal: Goal, now: string): Goal | undefined {
  if (goal.linkedExercises.some((link) => link.exerciseId === "ecarte-poulie")) return undefined;
  const after = goal.linkedExercises.findIndex((link) => link.exerciseId === "developpe-incline-halteres");
  const linkedExercises = [...goal.linkedExercises];
  linkedExercises.splice(after >= 0 ? after + 1 : linkedExercises.length, 0, { exerciseId: "ecarte-poulie" });
  return { ...goal, linkedExercises, updatedAt: now };
}

async function createFrame(spec: FrameSpec20261005, now: string): Promise<void> {
  if (await db.strengthFrames.where("exerciseId").equals(spec.exerciseId).first()) return;
  if (!(await db.exercises.get(spec.exerciseId))) return;
  const frameId = `frame-v2-${spec.exerciseId}`;
  const version: StrengthFrameVersion = {
    id: `${frameId}-v1`,
    frameId,
    number: 1,
    status: "active",
    progressionType: "charge_croissante",
    workSets: spec.workSets,
    repRange: { ...spec.repRange },
    rpeTarget: spec.rpeTarget,
    restSec: spec.restSec,
    increment: { unit: "kg", value: 2.5 },
    createdAt: now,
    updatedAt: now,
  };
  const frame: StrengthFrame = { id: frameId, exerciseId: spec.exerciseId, activeVersionId: version.id, createdAt: now, updatedAt: now };
  await db.strengthFrameVersions.add(version);
  await db.strengthFrames.add(frame);
}

export async function seedProgramMuscuC20261009(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.sessionTemplates, db.strengthFrames, db.strengthFrameVersions, db.exercises, db.goals, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.programmeMuscuC20261009 !== undefined) return;

    const c = await db.sessionTemplates.get("v2-muscu-c");
    const nextC = c ? toMuscuC20261009(c, now) : undefined;
    if (nextC) await db.sessionTemplates.put(nextC);

    const a = await db.sessionTemplates.get("v1-routine-a");
    const nextA = a ? routineAWithLegs(a, now) : undefined;
    if (nextA) await db.sessionTemplates.put(nextA);

    for (const spec of PROGRAM_MUSCU_C_20261009_FRAMES) await createFrame(spec, now);

    const upper = (await db.goals.where("key").equals("upper_body").first()) as Goal | undefined;
    const goal = upper ? upperBodyGoalWithEcarte(upper, now) : undefined;
    if (goal) await db.goals.put(goal);

    await db.settings.put({ key: "install", value: { ...install, programmeMuscuC20261009: now } });
  });
}
