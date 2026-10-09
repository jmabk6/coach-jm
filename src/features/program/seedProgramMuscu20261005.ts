import { db } from "../../db/database";
import type { ExerciseBlock, Goal, InstallMarkers, SessionTemplate, StrengthFrame, StrengthFrameVersion, SessionBlock } from "../../domain";
import { PROGRAM_MUSCU_20261005_FRAMES, PROGRAM_V2_TEMPLATES, type FrameSpec20261005 } from "./programV2";

/**
 * Seed 38 (programme muscu du 05/10/2026) — l'organisation des séances
 * autour du pari V6, sans toucher au pari (briques, identifiants, règles,
 * dates) :
 * - Muscu A (force) : sans tirage vertical ; rowing lourd 3 × 6-8, RPE 8-9,
 *   2 min 30 ; chest press de rappel 2 × 8-12, hors palier, référence
 *   propre ; le leg curl avant la leg press ;
 * - Muscu B (volume) : chest press lourd 3 × 6-8, RPE 8-9, 2 min 30 ;
 *   rowing de volume 2 × 10-15 après le développé incliné, hors palier,
 *   référence propre ; la traction légère reste en premier ;
 * - Muscu C : le tirage vertical 2 × 10-15 remplace le pullover ; les
 *   négatives (toujours absentes de la séance avant le 01/11/2026) passent
 *   juste après l'échauffement, avant la suspension ; consignes des
 *   sprints (étalonnage de la résistance) et de la montée sur banc ;
 * - cadres rowing (3 × 6-8, RPE 9), chest press (3 × 6-8, RPE 9) et tirage
 *   vertical (2 × 10-15, RPE 8) : nouvelle version (motif « changement de
 *   programme »), sans objectif en cours — les objectifs de 40 kg des
 *   anciens protocoles 8-12 sont effacés ;
 * - objectif Traction : le pullover quitte ses exercices liés (lien de
 *   suivi et d'affichage seulement : onglet Exercices, séances liées,
 *   objectifs travaillés du récap ; aucun moteur ne le lit), sans
 *   remplaçant.
 *
 * Un modèle n'est réorganisé que s'il a encore exactement les briques
 * semées avant ce seed ; sinon il reste tel quel. Les séances faites et
 * les séances démarrées ne bougent pas : elles ont leur copie du modèle ;
 * une séance planifiée prend le modèle à son démarrage. Jalons et séries
 * ne sont jamais touchés.
 */

/** Les briques des modèles juste avant le seed 38 (seeds 19 à 34). */
export const BLOCKS_BEFORE_20261005: Record<string, readonly string[]> = {
  "v2-muscu-a": [
    "v2-muscu-a-echauffement",
    "v2-muscu-a-traction",
    "v2-muscu-a-rowing",
    "v2-muscu-a-tirage-vertical",
    "v2-muscu-a-chest-press",
    "v2-muscu-a-elevations",
    "v2-muscu-a-curl",
    "v2-muscu-a-presse",
    "v2-muscu-a-leg-curl",
  ],
  "v2-muscu-b": [
    "v2-muscu-b-echauffement",
    "v2-muscu-b-traction",
    "v2-muscu-b-chest-press",
    "v2-muscu-b-developpe-incline",
    "v2-muscu-b-developpe-epaules",
    "v2-muscu-b-elevations",
    "v2-muscu-b-extension-triceps",
    "v2-muscu-b-presse",
  ],
  "v2-muscu-c": [
    "v2-muscu-c-echauffement",
    "v2-muscu-c-suspension",
    "v2-muscu-c-negatives",
    "v2-muscu-c-sprints",
    "v2-muscu-c-montee-banc",
    "v2-muscu-c-rester-bas",
    "v2-muscu-c-pullover",
    "v2-muscu-c-face-pull",
    "v2-muscu-c-curl-marteau",
    "v2-muscu-c-triceps-tete",
  ],
};

/** Les briques dont la consigne change : consigne, note et drapeaux repris du programme. */
const CHANGED = new Set([
  "v2-muscu-a-rowing",
  "v2-muscu-a-chest-press",
  "v2-muscu-b-chest-press",
  "v2-muscu-c-negatives",
  "v2-muscu-c-sprints",
  "v2-muscu-c-montee-banc",
]);

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function withDefinition(block: ExerciseBlock, target: ExerciseBlock): ExerciseBlock {
  const next: ExerciseBlock = { ...block, instructions: structuredClone(target.instructions), position: target.position };
  delete next.notes;
  delete next.outsideFrame;
  delete next.ownReference;
  if (target.notes !== undefined) next.notes = target.notes;
  if (target.outsideFrame) next.outsideFrame = true;
  if (target.ownReference) next.ownReference = true;
  return next;
}

