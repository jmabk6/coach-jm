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

    expect(getExercise).toHaveBeenCalledTimes(exerciseCatalog.length);
    expect(saveExercise).toHaveBeenCalledTimes(exerciseCatalog.length);

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

  it("classification de progression : complète seulement les champs vides, sans toucher updatedAt", async () => {
    const catalogSquat = exerciseCatalog.find((exercise) => exercise.id === "squat")!;
    const catalogRowing = exerciseCatalog.find((exercise) => exercise.id === "rowing-poulie-basse")!;
    const stored = (exercise: Exercise): Exercise => {
      const copy: Exercise = { ...exercise, updatedAt: "2026-09-14T00:00:00.000Z" };
      delete copy.progressionGroup;
      delete copy.movementFamily;
      return copy;
    };

    getExercise.mockImplementation(async (id: string) =>
      id === "squat" || id === "rowing-poulie-basse"
        ? stored(exerciseCatalog.find((exercise) => exercise.id === id)!)
        : exerciseCatalog.find((exercise) => exercise.id === id),
    );

    await seedExerciseCatalog();

    expect(saveExercise).toHaveBeenCalledTimes(2);
    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({ id: "squat", progressionGroup: "Quadriceps", updatedAt: "2026-09-14T00:00:00.000Z" }),
    );
    const savedSquat = saveExercise.mock.calls.find(([e]) => e.id === "squat")![0] as Exercise;
    expect("movementFamily" in savedSquat).toBe(false);
    expect(savedSquat).toEqual({ ...catalogSquat, updatedAt: "2026-09-14T00:00:00.000Z" });
    expect(saveExercise).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rowing-poulie-basse", progressionGroup: "Dos", movementFamily: "tirage_horizontal", updatedAt: "2026-09-14T00:00:00.000Z" }),
    );
    void catalogRowing;
  });

  it("n'écrase jamais un classement déjà renseigné, même différent du catalogue (modification personnelle)", async () => {
    const catalogSquat = exerciseCatalog.find((exercise) => exercise.id === "squat")!;
    const catalogRowing = exerciseCatalog.find((exercise) => exercise.id === "rowing-poulie-basse")!;
    const personalSquat: Exercise = { ...catalogSquat, progressionGroup: "Fessiers" };
    const personalRowing: Exercise = { ...catalogRowing, movementFamily: "tirage_vertical" };

    getExercise.mockImplementation(async (id: string) =>
      id === "squat" ? personalSquat : id === "rowing-poulie-basse" ? personalRowing : exerciseCatalog.find((exercise) => exercise.id === id),
    );

    await seedExerciseCatalog();

    expect(saveExercise).not.toHaveBeenCalled();
  });

  it("ne pose aucune classification sur un exercice créé par l'utilisateur, et signale sans corriger une combinaison invalide", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const custom = {
      id: "perso-1",
      name: "Mon exercice",
      category: "Musculation",
      zone: "Dos",
      movement: "Tirage",
      equipment: "Poulie",
      location: "Salle",
      mode: "series",
      measurementType: "load_reps",
      progressionGroup: "Quadriceps",
      status: "active",
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
    } as unknown as Exercise;
    getAllExercises.mockResolvedValue([custom]);
    getExercise.mockImplementation(async (id: string) => exerciseCatalog.find((exercise) => exercise.id === id));

    await seedExerciseCatalog();

    /* Hors catalogue : jamais lu par identifiant, jamais réécrit. */
    expect(getExercise).not.toHaveBeenCalledWith("perso-1");
    expect(saveExercise).not.toHaveBeenCalledWith(expect.objectContaining({ id: "perso-1" }));
    expect(archiveExercise).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("signale dans la console une classification invalide d'un exercice du catalogue et la laisse en l'état", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const catalogSquat = exerciseCatalog.find((exercise) => exercise.id === "squat")!;
    const broken: Exercise = { ...catalogSquat, progressionGroup: "Dos" };
    getExercise.mockImplementation(async (id: string) => (id === "squat" ? broken : exerciseCatalog.find((exercise) => exercise.id === id)));

    await seedExerciseCatalog();

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/classification de progression invalide sur « Squat barre » \(squat\)/));
    expect(saveExercise).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("n'écrit rien lorsque tout le catalogue est déjà à jour", async () => {
    getExercise.mockImplementation(
      async (id: string) =>
        exerciseCatalog.find(
          (exercise) => exercise.id === id,
        ),
    );

    await seedExerciseCatalog();

    expect(getExercise).toHaveBeenCalledTimes(exerciseCatalog.length);
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

  it("sens de la charge (lot a) : complété sur la traction et les dips si absent, rien d'autre ne change", async () => {
    const legacy = (id: string): Exercise => {
      const copy: Exercise = {
        ...exerciseCatalog.find((exercise) => exercise.id === id)!,
        updatedAt: "2026-09-15T00:00:00.000Z",
        technique: "Ma technique personnelle",
      };
      delete copy.loadSemantics;
      return copy;
    };

    getExercise.mockImplementation(async (id: string) =>
      id === "traction-assistee" || id === "dips-assistes"
        ? legacy(id)
        : exerciseCatalog.find((exercise) => exercise.id === id),
    );

    await seedExerciseCatalog();

    expect(saveExercise).toHaveBeenCalledTimes(2);
    for (const id of ["traction-assistee", "dips-assistes"]) {
      const saved = saveExercise.mock.calls.find(([e]) => e.id === id)![0] as Exercise;
      expect(saved).toEqual({ ...legacy(id), loadSemantics: "assistance" });
    }
  });

  it("sens de la charge (lot a) : une valeur déjà présente n'est jamais écrasée", async () => {
    const personal: Exercise = {
      ...exerciseCatalog.find((exercise) => exercise.id === "traction-assistee")!,
      loadSemantics: "external",
    };

    getExercise.mockImplementation(async (id: string) =>
      id === "traction-assistee" ? personal : exerciseCatalog.find((exercise) => exercise.id === id),
    );

    await seedExerciseCatalog();

    expect(saveExercise).not.toHaveBeenCalled();
  });

  it("sens de la charge (lot a) : rien n'est posé sur un exercice qui ne l'a pas au catalogue", async () => {
    const squat = exerciseCatalog.find((exercise) => exercise.id === "squat")!;
    expect(squat.loadSemantics).toBeUndefined();

    getExercise.mockImplementation(async (id: string) => exerciseCatalog.find((exercise) => exercise.id === id));

    await seedExerciseCatalog();

    expect(saveExercise).not.toHaveBeenCalled();
  });
});