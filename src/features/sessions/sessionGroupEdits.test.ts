import { describe, expect, it } from "vitest";

import type { Exercise, SessionTemplate } from "../../domain";
import { calculateBlockNumbering } from "../../domain/rules/sessionTemplateRules";
import {
  addExercisesToGroup,
  areBlocksConsecutive,
  createGroupFromBlocks,
  dissolveGroup,
  isGroupCandidate,
  updateGroupSettings,
} from "./sessionTemplateEdits";

const now = "2026-09-16T08:00:00.000Z";

function series(id: string): Exercise {
  return {
    id,
    name: id,
    category: "Musculation",
    zone: "Dos",
    movement: "Tirage",
    equipment: "Poulie",
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const tapis: Exercise = {
  id: "tapis",
  name: "Tapis",
  category: "Cardio",
  equipment: "Tapis",
  location: "Salle",
  mode: "steps",
  measurementType: "duration_speed_incline",
  status: "active",
  createdAt: now,
  updatedAt: now,
};

const exerciseById = new Map<string, Exercise>(
  [series("a"), series("b"), series("c"), series("d"), tapis].map((e) => [e.id, e]),
);

/** note, a, b, tapis, c */
const template: SessionTemplate = {
  id: "t",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  createdAt: now,
  updatedAt: now,
  blocks: [
    { id: "n", kind: "note", position: 0, text: "Échauffement" },
    {
      id: "ba",
      kind: "exercise",
      position: 1,
      exerciseId: "a",
      instructions: { shape: "reps", sets: 4, reps: { min: 6, max: 8 }, targetRpe: { min: 7, max: 8 }, restBetweenSetsSec: 120 },
    },
    {
      id: "bb",
      kind: "exercise",
      position: 2,
      exerciseId: "b",
      instructions: { shape: "reps", sets: 3, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
      notes: "Coudes serrés",
    },
    {
      id: "bt",
      kind: "exercise",
      position: 3,
      exerciseId: "tapis",
      instructions: { shape: "steps", steps: [] },
    },
    {
      id: "bc",
      kind: "exercise",
      position: 4,
      exerciseId: "c",
      instructions: { shape: "duration", sets: 3, durationSec: 45, restBetweenSetsSec: 60 },
    },
  ],
};

function ids() {
  let counter = 0;
  return () => `id-${++counter}`;
}

describe("sélection de briques", () => {
  it("ne retient que les exercices autonomes en séries", () => {
    const candidates = template.blocks.filter((block) => isGroupCandidate(block, exerciseById));

    expect(candidates.map((block) => block.id)).toEqual(["ba", "bb", "bc"]);
  });

  it("vérifie la contiguïté sans réordonner", () => {
    expect(areBlocksConsecutive(template.blocks, ["ba", "bb"])).toBe(true);
    expect(areBlocksConsecutive(template.blocks, ["bb", "ba"])).toBe(true);
    expect(areBlocksConsecutive(template.blocks, ["ba", "bc"])).toBe(false);
    expect(areBlocksConsecutive(template.blocks, ["ba"])).toBe(true);
    expect(areBlocksConsecutive(template.blocks, [])).toBe(false);
  });
});

describe("createGroupFromBlocks", () => {
  it("absorbe séries et repos de la première brique, garde les cibles des enfants", () => {
    const next = createGroupFromBlocks(template, ["bb", "ba"], exerciseById, ids());
    const group = next.blocks.find((block) => block.kind === "group");

    expect(next.blocks.map((block) => block.kind)).toEqual(["note", "group", "exercise", "exercise"]);
    expect(group).toMatchObject({
      id: "id-1",
      rounds: 4,
      restBetweenRoundsSec: 120,
    });
    expect(group?.kind === "group" && group.children).toEqual([
      {
        id: "ba",
        position: 0,
        exerciseId: "a",
        instructions: { shape: "reps", reps: { min: 6, max: 8 }, targetRpe: { min: 7, max: 8 } },
      },
      {
        id: "bb",
        position: 1,
        exerciseId: "b",
        instructions: { shape: "reps", reps: { min: 10, max: 12 } },
        notes: "Coudes serrés",
      },
    ]);
    expect(calculateBlockNumbering(next.blocks)).toEqual({
      "id-1": "1",
      ba: "1a",
      bb: "1b",
      bt: "2",
      bc: "3",
    });
  });

  it("refuse une sélection non consécutive, trop courte, ou hors séries", () => {
    expect(() => createGroupFromBlocks(template, ["ba", "bc"], exerciseById, ids())).toThrow(
      /consécutives/,
    );
    expect(() => createGroupFromBlocks(template, ["ba"], exerciseById, ids())).toThrow(
      /deux exercices/,
    );
    expect(() => createGroupFromBlocks(template, ["bb", "bt"], exerciseById, ids())).toThrow(
      /séries/,
    );
  });
});

describe("modification et dissolution", () => {
  const grouped = createGroupFromBlocks(template, ["ba", "bb"], exerciseById, ids());

  it("met à jour nom, réglages et ordre des enfants", () => {
    const next = updateGroupSettings(grouped, "id-1", {
      name: "  Superset dos ",
      description: "",
      rounds: 3,
      restBetweenRoundsSec: 60,
      childOrder: ["bb", "ba"],
    });
    const group = next.blocks.find((block) => block.id === "id-1");

    expect(group).toMatchObject({ name: "Superset dos", rounds: 3, restBetweenRoundsSec: 60 });
    expect(group).not.toHaveProperty("description");
    expect(group?.kind === "group" && group.children.map((child) => child.id)).toEqual(["bb", "ba"]);
    expect(calculateBlockNumbering(next.blocks)).toMatchObject({ bb: "1a", ba: "1b" });
  });

  it("ajoute des exercices compatibles et ignore les autres", () => {
    const next = addExercisesToGroup(grouped, "id-1", [series("d"), tapis, series("a")], ids());
    const group = next.blocks.find((block) => block.id === "id-1");

    expect(group?.kind === "group" && group.children.map((child) => child.exerciseId)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  it("dissout le groupe en rendant les exercices à leur place", () => {
    const next = dissolveGroup(grouped, "id-1", ids());

    expect(next.blocks.map((block) => `${block.kind}:${block.kind === "exercise" ? block.exerciseId : block.id}`)).toEqual([
      "note:n",
      "exercise:a",
      "exercise:b",
      "exercise:tapis",
      "exercise:c",
    ]);
    expect(next.blocks[1]).toMatchObject({
      instructions: { shape: "reps", sets: 4, reps: { min: 6, max: 8 }, restBetweenSetsSec: 120 },
    });
    expect(next.blocks[2]).toMatchObject({ notes: "Coudes serrés" });
  });
});
