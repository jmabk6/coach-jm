import "fake-indexeddb/auto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../db/database";
import {
  getPlannedSession,
} from "../../db/repositories/programRepository";
import {
  getSessionTemplate,
  saveSessionTemplate,
} from "../../db/repositories/sessionTemplateRepository";
import { getWorkout } from "../../db/repositories/workoutRepository";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { startWorkout } from "../workout/startWorkout";
import { seedValidationData } from "./seedValidationData";

describe("scénario complet de validation V1", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    await db.delete();
    db.close();
  });

  it("seed → programme → séance planifiée → workout persistant avec snapshot indépendant", async () => {
    const seedNow = "2026-09-14T08:00:00.000Z";
    const workoutNow = "2026-09-21T18:00:00.000Z";

    await seedValidationData(seedNow);

    const generated = await generateProgramWeek(
      "2026-09-21",
      seedNow,
    );

    expect(generated).toHaveLength(1);

    const plannedSession = generated[0];

    if (!plannedSession) {
      throw new Error("Séance planifiée non générée");
    }

    expect(plannedSession).toEqual(
      expect.objectContaining({
        id: "weekly-2026-09-21",
        date: "2026-09-21",
        sessionTemplateId: "muscu-a",
        status: "upcoming",
        source: "weekly_program",
      }),
    );

    const workout = await startWorkout(
      plannedSession.id,
      workoutNow,
    );

    expect(workout).toEqual(
      expect.objectContaining({
        id: "workout-weekly-2026-09-21",
        plannedSessionId: "weekly-2026-09-21",
        sessionTemplateId: "muscu-a",
        source: "planned",
        status: "in_progress",
        date: "2026-09-21",
      }),
    );

    expect(workout.blocks.map((block) => block.kind)).toEqual([
      "note",
      "exercise",
      "group",
      "exercise",
    ]);

    const linkedPlannedSession = await getPlannedSession(
      plannedSession.id,
    );

    expect(linkedPlannedSession).toEqual(
      expect.objectContaining({
        status: "in_progress",
        workoutId: workout.id,
      }),
    );

    const originalTemplate = await getSessionTemplate(
      "muscu-a",
    );

    expect(originalTemplate).toBeDefined();

    if (!originalTemplate) {
      throw new Error("Modèle Muscu A introuvable");
    }

    const modifiedTemplate = structuredClone(
      originalTemplate,
    );

    const squatBlock = modifiedTemplate.blocks.find(
      (block) =>
        block.kind === "exercise" &&
        block.exerciseId === "squat",
    );

    if (
      !squatBlock ||
      squatBlock.kind !== "exercise" ||
      squatBlock.instructions.shape !== "reps"
    ) {
      throw new Error("Bloc Squat introuvable");
    }

    squatBlock.instructions.reps = {
      min: 20,
      max: 20,
    };

    modifiedTemplate.updatedAt =
      "2026-09-21T19:00:00.000Z";

    await saveSessionTemplate(modifiedTemplate);

    db.close();
    await db.open();

    const reloadedWorkout = await getWorkout(
      workout.id,
    );

    expect(reloadedWorkout).toBeDefined();

    const reloadedSquat = reloadedWorkout?.blocks.find(
      (block) =>
        block.kind === "exercise" &&
        block.exerciseId === "squat",
    );

    expect(reloadedSquat?.kind).toBe("exercise");

    if (
      !reloadedSquat ||
      reloadedSquat.kind !== "exercise" ||
      reloadedSquat.snapshotInstructions.shape !== "reps"
    ) {
      throw new Error(
        "Snapshot Squat introuvable dans le workout",
      );
    }

    expect(reloadedSquat.snapshotInstructions.reps).toEqual({
      min: 8,
      max: 12,
    });

    const reloadedTemplate = await getSessionTemplate(
      "muscu-a",
    );

    const changedSquat = reloadedTemplate?.blocks.find(
      (block) =>
        block.kind === "exercise" &&
        block.exerciseId === "squat",
    );

    if (
      !changedSquat ||
      changedSquat.kind !== "exercise" ||
      changedSquat.instructions.shape !== "reps"
    ) {
      throw new Error(
        "Bloc Squat modifié introuvable",
      );
    }

    expect(changedSquat.instructions.reps).toEqual({
      min: 20,
      max: 20,
    });
  });
});