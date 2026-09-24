import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type {
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedTestBlock,
  SessionTemplate,
  StrengthFrameVersion,
  TestMeasureSpec,
  WorkoutSession,
} from "../../domain";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { PROGRAM_V1_ROUTINES, PROGRAM_V1_TEMPLATES } from "../program/programV1";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { createWorkoutSnapshot, type SnapshotTest } from "./createWorkoutSnapshot";
import { endAndConfirm } from "./endAndConfirmForTests";
import {
  addTestTrial,
  editTestTrial,
  endWorkoutSession,
  finishBlock,
  removeTestTrial,
  setTestNote,
  setTestSideValue,
  setTestValue,
  skipBlock,
  validateSeries,
} from "./engine/workoutEngine";
import { applyWorkoutAction } from "./engine/persistWorkout";
import { startWorkout } from "./startWorkout";

/**
 * Lot G.3 — brique test dans le moteur (conception V2 § 3.5.2) :
 * placements, ajustement du jour de test, brouillon (essais, valeurs,
 * côtés), fin, saut, corrections en attente ; aucune validation de palier
 * le jour du test traction.
 */

const T = "2026-10-25T09:00:00.000Z";

function template(id: string): SessionTemplate {
  const content = [...PROGRAM_V1_TEMPLATES, ...PROGRAM_V1_ROUTINES].find((item) => item.id === id)!;
  return { ...structuredClone(content), status: "active", position: 0, createdAt: T, updatedAt: T } as SessionTemplate;
}

const test = (protocolKey: string, extra: Partial<SnapshotTest["test"]> = {}): SnapshotTest => ({
  test: { protocolId: `protocol-${protocolKey}`, placement: "before_all", ...extra },
  protocolVersionId: `protocol-${protocolKey}-v1`,
});

/** `test:traction`, `v1-muscu-a-traction`… : l'ordre lisible d'une séance. */
const order = (blocks: PerformedBlock[]) =>
  blocks.map((block) => (block.kind === "test" ? `test:${block.protocolId.replace("protocol-", "")}` : block.sourceBlockId));

