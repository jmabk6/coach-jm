import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, SessionTemplate, StrengthFrame, StrengthFrameVersion, StrengthMilestone, WorkoutSession } from "../../domain";
import { frameParametersChanged, nextStep, proposeRaise } from "../../domain/rules/strengthRules";
import { canonicalStringify } from "../backup/canonicalJson";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { WRITE_METHODS, writePrototypeOf } from "../backup/testDatabase";
import { PROGRAM_V1_TEMPLATES } from "../program/programV1";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { FIX_WORKOUT_ID, fixesOf20260924 } from "../workout/seedFixWorkout20260924";
import { buildWorkout20260925, WORKOUT_20260925_ID } from "../history/seedWorkout20260925";
import { updateFrameVersion } from "./frameActions";

vi.stubEnv("BASE_URL", "/coach-jm/");
const { runSeeds, resumeSeedsForTests } = await import("../seed/runSeeds");
const { PROGRAM_V1_FRAMES, programFrameIds, seedProgramFrames } = await import("./seedProgramFrames");

/**
 * Lot D.6 — seed 7 : cadres du programme V1 et premières cibles (D19),
 * incrément facultatif (D18), renseigner un incrément absent ne crée pas
 * de version (N4), et T-21 (R) sur la sauvegarde du 23/09.
 */

beforeEach(async () => {
  resumeSeedsForTests();
  db.close();
  await db.delete();
  await db.open();
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  vi.unstubAllEnvs();
  db.close();
  await db.delete();
});

function spyWrites() {
  const proto = writePrototypeOf(db);
  return WRITE_METHODS.map((method) => vi.spyOn(proto, method));
}

async function versionOf(exerciseId: string): Promise<StrengthFrameVersion | undefined> {
  const frame = await db.strengthFrames.where("exerciseId").equals(exerciseId).first();
  return frame ? db.strengthFrameVersions.get(frame.activeVersionId) : undefined;
}

