import { describe, expect, it } from "vitest";

import type { SessionTemplate } from "../../domain";
import { createWorkoutSnapshot } from "./createWorkoutSnapshot";

const template: SessionTemplate = {
  id: "muscu-a",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [
    {
      id: "note-1",
      kind: "note",
      position: 0,
      title: "Échauffement",
      text: "Faire quelques minutes de cardio.",
    },
    {
      id: "exercise-1",
      kind: "exercise",
      position: 1,
      exerciseId: "squat",
      notes: "Descendre proprement.",
      instructions: {
        shape: "reps",
        sets: 3,
        reps: {
          min: 8,
          max: 10,
        },
        targetRpe: {
          min: 6,
          max: 8,
        },
        restBetweenSetsSec: 90,
      },
    },
    {
      id: "group-1",
      kind: "group",
      position: 2,
      name: "Circuit",
      description: "Deux exercices",
      rounds: 2,
      restBetweenRoundsSec: 120,
      children: [
        {
          id: "child-1",
          position: 0,
          exerciseId: "rowing",
          notes: "Contrôler le mouvement.",
          instructions: {
            shape: "reps",
            reps: {
              min: 10,
              max: 12,
            },
            targetRpe: {
              min: 6,
              max: 8,
            },
          },
        },
        {
          id: "child-2",
          position: 1,
          exerciseId: "planche",
          restBeforeSec: 30,
          instructions: {
            shape: "duration",
            durationSec: 45,
          },
        },
      ],
    },
  ],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

describe("createWorkoutSnapshot", () => {
  it("transforme les trois types de blocs du modèle en blocs exécutables", () => {
    const result = createWorkoutSnapshot(template);

    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      id: "workout-block-note-1",
      sourceBlockId: "note-1",
      kind: "note",
      position: 0,
      addedDuringWorkout: false,
      title: "Échauffement",
      text: "Faire quelques minutes de cardio.",
    });

    expect(result[1]).toMatchObject({
      id: "workout-block-exercise-1",
      sourceBlockId: "exercise-1",
      kind: "exercise",
      position: 1,
      addedDuringWorkout: false,
      exerciseId: "squat",
      status: "not_performed",
      note: "Descendre proprement.",
    });

    expect(result[2]).toMatchObject({
      id: "workout-block-group-1",
      sourceBlockId: "group-1",
      kind: "group",
      position: 2,
      addedDuringWorkout: false,
      status: "not_performed",
      name: "Circuit",
      description: "Deux exercices",
      plannedRounds: 2,
      plannedRestBetweenRoundsSec: 120,
    });
  });

  it("crée les séries prévues d'un exercice autonome", () => {
    const result = createWorkoutSnapshot(template);
    const block = result[1];

    expect(block?.kind).toBe("exercise");

    if (block?.kind !== "exercise") {
      throw new Error("Bloc exercice attendu");
    }

    expect(block.snapshotInstructions).toEqual(
      template.blocks[1]?.kind === "exercise"
        ? template.blocks[1].instructions
        : undefined,
    );

    expect(block.series).toEqual([
      {
        id: "workout-block-exercise-1-set-1",
        position: 0,
        status: "upcoming",
        role: "travail",
      },
      {
        id: "workout-block-exercise-1-set-2",
        position: 1,
        status: "upcoming",
        role: "travail",
      },
      {
        id: "workout-block-exercise-1-set-3",
        position: 2,
        status: "upcoming",
        role: "travail",
      },
    ]);
  });

  it("point de capture 1 : la version active est portée par la brique et par chaque tour, jamais par l'enfant prévu", () => {
    const result = createWorkoutSnapshot(
      template,
      new Map([
        ["squat", "v-squat-1"],
        ["planche", "v-planche-1"],
      ]),
    );
    const exerciseBlock = result.find((block) => block.kind === "exercise");
    const group = result.find((block) => block.kind === "group");

    expect(exerciseBlock).toMatchObject({ exerciseId: "squat", frameVersionId: "v-squat-1" });
    if (group?.kind !== "group") throw new Error("groupe attendu");
    for (const round of group.rounds) {
      expect(round.children.find((child) => child.exerciseId === "rowing")).not.toHaveProperty("frameVersionId");
      expect(round.children.find((child) => child.exerciseId === "planche")).toMatchObject({ frameVersionId: "v-planche-1" });
    }
    for (const child of group.children) expect(child).not.toHaveProperty("frameVersionId");

    /* Sans carte : rien ne change par rapport à l'existant. */
    const bare = createWorkoutSnapshot(template);
    expect(JSON.stringify(bare)).not.toContain("frameVersionId");
  });

  it("crée les enfants et les tours prévus d'un groupe", () => {
    const result = createWorkoutSnapshot(template);
    const block = result[2];

    expect(block?.kind).toBe("group");

    if (block?.kind !== "group") {
      throw new Error("Bloc groupe attendu");
    }

    expect(block.children).toHaveLength(2);
    expect(block.children[0]).toMatchObject({
      id: "workout-block-group-1-child-child-1",
      sourceChildId: "child-1",
      position: 0,
      exerciseId: "rowing",
      note: "Contrôler le mouvement.",
    });
    expect(block.children[1]).toMatchObject({
      id: "workout-block-group-1-child-child-2",
      sourceChildId: "child-2",
      position: 1,
      exerciseId: "planche",
      snapshotRestBeforeSec: 30,
    });

    expect(block.rounds).toHaveLength(2);

    expect(block.rounds[0]).toMatchObject({
      id: "workout-block-group-1-round-1",
      roundNumber: 1,
      status: "upcoming",
    });

    expect(block.rounds[0]?.children).toEqual([
      {
        id: "workout-block-group-1-round-1-child-child-1",
        groupChildId: "workout-block-group-1-child-child-1",
        exerciseId: "rowing",
      },
      {
        id: "workout-block-group-1-round-1-child-child-2",
        groupChildId: "workout-block-group-1-child-child-2",
        exerciseId: "planche",
      },
    ]);
  });
});