describe("placements (§ 3.5.1)", () => {
  it("traction : après l'échauffement ; la traction assistée passe à 2 séries, en prescription réduite", () => {
    const tractionFrame = { id: "frame-traction-v1", workSets: 3 } as StrengthFrameVersion;
    const blocks = createWorkoutSnapshot(
      template("v1-muscu-a"),
      new Map([["traction-assistee", tractionFrame.id]]),
      new Map([[tractionFrame.id, tractionFrame]]),
      [test("traction", { placement: "after_warmup", adjustments: [{ blockId: "v1-muscu-a-traction", sets: 2 }] })],
    );

    expect(order(blocks).slice(0, 3)).toEqual(["v1-muscu-a-echauffement", "test:traction", "v1-muscu-a-traction"]);
    expect(blocks.map((block) => block.position)).toEqual(blocks.map((_, index) => index));
    const traction = blocks[2] as PerformedExerciseBlock;
    expect(traction.series).toHaveLength(2);
    expect(traction.snapshotInstructions).toMatchObject({ sets: 2 });
    expect(traction.reducedPrescription).toBe(true);
    expect(blocks[1]).toMatchObject({ kind: "test", status: "not_performed", protocolVersionId: "protocol-traction-v1", addedDuringWorkout: false });
  });

  it("cardio : remplace le seul palier principal de Cardio A ; échauffement et retour au calme restent (option b)", () => {
    const blocks = createWorkoutSnapshot(template("v1-cardio-a"), undefined, undefined, [
      test("cardio", { placement: "replace_block", targetBlockId: "v1-cardio-a-tapis", targetStepId: "v1-cardio-a-principal-p1" }),
    ]);
    expect(order(blocks)).toEqual(["v1-cardio-a-tapis", "test:cardio", "v1-cardio-a-tapis"]);
    expect(blocks.map((block) => block.id)).toEqual([
      "workout-block-v1-cardio-a-tapis",
      "workout-block-test-protocol-cardio",
      "workout-block-v1-cardio-a-tapis-suite",
    ]);
    expect(blocks.map((block) => block.position)).toEqual([0, 1, 2]);
    expect((blocks[1] as PerformedTestBlock).replacedBlockId).toBe("v1-cardio-a-tapis");

    const [warmup, , cooldown] = blocks as [PerformedExerciseBlock, PerformedTestBlock, PerformedExerciseBlock];
    expect(warmup.cardioSteps).toEqual([
      { id: "workout-block-v1-cardio-a-tapis-step-v1-cardio-a-debut-p1", position: 0, status: "upcoming", settings: { durationSec: 300, speedKmh: 4.5, inclinePercent: 0 } },
    ]);
    expect(warmup.note).toBeUndefined();
    expect(cooldown.cardioSteps).toEqual([
      { id: "workout-block-v1-cardio-a-tapis-step-v1-cardio-a-retour-p1", position: 0, status: "upcoming", settings: { durationSec: 300, speedKmh: 4.5, inclinePercent: 0 } },
    ]);
    expect(cooldown.note).toBe("Dernier palier : retour au calme.");
    expect(cooldown.snapshotInstructions).toMatchObject({ shape: "steps", steps: [{ id: "v1-cardio-a-retour-p1", position: 0 }] });
  });

  it("palier visé introuvable : le bloc entier est remplacé", () => {
    const blocks = createWorkoutSnapshot(template("v1-cardio-a"), undefined, undefined, [
      test("cardio", { placement: "replace_block", targetBlockId: "v1-cardio-a-tapis", targetStepId: "absent" }),
    ]);
    expect(order(blocks)).toEqual(["test:cardio"]);
  });

  it("souplesse et tronc : remplacent tout le contenu de la routine du soir, dans l'ordre", () => {
    const blocks = createWorkoutSnapshot(template("v1-routine-b"), undefined, undefined, [
      test("souplesse", { placement: "replace_all" }),
      test("tronc", { placement: "replace_all" }),
    ]);
    expect(order(blocks)).toEqual(["test:souplesse", "test:tronc"]);
    expect(blocks.map((block) => block.position)).toEqual([0, 1]);
  });

  it("avant tout ; après l'échauffement sans échauffement : en tête ; brique visée absente : comme après l'échauffement", () => {
    expect(order(createWorkoutSnapshot(template("v1-cardio-b"), undefined, undefined, [test("jambes")]))[0]).toBe("test:jambes");
    expect(order(createWorkoutSnapshot(template("v1-cardio-c"), undefined, undefined, [test("cardio", { placement: "after_warmup" })]))[0]).toBe("test:cardio");
    expect(
      order(createWorkoutSnapshot(template("v1-muscu-a"), undefined, undefined, [test("cardio", { placement: "replace_block", targetBlockId: "absent" })])).slice(0, 2),
    ).toEqual(["v1-muscu-a-echauffement", "test:cardio"]);
  });
});

