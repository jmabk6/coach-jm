import { describe, expect, it } from "vitest";
import type {
  PlannedSession,
  WeeklyProgram,
} from "../models";
import { generatePlannedSessionsForWeek } from "./programRules";

const program: WeeklyProgram = {
  id: "weekly-program",
  name: "Programme",
  days: [
    {
      weekday: "monday",
      sessionTemplateId: "muscu-a",
    },
    {
      weekday: "wednesday",
      sessionTemplateId: "cardio-a",
    },
    {
      weekday: "friday",
      sessionTemplateId: "mobilite-a",
    },
  ],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

describe("generatePlannedSessionsForWeek", () => {
  it("génère les occurrences de la règle pour une semaine vide", () => {
    const result = generatePlannedSessionsForWeek({
      program,
      weekStartDate: "2026-09-14",
      existingSessions: [],
      now: "2026-09-13T10:00:00.000Z",
    });

    expect(result).toEqual([
      {
        id: "weekly-2026-09-14",
        date: "2026-09-14",
        sessionTemplateId: "muscu-a",
        status: "upcoming",
        sourceWeekday: "monday",
        source: "weekly_program",
        createdAt: "2026-09-13T10:00:00.000Z",
        updatedAt: "2026-09-13T10:00:00.000Z",
      },
      {
        id: "weekly-2026-09-16",
        date: "2026-09-16",
        sessionTemplateId: "cardio-a",
        status: "upcoming",
        sourceWeekday: "wednesday",
        source: "weekly_program",
        createdAt: "2026-09-13T10:00:00.000Z",
        updatedAt: "2026-09-13T10:00:00.000Z",
      },
      {
        id: "weekly-2026-09-18",
        date: "2026-09-18",
        sessionTemplateId: "mobilite-a",
        status: "upcoming",
        sourceWeekday: "friday",
        source: "weekly_program",
        createdAt: "2026-09-13T10:00:00.000Z",
        updatedAt: "2026-09-13T10:00:00.000Z",
      },
    ] satisfies PlannedSession[]);
  });

  it("ne recrée pas une occurrence hebdomadaire déjà existante, même retirée", () => {
    const existingSessions: PlannedSession[] = [
      {
        id: "weekly-2026-09-14",
        date: "2026-09-14",
        sessionTemplateId: "muscu-a",
        status: "upcoming",
        sourceWeekday: "monday",
        source: "weekly_program",
        removedAt: "2026-09-10T10:00:00.000Z",
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-10T10:00:00.000Z",
      },
    ];

    const result = generatePlannedSessionsForWeek({
      program,
      weekStartDate: "2026-09-14",
      existingSessions,
      now: "2026-09-13T10:00:00.000Z",
    });

    expect(result.map((session) => session.date)).toEqual([
      "2026-09-16",
      "2026-09-18",
    ]);
  });

  it("une séance manuelle le même jour ne bloque pas la génération hebdomadaire", () => {
    const existingSessions: PlannedSession[] = [
      {
        id: "manual-1",
        date: "2026-09-14",
        sessionTemplateId: "autre-seance",
        status: "upcoming",
        source: "manual",
        createdAt: "2026-09-12T10:00:00.000Z",
        updatedAt: "2026-09-12T10:00:00.000Z",
      },
    ];

    const result = generatePlannedSessionsForWeek({
      program,
      weekStartDate: "2026-09-14",
      existingSessions,
      now: "2026-09-13T10:00:00.000Z",
    });

    expect(result.map((session) => session.date)).toEqual([
      "2026-09-14",
      "2026-09-16",
      "2026-09-18",
    ]);
  });

  it("ne génère rien pour la semaine en cours ou une semaine passée", () => {
    const currentWeek = generatePlannedSessionsForWeek({
      program,
      weekStartDate: "2026-09-07",
      existingSessions: [],
      now: "2026-09-13T10:00:00.000Z",
    });

    const pastWeek = generatePlannedSessionsForWeek({
      program,
      weekStartDate: "2026-08-31",
      existingSessions: [],
      now: "2026-09-13T10:00:00.000Z",
    });

    expect(currentWeek).toEqual([]);
    expect(pastWeek).toEqual([]);
  });
});