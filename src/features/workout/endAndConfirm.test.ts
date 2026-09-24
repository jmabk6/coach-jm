import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import type { PerformedExerciseBlock, PerformedSeries, PlannedSession, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { recordWorkoutPresence } from "./engine/persistWorkout";
import { editSeries, validateSeries } from "./engine/workoutEngine";
import { calculateActiveDurationSec, shouldShowResumeSheet } from "./engine/workoutTime";
import { confirmWorkout, currentActiveDurationSec, endWorkout, isAwaitingConfirmation, milestoneIdFor } from "./finishWorkout";

/**
 * Lot E.1 — `Terminer` puis `Enregistrer` (D20, D21, conception V2 § 2.6) :
 * Terminer fige la durée et laisse la séance `in_progress` avec `endedAt` ;
 * jalons, figeage et instance `Faite` n'arrivent qu'à Enregistrer ; entre
 * les deux, seules les corrections sont permises et la séance n'entre
 * dans aucune statistique.
 */

const T = "2026-09-22T10:00:00.000Z";
const START = "2026-09-27T09:00:00.000Z";
const END = "2026-09-27T10:00:00.000Z"; // Terminer
const SAVE = "2026-09-27T10:20:00.000Z"; // Enregistrer, 20 min plus tard

const kg = (value: number) => ({ kind: "total" as const, kg: value });
const done = (id: string, load: number, reps: number): PerformedSeries => ({
  id, position: 0, status: "completed", role: "travail", load: kg(load), reps, rpe: 8, completedAt: "2026-09-27T09:30:00.000Z",
});

const version: StrengthFrameVersion = {
  id: "v-presse-1", frameId: "f-presse", number: 1, status: "active", progressionType: "charge_croissante", workSets: 2,
  repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 90, increment: { unit: "kg", value: 5 },
  currentTarget: { value: 130, unit: "kg", acceptedAt: T }, createdAt: T, updatedAt: T,
};

const presse: PerformedExerciseBlock = {
  id: "b-presse", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "presse-cuisses",
  frameVersionId: "v-presse-1", status: "not_performed",
  snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
  series: [done("s1", 130, 12), done("s2", 130, 12)],
};

const planned: PlannedSession = {
  id: "p1", date: "2026-09-27", sessionTemplateId: "v1-muscu-b", status: "in_progress", workoutId: "w1", source: "weekly_program",
  createdAt: T, updatedAt: T,
};

const running: WorkoutSession = {
  id: "w1", source: "planned", plannedSessionId: "p1", sessionTemplateId: "v1-muscu-b", kind: "training", status: "in_progress",
  date: "2026-09-27", startedAt: START, lastActionAt: "2026-09-27T09:58:00.000Z", activeDurationSec: 0,
  blocks: [presse], currentBlockId: "b-presse",
  activeRest: {
    id: "r1", kind: "between_sets", startedAt: "2026-09-27T09:58:00.000Z", targetEndAt: "2026-09-27T09:59:30.000Z",
    plannedDurationSec: 90, afterBlockId: "b-presse", afterEntryId: "s2",
  },
  pauses: [{ id: "pz", startedAt: "2026-09-27T09:50:00.000Z", endedAt: "2026-09-27T09:55:00.000Z" }],
  createdAt: START, updatedAt: START,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.strengthFrames.put({ id: "f-presse", exerciseId: "presse-cuisses", activeVersionId: "v-presse-1", createdAt: T, updatedAt: T });
  await db.strengthFrameVersions.put(version);
  await db.plannedSessions.put(planned);
  await db.workouts.put(running);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("Terminer", () => {
  it("pose endedAt, clôt le repos, fige la durée ; la séance reste en cours, rien n'est figé ni validé", async () => {
    const ended = await endWorkout("w1", END);

    expect(ended).toMatchObject({ status: "in_progress", endedAt: END });
    expect(ended.completedAt).toBeUndefined();
    expect(ended.activeRest).toBeUndefined();
    expect(ended.currentBlockId).toBeUndefined();
    expect((ended.blocks[0] as PerformedExerciseBlock).status).toBe("performed");
    /* 60 min d'amplitude moins 5 min de pause. */
    expect(ended.activeDurationSec).toBe(55 * 60);
    expect(isAwaitingConfirmation(ended)).toBe(true);

    /* Le temps qui passe ne compte plus. */
    expect(calculateActiveDurationSec(ended, SAVE)).toBe(55 * 60);
    expect(currentActiveDurationSec(ended, SAVE)).toBe(55 * 60);

    expect(await db.strengthMilestones.count()).toBe(0);
    expect((await db.strengthFrameVersions.get("v-presse-1"))?.firstOfficialWorkoutId).toBeUndefined();
    expect((await db.plannedSessions.get("p1"))?.status).toBe("in_progress");
  });

  it("en attente : absente des statistiques (séances enregistrées), sans feuille de reprise ni présence", async () => {
    const ended = await endWorkout("w1", END);

    expect(await getCompletedWorkouts()).toEqual([]);
    expect(shouldShowResumeSheet(ended, "2026-09-27T12:00:00.000Z")).toBe(false);
    expect(await recordWorkoutPresence(SAVE)).toBeUndefined();
    expect((await db.workouts.get("w1"))?.lastSeenAt).toBeUndefined();
  });

  it("en attente : plus aucun geste de séance, mais les corrections restent permises sans toucher à la durée", async () => {
    const ended = await endWorkout("w1", END);

    expect(() => validateSeries(ended, "b-presse", "s1", { reps: 10 }, SAVE)).toThrow(/seules les corrections/);
    const corrected = editSeries(ended, "b-presse", "s2", { reps: 11 }, SAVE);
    expect((corrected.blocks[0] as PerformedExerciseBlock).series?.[1]?.reps).toBe(11);
    expect(corrected.activeDurationSec).toBe(55 * 60);
    expect(corrected.endedAt).toBe(END);
  });

  it("Terminer deux fois ne change rien", async () => {
    const first = await endWorkout("w1", END);
    expect(await endWorkout("w1", SAVE)).toEqual(first);
  });
});

describe("Enregistrer", () => {
  it("refusé tant que la séance n'est pas terminée", async () => {
    await expect(confirmWorkout("w1", {}, SAVE)).rejects.toThrow("Terminez d'abord la séance");
    expect(await db.workouts.get("w1")).toEqual(running);
  });

  it("une transaction : ressenti, notes, completed à endedAt, jalon et figeage, instance Faite", async () => {
    await endWorkout("w1", END);
    const { workout, frames } = await confirmWorkout("w1", { feeling: 4, note: "  Bonne séance  " }, SAVE);

    expect(workout).toMatchObject({ status: "completed", completedAt: END, endedAt: END, feeling: 4, note: "Bonne séance", activeDurationSec: 55 * 60 });
    expect(frames).toEqual([
      { frameVersionId: "v-presse-1", result: { validated: true, value: 130, unit: "kg" }, milestoneId: milestoneIdFor("w1", "v-presse-1") },
    ]);
    expect(await db.strengthMilestones.count()).toBe(1);
    const frozen = await db.strengthFrameVersions.get("v-presse-1");
    expect(frozen).toMatchObject({ firstOfficialWorkoutId: "w1", frozenAt: SAVE });
    expect(frozen?.currentTarget).toBeUndefined();
    expect(await db.plannedSessions.get("p1")).toMatchObject({ status: "done", workoutId: "w1" });
    expect((await getCompletedWorkouts()).map((item) => item.id)).toEqual(["w1"]);
  });

  it("une correction faite en attente est celle qui compte à l'enregistrement", async () => {
    const ended = await endWorkout("w1", END);
    await db.workouts.put(editSeries(ended, "b-presse", "s2", { reps: 9 }, SAVE));

    const { frames } = await confirmWorkout("w1", {}, SAVE);
    expect(frames[0]?.result).toMatchObject({ validated: false });
    expect(await db.strengthMilestones.count()).toBe(0);
  });

  it("après Enregistrer : ni correction, ni second enregistrement", async () => {
    await endWorkout("w1", END);
    const { workout } = await confirmWorkout("w1", {}, SAVE);

    expect(() => editSeries(workout, "b-presse", "s2", { reps: 11 }, SAVE)).toThrow(/enregistrée/);
    await expect(confirmWorkout("w1", {}, SAVE)).rejects.toThrow("Cette séance est déjà enregistrée");
    await expect(endWorkout("w1", SAVE)).rejects.toThrow("Cette séance est déjà enregistrée");
  });
});