describe("brouillon du test (D27)", () => {
  const spec = (key: string, extra: Partial<TestMeasureSpec> = {}): TestMeasureSpec => ({ key, label: key, unit: "cm", input: "entered", required: true, ...extra });
  const doigtsSol = spec("doigts_sol_cm", { signed: true });
  const papillon = spec("papillon_cm");
  const apley = spec("apley_cm", { side: true });
  const derived = spec("ratio", { input: "derived" });

  function running(): WorkoutSession {
    return {
      id: "w", source: "planned", kind: "training", status: "in_progress", date: "2026-10-25", startedAt: T, lastActionAt: T, activeDurationSec: 0,
      createdAt: T, updatedAt: T,
      blocks: createWorkoutSnapshot(template("v1-muscu-a"), undefined, undefined, [test("traction", { placement: "after_warmup" })]),
    };
  }
  const TEST = "workout-block-test-protocol-traction";
  const testOf = (workout: WorkoutSession) => workout.blocks.find((block) => block.id === TEST) as PerformedTestBlock;
  const draftOf = (workout: WorkoutSession) => testOf(workout).draft;

  it("essais : ajout dans l'ordre, correction, retrait avec renumérotation ; le test devient la brique courante", () => {
    let workout = running();
    workout = addTestTrial(workout, TEST, { value: 40, outcome: "success", restSec: 180 }, "2026-10-25T09:10:00.000Z");
    workout = addTestTrial(workout, TEST, { value: 37, outcome: "success" }, "2026-10-25T09:14:00.000Z");
    workout = addTestTrial(workout, TEST, { value: 34, outcome: "failure" }, "2026-10-25T09:18:00.000Z");
    expect(workout.currentBlockId).toBe(TEST);
    expect(draftOf(workout)?.trials?.map((trial) => [trial.order, trial.value, trial.outcome])).toEqual([
      [1, 40, "success"], [2, 37, "success"], [3, 34, "failure"],
    ]);
    expect(draftOf(workout)?.trials?.[0]).toMatchObject({ restSec: 180, completedAt: "2026-10-25T09:10:00.000Z" });

    workout = editTestTrial(workout, TEST, 2, { value: 36.5, outcome: "success" }, T);
    workout = removeTestTrial(workout, TEST, 1, T);
    expect(draftOf(workout)?.trials?.map((trial) => [trial.order, trial.value])).toEqual([[1, 36.5], [2, 34]]);

    expect(() => addTestTrial(workout, TEST, { value: -1, outcome: "success" }, T)).toThrow(/positif/);
  });

  it("valeurs : négatif seulement pour une mesure signée ; ni dérivée, ni côté par la mauvaise voie ; effacement", () => {
    let workout = running();
    workout = setTestValue(workout, TEST, doigtsSol, -3, T);
    expect(() => setTestValue(workout, TEST, papillon, -1, T)).toThrow(/négative/);
    expect(() => setTestValue(workout, TEST, derived, 1, T)).toThrow(/dérivée/);
    expect(() => setTestValue(workout, TEST, apley, 4, T)).toThrow(/par côté/);

    workout = setTestSideValue(workout, TEST, apley, "left", 5, T);
    workout = setTestSideValue(workout, TEST, apley, "right", 8, T);
    workout = setTestSideValue(workout, TEST, apley, "left", undefined, T);
    workout = setTestNote(workout, TEST, "  bassin stable  ", T);
    expect(draftOf(workout)).toEqual({ values: { doigts_sol_cm: -3 }, sideValues: { apley_cm: { right: 8 } }, note: "bassin stable" });

    workout = setTestValue(workout, TEST, doigtsSol, undefined, T);
    workout = setTestSideValue(workout, TEST, apley, "right", undefined, T);
    workout = setTestNote(workout, TEST, "", T);
    expect(draftOf(workout)).toEqual({});
  });

  it("Terminer le test, sauter, clôture", () => {
    let workout = addTestTrial(running(), TEST, { value: 40, outcome: "success" }, T);
    workout = finishBlock(workout, TEST, T);
    expect(testOf(workout).status).toBe("performed");
    expect(workout.currentBlockId).toBe("workout-block-v1-muscu-a-traction");

    let skipped = skipBlock(running(), TEST, T);
    expect(testOf(skipped).status).toBe("skipped");
    expect(() => addTestTrial(skipped, TEST, { value: 40, outcome: "success" }, T)).toThrow(/sauté/);

    /* À la clôture : commencé = réalisé, jamais commencé = non réalisé. */
    const withInput = endWorkoutSession(addTestTrial(running(), TEST, { value: 40, outcome: "success" }, T), T);
    expect(testOf(withInput).status).toBe("performed");
    expect(testOf(endWorkoutSession(running(), T)).status).toBe("not_performed");
    skipped = endWorkoutSession(skipped, T);
    expect(testOf(skipped).status).toBe("skipped");
  });

  it("en attente d'enregistrement : les essais se corrigent encore (D21) ; enregistrée : plus rien", () => {
    let pending = endWorkoutSession(running(), T);
    pending = addTestTrial(pending, TEST, { value: 40, outcome: "success" }, "2026-10-25T10:05:00.000Z");
    expect(testOf(pending).status).toBe("performed");
    expect(pending.endedAt).toBe(T);
    pending = removeTestTrial(pending, TEST, 1, T);
    expect(testOf(pending).status).toBe("not_performed");

    const saved: WorkoutSession = { ...pending, status: "completed", completedAt: T };
    expect(() => addTestTrial(saved, TEST, { value: 40, outcome: "success" }, T)).toThrow(/enregistrée/);
  });
});

