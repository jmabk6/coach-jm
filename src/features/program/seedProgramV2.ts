import { db } from "../../db/database";
import { WEEKLY_PROGRAM_ID } from "../../db/repositories/programRepository";
import type {
  Goal,
  InstallMarkers,
  PlannedSession,
  SessionTemplate,
  StrengthFrame,
  StrengthFrameVersion,
  TestScheduleEntry,
} from "../../domain";
import { formatLocalDate } from "../../domain/rules/programRules";
import { testOf } from "../../domain/rules/testPlanRules";
import { testProtocolId } from "../tests/testProtocolsV1";
import {
  GOAL_LINKS_V2,
  PROGRAM_V2_DAYS,
  PROGRAM_V2_FRAMES,
  PROGRAM_V2_START,
  PROGRAM_V2_TEMPLATES,
  PROGRAM_V2_TEST_SCHEDULE,
  V1_TO_V2,
  type FrameSpecV2,
} from "./programV2";

/**
 * Seed 19 (programme V2, 26/09/2026). En une transaction, au premier
 * lancement qui suit le déploiement :
 *
 * 1. les six modèles `v2-*` s'ajoutent (un id déjà présent est gardé) ;
 * 2. la règle hebdomadaire passe aux modèles V2, jour par jour (un jour
 *    que l'utilisateur a changé pour un autre modèle garde son choix) ;
 * 3. la place des tests traction, cardio et jambes passe aux modèles V2 ;
 * 4. toute séance à venir datée du 04/10 ou après, non démarrée, qui porte
 *    un modèle V1 de musculation ou de cardio, passe au modèle V2 de la même
 *    lettre ; ses tests suivent la nouvelle place. Les séances d'avant le
 *    04/10 (semaine de tests) restent en V1 ;
 * 5. les cadres changent par une **nouvelle version** (motif « changement
 *    de programme »), jamais par écrasement ; un cadre absent est créé ;
 * 6. les exercices liés de Traction, Haut du corps, Jambes et Cardio sont
 *    remplacés (mise à jour explicite de l'utilisateur).
 */

const MUSCLE_AND_CARDIO_V1 = new Set(Object.keys(V1_TO_V2));
const TESTS_MOVED = new Set(["traction", "cardio", "jambes"]);

/* -------------------------------------------------------------------------- */
/* Cadres                                                                     */
/* -------------------------------------------------------------------------- */

function sameFrame(version: StrengthFrameVersion, spec: FrameSpecV2): boolean {
  return (
    version.workSets === spec.workSets &&
    version.repRange?.min === spec.repRange.min &&
    version.repRange?.max === spec.repRange.max &&
    version.restSec === spec.restSec &&
    version.currentTarget?.value === spec.target
  );
}

/** La version suivante d'un cadre, ou la V1 d'un cadre créé, aux paramètres du programme V2. */
export function frameVersionForV2(
  frameId: string,
  number: number,
  spec: FrameSpecV2,
  base: StrengthFrameVersion | undefined,
  now: string,
): StrengthFrameVersion {
  const version: StrengthFrameVersion = {
    id: `${frameId}-v${number}`,
    frameId,
    number,
    status: "active",
    progressionType: base?.progressionType ?? spec.progressionType ?? "charge_croissante",
    workSets: spec.workSets,
    repRange: { ...spec.repRange },
    rpeTarget: base?.rpeTarget ?? 8,
    restSec: spec.restSec,
    createdAt: now,
    updatedAt: now,
  };
  const increment = base ? base.increment : spec.increment !== undefined ? { unit: "kg" as const, value: spec.increment } : undefined;
  if (increment) version.increment = { ...increment };
  if (base?.barWeightKg !== undefined) version.barWeightKg = base.barWeightKg;
  if (spec.target !== undefined) version.currentTarget = { value: spec.target, unit: "kg", acceptedAt: now };
  return version;
}

async function applyFrame(spec: FrameSpecV2, now: string): Promise<void> {
  const frame = await db.strengthFrames.where("exerciseId").equals(spec.exerciseId).first();

  if (!frame) {
    if (!(await db.exercises.get(spec.exerciseId))) return;
    const frameId = `frame-v2-${spec.exerciseId}`;
    const version = frameVersionForV2(frameId, 1, spec, undefined, now);
    const created: StrengthFrame = { id: frameId, exerciseId: spec.exerciseId, activeVersionId: version.id, createdAt: now, updatedAt: now };
    await db.strengthFrameVersions.add(version);
    await db.strengthFrames.add(created);
    return;
  }

  const versions = await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray();
  const current = versions.find((version) => version.id === frame.activeVersionId);
  if (current?.status === "active" && sameFrame(current, spec)) return;

  if (current?.status === "active") {
    const archived: StrengthFrameVersion = { ...current, status: "archived", archivedAt: now, archiveReason: "changement_programme", updatedAt: now };
    delete archived.currentTarget;
    await db.strengthFrameVersions.put(archived);
  }

  const number = Math.max(0, ...versions.map((version) => version.number)) + 1;
  const next = frameVersionForV2(frame.id, number, spec, current ?? versions.at(-1), now);
  await db.strengthFrameVersions.add(next);
  await db.strengthFrames.put({ ...frame, activeVersionId: next.id, updatedAt: now });
}

