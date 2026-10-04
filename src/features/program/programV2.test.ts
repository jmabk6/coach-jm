import { describe, expect, it } from "vitest";
import type { PerformedBlock, PerformedExerciseBlock, SessionTemplate, StrengthFrameVersion } from "../../domain";
import { estimateSessionTemplateDurationSec, listTemplateExercises } from "../../domain/rules/sessionTemplateRules";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { createWorkoutSnapshot, type SnapshotTest } from "../workout/createWorkoutSnapshot";
import {
  CARDIO_A_V2_MAIN_STEP_IDS,
  GOAL_LINKS_V2,
  PROGRAM_V2_FRAMES,
  PROGRAM_V2_TEMPLATES,
  PROGRAM_V2_TEST_SCHEDULE,
} from "./programV2";

/**
 * Programme V2 (26/09/2026, contenu figé) : la traduction fidèle du
 * brief — modèles, durées, cadres, tests, objectifs.
 */

const T = "2026-10-04T08:00:00.000Z";
const byId = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]));

function template(id: string): SessionTemplate {
  const content = PROGRAM_V2_TEMPLATES.find((item) => item.id === id)!;
  return { ...structuredClone(content), status: "active", position: 0, createdAt: T, updatedAt: T } as SessionTemplate;
}

const minutes = (id: string) => Math.round(estimateSessionTemplateDurationSec(template(id).blocks, template(id).category) / 60);

const order = (blocks: PerformedBlock[]) =>
  blocks.map((block) => (block.kind === "test" ? `test:${block.protocolId.replace("protocol-", "")}` : block.sourceBlockId));

function schedule(key: string): SnapshotTest {
  const entry = PROGRAM_V2_TEST_SCHEDULE.find((item) => item.protocolKey === key)!;
  const test: SnapshotTest["test"] = { protocolId: `protocol-${key}`, placement: entry.placement ?? "before_all" };
  if (entry.targetBlockId) test.targetBlockId = entry.targetBlockId;
  if (entry.targetStepIds) test.targetStepIds = entry.targetStepIds;
  if (entry.adjustments) test.adjustments = entry.adjustments;
  return { test, protocolVersionId: `protocol-${key}-v1` };
}

describe("modèles V2", () => {
  it("chaque exercice existe au catalogue ; le squat sort du programme ; la suspension revient en Muscu C (03/10), les négatives aussi (pari V6)", () => {
    const ids = PROGRAM_V2_TEMPLATES.flatMap((item) => listTemplateExercises(item.blocks as SessionTemplate["blocks"], byId).map((exercise) => exercise.id));
    const referenced = PROGRAM_V2_TEMPLATES.flatMap((item) =>
      item.blocks.flatMap((block) => (block.kind === "exercise" ? [block.exerciseId] : block.kind === "group" ? block.children.map((child) => child.exerciseId) : [])),
    );
    expect(new Set(ids)).toEqual(new Set(referenced));
    expect(referenced).not.toContain("squat");
    expect(referenced).toContain("suspension-omoplates");
    expect(referenced).toContain("traction-negative");
  });

  it("ordre et prescriptions de Muscu A, B, C (échauffement tapis en tête)", () => {
    const describe = (id: string) =>
      template(id).blocks.map((block) =>
        block.kind === "exercise"
          ? `${block.exerciseId}${block.instructions.shape === "reps" ? ` ${block.instructions.sets}x${block.instructions.reps.min}-${block.instructions.reps.max}` : ""}`
          : block.kind === "group"
            ? `groupe ${block.name} x${block.rounds}`
            : "note",
      );
    expect(describe("v2-muscu-a")).toEqual([
      "tapis",
      "traction-assistee 3x1-5",
      "rowing-poulie-basse 3x8-12",
      "tirage-vertical 2x8-12",
      "chest-press 2x8-12",
      "elevations-laterales-halteres 3x12-15",
      "import-curl-biceps-ez 3x8-12",
      "leg-curl-couche 2x10-12",
    ]);
    /* Pari traction (03/10/2026) : la traction légère en premier. */
    expect(describe("v2-muscu-b")).toEqual([
      "tapis",
      "traction-assistee 3x8-10",
      "chest-press 3x8-12",
      "developpe-incline-halteres 3x8-12",
      "developpe-epaules-machine 3x8-10",
      "elevations-laterales-halteres 3x12-15",
      "extension-triceps-poulie 3x10-15",
      "presse-cuisses 3x10-12",
    ]);
    /* Pari traction (03/10/2026) : suspension + omoplates en premier, facile et technique. */
    expect(describe("v2-muscu-c")).toEqual([
      "tapis",
      "suspension-omoplates",
      "traction-negative 2x2-2",
      "sprint-velo",
      "montee-banc 3x8-8",
      "groupe Rester bas x3",
      "pullover-poulie 3x10-15",
      "face-pull 3x12-15",
      "curl-marteau-halteres 3x10-15",
      "extension-triceps-dessus-tete 2x10-15",
    ]);
  });

  it("durées estimées : Muscu A dans la cible 65-75 min, Muscu B (82, traction 3 × 8-10 le 04/10) et C (84 : suspension le 03/10, négatives du pari V6) au-dessus, signalé ; Cardio A 45, B 38, C 57", () => {
    expect(minutes("v2-muscu-a")).toBeGreaterThanOrEqual(65);
    expect(minutes("v2-muscu-a")).toBeLessThanOrEqual(75);
    expect(minutes("v2-muscu-c")).toBe(84);
    /* Cinq gros mouvements à 2 min de repos : l'estimation dépasse la cible (rapport du 26/09/2026). */
    expect(minutes("v2-muscu-b")).toBe(82);
    expect([minutes("v2-cardio-a"), minutes("v2-cardio-b"), minutes("v2-cardio-c")]).toEqual([45, 38, 57]);
  });

  it("cardio : un seul bloc tapis ; Cardio B sans récupération après le 5e intervalle", () => {
    for (const id of ["v2-cardio-a", "v2-cardio-b", "v2-cardio-c"]) {
      const blocks = template(id).blocks;
      expect(blocks.map((block) => (block.kind === "exercise" ? block.exerciseId : block.kind)), id).toEqual(["tapis"]);
      expect((blocks[0] as { notes?: string }).notes, id).toContain("Douleur au genou : arrêt.");
    }
    const steps = (template("v2-cardio-b").blocks[0] as { instructions: { steps: Array<{ id: string }> } }).instructions.steps.map((step) => step.id);
    expect(steps.slice(-3)).toEqual(["v2-cardio-b-recup-4", "v2-cardio-b-effort-5", "v2-cardio-b-retour"]);
  });
});

