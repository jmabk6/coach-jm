import { describe, expect, it } from "vitest";
import type { PlannedSession, WorkoutSession } from "../models";
import {
  formatDisplayedPlannedSessionStatus,
  formatDurationSource,
  formatTodayTitle,
  getDisplayedPlannedSessionStatus,
  getTodayState,
  listNextPlannedSessions,
} from "./todayRules";

const today = "2026-09-17";

function plannedSession(
  overrides: Partial<PlannedSession> & Pick<PlannedSession, "id" | "date">,
): PlannedSession {
  return {
    sessionTemplateId: "muscu-a",
    status: "upcoming",
    source: "manual",
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}

function workout(
  overrides: Partial<WorkoutSession> & Pick<WorkoutSession, "id">,
): WorkoutSession {
  const status = overrides.status ?? "completed";

  return {
    source: "free",
    date: today,
    startedAt: "2026-09-17T16:00:00.000Z",
    lastActionAt: "2026-09-17T16:40:00.000Z",
    ...(status === "completed"
      ? { completedAt: "2026-09-17T16:40:00.000Z" }
      : {}),
    activeDurationSec: 2400,
    blocks: [],
    createdAt: "2026-09-17T16:00:00.000Z",
    updatedAt: "2026-09-17T16:40:00.000Z",
    ...overrides,
    status,
  };
}

describe("getDisplayedPlannedSessionStatus", () => {
  it("affiche Non réalisée une séance à venir dont la date est passée", () => {
    const session = plannedSession({ id: "p", date: "2026-09-15" });

    expect(getDisplayedPlannedSessionStatus(session, today)).toBe("not_performed");
    expect(formatDisplayedPlannedSessionStatus(session, today)).toBe("Non réalisée");
  });

  it("affiche Aujourd'hui une séance à venir du jour (D23)", () => {
    const session = plannedSession({ id: "a", date: today });

    expect(getDisplayedPlannedSessionStatus(session, today)).toBe("today");
    expect(formatDisplayedPlannedSessionStatus(session, today)).toBe("Aujourd'hui");
    expect(getDisplayedPlannedSessionStatus({ ...session, status: "skipped" }, today)).toBe("skipped");
    expect(getDisplayedPlannedSessionStatus({ ...session, status: "done" }, today)).toBe("done");
  });

  it("ne change rien aux autres statuts ni aux dates à venir", () => {
    expect(
      getDisplayedPlannedSessionStatus(
        plannedSession({ id: "b", date: "2026-09-20" }),
        today,
      ),
    ).toBe("upcoming");
    expect(
      getDisplayedPlannedSessionStatus(
        plannedSession({ id: "c", date: "2026-09-10", status: "skipped" }),
        today,
      ),
    ).toBe("skipped");
    expect(
      getDisplayedPlannedSessionStatus(
        plannedSession({ id: "d", date: "2026-09-10", status: "done" }),
        today,
      ),
    ).toBe("done");
  });
});

describe("getTodayState", () => {
  it("est un jour de repos sans instance ni réalisation", () => {
    expect(
      getTodayState({ today, plannedSessions: [], workouts: [] }),
    ).toEqual({ kind: "rest", entries: [] });
  });

  it("montre la séance prévue du jour, sautée comprise", () => {
    const upcoming = plannedSession({ id: "p1", date: today });
    const skipped = plannedSession({
      id: "p2",
      date: today,
      status: "skipped",
      createdAt: "2026-09-11T08:00:00.000Z",
    });

    const state = getTodayState({
      today,
      plannedSessions: [skipped, upcoming],
      workouts: [],
    });

    expect(state.kind).toBe("planned");
    expect(state.entries).toEqual([
      { kind: "planned", session: upcoming },
      { kind: "planned", session: skipped },
    ]);
  });

  it("fait passer la séance en cours devant tout le reste", () => {
    const planned = plannedSession({ id: "p1", date: today });
    const free = workout({
      id: "free-1",
      status: "in_progress",
    });

    const state = getTodayState({
      today,
      plannedSessions: [planned],
      workouts: [free],
      inProgressWorkout: free,
    });

    expect(state.kind).toBe("in_progress");
    expect(state.entries[0]).toEqual({
      kind: "in_progress",
      workout: free,
      supplementary: true,
    });
    expect(state.entries[1]).toEqual({ kind: "planned", session: planned });
  });

  it("rattache la séance en cours à son instance", () => {
    const planned = plannedSession({
      id: "p1",
      date: today,
      status: "in_progress",
      workoutId: "workout-p1",
    });
    const running = workout({
      id: "workout-p1",
      source: "planned",
      plannedSessionId: "p1",
      status: "in_progress",
    });

    const state = getTodayState({
      today,
      plannedSessions: [planned],
      workouts: [running],
      inProgressWorkout: running,
    });

    expect(state.entries).toEqual([
      {
        kind: "in_progress",
        workout: running,
        session: planned,
        supplementary: false,
      },
    ]);
  });

  it("garde joignable une séance en cours démarrée un autre jour", () => {
    const running = workout({
      id: "workout-old",
      date: "2026-09-16",
      status: "in_progress",
    });

    const state = getTodayState({
      today,
      plannedSessions: [],
      workouts: [],
      inProgressWorkout: running,
    });

    expect(state.kind).toBe("in_progress");
    expect(state.entries).toHaveLength(1);
  });

  it("distingue la séance faite de la séance supplémentaire", () => {
    const planned = plannedSession({
      id: "p1",
      date: today,
      status: "done",
      workoutId: "workout-p1",
    });
    const done = workout({
      id: "workout-p1",
      source: "planned",
      plannedSessionId: "p1",
    });
    const extra = workout({
      id: "free-1",
      startedAt: "2026-09-17T18:00:00.000Z",
    });

    const state = getTodayState({
      today,
      plannedSessions: [planned],
      workouts: [extra, done],
    });

    expect(state.kind).toBe("completed");
    expect(state.entries).toEqual([
      { kind: "completed", workout: done, session: planned, supplementary: false },
      { kind: "completed", workout: extra, supplementary: true },
    ]);
  });

  it("quitte le repos dès qu'une séance supplémentaire est faite, sans instance", () => {
    const extra = workout({ id: "free-1" });

    const state = getTodayState({
      today,
      plannedSessions: [],
      workouts: [extra],
    });

    expect(state.kind).toBe("completed");
    expect(state.entries).toEqual([
      { kind: "completed", workout: extra, supplementary: true },
    ]);
  });

  it("ignore les instances retirées", () => {
    const removed = plannedSession({
      id: "p1",
      date: today,
      removedAt: "2026-09-16T10:00:00.000Z",
    });

    expect(
      getTodayState({ today, plannedSessions: [removed], workouts: [] }),
    ).toEqual({ kind: "rest", entries: [] });
  });
});

describe("listNextPlannedSessions", () => {
  it("liste les trois prochaines séances à venir après aujourd'hui", () => {
    const sessions = [
      plannedSession({ id: "past", date: "2026-09-15" }),
      plannedSession({ id: "today", date: today }),
      plannedSession({ id: "d4", date: "2026-09-21" }),
      plannedSession({ id: "d1", date: "2026-09-18" }),
      plannedSession({ id: "skipped", date: "2026-09-19", status: "skipped" }),
      plannedSession({ id: "d2", date: "2026-09-19" }),
      plannedSession({
        id: "removed",
        date: "2026-09-19",
        removedAt: "2026-09-16T10:00:00.000Z",
      }),
      plannedSession({ id: "d3", date: "2026-09-20" }),
    ];

    expect(
      listNextPlannedSessions(sessions, today).map((session) => session.id),
    ).toEqual(["d1", "d2", "d3"]);
  });
});

describe("libellés", () => {
  it("écrit la date du jour avec une majuscule", () => {
    expect(formatTodayTitle("2026-09-10")).toBe("Jeudi 10 septembre 2026");
  });

  it("dit d'où vient la durée affichée", () => {
    expect(formatDurationSource("estimated", 0)).toBe(
      "Estimation d'après le contenu de la séance",
    );
    expect(formatDurationSource("average", 5)).toBe(
      "Moyenne de tes 5 séances réalisées",
    );
  });
});
