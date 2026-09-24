import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PerformedExerciseBlock,
  PerformedSeries,
  PlannedSession,
  StrengthFrameVersion,
  WorkoutSession,
} from "../../domain";
import { db } from "../../db/database";
import { completeWorkoutSession, milestoneIdFor } from "./finishWorkout";
import { endAndConfirm as finishWorkout } from "./endAndConfirmForTests";

const startedAt = "2026-09-17T16:00:00.000Z";
const now = "2026-09-17T16:42:00.000Z";

const freeWorkout: WorkoutSession = {
  id: "free-1",
  source: "free",
  status: "in_progress",
  date: "2026-09-17",
  startedAt,
  lastActionAt: startedAt,
  activeDurationSec: 0,
  blocks: [],
  currentBlockId: "b1",
  pauses: [
    { id: "pause-1", startedAt: "2026-09-17T16:20:00.000Z", endedAt: "2026-09-17T16:30:00.000Z" },
  ],
  createdAt: startedAt,
  updatedAt: startedAt,
};

describe("completeWorkoutSession", () => {
  it("passe la séance Faite, durée active = amplitude moins les pauses", () => {
    const result = completeWorkoutSession(freeWorkout, now);

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBe(now);
    expect(result.lastActionAt).toBe(now);
    expect(result.activeDurationSec).toBe(42 * 60 - 10 * 60);
    expect(result.activeRest).toBeUndefined();
    expect(result.currentBlockId).toBeUndefined();
  });

  it("termine à la clôture une pause encore ouverte", () => {
    const result = completeWorkoutSession(
      {
        ...freeWorkout,
        pauses: [{ id: "pause-1", startedAt: "2026-09-17T16:30:00.000Z" }],
      },
      now,
    );

    expect(result.pauses).toEqual([
      { id: "pause-1", startedAt: "2026-09-17T16:30:00.000Z", endedAt: now },
    ]);
    expect(result.activeDurationSec).toBe(30 * 60);
  });
});