describe("seed 7 sur une base neuve", () => {
  it("un cadre par exercice à charge du programme, avec ses premières cibles", async () => {
    await runSeeds();
    const install = (await db.settings.get("install"))?.value as { frames?: string };
    expect(install.frames).toEqual(expect.any(String));

    expect(await db.strengthFrames.count()).toBe(PROGRAM_V1_FRAMES.length);
    const targets = Object.fromEntries(
      await Promise.all(PROGRAM_V1_FRAMES.map(async (spec) => [spec.exerciseId, (await versionOf(spec.exerciseId))?.currentTarget?.value] as const)),
    );
    expect(targets).toEqual({
      "traction-assistee": 52,
      squat: 35,
      "rowing-poulie-basse": 40,
      "chest-press": 37.5,
      "leg-curl-assis": 32.5,
      "elevations-laterales-halteres": 5,
      "developpe-epaules-machine": 27.5,
      "presse-cuisses": 130,
      "developpe-incline-halteres": undefined,
      "tirage-vertical": 40,
      "extension-triceps-poulie": 15,
      "pullover-poulie": undefined,
      "mollets-debout": undefined,
    });

    const traction = await versionOf("traction-assistee");
    expect(traction).toMatchObject({ progressionType: "assistance_decroissante", workSets: 3, repRange: { min: 6, max: 8 }, restSec: 150, rpeTarget: 8 });
    expect(traction?.increment).toBeUndefined();
    expect(traction?.currentTarget).toEqual({ value: 52, unit: "kg", acceptedAt: install.frames });

    expect(await versionOf("squat")).toMatchObject({ barWeightKg: 20, increment: { unit: "kg", value: 5 }, repRange: { min: 8, max: 10 }, restSec: 120 });
    expect((await versionOf("elevations-laterales-halteres"))?.increment).toEqual({ unit: "kg", value: 1 });
    expect((await versionOf("chest-press"))?.increment).toEqual({ unit: "kg", value: 2.5 });
    expect((await versionOf("leg-curl-assis"))?.workSets).toBe(3);

    for (const exerciseId of ["traction-negative", "suspension-omoplates", "chaise-60", "montee-banc", "marche-laterale-elastique", "sprint-velo"]) {
      expect(await versionOf(exerciseId), exerciseId).toBeUndefined();
    }

    const spies = spyWrites();
    await runSeeds();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("un exercice qui a déjà un cadre n'en reçoit pas un second ; l'existant reste identique", async () => {
    await runSeeds();
    await db.strengthFrames.clear();
    await db.strengthFrameVersions.clear();
    const install = (await db.settings.get("install"))!;
    await db.settings.put({ key: "install", value: { ...(install.value as object), frames: undefined } } as never);

    const mine: StrengthFrame = { id: "frame-perso", exerciseId: "tirage-vertical", activeVersionId: "frame-perso-v1", createdAt: "x", updatedAt: "y" };
    const myVersion: StrengthFrameVersion = {
      id: "frame-perso-v1", frameId: "frame-perso", number: 1, status: "active", progressionType: "charge_croissante", workSets: 3,
      repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 90, increment: { unit: "kg", value: 2.5 },
      currentTarget: { value: 40, unit: "kg", acceptedAt: "2026-09-22T10:12:04.435Z" }, createdAt: "x", updatedAt: "y",
    };
    await db.strengthFrames.put(mine);
    await db.strengthFrameVersions.put(myVersion);

    await seedProgramFrames("2026-09-24T10:00:00.000Z");

    expect(await db.strengthFrames.where("exerciseId").equals("tirage-vertical").toArray()).toEqual([mine]);
    expect(await db.strengthFrameVersions.get("frame-perso-v1")).toEqual(myVersion);
    expect(await db.strengthFrameVersions.get(programFrameIds("tirage-vertical").versionId)).toBeUndefined();
    expect(await db.strengthFrames.count()).toBe(PROGRAM_V1_FRAMES.length);
  });

  it("leg curl de Muscu C : 2 séries contre un cadre à 3, prescription réduite au démarrage", async () => {
    await runSeeds();
    const frames = await db.strengthFrames.toArray();
    const versions = await db.strengthFrameVersions.toArray();
    const muscuC = (await db.sessionTemplates.get("v1-muscu-c")) as SessionTemplate;

    const blocks = createWorkoutSnapshot(
      muscuC,
      new Map(frames.map((frame) => [frame.exerciseId, frame.activeVersionId])),
      new Map(versions.map((version) => [version.id, version])),
    );
    const legCurl = blocks.find((block) => block.kind === "exercise" && block.exerciseId === "leg-curl-assis") as PerformedExerciseBlock;
    expect(legCurl).toMatchObject({ frameVersionId: programFrameIds("leg-curl-assis").versionId, reducedPrescription: true });
    expect(PROGRAM_V1_TEMPLATES.find((t) => t.id === "v1-muscu-a")!.blocks.some((b) => b.kind === "exercise" && b.exerciseId === "leg-curl-assis")).toBe(true);
  });
});

describe("incrément facultatif (D18) et N4", () => {
  const T = "2026-09-22T10:00:00.000Z";
  const noIncrement: StrengthFrameVersion = {
    id: "v", frameId: "f", number: 1, status: "active", progressionType: "assistance_decroissante", workSets: 3,
    repRange: { min: 6, max: 8 }, rpeTarget: 8, restSec: 150, createdAt: T, updatedAt: T,
  };

  it("sans incrément : aucun cran, aucune hausse proposée", () => {
    expect(nextStep(noIncrement, 52)).toBeUndefined();
    const milestone: StrengthMilestone = { id: "m", frameVersionId: "v", workoutId: "w", date: "2026-09-27", value: 52, unit: "kg", createdAt: T };
    const workout = { id: "w", status: "completed", startedAt: "2026-09-27T10:00:00.000Z", blocks: [] } as unknown as WorkoutSession;
    expect(proposeRaise(noIncrement, [milestone], [workout])).toBeUndefined();
    expect(proposeRaise({ ...noIncrement, increment: { unit: "kg", value: 7 } }, [milestone], [workout])).toMatchObject({ value: 45 });
  });

  it("renseigner un incrément absent n'est pas un changement ; le modifier ou le retirer en est un", () => {
    const withIncrement = { ...noIncrement, increment: { unit: "kg" as const, value: 7 } };
    expect(frameParametersChanged(noIncrement, withIncrement)).toBe(false);
    expect(frameParametersChanged(withIncrement, { ...withIncrement, increment: { unit: "kg", value: 5 } })).toBe(true);
    expect(frameParametersChanged(withIncrement, noIncrement)).toBe(true);
  });

  it("version figée : saisir le cran de la machine la met à jour en place, sans nouvelle version", async () => {
    await runSeeds();
    const { frameId, versionId } = programFrameIds("traction-assistee");
    await db.strengthFrameVersions.update(versionId, { firstOfficialWorkoutId: "w1", frozenAt: T });
    const frame = (await db.strengthFrames.get(frameId))!;
    const exercise = (await db.exercises.get("traction-assistee"))!;
    const current = (await db.strengthFrameVersions.get(versionId))!;

    const outcome = await updateFrameVersion(exercise, frame, {
      progressionType: current.progressionType,
      workSets: current.workSets,
      repRange: current.repRange!,
      rpeTarget: current.rpeTarget!,
      restSec: current.restSec,
      increment: { unit: "kg", value: 7 },
    });

    expect(outcome.kind).toBe("updated");
    expect(await db.strengthFrameVersions.where("frameId").equals(frameId).count()).toBe(1);
    expect(await db.strengthFrameVersions.get(versionId)).toMatchObject({ number: 1, increment: { unit: "kg", value: 7 }, firstOfficialWorkoutId: "w1" });
  });
});

describe("T-21 (R) — sauvegarde réelle : le cadre existant n'est ni doublé ni modifié", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("seeds 1 à 7 : tirage-vertical garde son unique cadre, identique au fichier ; second passage sans écriture", async () => {
    const file = parseBackup(await readFile(path!, "utf8"));
    await resetAndRestore(file, db);
    resumeSeedsForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await runSeeds()).toMatchObject({ failed: [], skipped: [] });

    const fileFrames = (file.stores.strengthFrames ?? []) as StrengthFrame[];
    const fileVersions = (file.stores.strengthFrameVersions ?? []) as StrengthFrameVersion[];
    for (const frame of fileFrames) {
      expect(canonicalStringify(await db.strengthFrames.get(frame.id)), frame.id).toBe(canonicalStringify(frame));
      expect(await db.strengthFrames.where("exerciseId").equals(frame.exerciseId).count(), frame.exerciseId).toBe(1);
    }
    for (const version of fileVersions) {
      expect(canonicalStringify(await db.strengthFrameVersions.get(version.id)), version.id).toBe(canonicalStringify(version));
    }

    const covered = new Set(fileFrames.map((frame) => frame.exerciseId));
    for (const spec of PROGRAM_V1_FRAMES) {
      expect(await db.strengthFrames.where("exerciseId").equals(spec.exerciseId).count(), spec.exerciseId).toBe(1);
      if (!covered.has(spec.exerciseId)) expect(await db.strengthFrames.get(programFrameIds(spec.exerciseId).frameId), spec.exerciseId).toBeDefined();
    }
    const workouts = await db.workouts.orderBy("id").toArray();
    /* Seed 10 : seule la Cardio A du 24/09, dans l'état constaté, est corrigée. */
    /* Seed 12 : la séance du 25/09 ajoutée dans la base de l'utilisateur. */
    const added = workouts.find((workout) => workout.id === WORKOUT_20260925_ID);
    const expected = [
      ...(file.stores.workouts as WorkoutSession[]).map(
        (workout) =>
          workout.id === FIX_WORKOUT_ID
            ? fixesOf20260924(workout, workouts.find((item) => item.id === workout.id)?.updatedAt ?? "")
            : workout,
      ),
      ...(added ? [buildWorkout20260925(added.createdAt)] : []),
    ];
    expect(canonicalStringify(workouts)).toBe(
      canonicalStringify(expected.sort((a, b) => (a.id < b.id ? -1 : 1))),
    );

    const spies = spyWrites();
    await runSeeds();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
