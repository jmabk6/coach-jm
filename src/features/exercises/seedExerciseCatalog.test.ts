import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "../../domain";
import { exerciseCatalog } from "./exerciseCatalog";

const {
  archiveExercise,
  getAllExercises,
  getExercise,
  saveExercise,
} = vi.hoisted(() => ({
  archiveExercise: vi.fn(),
  getAllExercises: vi.fn(),
  getExercise: vi.fn(),
  saveExercise: vi.fn(),
}));

vi.mock(
  "../../db/repositories/exerciseRepository",
  () => ({
    archiveExercise,
    getAllExercises,
    getExercise,
    saveExercise,
  }),
);

import { seedExerciseCatalog } from "./seedExerciseCatalog";

describe("seedExerciseCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllExercises.mockResolvedValue([]);
  });

  it("ajoute tous les exercices absents", async () => {
    getExercise.mockResolvedValue(undefined);

    await seedExerciseCatalog();

    expect(getExercise).toHaveBeenCalledTimes(48);
    expect(saveExercise).toHaveBeenCalledTimes(48);

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

    expect(getExercise).toHaveBeenCalledTimes(48);
    expect(saveExercise).not.toHaveBeenCalled();
  });

  it("remet les médias officiels à jour lorsque le catalogue change d'image", async () => {
    const catalogSquat = exerciseCatalog.find(
      (exercise) => exercise.id === "squat",
    )!;

    const existingSquat: Exercise = {
      ...catalogSquat,
      name: "Mon squat personnalisé",
      media: {
        thumbnailUrl: "/coach-jm/media/exercises/jambes/squat-thumb-v4.webp",
        photoUrl: catalogSquat.media!.photoUrl!,
        videoUrl: "https://example.test/ma-video.mp4",
      },
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

    expect(saveExercise).toHaveBeenCalledTimes(1);

    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "squat",
        name: "Mon squat personnalisé",
        media: {
          thumbnailUrl: catalogSquat.media!.thumbnailUrl,
          photoUrl: catalogSquat.media!.photoUrl,
          animationFrameUrls: catalogSquat.media!.animationFrameUrls,
          videoUrl: "https://example.test/ma-video.mp4",
        },
      }),
    );
  });

  it("archive les anciens exercices sans catégorie qui ne sont pas dans le catalogue", async () => {
    getAllExercises.mockResolvedValue([
      { id: "ancien-exercice", status: "active" },
      { id: "ancien-archive", status: "archived" },
      { id: "squat", status: "active" },
    ]);

    getExercise.mockImplementation(
      async (id: string) =>
        exerciseCatalog.find(
          (exercise) => exercise.id === id,
        ),
    );

    await seedExerciseCatalog();

    expect(archiveExercise).toHaveBeenCalledTimes(1);
    expect(archiveExercise).toHaveBeenCalledWith("ancien-exercice");
    expect(saveExercise).not.toHaveBeenCalled();
  });
});