describe("completeWorkoutSession — nature conservée", () => {
  it("garde kind tel quel à la clôture, et n'en invente pas sur une séance qui n'en a pas", () => {
    expect(completeWorkoutSession({ ...freeWorkout, kind: "mobility_assessment" }, now).kind).toBe("mobility_assessment");
    expect(completeWorkoutSession({ ...freeWorkout, kind: "training" }, now).kind).toBe("training");
    expect("kind" in completeWorkoutSession(freeWorkout, now)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Sur la vraie base (fake-indexeddb)                                         */
/* -------------------------------------------------------------------------- */

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await db.delete();
});

describe("finishWorkout", () => {
  it("termine une séance libre sans toucher au Programme", async () => {
    await db.workouts.put(freeWorkout);

    const { workout: result, frames } = await finishWorkout("free-1", now);

    expect(result.status).toBe("completed");
    expect(frames).toEqual([]);
    expect(await db.workouts.get("free-1")).toEqual(result);
    expect(await db.plannedSessions.count()).toBe(0);
  });

  it("passe l'instance Faite pour une séance planifiée", async () => {
    const plannedSession: PlannedSession = {
      id: "p1",
      date: "2026-09-17",
      sessionTemplateId: "muscu-a",
      status: "in_progress",
      workoutId: "workout-p1",
      source: "manual",
      createdAt: startedAt,
      updatedAt: startedAt,
    };
    await db.plannedSessions.put(plannedSession);
    await db.workouts.put({
      ...freeWorkout,
      id: "workout-p1",
      source: "planned",
      plannedSessionId: "p1",
      sessionTemplateId: "muscu-a",
    });

    await finishWorkout("workout-p1", now);

    expect(await db.plannedSessions.get("p1")).toEqual({
      ...plannedSession,
      status: "done",
      workoutId: "workout-p1",
      updatedAt: now,
    });
  });

  it("refuse de terminer deux fois, et ne réécrit rien", async () => {
    const completed = { ...freeWorkout, status: "completed" as const, updatedAt: "x" };
    await db.workouts.put(completed);

    await expect(finishWorkout("free-1", now)).rejects.toThrow("Cette séance est déjà enregistrée");
    expect(await db.workouts.get("free-1")).toEqual(completed);
  });
});

/* -------------------------------------------------------------------------- */
/* Cadres à la clôture (v1.6, § 4.2 bis, § 4.3, § 4.4)                        */
/* -------------------------------------------------------------------------- */

const T = "2026-09-22T10:00:00.000Z";

function version(overrides: Partial<StrengthFrameVersion> = {}): StrengthFrameVersion {
  return {
    id: "v-presse-1",
    frameId: "f-presse",
    number: 1,
    status: "active",
    progressionType: "charge_croissante",
    workSets: 3,
    repRange: { min: 10, max: 12 },
    rpeTarget: 8,
    restSec: 90,
    increment: { unit: "kg", value: 2.5 },
    createdAt: T,
    updatedAt: T,
    ...overrides,
  };
}

const kg = (value: number) => ({ kind: "total" as const, kg: value });

function done(id: string, load: number, reps: number, rpe: number, extra: Partial<PerformedSeries> = {}): PerformedSeries {
  return { id, position: 0, status: "completed", role: "travail", load: kg(load), reps, rpe, completedAt: T, ...extra };
}

function presseBlock(series: PerformedSeries[], frameVersionId: string | null = "v-presse-1"): PerformedExerciseBlock {
  return {
    id: "b-presse",
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId: "presse",
    ...(frameVersionId !== null ? { frameVersionId } : {}),
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
    series,
  };
}

const validSeries = [done("s1", 100, 12, 8), done("s2", 100, 12, 7), done("s3", 100, 12, 8)];

async function seedFrame(overrides: Partial<StrengthFrameVersion> = {}) {
  await db.strengthFrames.put({ id: "f-presse", exerciseId: "presse", activeVersionId: "v-presse-1", createdAt: T, updatedAt: T });
  await db.strengthFrameVersions.put(version(overrides));
}

describe("finishWorkout — cadres, jalons et figeage", () => {
  it("séance validée : un jalon, la version figée, l'objectif en cours effacé — le tout en une fois", async () => {
    await seedFrame({ currentTarget: { value: 100, unit: "kg", acceptedAt: T } });
    await db.workouts.put({ ...freeWorkout, id: "w1", kind: "training", blocks: [presseBlock(validSeries)] });

    const { frames } = await finishWorkout("w1", now);

    expect(frames).toEqual([
      { frameVersionId: "v-presse-1", result: { validated: true, value: 100, unit: "kg" }, milestoneId: milestoneIdFor("w1", "v-presse-1") },
    ]);
    expect(await db.strengthMilestones.toArray()).toEqual([
      { id: "milestone-w1-v-presse-1", frameVersionId: "v-presse-1", workoutId: "w1", date: "2026-09-17", value: 100, unit: "kg", createdAt: now },
    ]);
    const frozen = await db.strengthFrameVersions.get("v-presse-1");
    expect(frozen).toMatchObject({ firstOfficialWorkoutId: "w1", frozenAt: now, updatedAt: now });
    expect(frozen).not.toHaveProperty("currentTarget");
  });

  it("séance non validée : aucun jalon, motif retourné, version figée quand même, objectif conservé", async () => {
    await seedFrame({ currentTarget: { value: 100, unit: "kg", acceptedAt: T } });
    await db.workouts.put({
      ...freeWorkout,
      id: "w1",
      kind: "training",
      blocks: [presseBlock([done("s1", 100, 12, 8), done("s2", 100, 11, 9), done("s3", 100, 12, 8)])],
    });

    const { frames } = await finishWorkout("w1", now);

    expect(frames).toEqual([{ frameVersionId: "v-presse-1", result: { validated: false, reason: "reps_insuffisantes" } }]);
    expect(await db.strengthMilestones.count()).toBe(0);
    expect(await db.strengthFrameVersions.get("v-presse-1")).toMatchObject({
      firstOfficialWorkoutId: "w1",
      frozenAt: now,
      currentTarget: { value: 100, unit: "kg", acceptedAt: T },
    });
  });

  it("deuxième séance : le figeage ne bouge pas, un second jalon s'ajoute ; le jalon lit la version portée, pas la version active", async () => {
    await seedFrame({ firstOfficialWorkoutId: "w0", frozenAt: "2026-09-10T10:00:00.000Z" });
    /* Le cadre pointe désormais une V2 plus exigeante ; la séance a été démarrée sous la V1. */
    await db.strengthFrameVersions.put(version({ id: "v-presse-2", number: 2, workSets: 4 }));
    await db.strengthFrames.update("f-presse", { activeVersionId: "v-presse-2" });
    await db.workouts.put({ ...freeWorkout, id: "w2", kind: "training", blocks: [presseBlock(validSeries)] });

    const { frames } = await finishWorkout("w2", now);

    expect(frames[0]).toMatchObject({ frameVersionId: "v-presse-1", result: { validated: true, value: 100 } });
    expect(await db.strengthFrameVersions.get("v-presse-1")).toMatchObject({ firstOfficialWorkoutId: "w0", frozenAt: "2026-09-10T10:00:00.000Z" });
    expect(await db.strengthFrameVersions.get("v-presse-2")).not.toHaveProperty("firstOfficialWorkoutId");
    expect((await db.strengthMilestones.toArray()).map((m) => m.id)).toEqual(["milestone-w2-v-presse-1"]);
  });

  it("brique sans version, bilan de mobilité, séance import-* : aucun jalon, aucun figeage", async () => {
    await seedFrame();

    await db.workouts.put({ ...freeWorkout, id: "w-nue", kind: "training", blocks: [presseBlock(validSeries, null)] });
    expect((await finishWorkout("w-nue", now)).frames).toEqual([]);

    await db.workouts.put({ ...freeWorkout, id: "w-bilan", kind: "mobility_assessment", blocks: [presseBlock(validSeries)] });
    expect((await finishWorkout("w-bilan", now)).frames).toEqual([]);

    await db.workouts.put({ ...freeWorkout, id: "import-2026-09-30", kind: "training", blocks: [presseBlock(validSeries)] });
    expect((await finishWorkout("import-2026-09-30", now)).frames).toEqual([]);

    expect(await db.strengthMilestones.count()).toBe(0);
    expect(await db.strengthFrameVersions.get("v-presse-1")).not.toHaveProperty("firstOfficialWorkoutId");
  });

  it("version référencée mais exercice sauté : figée (référencée), pas de résultat ; version disparue : ignorée", async () => {
    await seedFrame();
    const skipped: PerformedExerciseBlock = { ...presseBlock([]), status: "skipped", series: [{ id: "s", position: 0, status: "not_performed" }] };
    const ghost: PerformedExerciseBlock = { ...presseBlock(validSeries, "v-fantome"), id: "b-ghost", position: 1 };
    await db.workouts.put({ ...freeWorkout, id: "w1", kind: "training", blocks: [skipped, ghost] });

    const { frames } = await finishWorkout("w1", now);

    expect(frames).toEqual([]);
    expect(await db.strengthFrameVersions.get("v-presse-1")).toMatchObject({ firstOfficialWorkoutId: "w1" });
    expect(await db.strengthMilestones.count()).toBe(0);
  });

  it("transactionnel : si le jalon ne peut pas s'écrire, la séance reste en cours et la version non figée", async () => {
    await seedFrame();
    await db.workouts.put({ ...freeWorkout, id: "w1", kind: "training", blocks: [presseBlock(validSeries)] });
    vi.spyOn(db.strengthMilestones, "put").mockRejectedValue(new Error("disque plein"));

    await expect(finishWorkout("w1", now)).rejects.toThrow("disque plein");

    expect((await db.workouts.get("w1"))?.status).toBe("in_progress");
    expect(await db.strengthFrameVersions.get("v-presse-1")).not.toHaveProperty("firstOfficialWorkoutId");
    expect(await db.strengthMilestones.count()).toBe(0);
  });
});
