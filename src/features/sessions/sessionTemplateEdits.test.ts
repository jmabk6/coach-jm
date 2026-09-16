import { describe, expect, it } from "vitest";

import type { Exercise, SessionTemplate } from "../../domain";
import { calculateBlockNumbering } from "../../domain/rules/sessionTemplateRules";
import {
  appendExerciseBlocks,
  appendNoteBlock,
  listExerciseIds,
  removeBlock,
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