/** Le modèle réorganisé selon le programme du 05/10/2026, ou `undefined` s'il n'a plus les briques semées. */
export function toProgramMuscu20261005(template: SessionTemplate, now: string): SessionTemplate | undefined {
  const before = BLOCKS_BEFORE_20261005[template.id];
  const definition = PROGRAM_V2_TEMPLATES.find((item) => item.id === template.id);
  if (!before || !definition || !sameIds(template.blocks.map((block) => block.id), before)) return undefined;

  const current = new Map(template.blocks.map((block) => [block.id, block]));
  const blocks: SessionBlock[] = definition.blocks.map((target) => {
    const existing = current.get(target.id);
    if (!existing) return structuredClone(target);
    if (existing.kind === "exercise" && target.kind === "exercise" && CHANGED.has(target.id)) return withDefinition(existing, target);
    return { ...existing, position: target.position };
  });
  /* Muscu C (seed 39, 09/10/2026) : son nom et son sous-titre suivent la définition. */
  const naming =
    template.id === "v2-muscu-c"
      ? {
          name: definition.name,
          tags: [...(definition.tags ?? [])],
          ...(definition.subtitle !== undefined ? { subtitle: definition.subtitle } : {}),
          ...(definition.description !== undefined ? { description: definition.description } : {}),
        }
      : {};
  return { ...template, ...naming, blocks, updatedAt: now };
}

const sameSpec = (version: StrengthFrameVersion, spec: FrameSpec20261005) =>
  version.workSets === spec.workSets &&
  version.repRange?.min === spec.repRange.min &&
  version.repRange?.max === spec.repRange.max &&
  version.rpeTarget === spec.rpeTarget &&
  version.restSec === spec.restSec &&
  version.currentTarget === undefined;

/**
 * La nouvelle version d'un cadre aux paramètres du 05/10/2026, à partir de
 * la version active ; `undefined` si elle y est déjà. L'objectif en cours
 * est effacé (ancienne et nouvelle version) ; cran, barre et type gardés.
 */
export function frameVersion20261005(
  active: StrengthFrameVersion,
  number: number,
  spec: FrameSpec20261005,
  now: string,
): { archived: StrengthFrameVersion; next: StrengthFrameVersion } | undefined {
  if (sameSpec(active, spec)) return undefined;
  const archived: StrengthFrameVersion = { ...active, status: "archived", archivedAt: now, archiveReason: "changement_programme", updatedAt: now };
  delete archived.currentTarget;
  const next: StrengthFrameVersion = {
    ...active,
    id: `${active.frameId}-v${number}`,
    number,
    status: "active",
    workSets: spec.workSets,
    repRange: { ...spec.repRange },
    rpeTarget: spec.rpeTarget,
    restSec: spec.restSec,
    createdAt: now,
    updatedAt: now,
  };
  delete next.currentTarget;
  delete next.firstOfficialWorkoutId;
  delete next.frozenAt;
  delete next.archivedAt;
  delete next.archiveReason;
  return { archived, next };
}

async function applyFrame(spec: FrameSpec20261005, now: string): Promise<void> {
  const frame = await db.strengthFrames.where("exerciseId").equals(spec.exerciseId).first();

  if (!frame) {
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
    const created: StrengthFrame = { id: frameId, exerciseId: spec.exerciseId, activeVersionId: version.id, createdAt: now, updatedAt: now };
    await db.strengthFrameVersions.add(version);
    await db.strengthFrames.add(created);
    return;
  }

  const versions = await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray();
  const active = versions.find((version) => version.id === frame.activeVersionId);
  if (!active || active.status !== "active") return;
  const change = frameVersion20261005(active, Math.max(0, ...versions.map((version) => version.number)) + 1, spec, now);
  if (!change) return;
  await db.strengthFrameVersions.put(change.archived);
  await db.strengthFrameVersions.add(change.next);
  await db.strengthFrames.put({ ...frame, activeVersionId: change.next.id, updatedAt: now });
}

/** L'objectif Traction sans le pullover, ou `undefined` s'il ne l'a pas. */
export function tractionGoalWithoutPullover(goal: Goal, now: string): Goal | undefined {
  if (!goal.linkedExercises.some((link) => link.exerciseId === "pullover-poulie")) return undefined;
  return { ...goal, linkedExercises: goal.linkedExercises.filter((link) => link.exerciseId !== "pullover-poulie"), updatedAt: now };
}

export async function seedProgramMuscu20261005(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.sessionTemplates, db.strengthFrames, db.strengthFrameVersions, db.exercises, db.goals, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.programmeMuscu20261005 !== undefined) return;

    for (const id of Object.keys(BLOCKS_BEFORE_20261005)) {
      const template = await db.sessionTemplates.get(id);
      const next = template ? toProgramMuscu20261005(template, now) : undefined;
      if (next) await db.sessionTemplates.put(next);
    }

    for (const spec of PROGRAM_MUSCU_20261005_FRAMES) await applyFrame(spec, now);

    const traction = (await db.goals.where("key").equals("traction").first()) as Goal | undefined;
    const goal = traction ? tractionGoalWithoutPullover(traction, now) : undefined;
    if (goal) await db.goals.put(goal);

    await db.settings.put({ key: "install", value: { ...install, programmeMuscu20261005: now } });
  });
}
