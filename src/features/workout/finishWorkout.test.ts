import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannedSession, WorkoutSession } from "../../domain";

const { getWorkout, saveWorkout, getPlannedSession, savePlannedSession } =
  vi.hoisted(() => ({
    getWorkout: vi.fn(),
    saveWorkout: vi.fn(),
    getPlannedSession: vi.fn(),
    savePlannedSession: vi.fn(),
  }));

vi.mock("../../db/repositories/workoutRepository", () => ({
  getWorkout,
  saveWorkout,
}));

vi.mock("../../db/repositories/programRepository", () => ({
  getPlannedSession,
  savePlannedSession,
}));

import { completeWorkoutSession, finishWorkout } from "./finishWorkout";

const startedAt = "2026-09-17T16:00:00.000Z";
const now = "2026-09-17T16:42:00.000Z";

const freeWorkout: WorkoutSession = {
  id: "free-1",
  source: "free",
  status: "in_progress",
  date: "2026-09-17",
  startedAt,
  lastActionAt: startedAt,
  activeDurationSec: 0,
  blocks: [],
  currentBlockId: "b1",
  pauses: [
    { id: "pause-1", startedAt: "2026-09-17T16:20:00.000Z", endedAt: "2026-09-17T16:30:00.000Z" },
  ],
  createdAt: startedAt,
  updatedAt: startedAt,
};

describe("completeWorkoutSession", () => {
  it("passe la séance Faite, durée active = amplitude moins les pauses", () => {
    const result = completeWorkoutSession(freeWorkout, now);

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBe(now);
    expect(result.lastActionAt).toBe(now);
    expect(result.activeDurationSec).toBe(42 * 60 - 10 * 60);
    expect(result.activeRest).toBeUndefined();
    expect(result.currentBlockId).toBeUndefined();
  });

  it("termine à la clôture une pause encore ouverte", () => {
    const result = completeWorkoutSession(
      {
        ...freeWorkout,
        pauses: [{ id: "pause-1", startedAt: "2026-09-17T16:30:00.000Z" }],
      },
      now,
    );

    expect(result.pauses).toEqual([
      { id: "pause-1", startedAt: "2026-09-17T16:30:00.000Z", endedAt: now },
    ]);
    expect(result.activeDurationSec).toBe(30 * 60);
  });
});

describe("completeWorkoutSession — nature conservée", () => {
  it("garde kind tel quel à la clôture, et n'en invente pas sur une séance qui n'en a pas", () => {
    expect(completeWorkoutSession({ ...freeWorkout, kind: "mobility_assessment" }, now).kind).toBe("mobility_assessment");
    expect(completeWorkoutSession({ ...freeWorkout, kind: "training" }, now).kind).toBe("training");
    expect("kind" in completeWorkoutSession(freeWorkout, now)).toBe(false);
  });
});

describe("finishWorkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("termine une séance libre sans toucher au Programme", async () => {
    getWorkout.mockResolvedValue(freeWorkout);

    const result = await finishWorkout("free-1", now);

    expect(saveWorkout).toHaveBeenCalledWith(result);
    expect(result.status).toBe("completed");
    expect(getPlannedSession).not.toHaveBeenCalled();
    expect(savePlannedSession).not.toHaveBeenCalled();
  });

  it("passe l'instance Faite pour une séance planifiée", async () => {
    const plannedSession: PlannedSession = {
      id: "p1",
      date: "2026-09-17",
      sessionTemplateId: "muscu-a",
      status: "in_progress",
      workoutId: "workout-p1",
      source: "manual",
      createdAt: startedAt,
      updatedAt: startedAt,
    };

    getWorkout.mockResolvedValue({
      ...freeWorkout,
      id: "workout-p1",
      source: "planned",
      plannedSessionId: "p1",
      sessionTemplateId: "muscu-a",
    });
    getPlannedSession.mockResolvedValue(plannedSession);

    await finishWorkout("workout-p1", now);

    expect(savePlannedSession).toHaveBeenCalledWith({
      ...plannedSession,
      status: "done",
      workoutId: "workout-p1",
      updatedAt: now,
    });
  });

  it("refuse de terminer deux fois", async () => {
    getWorkout.mockResolvedValue({ ...freeWorkout, status: "completed" });

    await expect(finishWorkout("free-1", now)).rejects.toThrow(
      "Cette séance est déjà terminée",
    );
    expect(saveWorkout).not.toHaveBeenCalled();
  });
});
