import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PlannedSession,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";

const {
  getPlannedSession,
  savePlannedSession,
  getSessionTemplate,
  getInProgressWorkout,
  saveWorkout,
  getActiveRpeScaleVersion,
} = vi.hoisted(() => ({
  getPlannedSession: vi.fn(),
  savePlannedSession: vi.fn(),
  getSessionTemplate: vi.fn(),
  getInProgressWorkout: vi.fn(),
  saveWorkout: vi.fn(),
  getActiveRpeScaleVersion: vi.fn(),
}));

vi.mock("../../db/repositories/rpeScaleRepository", () => ({
  getActiveRpeScaleVersion,
}));

vi.mock("../../db/repositories/programRepository", () => ({
  getPlannedSession,
  savePlannedSession,
}));

vi.mock("../../db/repositories/sessionTemplateRepository", () => ({
  getSessionTemplate,
}));

vi.mock("../../db/repositories/workoutRepository", () => ({
  getInProgressWorkout,
  saveWorkout,
}));

import { startWorkout } from "./startWorkout";

const plannedSession: PlannedSession = {
  id: "weekly-2026-09-14",
  date: "2026-09-14",
  sessionTemplateId: "muscu-a",
  status: "upcoming",
  sourceWeekday: "monday",
  source: "weekly_program",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const template: SessionTemplate = {
  id: "muscu-a",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [
    {
      id: "exercise-1",
      kind: "exercise",
      position: 0,
      exerciseId: "squat",
      instructions: {
        shape: "reps",
        sets: 3,
        reps: {
          min: 8,
          max: 10,
        },
        restBetweenSetsSec: 90,
      },
    },
  ],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

describe("startWorkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getActiveRpeScaleVersion.mockResolvedValue({ id: "rpe-scale-v1" });
    getPlannedSession.mockResolvedValue(plannedSession);
    getSessionTemplate.mockResolvedValue(template);
    getInProgressWorkout.mockResolvedValue(undefined);
  });

  it("crée et sauvegarde une réalisation à partir d'une séance planifiée", async () => {
    const now = "2026-09-14T18:00:00.000Z";

    const result = await startWorkout(
      plannedSession.id,
      now,
    );

    expect(result).toMatchObject({
      id: "workout-weekly-2026-09-14",
      plannedSessionId: "weekly-2026-09-14",
      sessionTemplateId: "muscu-a",
      kind: "training",
      rpeScaleVersionId: "rpe-scale-v1",
      source: "planned",
      status: "in_progress",
      date: "2026-09-14",
      startedAt: now,
      lastActionAt: now,
      activeDurationSec: 0,
      createdAt: now,
      updatedAt: now,
    } satisfies Partial<WorkoutSession>);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      sourceBlockId: "exercise-1",
      kind: "exercise",
      exerciseId: "squat",
      status: "not_performed",
    });

    expect(saveWorkout).toHaveBeenCalledWith(result);

    expect(savePlannedSession).toHaveBeenCalledWith({
      ...plannedSession,
      status: "in_progress",
      workoutId: result.id,
      updatedAt: now,
    });
  });

  it("sans échelle de RPE en base, la séance n'en référence aucune (clé absente)", async () => {
    getActiveRpeScaleVersion.mockResolvedValue(undefined);

    const result = await startWorkout(plannedSession.id, "2026-09-14T18:00:00.000Z");

    expect(result).not.toHaveProperty("rpeScaleVersionId");
    expect(result.kind).toBe("training");
  });

  it("pose kind depuis la catégorie du modèle, sans choix : un modèle « Bilan de mobilité » donne un bilan", async () => {
    getSessionTemplate.mockResolvedValue({ ...template, id: "bilan", name: "Bilan", category: "Bilan de mobilité" });
    getPlannedSession.mockResolvedValue({ ...plannedSession, sessionTemplateId: "bilan" });

    const result = await startWorkout(plannedSession.id, "2026-09-14T18:00:00.000Z");

    expect(result.kind).toBe("mobility_assessment");
    expect(result.source).toBe("planned");
    expect(saveWorkout).toHaveBeenCalledWith(result);
  });

  it("refuse de démarrer une autre séance si une réalisation est déjà en cours", async () => {
    getInProgressWorkout.mockResolvedValue({
      id: "workout-existing",
      status: "in_progress",
    });

    await expect(
      startWorkout(
        plannedSession.id,
        "2026-09-14T18:00:00.000Z",
      ),
    ).rejects.toThrow(
      "Une séance est déjà en cours",
    );

    expect(saveWorkout).not.toHaveBeenCalled();
    expect(savePlannedSession).not.toHaveBeenCalled();
  });

  it("refuse une occurrence retirée du Programme", async () => {
    getPlannedSession.mockResolvedValue({
      ...plannedSession,
      removedAt: "2026-09-13T10:00:00.000Z",
    });

    await expect(
      startWorkout(
        plannedSession.id,
        "2026-09-14T18:00:00.000Z",
      ),
    ).rejects.toThrow(
      "Cette séance a été retirée du Programme",
    );

    expect(saveWorkout).not.toHaveBeenCalled();
  });
});