import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, PerformedSeries, SessionTemplate, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { db } from "../../db/database";
import { detectStagnation, listVersionSessions, seriesByFrameVersion } from "../../domain/rules/strengthRules";
import { calculateVolume } from "../../domain/rules/workoutRules";
import { lastSessionOutcome } from "../strength/frameReadings";
import { updateExerciseBlock } from "../sessions/sessionTemplateEdits";
import { createWorkoutSnapshot } from "./createWorkoutSnapshot";
import { finishWorkout } from "./finishWorkout";

/**
 * Lot D.3 — brique d'échauffement (D14) et prescription réduite
 * (conception V2 § 2.5.1) : le leg curl de Muscu C (2 × 12) contre un
 * cadre 3 × 10-12 ne valide jamais le palier et n'entre pas en
 * stagnation ; ses séries comptent normalement ailleurs.
 */

const T = "2026-09-22T10:00:00.000Z";
const kg = (value: number) => ({ kind: "total" as const, kg: value });

const legCurlVersion: StrengthFrameVersion = {
  id: "v-leg-curl-1",
  frameId: "f-leg-curl",
  number: 1,
  status: "active",
  progressionType: "charge_croissante",
  workSets: 3,
  repRange: { min: 10, max: 12 },
  rpeTarget: 8,
  restSec: 90,
  increment: { unit: "kg", value: 5 },
  createdAt: T,
  updatedAt: T,
};

function template(sets: number): SessionTemplate {
  return {
    id: "v1-muscu-c",
    name: "Muscu C",
    category: "Musculation",
    status: "active",
    position: 0,
    createdAt: T,
    updatedAt: T,
    blocks: [
      {
        id: "echauffement",
        kind: "exercise",
        position: 0,
        role: "warmup",
        exerciseId: "tapis",
        instructions: { shape: "steps", steps: [{ id: "p", position: 0, durationSec: { min: 480, max: 600 }, speedKmh: 5, inclinePercent: 0 }] },
      },
      {
        id: "leg-curl",
        kind: "exercise",
        position: 1,
        exerciseId: "leg-curl-assis",
        instructions: { shape: "reps", sets, reps: { min: 12, max: 12 }, restBetweenSetsSec: 90 },
      },
    ],
  } as SessionTemplate;
}

const frames = new Map([["leg-curl-assis", "v-leg-curl-1"]]);
const versions = new Map([["v-leg-curl-1", legCurlVersion]]);

let n = 0;
function done(load: number, reps: number): PerformedSeries {
  n += 1;
  return { id: `s${n}`, position: n, status: "completed", role: "travail", load: kg(load), reps, rpe: 8, completedAt: T };
}

