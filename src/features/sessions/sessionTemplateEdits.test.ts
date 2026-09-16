import { describe, expect, it } from "vitest";

import type { Exercise, SessionTemplate } from "../../domain";
import { calculateBlockNumbering } from "../../domain/rules/sessionTemplateRules";
import {
  appendExerciseBlocks,
  appendNoteBlock,
  listExerciseIds,
  removeBlock,
  removeGroupChild,
  reorderBlocks,
  updateNoteBlock,
} from "./sessionTemplateEdits";

const now = "2026-09-16T08:00:00.000Z";

function exercise(id: string): Exercise {
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

const empty: SessionTemplate = {
  id: "muscu-a",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [],
  createdAt: now,
  updatedAt: now,
};

function ids() {
  let counter = 0;
  return () => `id-${++counter}`;
}

describe("appendExerciseBlocks", () => {
  it("ajoute A puis B dans l'ordre, sans doublon", () => {
    const template = appendExerciseBlocks(
      empty,
      [exercise("a"), exercise("b"), exercise("a")],
      ids(),
    );

    expect(listExerciseIds(template.blocks)).toEqual(["a", "b"]);
    expect(template.blocks.map((block) => block.position)).toEqual([0, 1]);
    expect(calculateBlockNumbering(template.blocks)).toEqual({
      "id-1": "1",
      "id-2": "2",
    });
  });

  it("n'ajoute pas un exercice déjà présent dans un groupe", () => {
    const withGroup: SessionTemplate = {
      ...empty,
      blocks: [
        {
          id: "g",
          kind: "group",
          position: 0,
          rounds: 3,
          restBetweenRoundsSec: 60,
          children: [
            { id: "c1", position: 0, exerciseId: "a", instructions: { shape: "reps", reps: { min: 8, max: 12 } } },
            { id: "c2", position: 1, exerciseId: "b", instructions: { shape: "reps", reps: { min: 8, max: 12 } } },
          ],
        },
      ],
    };

    const template = appendExerciseBlocks(withGroup, [exercise("a"), exercise("c")], ids());

    expect(listExerciseIds(template.blocks)).toEqual(["a", "b", "c"]);
  });
});

describe("notes", () => {
  it("ajoute, modifie et retire une note, sans numéro", () => {
    let template = appendNoteBlock(
      appendExerciseBlocks(empty, [exercise("a")], ids()),
      { title: "Échauffement", text: "10 min de cardio léger" },
      () => "note",
    );

    expect(calculateBlockNumbering(template.blocks)).toEqual({ "id-1": "1" });

    template = updateNoteBlock(template, "note", { text: "5 min de vélo" });
    const note = template.blocks.find((block) => block.id === "note");
    expect(note).toMatchObject({ kind: "note", text: "5 min de vélo" });
    expect(note).not.toHaveProperty("title");

    template = removeBlock(template, "note");
    expect(template.blocks).toHaveLength(1);
    expect(template.blocks[0]?.position).toBe(0);
  });
});

describe("reorderBlocks", () => {
  it("renumérote les positions et recalcule la numérotation", () => {
    const template = appendExerciseBlocks(
      empty,
      [exercise("a"), exercise("b"), exercise("c")],
      ids(),
    );

    const reordered = reorderBlocks(template, ["id-3", "id-1", "id-2"]);

    expect(reordered.blocks.map((block) => block.id)).toEqual(["id-3", "id-1", "id-2"]);
    expect(reordered.blocks.map((block) => block.position)).toEqual([0, 1, 2]);
    expect(calculateBlockNumbering(reordered.blocks)).toEqual({
      "id-3": "1",
      "id-1": "2",
      "id-2": "3",
    });
  });

  it("refuse une liste incomplète", () => {
    const template = appendExerciseBlocks(empty, [exercise("a"), exercise("b")], ids());

    expect(() => reorderBlocks(template, ["id-1"])).toThrow();
  });
});

describe("removeGroupChild", () => {
  const withGroup: SessionTemplate = {
    ...empty,
    blocks: [
      {
        id: "n",
        kind: "note",
        position: 0,
        text: "Échauffement",
      },
      {
        id: "g",
        kind: "group",
        position: 1,
        rounds: 3,
        restBetweenRoundsSec: 60,
        children: [
          { id: "c1", position: 0, exerciseId: "a", instructions: { shape: "reps", reps: { min: 8, max: 12 } } },
          { id: "c2", position: 1, exerciseId: "b", instructions: { shape: "reps", reps: { min: 10, max: 12 } } },
          { id: "c3", position: 2, exerciseId: "c", instructions: { shape: "duration", durationSec: 45 } },
        ],
      },
      {
        id: "x",
        kind: "exercise",
        position: 2,
        exerciseId: "d",
        instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 },
      },
    ],
  };

  it("sort un enfant du groupe juste après lui, avec les tours en séries", () => {
    const template = removeGroupChild(withGroup, "g", "c2", true, ids());
    const kinds = template.blocks.map((block) => `${block.kind}:${block.kind === "exercise" ? block.exerciseId : block.id}`);

    expect(kinds).toEqual(["note:n", "group:g", "exercise:b", "exercise:d"]);

    const detached = template.blocks[2];
    expect(detached).toMatchObject({
      kind: "exercise",
      instructions: { shape: "reps", sets: 3, reps: { min: 10, max: 12 }, restBetweenSetsSec: 60 },
    });
    expect(calculateBlockNumbering(template.blocks)).toEqual({
      g: "1",
      c1: "1a",
      c3: "1b",
      "id-1": "2",
      x: "3",
    });
  });

  it("retire un enfant de la séance sans le replacer", () => {
    const template = removeGroupChild(withGroup, "g", "c2", false, ids());

    expect(template.blocks).toHaveLength(3);
    const group = template.blocks.find((block) => block.id === "g");
    expect(group?.kind === "group" && group.children.map((child) => child.id)).toEqual(["c1", "c3"]);
  });

  it("dissout le groupe quand il ne reste qu'un exercice", () => {
    const twoChildren: SessionTemplate = {
      ...withGroup,
      blocks: withGroup.blocks.map((block) =>
        block.kind === "group" ? { ...block, children: block.children.slice(0, 2) } : block,
      ),
    };

    const template = removeGroupChild(twoChildren, "g", "c2", true, ids());
    const kinds = template.blocks.map((block) => `${block.kind}:${block.kind === "exercise" ? block.exerciseId : block.id}`);

    // Le restant (a) devient une brique classique, puis l'enfant sorti (b), puis d.
    expect(kinds).toEqual(["note:n", "exercise:a", "exercise:b", "exercise:d"]);
    expect(template.blocks.map((block) => block.position)).toEqual([0, 1, 2, 3]);
    expect(template.blocks[1]).toMatchObject({
      instructions: { shape: "reps", sets: 3, restBetweenSetsSec: 60 },
    });
  });
});