/* -------------------------------------------------------------------------- */
/* Séances planifiées                                                         */
/* -------------------------------------------------------------------------- */

/** Une séance à venir du 04/10 ou après, sur un modèle V1 : le modèle V2 de la même lettre, ses tests à la place V2. */
export function toProgramV2(session: PlannedSession, now: string): PlannedSession | undefined {
  const next = V1_TO_V2[session.sessionTemplateId];
  if (!next || session.date < PROGRAM_V2_START || session.status !== "upcoming" || session.workoutId || session.removedAt) return undefined;

  const moved: PlannedSession = { ...session, sessionTemplateId: next, updatedAt: now };
  if (session.tests && session.tests.length > 0) {
    moved.tests = session.tests.map((test) => {
      const entry = PROGRAM_V2_TEST_SCHEDULE.find((item) => testProtocolId(item.protocolKey) === test.protocolId);
      if (!entry || !TESTS_MOVED.has(entry.protocolKey)) return test;
      const placed = testOf(entry, test.protocolId);
      return test.rescheduledToPlannedSessionId ? { ...placed, rescheduledToPlannedSessionId: test.rescheduledToPlannedSessionId } : placed;
    });
  }
  return moved;
}

/* -------------------------------------------------------------------------- */
/* Seed                                                                       */
/* -------------------------------------------------------------------------- */

export async function seedProgramV2(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction(
    "rw",
    [db.sessionTemplates, db.weeklyPrograms, db.plannedSessions, db.strengthFrames, db.strengthFrameVersions, db.exercises, db.goals, db.settings],
    async () => {
      const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
      if (install?.programV2 !== undefined) return;

      /* 1. Modèles V2. */
      const existing = await db.sessionTemplates.toArray();
      const present = new Set(existing.map((template) => template.id));
      let position = existing.reduce((max, template) => Math.max(max, template.position), -1);
      for (const content of PROGRAM_V2_TEMPLATES) {
        if (present.has(content.id)) continue;
        position += 1;
        const template: SessionTemplate = { ...structuredClone(content), origin: "program_v2", status: "active", position, createdAt: now, updatedAt: now };
        await db.sessionTemplates.add(template);
      }

      /* 2. Règle hebdomadaire. */
      const program = await db.weeklyPrograms.get(WEEKLY_PROGRAM_ID);
      if (program) {
        const days = program.days.map((day) => {
          const v2 = PROGRAM_V2_DAYS.find((item) => item.weekday === day.weekday);
          return day.sessionTemplateId && MUSCLE_AND_CARDIO_V1.has(day.sessionTemplateId) && v2?.sessionTemplateId
            ? { ...day, sessionTemplateId: v2.sessionTemplateId }
            : day;
        });
        await db.weeklyPrograms.put({ ...program, name: "Programme V2", days, updatedAt: now });
      }

      /* 3. Place des tests. */
      const schedule = (await db.settings.get("testSchedule"))?.value as TestScheduleEntry[] | undefined;
      if (schedule) {
        const next = schedule.map((entry) =>
          TESTS_MOVED.has(entry.protocolKey) ? structuredClone(PROGRAM_V2_TEST_SCHEDULE.find((item) => item.protocolKey === entry.protocolKey)!) : entry,
        );
        await db.settings.put({ key: "testSchedule", value: next });
      }

      /* 4. Séances du 04/10 et après. */
      const future = await db.plannedSessions.where("date").aboveOrEqual(PROGRAM_V2_START).toArray();
      for (const session of future) {
        const moved = toProgramV2(session, now);
        if (moved) await db.plannedSessions.put(moved);
      }

      /* 5. Cadres. */
      for (const spec of PROGRAM_V2_FRAMES) await applyFrame(spec, now);

      /* 6. Exercices liés des objectifs. */
      for (const [key, ids] of Object.entries(GOAL_LINKS_V2)) {
        const goal = (await db.goals.where("key").equals(key).first()) as Goal | undefined;
        if (!goal) continue;
        const secondaryIndicators =
          key === "legs"
            ? goal.secondaryIndicators.filter((indicator) => !(indicator.kind === "exercise" && indicator.exerciseId === "squat"))
            : goal.secondaryIndicators;
        await db.goals.put({ ...goal, linkedExercises: ids.map((exerciseId) => ({ exerciseId })), secondaryIndicators, updatedAt: now });
      }

      await db.settings.put({ key: "install", value: { ...install, programV2: now } });
    },
  );
}

/**
 * Seed 20 : à partir du 04/10, les modèles V1 de musculation et de cardio
 * sont archivés (leur historique reste). Avant cette date, le seed ne fait
 * rien et ne pose pas son marqueur : il réessaie au lancement suivant.
 */
export async function seedArchiveProgramV1(now: string = new Date().toISOString(), today: string = formatLocalDate(new Date())): Promise<void> {
  if (today < PROGRAM_V2_START) return;

  await db.transaction("rw", [db.sessionTemplates, db.settings], async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.archiveProgramV1 !== undefined) return;

    for (const id of MUSCLE_AND_CARDIO_V1) {
      const template = await db.sessionTemplates.get(id);
      if (template && template.status === "active") await db.sessionTemplates.put({ ...template, status: "archived", updatedAt: now });
    }

    await db.settings.put({ key: "install", value: { ...install, archiveProgramV1: now } });
  });
}
