import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, SessionTemplate, TestScheduleEntry } from "../../domain";
import { canonicalStringify } from "../backup/canonicalJson";
import { CARDIO_A, CARDIO_A_FORMER, PROGRAM_V1_TEST_SCHEDULE } from "./programV1";

/**
 * Seed 9 — Cardio A en un seul bloc (décision du 24/09/2026) : une séance
 * sur une seule machine est **un** bloc à trois paliers, et le test cardio
 * ne remplace que le palier principal (option b).
 *
 * En une transaction avec le marqueur `install.cardioASingleBlock` :
 * - le modèle installé n'est remplacé que s'il est **exactement** l'ancien
 *   Cardio A en trois blocs — un modèle modifié par l'utilisateur est
 *   laissé tel quel ;
 * - si le modèle est bien en un bloc, l'ancienne place du test cardio
 *   (bloc principal) devient le palier principal, dans la place des tests
 *   et dans les tests déjà attachés aux séances à venir.
 * Les séances réalisées gardent leur instantané : rien ne les touche.
 */

const FORMER_BLOCK_ID = "v1-cardio-a-principal";
const CARDIO_SCHEDULE = PROGRAM_V1_TEST_SCHEDULE.find((entry) => entry.protocolKey === "cardio")!;

const FORMER_CARDIO_SCHEDULE: TestScheduleEntry = {
  protocolKey: "cardio",
  weekday: "wednesday",
  slot: "day",
  templateId: "v1-cardio-a",
  placement: "replace_block",
  targetBlockId: FORMER_BLOCK_ID,
};

function isFormerCardioA(template: SessionTemplate): boolean {
  return (
    template.mainBlockId === CARDIO_A_FORMER.mainBlockId &&
    canonicalStringify(template.blocks) === canonicalStringify(CARDIO_A_FORMER.blocks)
  );
}

export async function seedCardioASingleBlock(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.sessionTemplates, db.settings, db.plannedSessions, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.cardioASingleBlock !== undefined) return;

    let template = await db.sessionTemplates.get(CARDIO_A.id);
    if (template && isFormerCardioA(template)) {
      template = {
        ...template,
        mainBlockId: CARDIO_A.mainBlockId!,
        blocks: structuredClone(CARDIO_A.blocks),
        updatedAt: now,
      };
      await db.sessionTemplates.put(template);
    }

    const singleBlock = template?.blocks.some((block) => block.id === CARDIO_SCHEDULE.targetBlockId) ?? false;

    if (singleBlock) {
      const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
      if (schedule?.some((entry) => canonicalStringify(entry) === canonicalStringify(FORMER_CARDIO_SCHEDULE))) {
        await db.settings.put({
          key: "testSchedule",
          value: schedule.map((entry) =>
            canonicalStringify(entry) === canonicalStringify(FORMER_CARDIO_SCHEDULE) ? structuredClone(CARDIO_SCHEDULE) : entry,
          ),
        });
      }

      const upcoming = await db.plannedSessions.where("status").equals("upcoming").toArray();
      const retargeted: PlannedSession[] = [];
      for (const session of upcoming) {
        if (session.sessionTemplateId !== CARDIO_A.id) continue;
        if (!session.tests?.some((test) => test.targetBlockId === FORMER_BLOCK_ID)) continue;
        retargeted.push({
          ...session,
          tests: session.tests.map((test) =>
            test.targetBlockId === FORMER_BLOCK_ID
              ? { ...test, targetBlockId: CARDIO_SCHEDULE.targetBlockId!, targetStepId: CARDIO_SCHEDULE.targetStepId! }
              : test,
          ),
          updatedAt: now,
        });
      }
      if (retargeted.length > 0) await db.plannedSessions.bulkPut(retargeted);
    }

    await db.settings.put({ key: "install", value: { ...install, cardioASingleBlock: now } });
  });
}
