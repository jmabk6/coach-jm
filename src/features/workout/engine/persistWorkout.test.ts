import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSession } from "../../../domain";

const { getWorkout, getInProgressWorkout, saveWorkout, updateWorkout } = vi.hoisted(() => ({
  getWorkout: vi.fn(),
  getInProgressWorkout: vi.fn(),
  saveWorkout: vi.fn(),
  updateWorkout: vi.fn(),
}));

vi.mock("../../../db/repositories/workoutRepository", () => ({
  getWorkout,
  getInProgressWorkout,
  saveWorkout,
  updateWorkout,
}));

import { applyWorkoutAction, recordWorkoutPresence } from "./persistWorkout";
import { pauseWorkout } from "./workoutEngine";

const T0 = "2026-09-17T10:00:00.000Z";

const running: WorkoutSession = {
  id: "w",
  source: "free",
  status: "in_progress",
  date: "2026-09-17",
  startedAt: T0,
  lastActionAt: T0,
  activeDurationSec: 0,
  blocks: [],
  createdAt: T0,
  updatedAt: T0,
};

describe("applyWorkoutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applique le geste et sauvegarde aussitôt le résultat", async () => {
    getWorkout.mockResolvedValue(running);

    const next = await applyWorkoutAction(
      "w",
      (workout, now) => pauseWorkout(workout, now, () => "p1"),
      "2026-09-17T10:05:00.000Z",
    );

    expect(next.pauses).toEqual([{ id: "pause-p1", startedAt: "2026-09-17T10:05:00.000Z" }]);
    expect(saveWorkout).toHaveBeenCalledWith(next);
  });

  it("refuse un geste sur une séance terminée ou introuvable", async () => {
    getWorkout.mockResolvedValue({ ...running, status: "completed" });
    await expect(applyWorkoutAction("w", (w) => w)).rejects.toThrow(/terminée/);

    getWorkout.mockResolvedValue(undefined);
    await expect(applyWorkoutAction("w", (w) => w)).rejects.toThrow(/introuvable/);

    expect(saveWorkout).not.toHaveBeenCalled();
  });
});

describe("recordWorkoutPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enregistre la présence sans toucher à la dernière action", async () => {
    getInProgressWorkout.mockResolvedValue(running);

    const next = await recordWorkoutPresence("2026-09-17T10:00:15.000Z");

    expect(next?.lastSeenAt).toBe("2026-09-17T10:00:15.000Z");
    expect(next?.lastActionAt).toBe(T0);
    expect(updateWorkout).toHaveBeenCalledWith("w", { lastSeenAt: "2026-09-17T10:00:15.000Z" });
    expect(saveWorkout).not.toHaveBeenCalled();
  });

  it("ne fait rien sans séance en cours", async () => {
    getInProgressWorkout.mockResolvedValue(undefined);

    expect(await recordWorkoutPresence()).toBeUndefined();
    expect(updateWorkout).not.toHaveBeenCalled();
  });
});
