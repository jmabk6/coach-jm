import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession, TestCycleSettings } from "../../domain";
import { resyncPlannedSessionsToProgram } from "../../domain/rules/programRules";
import { daysUntilNextTestWeek, eveningRoutineFor, isTestWeek, nextTestWeekStart } from "../../domain/rules/testCycleRules";
import { listTestsToReschedule } from "../../domain/rules/testPlanRules";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { PROGRAM_V1_WEEKLY } from "../program/programV1";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { rescheduleTest } from "./rescheduleTest";

/**
 * Lot G.2 — cycle des tests, tests attachés à la génération, « à
 * replanifier » dérivé (D26), action Replanifier.
 */

const cycle: TestCycleSettings = { anchorWeekStart: "2026-09-27", everyWeeks: 4 };
const NOW = "2026-09-24T10:00:00.000Z";
const T = "2026-09-01T08:00:00.000Z";

describe("cycle (§ 5.9)", () => {
  it("une semaine sur quatre à partir du dimanche 27/09", () => {
    expect(["2026-09-20", "2026-09-27", "2026-10-04", "2026-10-18", "2026-10-25", "2026-11-22"].map((week) => isTestWeek(week, cycle))).toEqual([
      false, true, false, false, true, true,
    ]);
  });

  it("prochaine semaine de tests et « dans N jours »", () => {
    expect(nextTestWeekStart("2026-09-24", cycle)).toBe("2026-09-27");
    expect(nextTestWeekStart("2026-09-30", cycle)).toBe("2026-09-27");
    expect(nextTestWeekStart("2026-10-05", cycle)).toBe("2026-10-25");
    expect(daysUntilNextTestWeek("2026-09-23", cycle)).toBe(4);
    expect(daysUntilNextTestWeek("2026-09-29", cycle)).toBe(0);
  });

  it("routine du soir : la rotation suit les jours (N3)", () => {
    const dates = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-26"];
    expect(dates.map((date) => eveningRoutineFor(PROGRAM_V1_WEEKLY, date))).toEqual([
      "v1-routine-c", "v1-routine-a", "v1-routine-b", "v1-routine-c", "v1-routine-a", "v1-routine-c",
    ]);
  });
});

describe("génération d'une semaine de tests", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  const by = (sessions: PlannedSession[], date: string, slot?: "evening") =>
    sessions.find((session) => session.date === date && (session.slot === "evening") === (slot === "evening"));

  it("semaine du 25/10 : chaque test à sa place", async () => {
    const week = await generateProgramWeek("2026-10-25", NOW);

    expect(by(week, "2026-10-25")).toMatchObject({
      sessionTemplateId: "v1-muscu-a",
      tests: [{ protocolId: "protocol-traction", placement: "after_warmup", adjustments: [{ blockId: "v1-muscu-a-traction", sets: 2 }] }],
    });
    expect(by(week, "2026-10-26")).toMatchObject({ sessionTemplateId: "v1-cardio-b" });
    expect(by(week, "2026-10-26")?.tests).toBeUndefined();
    expect(by(week, "2026-10-26", "evening")).toMatchObject({
      id: "weekly-2026-10-26-evening",
      sessionTemplateId: "v1-routine-c",
      slot: "evening",
      tests: [
        { protocolId: "protocol-souplesse", placement: "replace_all" },
        { protocolId: "protocol-tronc", placement: "replace_all" },
      ],
    });
    expect(by(week, "2026-10-28")).toMatchObject({
      sessionTemplateId: "v1-cardio-a",
      tests: [{ protocolId: "protocol-cardio", placement: "replace_block", targetBlockId: "v1-cardio-a-tapis", targetStepId: "v1-cardio-a-principal-p1" }],
    });
    expect(by(week, "2026-10-29")).toMatchObject({
      sessionTemplateId: "v1-muscu-c",
      tests: [{ protocolId: "protocol-jambes", placement: "replace_block", targetBlockId: "v1-muscu-c-sprints" }],
    });
    /* Mensurations : le matin, hors séance — aucune instance. */
    expect(week.flatMap((session) => session.tests ?? []).map((test) => test.protocolId)).not.toContain("protocol-mensurations");

    expect(await db.plannedSessions.count()).toBe(week.length);
  });

  it("semaine ordinaire : aucun test, aucune instance du soir", async () => {
    const week = await generateProgramWeek("2026-11-01", NOW);
    expect(week.some((session) => session.tests || session.slot === "evening")).toBe(false);
  });

  it("protocole en pause : jamais attaché", async () => {
    await db.testProtocols.update("protocol-jambes", { status: "paused" });
    const week = await generateProgramWeek("2026-10-25", NOW);
    expect(by(week, "2026-10-29")?.tests).toBeUndefined();
  });

  it("instance déjà générée : jamais retouchée ; seconde génération sans doublon", async () => {
    await db.plannedSessions.put({
      id: "weekly-2026-10-25", date: "2026-10-27", sessionTemplateId: "v1-muscu-a", status: "upcoming", source: "weekly_program",
      sourceWeekday: "sunday", sourceDate: "2026-10-25", createdAt: T, updatedAt: T,
    });
    await generateProgramWeek("2026-10-25", NOW);
    expect((await db.plannedSessions.get("weekly-2026-10-25"))?.tests).toBeUndefined();

    const before = await db.plannedSessions.count();
    expect(await generateProgramWeek("2026-10-25", NOW)).toEqual([]);
    expect(await db.plannedSessions.count()).toBe(before);
  });

  it("la règle ne supprime ni ne change une instance qui porte un test, ni une instance du soir", async () => {
    const week = await generateProgramWeek("2026-10-25", NOW);
    const next = { days: PROGRAM_V1_WEEKLY.days.map((day) => (day.weekday === "sunday" || day.weekday === "monday" ? { weekday: day.weekday } : day)) };

    const { deleteIds, updates } = resyncPlannedSessionsToProgram({ previous: PROGRAM_V1_WEEKLY, next, sessions: week, now: NOW });

    expect(deleteIds).toEqual(["weekly-2026-10-26"]);
    expect(updates).toEqual([]);
  });
});

