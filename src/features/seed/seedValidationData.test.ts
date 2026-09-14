import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  saveExercise,
  saveSessionTemplate,
  saveWeeklyProgram,
  saveWorkout,
} = vi.hoisted(() => ({
  saveExercise: vi.fn(),
  saveSessionTemplate: vi.fn(),
  saveWeeklyProgram: vi.fn(),
  saveWorkout: vi.fn(),
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

vi.mock("../../db/repositories/workoutRepository", () => ({
  saveWorkout,
}));

import { seedValidationData } from "./seedValidationData";

describe("seedValidationData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crée les exercices, Muscu A, le programme et les workouts de validation", async () => {
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

    expect(
      template.blocks.map(
        (block: { kind: string }) => block.kind,
      ),
    ).toEqual([
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

    expect(saveWorkout).toHaveBeenCalledTimes(3);

    expect(saveWorkout).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: "validation-squat-2026-09-01",
        status: "completed",
        date: "2026-09-01",
      }),
    );

    expect(saveWorkout).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "validation-squat-2026-09-07",
        status: "completed",
        date: "2026-09-07",
      }),
    );

    expect(saveWorkout).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: "validation-squat-2026-09-13",
        status: "completed",
        date: "2026-09-13",
      }),
    );
  });
});