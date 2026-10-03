import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { WEEKLY_PROGRAM_ID } from "../../db/repositories/programRepository";
import type { Goal, PlannedSession, StrengthFrameVersion, TestScheduleEntry, WorkoutSession } from "../../domain";
import { slotOf } from "../../domain/rules/programRules";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { resumeSeedsForTests, runSeeds, SEEDS_BEFORE_PROGRAM_V2 } from "../seed/runSeeds";
import { generateProgramWeek } from "./generateProgramWeek";
import { CARDIO_A_V2_MAIN_STEP_IDS, GOAL_LINKS_V2, PROGRAM_V2_FRAMES } from "./programV2";
import { seedArchiveProgramV1, seedProgramV2 } from "./seedProgramV2";

/**
 * Seeds 19 et 20 (programme V2, 26/09/2026) : la semaine de tests du
 * 27/09 reste en V1 ; tout ce qui est daté du 04/10 ou après passe en V2 ;
 * les cadres changent par nouvelle version ; les modèles V1 ne sont
 * archivés qu'à partir du 04/10.
 */

const NOW = "2026-09-30T20:00:00.000Z";

async function activeVersion(exerciseId: string): Promise<{ versions: StrengthFrameVersion[]; active: StrengthFrameVersion }> {
  const frame = (await db.strengthFrames.where("exerciseId").equals(exerciseId).first())!;
  const versions = (await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray()).sort((a, b) => a.number - b.number);
  return { versions, active: versions.find((version) => version.id === frame.activeVersionId)! };
}

const dayOn = async (date: string) => (await db.plannedSessions.where("date").equals(date).toArray()).find((session) => slotOf(session) === "day");

