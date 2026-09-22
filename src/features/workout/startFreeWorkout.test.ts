import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getInProgressWorkout,
  saveWorkout,
  getActiveRpeScaleVersion,
  loadActiveFrameVersions,
} = vi.hoisted(() => ({
  getInProgressWorkout: vi.fn(),
  saveWorkout: vi.fn(),
  getActiveRpeScaleVersion: vi.fn(),
  loadActiveFrameVersions: vi.fn(),
}));

vi.mock("../strength/activeFrameVersions", () => ({
  loadActiveFrameVersions,
}));

vi.mock("../../db/repositories/workoutRepository", () => ({
  getInProgressWorkout,
  saveWorkout,
}));

vi.mock("../../db/repositories/rpeScaleRepository", () => ({
  getActiveRpeScaleVersion,
}));

import { startFreeWorkout } from "./startFreeWorkout";

describe("startFreeWorkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInProgressWorkout.mockResolvedValue(undefined);
    getActiveRpeScaleVersion.mockResolvedValue({ id: "rpe-scale-v1" });
    loadActiveFrameVersions.mockResolvedValue({ versionIdByExercise: new Map(), versionById: new Map() });
  });

  it("crée et sauvegarde une séance libre vide", async () => {
    const now = "2026-09-14T18:00:00.000Z";

    const result = await startFreeWorkout(
      "2026-09-14",
      now,
    );

    expect(result).toEqual({
      id: "free-2026-09-14-2026-09-14T18:00:00.000Z",
      kind: "training",
      rpeScaleVersionId: "rpe-scale-v1",
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
describe("startFreeWorkout — nature de la séance (kind)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInProgressWorkout.mockResolvedValue(undefined);
  });

  const now = "2026-09-14T18:00:00.000Z";
  const template = {
    id: "t",
    name: "T",
    category: "Musculation" as const,
    status: "active" as const,
    position: 0,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };

  it("sans modèle ni choix : entraînement, écrit explicitement", async () => {
    const result = await startFreeWorkout("2026-09-14", now);
    expect(result.kind).toBe("training");
  });

  it("sans modèle, avec le choix « Bilan de mobilité » : bilan", async () => {
    const result = await startFreeWorkout("2026-09-14", now, undefined, { kind: "mobility_assessment" });
    expect(result.kind).toBe("mobility_assessment");
    expect(result.blocks).toEqual([]);
  });

  it("avec un modèle : la catégorie du modèle décide, le choix est ignoré", async () => {
    expect((await startFreeWorkout("2026-09-14", now, template, { kind: "mobility_assessment" })).kind).toBe("training");
    expect((await startFreeWorkout("2026-09-14", now, { ...template, category: "Bilan de mobilité" })).kind).toBe("mobility_assessment");
    expect((await startFreeWorkout("2026-09-14", now, { ...template, category: "Mobilité" })).kind).toBe("training");
  });
});

describe("startFreeWorkout depuis un modèle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInProgressWorkout.mockResolvedValue(undefined);
  });

  it("copie les consignes du modèle sans créer d'instance", async () => {
    const now = "2026-09-14T18:00:00.000Z";
    /* Point de capture 1 pour une séance libre depuis un modèle : la version active du cadre. */
    loadActiveFrameVersions.mockResolvedValue({
      versionIdByExercise: new Map([["squat", "v-squat-1"]]),
      versionById: new Map(),
    });

    const result = await startFreeWorkout("2026-09-14", now, {
      id: "muscu-a",
      name: "Muscu A",
      category: "Musculation",
      status: "active",
      position: 0,
      blocks: [
        {
          id: "b1",
          kind: "exercise",
          position: 0,
          exerciseId: "squat",
          instructions: {
            shape: "reps",
            sets: 3,
            reps: { min: 8, max: 10 },
            restBetweenSetsSec: 120,
          },
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    expect(result.source).toBe("free");
    expect(result.sessionTemplateId).toBe("muscu-a");
    expect(result.plannedSessionId).toBeUndefined();
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      kind: "exercise",
      exerciseId: "squat",
      sourceBlockId: "b1",
      addedDuringWorkout: false,
      frameVersionId: "v-squat-1",
    });
  });
});
