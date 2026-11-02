import { db } from "../../db/database";
import type { Goal, InstallMarkers, SessionTemplate, TestProtocolVersion } from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { coreGoalV4, EPAULE_BLOCK_ID, EXTENSION_BLOCK_ID, EXTENSION_HAUT_DOS_ID, flexibilityGoalV4, ROUTINE_B_V4_ID, routineExercisesV4, ROUTINES_V1_IDS, ROUTINES_V4_TEMPLATES, SOUPLESSE_V4, TRONC_V4 } from "./programRoutinesV4";
import { PROGRAM_V4_START } from "./programV4";

/**
 * Seed 52 (programme V4, lot L5) — les routines du soir V4, **à partir du
 * dimanche d'activation seulement** (avant : rien, aucun marqueur) :
 * exercices créés (pallof élastique, ischios avec sangle, hanches 90/90,
 * glissés au mur, extension du haut du dos), routines A, B et C V4 créées,
 * anciennes routines archivées (historique conservé). Passe avant le
 * calendrier V4 (seed 51), qui les affecte aux soirs.
 *
 * Indicateurs (spec § 3.4) : protocole Souplesse (mains dans le dos,
 * papillon, ischio allongé en degrés ; doigts-sol facultatif) et Tronc
 * (planche latérale facultative) — sur place tant qu'aucun résultat ne fige
 * la version, sinon version suivante (les anciens résultats gardent la
 * leur) ; objectifs Tronc et Souplesse mis à jour.
 */

type ProtocolContent = Pick<TestProtocolVersion, "instructions" | "measures" | "primaryMeasureKey">;

/** La version active du protocole, révisée : sur place si elle n'est pas figée, sinon une nouvelle version. */
async function reviseProtocol(protocolId: string, content: ProtocolContent, now: string): Promise<void> {
  const protocol = await db.testProtocols.get(protocolId);
  const active = protocol ? await db.testProtocolVersions.get(protocol.activeVersionId) : undefined;
  if (!protocol || !active) return;
  const patch = structuredClone(content);
  if (active.firstOfficialResultId === undefined) {
    await db.testProtocolVersions.put({ ...active, ...patch, updatedAt: now });
    return;
  }
  const versions = await db.testProtocolVersions.where("protocolId").equals(protocolId).toArray();
  const number = Math.max(...versions.map((version) => version.number)) + 1;
  const next: TestProtocolVersion = { ...structuredClone(active), ...patch, id: `${protocol.id}-v${number}`, number, status: "active", createdAt: now, updatedAt: now };
  delete next.firstOfficialResultId;
  delete next.frozenAt;
  await db.testProtocolVersions.bulkPut([{ ...active, status: "archived", updatedAt: now }, next]);
  await db.testProtocols.put({ ...protocol, activeVersionId: next.id, updatedAt: now });
}
export async function seedRoutinesV4(now: string = new Date().toISOString()): Promise<void> {
  if (formatLocalDate(new Date(now)) < PROGRAM_V4_START) return;
  await db.transaction("rw", [db.sessionTemplates, db.exercises, db.settings, db.testProtocols, db.testProtocolVersions, db.goals], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.routinesV4 !== undefined) return;

    for (const exercise of routineExercisesV4(now)) {
      if (!(await db.exercises.get(exercise.id))) await db.exercises.add(exercise);
    }

    const templates = (await db.sessionTemplates.toArray()) as SessionTemplate[];
    const old = new Map(templates.map((template) => [template.id, template]));
    let position = Math.max(0, ...templates.map((template) => template.position)) + 1;
    /* À la place des anciennes routines dans la liste (elles passent à la fin), sinon à la fin. */
    for (const [index, content] of ROUTINES_V4_TEMPLATES.entries()) {
      if (old.has(content.id)) continue;
      const previous = old.get(ROUTINES_V1_IDS[index]!);
      await db.sessionTemplates.add({ ...structuredClone(content), status: "active", position: previous?.position ?? position++, createdAt: now, updatedAt: now } as SessionTemplate);
    }
    for (const id of ROUTINES_V1_IDS) {
      const template = old.get(id);
      if (template && template.status !== "archived") await db.sessionTemplates.put({ ...template, status: "archived", position: position++, updatedAt: now });
    }

    await reviseProtocol("protocol-souplesse", SOUPLESSE_V4, now);
    await reviseProtocol("protocol-tronc", TRONC_V4, now);
    const flexibility = (await db.goals.where("key").equals("flexibility").first()) as Goal | undefined;
    if (flexibility) await db.goals.put(flexibilityGoalV4(flexibility, now));
    const core = (await db.goals.where("key").equals("core").first()) as Goal | undefined;
    if (core) await db.goals.put(coreGoalV4(core, now));

    await db.settings.put({ key: "install", value: { ...install, routinesV4: now } });
  });
}

/**
 * Seed 53 (02/11/2026) — Routine B V4 : l'extension du haut du dos (que JM
 * n'aime pas) est remplacée par l'étirement de l'épaule, main dans le dos
 * (2 × 30 s par côté), à la même place ; l'objectif Souplesse suit. Rien si
 * la routine n'a plus cette brique. Les séances faites ne bougent pas.
 */
export async function seedRoutineBEpaule20261102(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", [db.sessionTemplates, db.goals, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.routineBEpaule20261102 !== undefined) return;
    const definition = ROUTINES_V4_TEMPLATES.find((item) => item.id === ROUTINE_B_V4_ID)!;
    const replacement = definition.blocks.find((block) => block.id === EPAULE_BLOCK_ID)!;
    const routine = (await db.sessionTemplates.get(ROUTINE_B_V4_ID)) as SessionTemplate | undefined;
    if (routine && routine.blocks.some((block) => block.id === EXTENSION_BLOCK_ID)) {
      const blocks = routine.blocks.map((block) => (block.id === EXTENSION_BLOCK_ID ? { ...structuredClone(replacement), position: block.position } : block));
      await db.sessionTemplates.put({ ...routine, blocks, updatedAt: now });
    }
    const flexibility = (await db.goals.where("key").equals("flexibility").first()) as Goal | undefined;
    if (flexibility && flexibility.linkedExercises.some((link) => link.exerciseId === EXTENSION_HAUT_DOS_ID)) {
      await db.goals.put({ ...flexibility, linkedExercises: flexibility.linkedExercises.map((link) => (link.exerciseId === EXTENSION_HAUT_DOS_ID ? { exerciseId: "etirement-epaule-main-dos" } : link)), updatedAt: now });
    }
    await db.settings.put({ key: "install", value: { ...install, routineBEpaule20261102: now } });
  });
}
