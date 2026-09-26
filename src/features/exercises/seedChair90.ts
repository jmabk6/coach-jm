import { db } from "../../db/database";
import type { GroupBlock, InstallMarkers, SessionTemplate } from "../../domain";
import { CHAISE_NOTE } from "../program/programV1";
import { testProtocolVersionId } from "../tests/testProtocolsV1";
import { exerciseCatalog } from "./exerciseCatalog";

/**
 * Seed 16 (décision du 26/09/2026) : la chaise contre le mur se fait à
 * 90°, cuisses parallèles au sol, et non plus à 60°. L'identifiant
 * `chaise-60` reste (des séances et des mesures y renvoient).
 *
 * - Exercice : nom et technique remplacés s'ils sont encore ceux du
 *   catalogue d'origine ; une saisie de l'utilisateur est gardée.
 * - Protocole Jambes : la version 1 est modifiée **sur place**, sans
 *   nouvelle version, tant qu'aucun résultat ne l'a figée (même méthode
 *   que les consignes du lot G) ; sinon elle reste telle quelle.
 * - Muscu C, groupe « Rester bas » : la chaise reçoit sa consigne si elle
 *   n'en a pas.
 */

export const CHAIR_60_NAME = "Chaise contre le mur à 60°";
export const CHAIR_60_TECHNIQUE =
  "Dos plaqué au mur, descends jusqu'à un angle d'environ 60° aux genoux, pieds à plat et genoux au-dessus des chevilles. Tiens la position sans t'appuyer avec les mains.";
export const CHAIR_60_INSTRUCTION =
  "Puis la chaise contre le mur, durée maximale : dos plaqué au mur, genoux fléchis d'environ 60°, moins bas que la position assise.";
export const CHAIR_90_INSTRUCTION =
  "Puis la chaise contre le mur, durée maximale : dos plaqué au mur, cuisses parallèles au sol, genoux au-dessus des chevilles ; arrêt en cas de douleur au genou.";

/**
 * Muscu C avec la consigne de la chaise, si elle n'en avait pas ; sinon
 * `undefined`. Pure : les tests sur sauvegarde réelle en tirent l'attendu.
 */
export function muscuCWithChairNote(template: SessionTemplate, now: string): SessionTemplate | undefined {
  if (template.id !== "v1-muscu-c") return undefined;
  let changed = false;
  const blocks = template.blocks.map((block) => {
    if (block.kind !== "group" || block.id !== "v1-muscu-c-rester-bas") return block;
    const children = block.children.map((child) => {
      if (child.id !== "v1-muscu-c-chaise" || child.notes !== undefined) return child;
      changed = true;
      return { ...child, notes: CHAISE_NOTE };
    });
    return { ...block, children } satisfies GroupBlock;
  });
  return changed ? { ...template, blocks, updatedAt: now } : undefined;
}

export async function seedChair90(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.exercises, db.testProtocolVersions, db.testResults, db.sessionTemplates, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.chair90 !== undefined) return;

    /* L'exercice. */
    const official = exerciseCatalog.find((exercise) => exercise.id === "chaise-60")!;
    const chair = await db.exercises.get("chaise-60");
    if (chair) {
      const next = { ...chair };
      if (chair.name === CHAIR_60_NAME) next.name = official.name;
      if (chair.technique === CHAIR_60_TECHNIQUE && official.technique !== undefined) next.technique = official.technique;
      if (next.name !== chair.name || next.technique !== chair.technique) {
        await db.exercises.put({ ...next, updatedAt: now });
      }
    }

    /* Le protocole Jambes, version 1, sur place tant qu'elle n'est pas figée. */
    const versionId = testProtocolVersionId("jambes", 1);
    const version = await db.testProtocolVersions.get(versionId);
    const results = await db.testResults.where("versionId").equals(versionId).count();
    if (version && version.firstOfficialResultId === undefined && version.frozenAt === undefined && results === 0) {
      const instructions = version.instructions.map((line) => (line === CHAIR_60_INSTRUCTION ? CHAIR_90_INSTRUCTION : line));
      const settings = version.settings?.chairAngleDeg === 60 ? { ...version.settings, chairAngleDeg: 90 } : version.settings;
      if (instructions.some((line, index) => line !== version.instructions[index]) || settings !== version.settings) {
        await db.testProtocolVersions.put({ ...version, instructions, ...(settings ? { settings } : {}), updatedAt: now });
      }
    }

    /* Muscu C, groupe « Rester bas » : la consigne de la chaise. */
    const template = await db.sessionTemplates.get("v1-muscu-c");
    const withNote = template ? muscuCWithChairNote(template, now) : undefined;
    if (withNote) await db.sessionTemplates.put(withNote);

    await db.settings.put({ key: "install", value: { ...install, chair90: now } });
  });
}
