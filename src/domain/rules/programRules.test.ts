import { describe, expect, it } from "vitest";
import type {
  PlannedSession,
  WeeklyProgram,
} from "../models";
import {
  formatWeekRange,
  generatePlannedSessionsForWeek,
  getWeekStartDate,
  getWeekdayOf,
  isFutureWeek,
  isPlannedSessionPristine,
  listWeekDates,
  listPlannedSessionActions,
  removeTemplateFromWeeklyProgram,
  resyncPlannedSessionsToProgram,
  setWeeklyProgramDay,
} from "./programRules";

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
      weekStartDate: "2026-09-13",
      existingSessions: [],
      now: "2026-09-12T10:00:00.000Z",
    });

    expect(result).toEqual([
      {
        id: "weekly-2026-09-14",
        date: "2026-09-14",
        sessionTemplateId: "muscu-a",
        status: "upcoming",
        sourceWeekday: "monday",
        sourceDate: "2026-09-14",
        source: "weekly_program",
        createdAt: "2026-09-12T10:00:00.000Z",
        updatedAt: "2026-09-12T10:00:00.000Z",
      },
      {
        id: "weekly-2026-09-16",
        date: "2026-09-16",
        sessionTemplateId: "cardio-a",
        status: "upcoming",
        sourceWeekday: "wednesday",
        sourceDate: "2026-09-16",
        source: "weekly_program",
        createdAt: "2026-09-12T10:00:00.000Z",
        updatedAt: "2026-09-12T10:00:00.000Z",
      },
      {
        id: "weekly-2026-09-18",
        date: "2026-09-18",
        sessionTemplateId: "mobilite-a",
        status: "upcoming",
        sourceWeekday: "friday",
        sourceDate: "2026-09-18",
        source: "weekly_program",
        createdAt: "2026-09-12T10:00:00.000Z",
        updatedAt: "2026-09-12T10:00:00.000Z",
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
      weekStartDate: "2026-09-13",
      existingSessions,
      now: "2026-09-12T10:00:00.000Z",
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
      weekStartDate: "2026-09-13",
      existingSessions,
      now: "2026-09-12T10:00:00.000Z",
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
      weekStartDate: "2026-09-13",
      existingSessions: [],
      now: "2026-09-13T10:00:00.000Z",
    });

    const pastWeek = generatePlannedSessionsForWeek({
      program,
      weekStartDate: "2026-09-06",
      existingSessions: [],
      now: "2026-09-13T10:00:00.000Z",
    });

    expect(currentWeek).toEqual([]);
    expect(pastWeek).toEqual([]);
  });
});

