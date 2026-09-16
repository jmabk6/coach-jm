import "fake-indexeddb/auto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Exercise, SessionTemplate } from "../../domain";
import { db } from "../../db/database";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import {
  getActiveSessionTemplates,
  getSessionTemplate,
  saveSessionTemplate,
} from "../../db/repositories/sessionTemplateRepository";
import {
  formatExerciseInstructionsRow,
  formatGroupChildInstructionsRow,
  formatGroupRow,
} from "../../domain/rules/blockInstructionRules";
import {
  calculateBlockNumbering,
  formatSessionTemplateSummary,
  summarizeSessionTemplate,
} from "../../domain/rules/sessionTemplateRules";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import {
  appendExerciseBlocks,
  appendNoteBlock,
  createGroupFromBlocks,
  reorderBlocks,
  updateExerciseBlock,
  updateGroupChild,
  updateGroupSettings,
} from "./sessionTemplateEdits";

/**
 * Critère de fin de l'Étape 3 : reconstruire fidèlement Muscu A du mockup
 * (p. 12) avec les opérations des écrans, fermer, revenir, retrouver
 * exactement la même structure — numérotation calculée, jamais stockée.
 */
describe("critère de fin — Muscu A du mockup", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedExerciseCatalog();
  });

  afterAll(async () => {
    await db.delete();
    db.close();
  });

  it("reconstruit Muscu A, ferme, revient, retrouve la même structure", async () => {
    let counter = 0;
    const newId = () => `id-${++counter}`;
    const exercises = await getAllExercises();
    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const pick = (id: string): Exercise => {
      const exercise = exerciseById.get(id);
      if (!exercise) throw new Error(`Exercice ${id} absent du catalogue`);
      return exercise;
    };

    /* Nouvelle séance : identité seulement, aucune brique. */
    const now = "2026-09-16T10:00:00.000Z";
    let template: SessionTemplate = {
      id: "muscu-a",
      name: "Muscu A",
      category: "Musculation",
      status: "active",
      position: 0,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    };

    /* Ajout des exercices depuis la bibliothèque, dans l'ordre coché (A puis B). */
    template = appendExerciseBlocks(
      template,
      [
        "squat",
        "presse-cuisses",
        "tirage-vertical",
        "rowing-poulie-basse",
        "chest-press",
        "developpe-epaules-machine",
        "planche",
        "crunch-poulie",
      ].map(pick),
      newId,
    );

    /* La note d'échauffement, ajoutée en fin, puis remontée en tête. */
    template = appendNoteBlock(
      template,
      { title: "Échauffement", text: "10 min de cardio léger + mobilisations articulaires" },
      newId,
    );
    const noteId = template.blocks[template.blocks.length - 1]?.id ?? "";
    template = reorderBlocks(template, [
      noteId,
      ...template.blocks.filter((block) => block.id !== noteId).map((block) => block.id),
    ]);

    /* Consignes de chaque brique, comme dans Modifier l'exercice. */
    const blockOf = (exerciseId: string) => {
      const block = template.blocks.find(
        (item) => item.kind === "exercise" && item.exerciseId === exerciseId,
      );
      if (!block) throw new Error(`Brique ${exerciseId} introuvable`);
      return block;
    };
    const reps = (
      exerciseId: string,
      sets: number,
      min: number,
      max: number,
      rpe: number,
      restSec: number,
    ) => {
      template = updateExerciseBlock(template, blockOf(exerciseId).id, {
        exerciseId,
        instructions: {
          shape: "reps",
          sets,
          reps: { min, max },
          targetRpe: { min: rpe, max: rpe },
          restBetweenSetsSec: restSec,
        },
      });
    };

    reps("squat", 3, 8, 10, 7, 120);
    reps("presse-cuisses", 3, 10, 12, 7, 120);
    reps("tirage-vertical", 3, 8, 12, 7, 120);
    reps("rowing-poulie-basse", 3, 8, 12, 7, 120);
    reps("chest-press", 3, 8, 12, 7, 120);
    reps("developpe-epaules-machine", 3, 8, 12, 7, 120);
    reps("crunch-poulie", 3, 15, 20, 7, 60);
    template = updateExerciseBlock(template, blockOf("planche").id, {
      exerciseId: "planche",
      instructions: {
        shape: "duration",
        sets: 3,
        durationSec: 45,
        targetRpe: { min: 8, max: 8 },
        restBetweenSetsSec: 60,
      },
    });

    /* Sélection de deux briques consécutives → groupe ; puis ses réglages. */
    template = createGroupFromBlocks(
      template,
      [blockOf("tirage-vertical").id, blockOf("rowing-poulie-basse").id],
      exerciseById,
      newId,
    );
    const group = template.blocks.find((block) => block.kind === "group");
    if (!group || group.kind !== "group") throw new Error("Groupe absent");

    template = updateGroupSettings(template, group.id, {
      name: "Superset dos",
      rounds: 3,
      restBetweenRoundsSec: 60,
      childOrder: group.children.map((child) => child.id),
    });
    for (const child of group.children) {
      template = updateGroupChild(template, group.id, child.id, {
        exerciseId: child.exerciseId,
        instructions: {
          shape: "reps",
          reps: { min: 8, max: 12 },
          targetRpe: { min: 7, max: 7 },
        },
      });
    }

    await saveSessionTemplate(template);

    /* Fermer l'app, revenir. */
    db.close();
    await db.open();

    const reloaded = await getSessionTemplate("muscu-a");
    expect(reloaded).toBeDefined();
    expect(reloaded).toEqual(template);
    expect(await getActiveSessionTemplates()).toHaveLength(1);

    const blocks = reloaded?.blocks ?? [];
    const numbering = calculateBlockNumbering(blocks);

    /* La structure du mockup, lue comme l'écran la lit. */
    const rendered = [...blocks]
      .sort((a, b) => a.position - b.position)
      .flatMap((block) => {
        if (block.kind === "note") {
          return [`— ${block.title} · ${block.text}`];
        }

        if (block.kind === "group") {
          return [
            `${numbering[block.id]} ${block.name} · ${formatGroupRow(block)}`,
            ...block.children.map(
              (child) =>
                `${numbering[child.id]} ${exerciseById.get(child.exerciseId)?.name} · ${formatGroupChildInstructionsRow(child.instructions)}`,
            ),
          ];
        }

        return [
          `${numbering[block.id]} ${exerciseById.get(block.exerciseId)?.name} · ${formatExerciseInstructionsRow(block.instructions)}`,
        ];
      });

    expect(rendered).toEqual([
      "— Échauffement · 10 min de cardio léger + mobilisations articulaires",
      "1 Squat barre · 3 séries · 8–10 reps · RPE 7 · repos 2 min",
      "2 Presse à cuisses · 3 séries · 10–12 reps · RPE 7 · repos 2 min",
      "3 Superset dos · 3 tours · repos 1 min entre les tours",
      "3a Tirage vertical à la poulie · 8–12 reps · RPE 7",
      "3b Rowing poulie basse assis · 8–12 reps · RPE 7",
      "4 Chest press machine · 3 séries · 8–12 reps · RPE 7 · repos 2 min",
      "5 Développé épaules machine · 3 séries · 8–12 reps · RPE 7 · repos 2 min",
      "6 Planche · 3 séries · 45 s · RPE 8 · repos 1 min",
      "7 Crunch poulie · 3 séries · 15–20 reps · RPE 7 · repos 1 min",
    ]);

    /* Rien de la numérotation n'est stocké : seules les positions le sont. */
    expect(blocks.map((block) => block.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(JSON.stringify(reloaded)).not.toContain('"3a"');

    /* Résumé de la carte Séances : 8 exercices, 5 zones → Full body. */
    expect(
      formatSessionTemplateSummary(summarizeSessionTemplate(blocks, exerciseById)),
    ).toBe("8 exercices · Full body");
  });
});
