import "fake-indexeddb/auto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { WEEKLY_PROGRAM_ID } from "../../db/repositories/programRepository";
import type { ExerciseBlock, SessionTemplate, TestScheduleEntry, WeeklyProgram } from "../../domain";
import { getWeekStartDate, listWeekDates } from "../../domain/rules/programRules";
import { EMPTY_ROUTINE_REASON, startBlockedReason } from "../../domain/rules/sessionTemplateRules";
import { canonicalStringify } from "../backup/canonicalJson";
import { WRITE_METHODS, writePrototypeOf } from "../backup/testDatabase";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { runSeeds, resumeSeedsForTests } from "../seed/runSeeds";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { generateProgramWeek } from "./generateProgramWeek";
import { PROGRAM_V1_ROUTINES, PROGRAM_V1_TEMPLATES, PROGRAM_V1_TEST_SCHEDULE } from "./programV1";
import { seedProgramV1, seedRoutines } from "./seedProgramV1";

/**
 * Lot D.5 — seed 5 (programme V1 : 6 modèles, règle hebdomadaire, place
 * des tests) et seed 6 (3 routines vides). Marqueurs ; brouillon intact ;
 * règle existante jamais écrasée ; semaine générée du dimanche au samedi.
 */

const NOW = "2026-09-24T10:00:00.000Z";
const V1_IDS = ["v1-muscu-a", "v1-muscu-b", "v1-muscu-c", "v1-cardio-a", "v1-cardio-b", "v1-cardio-c"];
const ROUTINE_IDS = ["v1-routine-a", "v1-routine-b", "v1-routine-c"];

const draft: SessionTemplate = {
  id: "2b1c-brouillon",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [],
  createdAt: "2026-09-10T08:00:00.000Z",
  updatedAt: "2026-09-10T08:00:00.000Z",
};

beforeEach(async () => {
  resumeSeedsForTests();
  db.close();
  await db.delete();
  await db.open();
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  db.close();
  await db.delete();
});

function spyWrites() {
  const proto = writePrototypeOf(db);
  return WRITE_METHODS.map((method) => vi.spyOn(proto, method));
}

function exerciseBlocksOf(template: Pick<SessionTemplate, "blocks">): ExerciseBlock[] {
  return template.blocks.flatMap((block) =>
    block.kind === "exercise"
      ? [block]
      : block.kind === "group"
        ? block.children.map((child) => ({ id: child.id, kind: "exercise" as const, position: 0, exerciseId: child.exerciseId, instructions: { shape: "reps" as const, sets: 1, reps: { min: 1, max: 1 }, restBetweenSetsSec: 0 } }))
        : [],
  );
}

describe("contenu du programme V1", () => {
  it("chaque exercice référencé existe au catalogue ; positions consécutives ; ids de bloc uniques", () => {
    const catalogIds = new Set(exerciseCatalog.map((exercise) => exercise.id));

    for (const template of PROGRAM_V1_TEMPLATES) {
      expect(template.blocks.map((block) => block.position), template.id).toEqual(template.blocks.map((_, index) => index));
      for (const block of exerciseBlocksOf(template)) {
        expect(catalogIds.has(block.exerciseId), `${template.id} → ${block.exerciseId}`).toBe(true);
      }
    }
    const allBlockIds = PROGRAM_V1_TEMPLATES.flatMap((template) => template.blocks.map((block) => block.id));
    expect(new Set(allBlockIds).size).toBe(allBlockIds.length);
  });

  it("chaque muscu commence par une vraie brique d'échauffement ; leg curl de Muscu C à 2 séries (N5)", () => {
    for (const id of ["v1-muscu-a", "v1-muscu-b", "v1-muscu-c"]) {
      const first = PROGRAM_V1_TEMPLATES.find((template) => template.id === id)!.blocks[0];
      expect(first, id).toMatchObject({ kind: "exercise", role: "warmup", exerciseId: "tapis" });
    }
    const legCurl = PROGRAM_V1_TEMPLATES.find((t) => t.id === "v1-muscu-c")!.blocks.find((b) => b.id === "v1-muscu-c-leg-curl");
    expect(legCurl).toMatchObject({ exerciseId: "leg-curl-assis", instructions: { sets: 2, reps: { min: 12, max: 12 } } });
  });

  it("la place des tests et le bloc principal de Cardio A pointent vers des blocs existants", () => {
    const blocksById = new Map(PROGRAM_V1_TEMPLATES.flatMap((template) => template.blocks.map((block) => [block.id, template.id] as const)));
    const cardioA = PROGRAM_V1_TEMPLATES.find((template) => template.id === "v1-cardio-a")!;
    expect(blocksById.get(cardioA.mainBlockId!)).toBe("v1-cardio-a");

    for (const entry of PROGRAM_V1_TEST_SCHEDULE) {
      if (entry.targetBlockId) expect(blocksById.get(entry.targetBlockId), entry.protocolKey).toBe(entry.templateId);
      for (const adjustment of entry.adjustments ?? []) expect(blocksById.get(adjustment.blockId), entry.protocolKey).toBe(entry.templateId);
    }
    expect(PROGRAM_V1_TEST_SCHEDULE.map((entry) => entry.protocolKey)).toEqual(["traction", "mensurations", "souplesse", "tronc", "cardio", "jambes"]);
  });
});