describe("à replanifier (D26), état dérivé", () => {
  const tested = (id: string, date: string, extra: Partial<PlannedSession> = {}): PlannedSession => ({
    id, date, sessionTemplateId: "v1-muscu-c", status: "upcoming", source: "weekly_program", createdAt: T, updatedAt: T,
    tests: [{ protocolId: "protocol-jambes", placement: "after_warmup" }], ...extra,
  });
  const TODAY = "2026-10-31";

  it("sautée, retirée, passée sans être faite, ou faite sans le test ; ni future, ni avec résultat, ni déjà replanifiée", () => {
    const sessions = [
      tested("sautee", "2026-10-29", { status: "skipped" }),
      tested("retiree", "2026-10-29", { removedAt: T }),
      tested("passee", "2026-10-29"),
      tested("faite", "2026-10-29", { status: "done" }),
      tested("future", "2026-11-05"),
      tested("resultat", "2026-10-22"),
      tested("replanifiee", "2026-10-15", { status: "skipped", tests: [{ protocolId: "protocol-jambes", placement: "after_warmup", rescheduledToPlannedSessionId: "x" }] }),
    ];
    const results = [{ protocolId: "protocol-jambes", date: "2026-10-22" }];

    /* « faite » : la séance est faite, mais sans résultat du test ce jour-là (test sauté, I-13). */
    expect(listTestsToReschedule(sessions, results, TODAY).map((item) => item.session.id)).toEqual(["sautee", "retiree", "passee", "faite"]);
    expect(
      listTestsToReschedule(sessions, [...results, { protocolId: "protocol-jambes", date: "2026-10-29" }], TODAY).map((item) => item.session.id),
    ).toEqual([]);
  });
});

describe("Replanifier", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.plannedSessions.bulkPut([
      {
        id: "jeudi", date: "2026-10-29", sessionTemplateId: "v1-muscu-c", status: "skipped", source: "weekly_program", createdAt: T, updatedAt: T,
        tests: [{ protocolId: "protocol-jambes", placement: "after_warmup" }],
      },
      { id: "samedi-c", date: "2026-10-31", sessionTemplateId: "v1-muscu-c", status: "upcoming", source: "manual", createdAt: T, updatedAt: T },
      { id: "samedi-cardio", date: "2026-10-31", sessionTemplateId: "v1-cardio-c", status: "upcoming", source: "weekly_program", createdAt: T, updatedAt: T },
      { id: "faite", date: "2026-10-30", sessionTemplateId: "v1-muscu-c", status: "done", source: "manual", createdAt: T, updatedAt: T },
    ]);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("le test part sur l'autre séance ; l'origine est marquée et n'est plus en retard", async () => {
    await rescheduleTest("jeudi", "protocol-jambes", "samedi-c", NOW);

    expect((await db.plannedSessions.get("samedi-c"))?.tests).toEqual([{ protocolId: "protocol-jambes", placement: "after_warmup" }]);
    expect((await db.plannedSessions.get("jeudi"))?.tests).toEqual([
      { protocolId: "protocol-jambes", placement: "after_warmup", rescheduledToPlannedSessionId: "samedi-c" },
    ]);
    expect(listTestsToReschedule(await db.plannedSessions.toArray(), [], "2026-10-30").map((item) => item.session.id)).toEqual([]);
  });

  it("vers un autre modèle : le test se place après l'échauffement, sans les ajustements du modèle d'origine", async () => {
    await db.plannedSessions.update("jeudi", {
      tests: [{ protocolId: "protocol-cardio", placement: "replace_block", targetBlockId: "v1-cardio-a-principal" }],
    });
    await rescheduleTest("jeudi", "protocol-cardio", "samedi-cardio", NOW);
    expect((await db.plannedSessions.get("samedi-cardio"))?.tests).toEqual([{ protocolId: "protocol-cardio", placement: "after_warmup" }]);
  });

  it("refusé vers une séance faite, ou pour un test déjà replanifié", async () => {
    await expect(rescheduleTest("jeudi", "protocol-jambes", "faite", NOW)).rejects.toThrow(/séance à venir/);
    await rescheduleTest("jeudi", "protocol-jambes", "samedi-c", NOW);
    await expect(rescheduleTest("jeudi", "protocol-jambes", "samedi-cardio", NOW)).rejects.toThrow(/pas à replanifier/);
  });
});
