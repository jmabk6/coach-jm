import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkTestLinks, verifyBackup } from "../../../scripts/verify-backup.mjs";
import { db } from "../../db/database";
import type { PerformedTestBlock, TestResult, WorkoutSession } from "../../domain";
import { listTestsToReschedule } from "../../domain/rules/testPlanRules";
import { readStores } from "../backup/exportBackup";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { deleteWorkout } from "../workout/deleteWorkout";
import { endAndConfirm } from "../workout/endAndConfirmForTests";
import { applyWorkoutAction } from "../workout/engine/persistWorkout";
import { addTestTrial, finishBlock, skipBlock } from "../workout/engine/workoutEngine";
import { startWorkout } from "../workout/startWorkout";
import { testResultIdFor } from "./settleTestBlocks";

/**
 * Lot G.5 — à l'enregistrement, chaque test réalisé devient un
 * `TestResult` et la brique ne garde que `testResultId` (D27) ; la
 * suppression de la séance emporte ses résultats et défige la version ;
 * T-19 : `checkTestLinks` contrôle I-10 à I-13 et détecte un orphelin.
 */

const T = "2026-10-25T09:00:00.000Z";
const SAVE = "2026-10-25T10:30:00.000Z";
const WORKOUT = "workout-weekly-2026-10-25";
const TEST = "workout-block-test-protocol-traction";

async function stores() {
  return (await readStores(db)).stores as Record<string, unknown[]>;
}

async function tractionSession(trials: Array<[number, "success" | "failure"]>, options: { skip?: boolean } = {}) {
  await startWorkout("weekly-2026-10-25", T);
  for (const [value, outcome] of trials) {
    await applyWorkoutAction(WORKOUT, (current, at) => addTestTrial(current, TEST, { value, outcome, restSec: 180 }, at), T);
  }
  await applyWorkoutAction(WORKOUT, (current, at) => (options.skip ? skipBlock(current, TEST, at) : finishBlock(current, TEST, at)), T);
  await endAndConfirm(WORKOUT, SAVE);
}

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

describe("enregistrer une séance avec un test (D27)", () => {
  it("le résultat est créé avec ses mesures dérivées ; la brique ne garde que testResultId ; la version se fige", async () => {
    await tractionSession([[40, "success"], [38, "success"], [36, "failure"]]);

    const id = testResultIdFor(WORKOUT, TEST);
    const result = (await db.testResults.get(id))!;
    expect(result).toMatchObject({
      protocolId: "protocol-traction", versionId: "protocol-traction-v1", date: "2026-10-25", origin: "workout",
      workoutId: WORKOUT, blockId: TEST, status: "complete",
    });
    expect(result.measures).toEqual([
      { key: "assistance_min_kg", value: 38, unit: "kg" },
      { key: "essais_nb", value: 3, unit: "essais" },
    ]);
    expect(result.trials?.map((trial) => trial.value)).toEqual([40, 38, 36]);

    const block = (await db.workouts.get(WORKOUT))!.blocks.find((item) => item.id === TEST) as PerformedTestBlock;
    expect(block.draft).toBeUndefined();
    expect(block.testResultId).toBe(id);
    expect(await db.testProtocolVersions.get("protocol-traction-v1")).toMatchObject({ firstOfficialResultId: id, frozenAt: SAVE });

    expect(checkTestLinks(await stores())).toEqual([]);
    /* Fait ce jour-là : plus rien à replanifier. */
    const planned = await db.plannedSessions.toArray();
    expect(listTestsToReschedule(planned, await db.testResults.toArray(), "2026-10-26").map((item) => item.session.id)).not.toContain("weekly-2026-10-25");
  });

  it("test sauté : ni résultat, ni brouillon, ni figeage ; il devient à replanifier (I-13)", async () => {
    await tractionSession([[40, "success"]], { skip: true });

    expect(await db.testResults.count()).toBe(0);
    const block = (await db.workouts.get(WORKOUT))!.blocks.find((item) => item.id === TEST) as PerformedTestBlock;
    expect(block).toMatchObject({ status: "skipped" });
    expect(block.draft).toBeUndefined();
    expect(block.testResultId).toBeUndefined();
    expect((await db.testProtocolVersions.get("protocol-traction-v1"))?.firstOfficialResultId).toBeUndefined();
    expect(checkTestLinks(await stores())).toEqual([]);

    const planned = await db.plannedSessions.toArray();
    expect(listTestsToReschedule(planned, [], "2026-10-26").map((item) => [item.session.id, item.test.protocolId])).toContainEqual([
      "weekly-2026-10-25",
      "protocol-traction",
    ]);
  });

  it("résultat incomplet enregistré tel quel (aucun essai réussi)", async () => {
    await tractionSession([[40, "failure"]]);
    const result = (await db.testResults.get(testResultIdFor(WORKOUT, TEST)))!;
    expect(result.status).toBe("incomplete");
    expect(result.measures).toEqual([{ key: "essais_nb", value: 1, unit: "essais" }]);
  });
});