describe("dates du Programme", () => {
  it("trouve le dimanche et le jour de la semaine d'une date (lot B : dimanche → samedi)", () => {
    expect(getWeekStartDate("2026-09-10")).toBe("2026-09-06");
    expect(getWeekStartDate("2026-09-12")).toBe("2026-09-06");
    expect(getWeekStartDate("2026-09-13")).toBe("2026-09-13");
    expect(getWeekStartDate("2026-09-14")).toBe("2026-09-13");
    expect(getWeekStartDate("2026-09-26")).toBe("2026-09-20");
    expect(getWeekStartDate("2026-09-27")).toBe("2026-09-27");
    expect(getWeekdayOf("2026-09-10")).toBe("thursday");
    expect(getWeekdayOf("2026-09-13")).toBe("sunday");
    expect(getWeekdayOf("2026-09-19")).toBe("saturday");
    expect(listWeekDates("2026-09-27")).toEqual([
      "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
  });

  it("la semaine du 27/09 est future le samedi 26, en cours dès le dimanche 27", () => {
    expect(isFutureWeek("2026-09-27", "2026-09-26T23:00:00.000Z")).toBe(true);
    expect(isFutureWeek("2026-09-27", "2026-09-27T08:00:00.000Z")).toBe(false);
  });

  it("libelle une semaine, avec les deux mois si elle les chevauche", () => {
    expect(formatWeekRange("2026-09-06")).toBe("Du 6 au 12 septembre 2026");
    expect(formatWeekRange("2026-09-27")).toBe(
      "Du 27 septembre au 3 octobre 2026",
    );
  });
});

describe("génération et instances déplacées", () => {
  it("ne recrée pas la séance au jour d'origine d'une instance déplacée", () => {
    const moved: PlannedSession = {
      id: "weekly-2026-09-14",
      date: "2026-09-15",
      sessionTemplateId: "muscu-a",
      status: "upcoming",
      sourceWeekday: "monday",
      sourceDate: "2026-09-14",
      source: "weekly_program",
      createdAt: "2026-09-13T10:00:00.000Z",
      updatedAt: "2026-09-13T11:00:00.000Z",
    };

    const result = generatePlannedSessionsForWeek({
      program,
      weekStartDate: "2026-09-13",
      existingSessions: [moved],
      now: "2026-09-12T10:00:00.000Z",
    });

    expect(result.map((session) => session.date)).toEqual([
      "2026-09-16",
      "2026-09-18",
    ]);
  });
});

describe("resyncPlannedSessionsToProgram", () => {
  const now = "2026-09-16T10:00:00.000Z";

  function weekly(
    date: string,
    templateId: string,
    overrides: Partial<PlannedSession> = {},
  ): PlannedSession {
    return {
      id: `weekly-${date}`,
      date,
      sessionTemplateId: templateId,
      status: "upcoming",
      sourceWeekday: "monday",
      sourceDate: date,
      source: "weekly_program",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  const next: WeeklyProgram = {
    ...program,
    days: [
      { weekday: "monday", sessionTemplateId: "muscu-b" },
      { weekday: "wednesday" },
      { weekday: "friday", sessionTemplateId: "mobilite-a" },
    ],
  };

  it("met à jour une instance intacte et supprime celle d'un jour vidé", () => {
    const sessions = [
      weekly("2026-09-21", "muscu-a"),
      weekly("2026-09-23", "cardio-a", { sourceWeekday: "wednesday" }),
      weekly("2026-09-25", "mobilite-a", { sourceWeekday: "friday" }),
    ];

    const result = resyncPlannedSessionsToProgram({
      previous: program,
      next,
      sessions,
      now,
    });

    expect(result.deleteIds).toEqual(["weekly-2026-09-23"]);
    expect(result.updates.map((s) => [s.id, s.sessionTemplateId])).toEqual([
      ["weekly-2026-09-21", "muscu-b"],
    ]);
  });

  it("laisse intactes les instances modifiées par l'utilisateur", () => {
    const sessions: PlannedSession[] = [
      weekly("2026-09-21", "muscu-a", { date: "2026-09-22" }),
      weekly("2026-09-28", "cardio-a"),
      weekly("2026-10-05", "muscu-a", { status: "skipped" }),
      weekly("2026-10-12", "muscu-a", { removedAt: now }),
      {
        id: "manual-1",
        date: "2026-10-19",
        sessionTemplateId: "muscu-a",
        status: "upcoming",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
    ];

    const result = resyncPlannedSessionsToProgram({
      previous: program,
      next,
      sessions,
      now,
    });

    expect(result.deleteIds).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("ne touche ni la semaine en cours ni le passé", () => {
    const sessions = [
      weekly("2026-09-14", "muscu-a"),
      weekly("2026-09-07", "muscu-a"),
    ];

    const result = resyncPlannedSessionsToProgram({
      previous: program,
      next,
      sessions,
      now,
    });

    expect(result.deleteIds).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("une instance est intacte seulement si elle est exactement ce que la règle a créé", () => {
    expect(isPlannedSessionPristine(weekly("2026-09-21", "muscu-a"), program)).toBe(true);
    expect(isPlannedSessionPristine(weekly("2026-09-21", "muscu-b"), program)).toBe(false);
    expect(
      isPlannedSessionPristine(
        weekly("2026-09-21", "muscu-a", { workoutId: "w1" }),
        program,
      ),
    ).toBe(false);
  });
});

describe("édition de la règle", () => {
  it("affecte et vide une journée en gardant les sept jours ordonnés", () => {
    const withTuesday = setWeeklyProgramDay(program, "tuesday", "cardio-a", "now");

    expect(withTuesday.days.map((d) => d.weekday)).toEqual([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
    expect(withTuesday.days[2]).toEqual({
      weekday: "tuesday",
      sessionTemplateId: "cardio-a",
    });

    const cleared = setWeeklyProgramDay(withTuesday, "monday", undefined, "now");

    expect(cleared.days[1]).toEqual({ weekday: "monday" });
  });

  it("retire un modèle archivé de toutes ses journées", () => {
    const result = removeTemplateFromWeeklyProgram(program, "muscu-a", "now");

    expect(result.days.find((d) => d.weekday === "monday")).toEqual({
      weekday: "monday",
    });
    expect(result.days.find((d) => d.weekday === "wednesday")).toEqual({
      weekday: "wednesday",
      sessionTemplateId: "cardio-a",
    });
  });
});

describe("listPlannedSessionActions", () => {
  const base: PlannedSession = {
    id: "manual-1",
    date: "2026-09-12",
    sessionTemplateId: "muscu-b",
    status: "upcoming",
    source: "manual",
    createdAt: "now",
    updatedAt: "now",
  };

  it("date le retrait et le grise avec sa raison sur une séance faite", () => {
    const upcoming = listPlannedSessionActions(base);
    expect(upcoming.at(-1)).toEqual({
      action: "remove",
      label: "Retirer du 12 septembre",
    });

    const done = listPlannedSessionActions({ ...base, status: "done" });
    expect(done[0]?.action).toBe("recap");
    expect(done.at(-1)).toMatchObject({
      action: "remove",
      unavailableReason: "Non disponible (séance déjà réalisée)",
    });
    expect(done.map((a) => a.action)).not.toContain("skip");
  });

  it("place Démarrer en premier sur une séance sautée", () => {
    const skipped = listPlannedSessionActions({ ...base, status: "skipped" });
    expect(skipped[0]).toEqual({ action: "start", label: "Démarrer la séance" });
    expect(skipped.map((a) => a.action)).toContain("restore");
  });
});
