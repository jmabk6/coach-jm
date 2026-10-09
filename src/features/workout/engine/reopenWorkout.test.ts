import { describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, WorkoutSession } from "../../../domain";
import { activateBlock, completeWorkoutSession, endWorkoutSession, reopenWorkoutSession, skipBlock, validateSeries } from "./workoutEngine";

/**
 * « Reprendre la séance » (10/10/2026) : « Terminer » touché par erreur, la
 * séance revient exactement où elle en était — exercices restants, exercice
 * en cours, ressenti et notes déjà saisis. Le temps passé sur l'écran de fin
 * ne compte pas dans la durée active. Une séance enregistrée ne se reprend
 * pas.
 */

const T0 = "2026-10-10T10:00:00.000Z";
const at = (minutes: number) => new Date(new Date(T0).getTime() + minutes * 60_000).toISOString();
let counter = 0;
const newId = () => `id${++counter}`;

function block(id: string, position: number): PerformedExerciseBlock {
  return {
    id, kind: "exercise", position, addedDuringWorkout: false, exerciseId: id, status: "not_performed",
    snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 90 },
    series: [0, 1, 2].map((index) => ({ id: `${id}-s${index}`, position: index, status: "upcoming" as const })),
  };
}

function started(): WorkoutSession {
  const base: WorkoutSession = {
    id: "w", source: "free", status: "in_progress", date: "2026-10-10", startedAt: T0, lastActionAt: T0, activeDurationSec: 0,
    blocks: [block("rowing", 0), block("curl", 1), block("triceps", 2)], createdAt: T0, updatedAt: T0,
  };
  let w = activateBlock(base, "rowing", T0);
  w = validateSeries(w, "rowing", "rowing-s0", { reps: 10 }, at(2), newId);
  w = validateSeries(w, "rowing", "rowing-s1", { reps: 9 }, at(5), newId);
  w = skipBlock(w, "triceps", at(6));
  return w;
}

describe("reprendre une séance terminée par erreur", () => {
  it("Terminer garde l'état d'avant ; Reprendre le rend à l'identique (séries restantes, exercice en cours, briques sautées) et efface la fin", () => {
    const before = started();
    /* Seule différence attendue : le repos en cours au moment de Terminer est clos (5 min, hors repos moyen), comme avant. */
    const expected = structuredClone(before.blocks);
    Object.assign((expected[0] as PerformedExerciseBlock).series![1]!, { actualRestAfterSec: 300, restComparable: false });
    const ended = endWorkoutSession(before, at(10));
    expect(ended.endedAt).toBe(at(10));
    expect((ended.blocks.find((item) => item.id === "curl") as PerformedExerciseBlock).status).toBe("not_performed");
    expect(ended.resumeState?.blocks).toEqual(expected);

    const reopened = reopenWorkoutSession({ ...ended, feeling: 4, note: "Bonne séance" }, at(14), newId);
    expect(reopened.endedAt).toBeUndefined();
    expect(reopened.resumeState).toBeUndefined();
    expect(reopened.status).toBe("in_progress");
    expect(reopened.blocks).toEqual(expected);
    expect(reopened.currentBlockId).toBe(before.currentBlockId);
    expect(reopened.currentEntryId).toBe(before.currentEntryId);
    /* Ressenti et notes déjà saisis sur l'écran de fin : gardés. */
    expect([reopened.feeling, reopened.note]).toEqual([4, "Bonne séance"]);
  });

  it("le temps passé sur l'écran de fin ne compte pas : une pause de la fin à la reprise", () => {
    const ended = endWorkoutSession(started(), at(10));
    expect(ended.activeDurationSec).toBe(10 * 60);
    const reopened = reopenWorkoutSession(ended, at(14), newId);
    expect(reopened.pauses?.at(-1)).toMatchObject({ startedAt: at(10), endedAt: at(14) });
    expect(reopened.activeDurationSec).toBe(10 * 60);
    /* Puis la séance continue normalement et se termine pour de bon. */
    const later = validateSeries(reopened, "rowing", "rowing-s2", { reps: 8 }, at(16), newId);
    const done = completeWorkoutSession(later, at(20));
    expect(done.activeDurationSec).toBe(16 * 60);
    expect(done.resumeState).toBeUndefined();
    expect((done.blocks.find((item) => item.id === "rowing") as PerformedExerciseBlock).series!.map((series) => series.status)).toEqual(["completed", "completed", "completed"]);
  });

  it("une séance enregistrée, non terminée, ou terminée sans état gardé ne se reprend pas", () => {
    const ended = endWorkoutSession(started(), at(10));
    expect(() => reopenWorkoutSession(completeWorkoutSession(ended, at(11)), at(12), newId)).toThrow();
    expect(() => reopenWorkoutSession(started(), at(12), newId)).toThrow();
    const withoutState = { ...ended };
    delete withoutState.resumeState;
    expect(() => reopenWorkoutSession(withoutState, at(12), newId)).toThrow();
  });
});
