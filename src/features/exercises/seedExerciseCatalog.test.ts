import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "../../domain";
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

  it("complète les métadonnées absentes d'un exercice existant", async () => {
    const catalogSquat = exerciseCatalog.find(
      (exercise) => exercise.id === "squat",
    )!;

    const existingSquat: Exercise = {
      ...catalogSquat,
      name: "Mon squat personnalisé",
    };

    delete existingSquat.technique;
    delete existingSquat.description;
    delete existingSquat.advice;
    delete existingSquat.muscles;

    getExercise.mockImplementation(
      async (id: string) =>
        id === "squat"
          ? existingSquat
          : exerciseCatalog.find(
              (exercise) => exercise.id === id,
            ),
    );

    await seedExerciseCatalog();

    expect(saveExercise).toHaveBeenCalledTimes(1);

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "squat",
        name: "Mon squat personnalisé",
        technique: catalogSquat.technique,
        description: catalogSquat.description,
        advice: catalogSquat.advice,
        muscles: catalogSquat.muscles,
      }),
    );
  });

  it("ne remplace jamais les métadonnées déjà personnalisées", async () => {
    const catalogSquat = exerciseCatalog.find(
      (exercise) => exercise.id === "squat",
    )!;

    const existingSquat: Exercise = {
      ...catalogSquat,
      name: "Mon squat personnalisé",
      technique: "Ma technique",
      description: "",
      advice: "Mon conseil",
      muscles: ["Mes muscles"],
    };

    getExercise.mockImplementation(
      async (id: string) =>
        id === "squat"
          ? existingSquat
          : exerciseCatalog.find(
              (exercise) => exercise.id === id,
            ),
    );

    await seedExerciseCatalog();

    expect(saveExercise).not.toHaveBeenCalled();
  });

  it("n'écrit rien lorsque tout le catalogue est déjà à jour", async () => {
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