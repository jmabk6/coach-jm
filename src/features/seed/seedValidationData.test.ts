import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  saveExercise,
  saveSessionTemplate,
  saveWeeklyProgram,
} = vi.hoisted(() => ({
  saveExercise: vi.fn(),
  saveSessionTemplate: vi.fn(),
  saveWeeklyProgram: vi.fn(),
}));

vi.mock("../../db/repositories/exerciseRepository", () => ({
  saveExercise,
}));

vi.mock("../../db/repositories/sessionTemplateRepository", () => ({
  saveSessionTemplate,
}));

vi.mock("../../db/repositories/programRepository", () => ({
  saveWeeklyProgram,
}));

import { seedValidationData } from "./seedValidationData";

describe("seedValidationData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crée les exercices, Muscu A et la règle hebdomadaire de validation", async () => {
    const now = "2026-09-14T08:00:00.000Z";

    await seedValidationData(now);

    expect(saveExercise).toHaveBeenCalledTimes(4);

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "squat",
        name: "Squat",
        mode: "series",
        measurementType: "load_reps",
        status: "active",
      }),
    );

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tirage-vertical",
        name: "Tirage vertical",
        mode: "series",
        measurementType: "load_reps",
        status: "active",
      }),
    );

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "planche",
        name: "Planche",
        mode: "series",
        measurementType: "duration",
        status: "active",
      }),
    );

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tapis",
        name: "Tapis",
        mode: "steps",
        measurementType: "duration_speed_incline",
        status: "active",
      }),
    );

    expect(saveSessionTemplate).toHaveBeenCalledTimes(1);

    expect(saveSessionTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "muscu-a",
        name: "Muscu A",
        category: "Musculation",
        status: "active",
      }),
    );

    const template =
      saveSessionTemplate.mock.calls[0]?.[0];

    expect(template.blocks.map((block: { kind: string }) => block.kind)).toEqual([
      "note",
      "exercise",
      "group",
      "exercise",
    ]);

    expect(saveWeeklyProgram).toHaveBeenCalledTimes(1);

    expect(saveWeeklyProgram).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Programme principal",
      }),
    );

    const program =
      saveWeeklyProgram.mock.calls[0]?.[0];

    expect(program.days).toEqual([
      {
        weekday: "monday",
        sessionTemplateId: "muscu-a",
      },
      { weekday: "tuesday" },
      { weekday: "wednesday" },
      { weekday: "thursday" },
      { weekday: "friday" },
      { weekday: "saturday" },
      { weekday: "sunday" },
    ]);
  });
});