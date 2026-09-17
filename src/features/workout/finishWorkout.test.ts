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
  activeRest: {
    id: "rest-1",
    kind: "between_sets",
    targetEndAt: "2026-09-17T16:10:00.000Z",
    plannedDurationSec: 90,
    startedAt: "2026-09-17T16:08:30.000Z",
  },
  createdAt: startedAt,
  updatedAt: startedAt,
};

describe("completeWorkoutSession", () => {
  it("passe la séance Faite, sans repos ni brique courante", () => {
    const result = completeWorkoutSession(freeWorkout, now);

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBe(now);
    expect(result.lastActionAt).toBe(now);
    expect(result.activeDurationSec).toBe(42 * 60);
    expect(result.activeRest).toBeUndefined();
    expect(result.currentBlockId).toBeUndefined();
  });

  it("conserve la durée active déjà accumulée par le moteur", () => {
    const result = completeWorkoutSession(
      { ...freeWorkout, activeDurationSec: 1500 },
      now,
    );

    expect(result.activeDurationSec).toBe(1500);
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
