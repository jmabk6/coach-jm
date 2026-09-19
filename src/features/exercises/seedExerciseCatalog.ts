import {
  archiveExercise,
  getAllExercises,
  getExercise,
  saveExercise,
} from "../../db/repositories/exerciseRepository";
import { classificationErrors } from "../../domain/rules/exerciseRules";
import { exerciseCatalog } from "./exerciseCatalog";

/**
 * Synchronise le catalogue officiel avec la base locale.
 *
 * - un exercice absent est ajouté ;
 * - un exercice existant n'est jamais remplacé ;
 * - seuls les champs éditoriaux encore absents sont complétés ;
 * - la classification de progression (`progressionGroup`, `movementFamily`,
 *   conception v1.5 § 8.2) suit la même règle : **complétée seulement si
 *   absente en base**, jamais écrasée, jamais posée sur un exercice hors
 *   catalogue ; `updatedAt` n'est pas modifié ;
 * - une classification invalide trouvée en base est signalée dans la
 *   console et laissée en l'état (§ 8.2) ;
 * - les médias officiels (vignette, photo) suivent toujours le catalogue :
 *   ce sont des fichiers générés, pas des données de l'utilisateur.
 *
 * Ainsi, les personnalisations de l'utilisateur sont conservées.
 */
export async function seedExerciseCatalog(): Promise<void> {
  const officialIds = new Set(
    exerciseCatalog.map((exercise) => exercise.id),
  );

  const storedExercises = await getAllExercises();

  for (const storedExercise of storedExercises) {
    const legacyExercise = storedExercise as unknown as {
      id: string;
      category?: string;
      status: string;
    };

    if (
      legacyExercise.status === "active" &&
      legacyExercise.category === undefined &&
      !officialIds.has(legacyExercise.id)
    ) {
      await archiveExercise(legacyExercise.id);
    }
  }

  for (const exercise of exerciseCatalog) {
    const existing = await getExercise(exercise.id);

    if (!existing) {
      await saveExercise(exercise);
      continue;
    }

    const legacySeedIds = [
      "squat",
      "tirage-vertical",
      "planche",
      "tapis",
    ];

    const legacyExisting = existing as unknown as {
      id: string;
      category?: string;
      createdAt: string;
      updatedAt: string;
    };

    if (
      legacyExisting.category === undefined &&
      legacySeedIds.includes(legacyExisting.id)
    ) {
      await saveExercise({
        ...exercise,
        createdAt: legacyExisting.createdAt,
        updatedAt: legacyExisting.updatedAt,
      });

      continue;
    }

    const officialMedia = exercise.media;
    const sameFrames =
      JSON.stringify(existing.media?.animationFrameUrls ?? null) ===
      JSON.stringify(officialMedia?.animationFrameUrls ?? null);
    const mediaOutdated =
      officialMedia !== undefined &&
      (existing.media?.thumbnailUrl !== officialMedia.thumbnailUrl ||
        existing.media?.photoUrl !== officialMedia.photoUrl ||
        !sameFrames);

    /* Classification en base : signalée si invalide, jamais corrigée. */
    const storedIssues = classificationErrors(existing);
    if (storedIssues.length > 0) {
      console.warn(`[coach-jm] classification de progression invalide sur « ${existing.name} » (${existing.id}), laissée en l'état : ${storedIssues.join(" ")}`);
    }

    const groupMissing =
      existing.progressionGroup === undefined &&
      exercise.progressionGroup !== undefined;
    const familyMissing =
      existing.movementFamily === undefined &&
      exercise.movementFamily !== undefined;

    const needsCatalogUpgrade =
      (existing.technique === undefined &&
        exercise.technique !== undefined) ||
      (existing.description === undefined &&
        exercise.description !== undefined) ||
      (existing.advice === undefined &&
        exercise.advice !== undefined) ||
      (existing.muscles === undefined &&
        exercise.muscles !== undefined) ||
      groupMissing ||
      familyMissing ||
      mediaOutdated;

    if (!needsCatalogUpgrade) {
      continue;
    }

    const existingMediaWithoutStaleFrames =
      officialMedia !== undefined &&
      officialMedia.animationFrameUrls === undefined &&
      existing.media?.animationFrameUrls !== undefined
        ? Object.fromEntries(
            Object.entries(existing.media).filter(
              ([key]) => key !== "animationFrameUrls",
            ),
          )
        : existing.media;

    const upgraded = {
      ...existing,

      ...(existing.technique === undefined &&
      exercise.technique !== undefined
        ? { technique: exercise.technique }
        : {}),

      ...(existing.description === undefined &&
      exercise.description !== undefined
        ? { description: exercise.description }
        : {}),

      ...(existing.advice === undefined &&
      exercise.advice !== undefined
        ? { advice: exercise.advice }
        : {}),

      ...(existing.muscles === undefined &&
      exercise.muscles !== undefined
        ? { muscles: exercise.muscles }
        : {}),

      /* Champs vides seulement (§ 8.2) : une valeur déjà présente — a
         fortiori une modification personnelle — n'est jamais touchée. */
      ...(groupMissing ? { progressionGroup: exercise.progressionGroup } : {}),
      ...(familyMissing ? { movementFamily: exercise.movementFamily } : {}),

      ...(mediaOutdated && officialMedia !== undefined
        ? {
            media: {
              ...existingMediaWithoutStaleFrames,
              ...(officialMedia.thumbnailUrl !== undefined
                ? { thumbnailUrl: officialMedia.thumbnailUrl }
                : {}),
              ...(officialMedia.photoUrl !== undefined
                ? { photoUrl: officialMedia.photoUrl }
                : {}),
              ...(officialMedia.animationFrameUrls !== undefined
                ? { animationFrameUrls: officialMedia.animationFrameUrls }
                : {}),
            },
          }
        : {}),
    };

    await saveExercise(upgraded);
  }
}