describe("seed 19 — le programme V2", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
    vi.restoreAllMocks();
  });

  it("la semaine du 27/09 reste en V1 ; le 04/10 passe en V2 ; la semaine de tests du 25/10 place ses tests en V2 ; une séance démarrée ne bouge pas", async () => {
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2);
    for (const week of ["2026-09-27", "2026-10-04", "2026-10-11", "2026-10-25"]) await generateProgramWeek(week, "2026-09-26T08:00:00.000Z");
    const started = (await dayOn("2026-10-06"))!;
    await db.plannedSessions.put({ ...started, workoutId: "w-demarree" });
    await db.workouts.put({ id: "w-demarree", plannedSessionId: started.id, date: started.date, status: "in_progress" } as unknown as WorkoutSession);

    await seedProgramV2(NOW);

    expect((await dayOn("2026-09-27"))?.sessionTemplateId).toBe("v1-muscu-a");
    expect((await dayOn("2026-10-03"))?.sessionTemplateId).toBe("v1-cardio-c");
    expect((await dayOn("2026-10-04"))?.sessionTemplateId).toBe("v2-muscu-a");
    expect((await dayOn("2026-10-05"))?.sessionTemplateId).toBe("v2-cardio-b");
    expect((await dayOn("2026-10-06"))?.sessionTemplateId).toBe("v1-muscu-b");
    expect((await dayOn("2026-10-08"))?.sessionTemplateId).toBe("v2-muscu-c");

    const sunday = (await dayOn("2026-10-25"))!;
    expect(sunday.sessionTemplateId).toBe("v2-muscu-a");
    /* Pari V6 (05/10) : le test remplace la traction de Muscu A. */
    expect(sunday.tests).toEqual([{ protocolId: "protocol-traction", placement: "replace_block", targetBlockId: "v2-muscu-a-traction" }]);
    expect((await dayOn("2026-10-28"))?.tests).toEqual([
      { protocolId: "protocol-cardio", placement: "replace_block", targetBlockId: "v2-cardio-a-tapis", targetStepIds: CARDIO_A_V2_MAIN_STEP_IDS },
    ]);
    expect((await dayOn("2026-10-29"))?.tests).toEqual([{ protocolId: "protocol-jambes", placement: "replace_block", targetBlockId: "v2-muscu-c-sprints" }]);

    /* Les semaines générées ensuite sont en V2. */
    await generateProgramWeek("2026-11-01", NOW);
    expect((await dayOn("2026-11-03"))?.sessionTemplateId).toBe("v2-muscu-b");
  });

  it("modèles, règle, place des tests, cadres et objectifs ; second passage sans écriture", async () => {
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2);
    const tractionBefore = (await activeVersion("traction-assistee")).active;

    await seedProgramV2(NOW);

    const templates = await db.sessionTemplates.toArray();
    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c", "v2-cardio-a", "v2-cardio-b", "v2-cardio-c"]) {
      expect(templates.find((template) => template.id === id), id).toMatchObject({ origin: "program_v2", status: "active" });
    }
    const program = (await db.weeklyPrograms.get(WEEKLY_PROGRAM_ID))!;
    expect(program.name).toBe("Programme V2");
    expect(program.days.map((day) => day.sessionTemplateId ?? "-")).toEqual(["v2-muscu-a", "v2-cardio-b", "v2-muscu-b", "v2-cardio-a", "v2-muscu-c", "-", "v2-cardio-c"]);
    expect(program.eveningRotation).toEqual(["v1-routine-a", "v1-routine-b", "v1-routine-c"]);
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.map((entry) => `${entry.protocolKey}:${entry.templateId ?? "-"}`)).toEqual([
      "traction:v2-muscu-a",
      "mensurations:-",
      "souplesse:-",
      "tronc:-",
      "cardio:v2-cardio-a",
      "jambes:v2-muscu-c",
    ]);

    /* Traction assistée : inchangée (52 kg d'aide conservé). */
    expect((await activeVersion("traction-assistee")).active).toEqual(tractionBefore);
    /* Un cadre qui change : nouvelle version, l'ancienne archivée « changement de programme ». */
    const chest = await activeVersion("chest-press");
    expect(chest.versions.map((version) => [version.number, version.status])).toEqual([[1, "archived"], [2, "active"]]);
    expect(chest.versions[0]).toMatchObject({ archiveReason: "changement_programme" });
    expect(chest.active).toMatchObject({ workSets: 3, repRange: { min: 8, max: 12 }, restSec: 120, currentTarget: { value: 40, unit: "kg" } });
    for (const spec of PROGRAM_V2_FRAMES) {
      const { active } = await activeVersion(spec.exerciseId);
      expect(active, spec.exerciseId).toMatchObject({ status: "active", workSets: spec.workSets, repRange: spec.repRange, restSec: spec.restSec });
      expect(active.currentTarget?.value, spec.exerciseId).toBe(spec.target);
    }
    /* Cadres créés, sans cible. */
    expect((await activeVersion("face-pull")).active).toMatchObject({ number: 1, progressionType: "charge_croissante", rpeTarget: 8 });

    for (const [key, ids] of Object.entries(GOAL_LINKS_V2)) {
      const goal = (await db.goals.where("key").equals(key).first()) as Goal;
      expect(goal.linkedExercises.map((item) => item.exerciseId), key).toEqual(ids);
    }
    const legs = (await db.goals.where("key").equals("legs").first()) as Goal;
    expect(legs.secondaryIndicators.some((indicator) => indicator.kind === "exercise" && indicator.exerciseId === "squat")).toBe(false);
    /* 27/09/2026 : le leg curl couché remplace le leg curl assis, cadre créé sans cible. */
    expect(legs.secondaryIndicators).toContainEqual({ kind: "exercise", exerciseId: "leg-curl-couche", metric: "chargeMax" });
    expect(legs.secondaryIndicators.some((indicator) => indicator.kind === "exercise" && indicator.exerciseId === "leg-curl-assis")).toBe(false);
    expect((await activeVersion("leg-curl-couche")).active).toMatchObject({ number: 1, workSets: 2, repRange: { min: 10, max: 12 } });
    expect((await activeVersion("leg-curl-couche")).active.currentTarget).toBeUndefined();

    const snapshot = async () => JSON.stringify([await db.sessionTemplates.toArray(), await db.strengthFrameVersions.toArray(), await db.goals.toArray(), await db.weeklyPrograms.toArray()]);
    const before = await snapshot();
    await seedProgramV2("2026-10-01T08:00:00.000Z");
    expect(await snapshot()).toBe(before);
  });

  it("seed 20 : rien avant le 04/10 (et pas de marqueur) ; à partir du 04/10, les modèles V1 de musculation et de cardio sont archivés, les routines non", async () => {
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2);
    await seedProgramV2(NOW);

    await seedArchiveProgramV1(NOW, "2026-10-03");
    expect((await db.sessionTemplates.get("v1-muscu-a"))?.status).toBe("active");
    expect(((await db.settings.get("install"))!.value as { archiveProgramV1?: string }).archiveProgramV1).toBeUndefined();

    await seedArchiveProgramV1("2026-10-04T06:00:00.000Z", "2026-10-04");
    for (const id of ["v1-muscu-a", "v1-muscu-b", "v1-muscu-c", "v1-cardio-a", "v1-cardio-b", "v1-cardio-c"]) {
      expect((await db.sessionTemplates.get(id))?.status, id).toBe("archived");
    }
    expect((await db.sessionTemplates.get("v1-routine-a"))?.status).toBe("active");
    expect((await db.sessionTemplates.get("v2-muscu-a"))?.status).toBe("active");
  });

  const path = process.env.COACH_JM_BACKUP;
  it.skipIf(!path)("sauvegarde réelle : la semaine de tests reste en V1, la règle passe en V2, cadres en nouvelle version, historique intact", async () => {
    const file = parseBackup(await readFile(path!, "utf8"));
    await resetAndRestore(file, db);
    resumeSeedsForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2);
    const planned = await db.plannedSessions.toArray();
    const workouts = await db.workouts.toArray();
    const versionsBefore = await db.strengthFrameVersions.toArray();

    await seedProgramV2(NOW);

    /* Séances faites et semaine de tests : identiques. */
    expect(await db.workouts.toArray()).toEqual(workouts);
    const plannedAfter = await db.plannedSessions.toArray();
    for (const session of planned.filter((item: PlannedSession) => item.date < "2026-10-04")) {
      expect(plannedAfter.find((item) => item.id === session.id), session.id).toEqual(session);
    }
    for (const session of plannedAfter.filter((item) => item.date >= "2026-10-04" && item.status === "upcoming")) {
      expect(session.sessionTemplateId.startsWith("v1-muscu") || session.sessionTemplateId.startsWith("v1-cardio"), session.id).toBe(false);
    }
    /* Aucune version n'est écrasée : chaque version d'avant existe encore, archivée au besoin, paramètres intacts. */
    const versionsAfter = await db.strengthFrameVersions.toArray();
    const params = (version: StrengthFrameVersion) => {
      const copy: Partial<StrengthFrameVersion> = { ...version };
      for (const key of ["status", "updatedAt", "archivedAt", "archiveReason", "currentTarget"] as const) delete copy[key];
      return copy;
    };
    for (const version of versionsBefore) {
      const after = versionsAfter.find((item) => item.id === version.id)!;
      expect(params(after), version.id).toEqual(params(version));
      if (after.status === "archived" && version.status === "active") expect(after.archiveReason, version.id).toBe("changement_programme");
    }
    expect((await db.weeklyPrograms.get(WEEKLY_PROGRAM_ID))?.days.find((day) => day.weekday === "sunday")?.sessionTemplateId).toBe("v2-muscu-a");
  });
});