describe("seeds 5 et 6 sur une base neuve", () => {
  it("installe les modèles, les routines, la règle et la place des tests ; second passage sans écriture", async () => {
    await runSeeds();

    const templates = await db.sessionTemplates.orderBy("position").toArray();
    expect(templates.map((template) => template.id)).toEqual([...V1_IDS, ...ROUTINE_IDS]);
    expect(templates.every((template) => template.origin === "program_v1" && template.status === "active")).toBe(true);
    expect(templates.filter((template) => template.category === "Routine").every((template) => template.blocks.length === 0)).toBe(true);

    const program = (await db.weeklyPrograms.get(WEEKLY_PROGRAM_ID)) as WeeklyProgram;
    expect(program.days.map((day) => [day.weekday, day.sessionTemplateId])).toEqual([
      ["sunday", "v1-muscu-a"],
      ["monday", "v1-cardio-b"],
      ["tuesday", "v1-muscu-b"],
      ["wednesday", "v1-cardio-a"],
      ["thursday", "v1-muscu-c"],
      ["friday", undefined],
      ["saturday", "v1-cardio-c"],
    ]);
    expect(program.eveningRotation).toEqual(ROUTINE_IDS);

    expect((await db.settings.get("testSchedule"))?.value).toEqual(PROGRAM_V1_TEST_SCHEDULE);
    expect((await db.settings.get("install"))?.value).toMatchObject({ programV1: expect.any(String), routines: expect.any(String) });

    const before = canonicalStringify(await db.sessionTemplates.toArray());
    const spies = spyWrites();
    await runSeeds();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(canonicalStringify(await db.sessionTemplates.toArray())).toBe(before);
  });

  it("semaine future générée du dimanche au samedi : Muscu A le dimanche, rien le vendredi", async () => {
    await runSeeds();
    /* La semaine qui suit celle du 24/09 : dimanche 27/09. */
    const nextWeek = getWeekStartDate("2026-10-01");
    expect(nextWeek).toBe("2026-09-27");

    const all = await generateProgramWeek(nextWeek, NOW);
    /* 27/09 ouvre la première semaine de tests : le lundi soir porte en plus la Souplesse et le Tronc (lot G.2). */
    const generated = all.filter((session) => session.slot !== "evening");
    expect(all.filter((session) => session.slot === "evening").map((session) => session.date)).toEqual(["2026-09-28"]);
    const byDate = new Map(generated.map((session) => [session.date, session.sessionTemplateId]));
    const [sunday, , , , , friday, saturday] = listWeekDates(nextWeek);

    expect(new Date(`${sunday}T12:00:00`).getDay()).toBe(0);
    expect(byDate.get(sunday!)).toBe("v1-muscu-a");
    expect(byDate.get(friday!)).toBeUndefined();
    expect(byDate.get(saturday!)).toBe("v1-cardio-c");
    expect(generated).toHaveLength(6);
  });
});

describe("existant : jamais écrasé", () => {
  it("brouillon « Muscu A » intact ; les modèles V1 viennent à côté, après lui", async () => {
    await db.sessionTemplates.add(draft);
    await seedProgramV1(NOW);

    expect(await db.sessionTemplates.get(draft.id)).toEqual(draft);
    const v1 = await db.sessionTemplates.where("id").anyOf(V1_IDS).toArray();
    expect(v1).toHaveLength(6);
    expect(Math.min(...v1.map((template) => template.position))).toBeGreaterThan(draft.position);
  });

  it("règle hebdomadaire et place des tests existantes : conservées, rien n'est fusionné", async () => {
    const mine: WeeklyProgram = { id: WEEKLY_PROGRAM_ID, name: "Ma semaine", days: [{ weekday: "monday", sessionTemplateId: draft.id }], createdAt: "x", updatedAt: "x" };
    const mySchedule: TestScheduleEntry[] = [{ protocolKey: "traction", weekday: "saturday", slot: "day" }];
    await db.weeklyPrograms.put(mine);
    await db.settings.put({ key: "testSchedule", value: mySchedule });

    await seedProgramV1(NOW);

    expect(await db.weeklyPrograms.get(WEEKLY_PROGRAM_ID)).toEqual(mine);
    expect((await db.settings.get("testSchedule"))?.value).toEqual(mySchedule);
  });

  it("un modèle V1 déjà présent (même id) est conservé tel quel", async () => {
    const edited = { ...draft, id: "v1-muscu-a", name: "Muscu A modifiée par moi", position: 3 };
    await db.sessionTemplates.add(edited);
    await seedProgramV1(NOW);
    expect(await db.sessionTemplates.get("v1-muscu-a")).toEqual(edited);
  });

  it("marqueur posé : un modèle supprimé ou une règle retirée ne sont pas réinstallés", async () => {
    await seedProgramV1(NOW);
    await seedRoutines(NOW);
    await db.sessionTemplates.delete("v1-cardio-b");
    await db.sessionTemplates.delete("v1-routine-c");
    await db.weeklyPrograms.delete(WEEKLY_PROGRAM_ID);

    await seedProgramV1(NOW);
    await seedRoutines(NOW);

    expect(await db.sessionTemplates.get("v1-cardio-b")).toBeUndefined();
    expect(await db.sessionTemplates.get("v1-routine-c")).toBeUndefined();
    expect(await db.weeklyPrograms.get(WEEKLY_PROGRAM_ID)).toBeUndefined();
  });
});

describe("routines vides : non démarrables, raison affichée", () => {
  it("« Contenu à définir » ; un modèle vide ordinaire garde sa raison habituelle", async () => {
    const routine = { ...PROGRAM_V1_ROUTINES[0]!, status: "active" as const, position: 0, createdAt: NOW, updatedAt: NOW };
    expect(startBlockedReason(routine)).toBe(EMPTY_ROUTINE_REASON);
    expect(startBlockedReason(draft)).toBe("Ajoutez au moins une brique pour démarrer");
    expect(startBlockedReason(PROGRAM_V1_TEMPLATES[0]!)).toBeUndefined();

    await expect(startFreeWorkout("2026-09-24", NOW, routine)).rejects.toThrow(/Contenu à définir/);
    expect(await db.workouts.count()).toBe(0);
  });
});
