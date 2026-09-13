import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getInProgressWorkout,
  saveWorkout,
} = vi.hoisted(() => ({
  getInProgressWorkout: vi.fn(),
  saveWorkout: vi.fn(),
}));

vi.mock("../../db/repositories/workoutRepository", () => ({
  getInProgressWorkout,
  saveWorkout,
}));

import { startFreeWorkout } from "./startFreeWorkout";

describe("startFreeWorkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInProgressWorkout.mockResolvedValue(undefined);
  });

  it("crée et sauvegarde une séance libre vide", async () => {
    const now = "2026-09-14T18:00:00.000Z";

    const result = await startFreeWorkout(
      "2026-09-14",
      now,
    );

    expect(result).toEqual({
      id: "free-2026-09-14-2026-09-14T18:00:00.000Z",
      source: "free",
      status: "in_progress",
      date: "2026-09-14",
      startedAt: now,
      lastActionAt: now,
      activeDurationSec: 0,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(saveWorkout).toHaveBeenCalledWith(result);
  });

  it("refuse de démarrer une séance libre si une autre séance est déjà en cours", async () => {
    getInProgressWorkout.mockResolvedValue({
      id: "workout-existing",
      status: "in_progress",
    });

    await expect(
      startFreeWorkout(
        "2026-09-14",
        "2026-09-14T18:00:00.000Z",
      ),
    ).rejects.toThrow(
      "Une séance est déjà en cours",
    );

    expect(saveWorkout).not.toHaveBeenCalled();
  });
});