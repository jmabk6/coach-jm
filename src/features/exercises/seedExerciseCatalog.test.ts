import { beforeEach, describe, expect, it, vi } from "vitest";
import { exerciseCatalog } from "./exerciseCatalog";

const {
  getExercise,
  saveExercise,
} = vi.hoisted(() => ({
  getExercise: vi.fn(),
  saveExercise: vi.fn(),
}));

vi.mock(
  "../../db/repositories/exerciseRepository",
  () => ({
    getExercise,
    saveExercise,
  }),
);

import { seedExerciseCatalog } from "./seedExerciseCatalog";

describe("seedExerciseCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ajoute tous les exercices absents", async () => {
    getExercise.mockResolvedValue(undefined);

    await seedExerciseCatalog();

    expect(getExercise).toHaveBeenCalledTimes(42);
    expect(saveExercise).toHaveBeenCalledTimes(42);

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "squat",
        name: "Squat barre",
      }),
    );

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "test-papillon",
        category: "Test mobilité",
      }),
    );
  });

  it("ne remplace jamais un exercice déjà existant", async () => {
    const existingSquat = {
      ...exerciseCatalog.find(
        (exercise) => exercise.id === "squat",
      )!,
      name: "Mon squat personnalisé",
    };

    getExercise.mockImplementation(
      async (id: string) =>
        id === "squat"
          ? existingSquat
          : undefined,
    );

    await seedExerciseCatalog();

    expect(getExercise).toHaveBeenCalledTimes(42);
    expect(saveExercise).toHaveBeenCalledTimes(41);

    expect(saveExercise).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: "squat",
      }),
    );
  });

  it("n'écrit rien lorsque tout le catalogue existe déjà", async () => {
    getExercise.mockImplementation(
      async (id: string) =>
        exerciseCatalog.find(
          (exercise) => exercise.id === id,
        ),
    );

    await seedExerciseCatalog();

    expect(getExercise).toHaveBeenCalledTimes(42);
    expect(saveExercise).not.toHaveBeenCalled();
  });
});