describe("supprimer la séance (SCHEMA § 8.1)", () => {
  it("son résultat disparaît dans la même transaction ; la version, sans autre résultat, se défige", async () => {
    await tractionSession([[40, "success"], [38, "failure"]]);
    await deleteWorkout(WORKOUT, SAVE);

    expect(await db.testResults.count()).toBe(0);
    const version = (await db.testProtocolVersions.get("protocol-traction-v1"))!;
    expect(version.firstOfficialResultId).toBeUndefined();
    expect(version.frozenAt).toBeUndefined();
    expect(checkTestLinks(await stores())).toEqual([]);
  });

  it("s'il reste un résultat de cette version, elle reste figée sur le plus ancien restant", async () => {
    const manual: TestResult = {
      id: "manual-traction-27-09", protocolId: "protocol-traction", versionId: "protocol-traction-v1", date: "2026-09-27",
      origin: "manual", status: "complete", measures: [{ key: "assistance_min_kg", value: 40, unit: "kg" }], createdAt: T, updatedAt: T,
    };
    await tractionSession([[40, "success"], [38, "failure"]]);
    await db.testResults.put(manual);

    await deleteWorkout(WORKOUT, SAVE);
    expect(await db.testProtocolVersions.get("protocol-traction-v1")).toMatchObject({ firstOfficialResultId: manual.id, frozenAt: SAVE });
  });
});

describe("T-19 : checkTestLinks et verify-backup (I-10 à I-13)", () => {
  it("chaque écart est détecté, avec son invariant", async () => {
    await tractionSession([[40, "success"], [38, "failure"]]);
    const base = await stores();
    const workouts = structuredClone(base.workouts) as WorkoutSession[];
    const confirmed = workouts.find((workout) => workout.id === WORKOUT)!;
    const block = confirmed.blocks.find((item) => item.id === TEST) as PerformedTestBlock;

    /* I-10 : brouillon resté ; I-11 : résultat absent (orphelin volontaire). */
    const altered = {
      ...base,
      workouts: [{ ...confirmed, blocks: confirmed.blocks.map((item) => (item.id === TEST ? { ...block, draft: { trials: [] }, testResultId: "absent" } : item)) }],
    };
    expect(checkTestLinks(altered)).toEqual([
      `I-10 workouts · ${WORKOUT} · ${TEST} : brique test enregistrée avec un brouillon (draft)`,
      `I-11 workouts · ${WORKOUT} · ${TEST} : testResultId absent sans résultat`,
      `I-12 testResults · ${testResultIdFor(WORKOUT, TEST)} : référencé par 0 brique(s) de sa séance`,
    ]);

    /* I-12 : résultat dont la séance a disparu ; I-13 : test sauté avec un résultat. */
    const orphanResult = { ...(base.testResults as TestResult[])[0]!, id: "orphelin", workoutId: "disparue" };
    const skipped = { ...confirmed, blocks: confirmed.blocks.map((item) => (item.id === TEST ? { ...block, status: "skipped" } : item)) };
    expect(checkTestLinks({ ...base, workouts: [skipped], testResults: [...(base.testResults as TestResult[]), orphanResult] })).toEqual([
      `I-13 workouts · ${WORKOUT} · ${TEST} : test sauté avec une saisie ou un résultat`,
      "I-12 testResults · orphelin : workoutId disparue sans séance",
    ]);
  });

  it("verify-backup relaie les écarts comme références à revoir", async () => {
    await tractionSession([[40, "success"], [38, "failure"]]);
    const base = await stores();
    const envelope = { format: "coach-jm-backup", formatVersion: 2, stores: { ...base, testResults: [] }, counts: {}, integrity: {} };
    const report = verifyBackup(envelope);
    expect(report.notes).toContain(`I-11 workouts · ${WORKOUT} · ${TEST} : testResultId ${testResultIdFor(WORKOUT, TEST)} sans résultat`);
  });
});