function session(id: string, date: string, series: PerformedSeries[], reduced: boolean): WorkoutSession {
  const block: PerformedExerciseBlock = {
    id: `${id}-b`,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId: "leg-curl-assis",
    frameVersionId: "v-leg-curl-1",
    ...(reduced ? { reducedPrescription: true } : {}),
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: series.length, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
    series,
  };
  return {
    id,
    source: "free",
    status: "completed",
    kind: "training",
    date,
    startedAt: `${date}T16:00:00.000Z`,
    lastActionAt: `${date}T16:40:00.000Z`,
    completedAt: `${date}T16:40:00.000Z`,
    activeDurationSec: 2400,
    blocks: [block],
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T16:40:00.000Z`,
  };
}

describe("démarrage : rôle recopié, prescription réduite posée", () => {
  it("2 séries prévues contre un cadre à 3 : brique réduite ; l'échauffement garde son rôle", () => {
    const [warmup, legCurl] = createWorkoutSnapshot(template(2), frames, versions) as PerformedExerciseBlock[];

    expect(warmup?.role).toBe("warmup");
    expect(warmup?.reducedPrescription).toBeUndefined();
    expect(legCurl).toMatchObject({ frameVersionId: "v-leg-curl-1", reducedPrescription: true });
    expect(legCurl?.role).toBeUndefined();
  });

  it("autant de séries que le cadre, ou pas de cadre : rien n'est posé", () => {
    const [, full] = createWorkoutSnapshot(template(3), frames, versions) as PerformedExerciseBlock[];
    expect(full?.reducedPrescription).toBeUndefined();

    const [, noFrame] = createWorkoutSnapshot(template(2)) as PerformedExerciseBlock[];
    expect(noFrame?.reducedPrescription).toBeUndefined();
    expect(noFrame?.frameVersionId).toBeUndefined();
  });

  it("éditeur de modèle : la case pose ou retire le rôle ; absente, elle ne le touche pas", () => {
    const base = template(2);
    const instructions = { shape: "reps" as const, sets: 2, reps: { min: 12, max: 12 }, restBetweenSetsSec: 90 };

    const cleared = updateExerciseBlock(base, "echauffement", { exerciseId: "tapis", instructions, warmup: false });
    expect(cleared.blocks[0]?.role).toBeUndefined();

    const set = updateExerciseBlock(base, "leg-curl", { exerciseId: "leg-curl-assis", instructions, warmup: true });
    expect(set.blocks[1]?.role).toBe("warmup");

    const kept = updateExerciseBlock(base, "echauffement", { exerciseId: "velo", instructions });
    expect(kept.blocks[0]?.role).toBe("warmup");
  });
});

describe("cadre : ni jalon, ni motif, ni stagnation pour une brique réduite", () => {
  const reducedA = session("w1", "2026-09-20", [done(30, 12), done(30, 12)], true);
  const reducedB = session("w2", "2026-09-24", [done(30, 12), done(30, 12)], true);
  const reducedC = session("w3", "2026-09-28", [done(30, 12), done(30, 12)], true);

  it("les séries réduites n'entrent pas dans les séries du cadre", () => {
    expect(seriesByFrameVersion(reducedA).get("v-leg-curl-1")).toBeUndefined();
    expect(lastSessionOutcome(legCurlVersion, [reducedA])).toBeUndefined();
  });

  it("trois séances réduites à la même charge : aucune stagnation", () => {
    expect(listVersionSessions(legCurlVersion, [reducedA, reducedB, reducedC])).toEqual([]);
    expect(detectStagnation(legCurlVersion, [reducedA, reducedB, reducedC], [])).toBeUndefined();

    /* Les mêmes séances non réduites (3 séries) seraient une stagnation : la règle a bien mordu. */
    const full = (id: string, date: string) => session(id, date, [done(30, 11), done(30, 10), done(30, 10)], false);
    expect(detectStagnation(legCurlVersion, [full("f1", "2026-09-20"), full("f2", "2026-09-24"), full("f3", "2026-09-28")], [])).toBeDefined();
  });

  it("les séries restent des données d'entraînement : tonnage ordinaire", () => {
    const block = reducedA.blocks[0] as PerformedExerciseBlock;
    expect(calculateVolume(block.series ?? [])).toBe(30 * 12 * 2);
  });
});

describe("clôture (base réelle, fake-indexeddb)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("brique réduite : aucun jalon, aucun sort ; la version est tout de même figée par sa première séance officielle", async () => {
    await db.strengthFrames.put({ id: "f-leg-curl", exerciseId: "leg-curl-assis", activeVersionId: "v-leg-curl-1", createdAt: T, updatedAt: T });
    await db.strengthFrameVersions.put({ ...legCurlVersion, currentTarget: { value: 30, unit: "kg", acceptedAt: T } });
    const running: WorkoutSession = { ...session("w1", "2026-09-20", [done(30, 12), done(30, 12)], true), status: "in_progress" };
    delete running.completedAt;
    await db.workouts.put(running);

    const { frames: outcomes } = await finishWorkout("w1", "2026-09-20T16:45:00.000Z");

    expect(outcomes).toEqual([]);
    expect(await db.strengthMilestones.count()).toBe(0);
    const version = await db.strengthFrameVersions.get("v-leg-curl-1");
    expect(version).toMatchObject({ firstOfficialWorkoutId: "w1", currentTarget: { value: 30, unit: "kg" } });
  });
});