describe("démarrage d'une séance de la semaine de tests", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    await generateProgramWeek("2026-10-25", "2026-09-24T10:00:00.000Z");
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("Muscu A du 25/10 : test traction capturé ; 2 séries de traction assistée, sans validation de palier", async () => {
    const workout = await startWorkout("weekly-2026-10-25", T);
    const testBlock = workout.blocks.find((block) => block.kind === "test") as PerformedTestBlock;
    expect(testBlock).toMatchObject({ protocolId: "protocol-traction", protocolVersionId: "protocol-traction-v1" });

    const traction = workout.blocks.find((block) => block.kind === "exercise" && block.exerciseId === "traction-assistee") as PerformedExerciseBlock;
    expect(traction.series).toHaveLength(2);
    expect(traction.reducedPrescription).toBe(true);

    for (const series of traction.series!) {
      await applyWorkoutAction(workout.id, (current, at) =>
        validateSeries(current, traction.id, series.id, { load: { kind: "total", kg: 40 }, reps: 8, role: "travail" }, at),
      T);
    }
    const { frames } = await endAndConfirm(workout.id, "2026-10-25T10:00:00.000Z");

    expect(frames.find((frame) => frame.result.validated)).toBeUndefined();
    expect(await db.strengthMilestones.count()).toBe(0);
  });

  it("Muscu C du 29/10 : le test Jambes prend la place des sprints d'entraînement, le reste est inchangé", async () => {
    const workout = await startWorkout("weekly-2026-10-29", T);

    expect(order(workout.blocks)).toEqual([
      "v1-muscu-c-echauffement",
      "v1-muscu-c-suspension",
      "test:jambes",
      "v1-muscu-c-montee-banc",
      "v1-muscu-c-rester-bas",
      "v1-muscu-c-pullover",
      "v1-muscu-c-leg-curl",
    ]);
    expect(workout.blocks.find((block) => block.kind === "test")).toMatchObject({ replacedBlockId: "v1-muscu-c-sprints" });
    expect(workout.blocks.some((block) => block.kind === "exercise" && block.exerciseId === "sprint-velo")).toBe(false);
  });

  it("lundi soir : la routine vide démarre, son contenu est la Souplesse puis le Tronc", async () => {
    const workout = await startWorkout("weekly-2026-10-26-evening", T);
    expect(order(workout.blocks)).toEqual(["test:souplesse", "test:tronc"]);
  });

  it("un test replanifié ailleurs, ou d'un protocole en pause, n'entre pas dans la séance", async () => {
    await db.plannedSessions.update("weekly-2026-10-26-evening", {
      tests: [
        { protocolId: "protocol-souplesse", placement: "replace_all", rescheduledToPlannedSessionId: "ailleurs" },
        { protocolId: "protocol-tronc", placement: "replace_all" },
      ],
    });
    await db.testProtocols.update("protocol-tronc", { status: "paused" });

    await expect(startWorkout("weekly-2026-10-26-evening", T)).rejects.toThrow(/aucun exercice/);
  });
});