describe("tests et prescriptions réduites en V2", () => {
  it("traction (pari V6, 05/10) : le test remplace la traction de A, aucune série de travail après", () => {
    const frame = { id: "frame-traction-v1", workSets: 3 } as StrengthFrameVersion;
    const blocks = createWorkoutSnapshot(template("v2-muscu-a"), new Map([["traction-assistee", frame.id]]), new Map([[frame.id, frame]]), [schedule("traction")]);
    expect(order(blocks).slice(0, 3)).toEqual(["v2-muscu-a-echauffement", "test:traction", "v2-muscu-a-rowing"]);
    expect(order(blocks)).not.toContain("v2-muscu-a-traction");
  });

  it("N5 : chest press 2 séries en A et traction légère 2 séries en B ne valident ni ne stagnent", () => {
    const chest = { id: "frame-chest-v2", workSets: 3 } as StrengthFrameVersion;
    const traction = { id: "frame-traction-v1", workSets: 3 } as StrengthFrameVersion;
    const frames = new Map([["chest-press", chest.id], ["traction-assistee", traction.id]]);
    const versions = new Map([[chest.id, chest], [traction.id, traction]]);
    const a = createWorkoutSnapshot(template("v2-muscu-a"), frames, versions) as PerformedExerciseBlock[];
    const b = createWorkoutSnapshot(template("v2-muscu-b"), frames, versions) as PerformedExerciseBlock[];
    expect(a.find((block) => block.sourceBlockId === "v2-muscu-a-chest-press")?.reducedPrescription).toBe(true);
    expect(a.find((block) => block.sourceBlockId === "v2-muscu-a-traction")?.reducedPrescription).toBeUndefined();
    expect(b.find((block) => block.sourceBlockId === "v2-muscu-b-traction")?.reducedPrescription).toBe(true);
    expect(b.find((block) => block.sourceBlockId === "v2-muscu-b-chest-press")?.reducedPrescription).toBeUndefined();
  });

  it("cardio : le test remplace les 6 paliers du bloc principal ; progressif et retour au calme restent", () => {
    const blocks = createWorkoutSnapshot(template("v2-cardio-a"), undefined, undefined, [schedule("cardio")]);
    expect(order(blocks)).toEqual(["v2-cardio-a-tapis", "test:cardio", "v2-cardio-a-tapis"]);
    const [before, , after] = blocks as [PerformedExerciseBlock, PerformedBlock, PerformedExerciseBlock];
    expect(before.cardioSteps?.map((step) => step.id)).toEqual(["workout-block-v2-cardio-a-tapis-step-v2-cardio-a-progressif"]);
    expect(after.cardioSteps?.map((step) => step.id)).toEqual(["workout-block-v2-cardio-a-tapis-step-v2-cardio-a-retour"]);
    expect(CARDIO_A_V2_MAIN_STEP_IDS).toHaveLength(6);
  });

  it("jambes : le test remplace les sprints de Muscu C", () => {
    const blocks = createWorkoutSnapshot(template("v2-muscu-c"), undefined, undefined, [schedule("jambes")]);
    expect(order(blocks).slice(0, 5)).toEqual(["v2-muscu-c-echauffement", "v2-muscu-c-suspension", "v2-muscu-c-negatives", "test:jambes", "v2-muscu-c-montee-banc"]);
  });
});

describe("cadres et objectifs", () => {
  it("cadres : chaque exercice cité existe ; cibles du brief", () => {
    for (const spec of PROGRAM_V2_FRAMES) expect(byId.has(spec.exerciseId), spec.exerciseId).toBe(true);
    const targets = Object.fromEntries(PROGRAM_V2_FRAMES.map((spec) => [spec.exerciseId, spec.target]));
    expect(targets).toMatchObject({
      "chest-press": 40,
      "rowing-poulie-basse": 40,
      "developpe-incline-halteres": 8,
      "elevations-laterales-halteres": 5,
      "tirage-vertical": 40,
      /* 27/09/2026 : leg curl couché, sans cible (à étalonner). */
      "leg-curl-couche": undefined,
      "developpe-epaules-machine": undefined,
      "extension-triceps-poulie": 10,
      "presse-cuisses": 120,
    });
  });

  it("objectifs : exercices liés existants ; plus de squat pour Jambes", () => {
    for (const ids of Object.values(GOAL_LINKS_V2)) for (const id of ids) expect(byId.has(id), id).toBe(true);
    expect(GOAL_LINKS_V2.legs).not.toContain("squat");
    expect(GOAL_LINKS_V2.legs).toContain("leg-curl-couche");
    expect(GOAL_LINKS_V2.legs).not.toContain("leg-curl-assis");
  });
});
