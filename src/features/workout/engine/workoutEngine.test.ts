import { describe, expect, it } from "vitest";
import type {
  Exercise,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  WorkoutSession,
} from "../../../domain";
import { calculateExecutionProgress } from "../../../domain/rules/workoutRules";
import {
  activateBlock,
  addExerciseBlocks,
  addRound,
  addSeries,
  addStep,
  adjustRest,
  buildResumeSummary,
  completeWorkoutSession,
  editRoundChild,
  editSeries,
  editSimpleMeasurement,
  editStep,
  finishBlock,
  findSubstitutionRound,
  substituteExercise,
  substituteGroupChild,
  pauseWorkout,
  recordPresence,
  resumeWorkout,
  skipBlock,
  skipRest,
  unskipBlock,
  updateStep,
  validateRoundChild,
  validateSeries,
  validateSimpleMeasurement,
  validateStep,
} from "./workoutEngine";
import {
  formatBlockCompletion,
  proposeRoundChildValues,
  proposeSeriesValues,
  summarizeBlockCompletion,
} from "./workoutBlocks";
import { getRestCountdown, shouldShowResumeSheet, summarizeRests } from "./workoutTime";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const T0 = "2026-09-17T10:00:00.000Z";

function at(minutes: number, seconds = 0): string {
  return new Date(
    new Date(T0).getTime() + (minutes * 60 + seconds) * 1000,
  ).toISOString();
}

let counter = 0;
const newId = () => `id${++counter}`;

function squatBlock(position = 0): PerformedExerciseBlock {
  return {
    id: "squat-block",
    kind: "exercise",
    position,
    addedDuringWorkout: false,
    exerciseId: "squat",
    status: "not_performed",
    snapshotInstructions: {
      shape: "reps",
      sets: 3,
      reps: { min: 8, max: 10 },
      restBetweenSetsSec: 90,
    },
    series: [
      { id: "s1", position: 0, status: "upcoming" },
      { id: "s2", position: 1, status: "upcoming" },
      { id: "s3", position: 2, status: "upcoming" },
    ],
  };
}

function crunchBlock(position = 1): PerformedExerciseBlock {
  return {
    id: "crunch-block",
    kind: "exercise",
    position,
    addedDuringWorkout: false,
    exerciseId: "crunch",
    status: "not_performed",
    snapshotInstructions: {
      shape: "reps",
      sets: 2,
      reps: { min: 15, max: 15 },
      restBetweenSetsSec: 45,
    },
    series: [
      { id: "c1", position: 0, status: "upcoming" },
      { id: "c2", position: 1, status: "upcoming" },
    ],
  };
}

function tapisBlock(position = 2): PerformedExerciseBlock {
  return {
    id: "tapis-block",
    kind: "exercise",
    position,
    addedDuringWorkout: false,
    exerciseId: "tapis",
    status: "not_performed",
    snapshotInstructions: {
      shape: "steps",
      steps: [
        { id: "i1", position: 0, durationSec: 300, speedKmh: 5, inclinePercent: 10 },
        { id: "i2", position: 1, durationSec: 300, speedKmh: 5, inclinePercent: 12 },
      ],
    },
    cardioSteps: [
      { id: "p1", position: 0, status: "upcoming", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 10 } },
      { id: "p2", position: 1, status: "upcoming", settings: { durationSec: 300, speedKmh: 5, inclinePercent: 12 } },
    ],
  };
}

function groupBlock(position = 0, restBeforeB?: number): PerformedGroupBlock {
  const rounds = [1, 2].map((n) => ({
    id: `round-${n}`,
    roundNumber: n,
    status: "upcoming" as const,
    children: [
      { id: `round-${n}-a`, groupChildId: "child-a", exerciseId: "tirage" },
      { id: `round-${n}-b`, groupChildId: "child-b", exerciseId: "chest" },
    ],
  }));

  return {
    id: "group-block",
    kind: "group",
    position,
    addedDuringWorkout: false,
    status: "not_performed",
    plannedRounds: 2,
    plannedRestBetweenRoundsSec: 60,
    children: [
      { id: "child-a", position: 0, exerciseId: "tirage", snapshotInstructions: { shape: "reps", reps: { min: 8, max: 10 } } },
      {
        id: "child-b",
        position: 1,
        exerciseId: "chest",
        snapshotInstructions: { shape: "reps", reps: { min: 8, max: 10 } },
        ...(restBeforeB !== undefined ? { snapshotRestBeforeSec: restBeforeB } : {}),
      },
    ],
    rounds,
  };
}

function workout(blocks: WorkoutSession["blocks"]): WorkoutSession {
  return {
    id: "w",
    source: "free",
    status: "in_progress",
    date: "2026-09-17",
    startedAt: T0,
    lastActionAt: T0,
    activeDurationSec: 0,
    blocks,
    createdAt: T0,
    updatedAt: T0,
  };
}

function exerciseOf(w: WorkoutSession, id: string): PerformedExerciseBlock {
  return w.blocks.find((b) => b.id === id) as PerformedExerciseBlock;
}

function groupOf(w: WorkoutSession, id: string): PerformedGroupBlock {
  return w.blocks.find((b) => b.id === id) as PerformedGroupBlock;
}

const kg = (value: number) => ({ kind: "total" as const, kg: value });

const exercise = (id: string, measurementType: Exercise["measurementType"]): Exercise =>
  ({
    id,
    name: id,
    category: "Musculation",
    zone: "Jambes",
    movement: "Squat",
    equipment: "Machine",
    location: "Salle",
    mode: measurementType === "duration_speed_incline" ? "steps" : "series",
    measurementType,
    status: "active",
    createdAt: T0,
    updatedAt: T0,
  }) as Exercise;

/* -------------------------------------------------------------------------- */
/* Séries et repos                                                            */
/* -------------------------------------------------------------------------- */

describe("séries", () => {
  it("valide une série, ouvre la suivante et démarre un repos vers une heure cible", () => {
    const start = activateBlock(workout([squatBlock(), crunchBlock()]), "squat-block", T0);
    const next = validateSeries(start, "squat-block", "s1", { load: kg(40), reps: 10, rpe: 7 }, at(12), newId);

    const block = exerciseOf(next, "squat-block");
    expect(block.series?.[0]).toMatchObject({ status: "completed", load: kg(40), reps: 10, rpe: 7, completedAt: at(12) });
    expect(block.series?.[1]?.status).toBe("active");
    expect(next.currentEntryId).toBe("s2");
    expect(next.activeRest).toMatchObject({
      kind: "between_sets",
      startedAt: at(12),
      targetEndAt: at(13, 30),
      plannedDurationSec: 90,
      afterBlockId: "squat-block",
      afterEntryId: "s1",
    });
    expect(next.lastActionAt).toBe(at(12));
    expect(next.activeDurationSec).toBe(12 * 60);
  });

  it("ne modifie jamais la séance reçue", () => {
    const start = activateBlock(workout([squatBlock()]), "squat-block", T0);
    const frozen = structuredClone(start);

    validateSeries(start, "squat-block", "s1", { reps: 10 }, at(1), newId);

    expect(start).toEqual(frozen);
  });

  it("fin cible ≠ fin réelle : la validation suivante fixe le repos réel", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { load: kg(40), reps: 10 }, at(12), newId);
    w = validateSeries(w, "squat-block", "s2", { load: kg(40), reps: 10 }, at(14, 7), newId);

    const series = exerciseOf(w, "squat-block").series!;
    expect(series[0]).toMatchObject({ actualRestAfterSec: 127, restComparable: true });
    expect(w.activeRest?.afterEntryId).toBe("s2");
  });

  it("repos dépassé de plusieurs minutes : le repos réel est celui des horodatages", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);

    expect(buildResumeSummary(w, at(17)).rest).toEqual({
      phase: "done",
      overrunSec: 210,
      elapsedSec: 300,
      plannedDurationSec: 90,
    });

    w = validateSeries(w, "squat-block", "s2", { reps: 10 }, at(17), newId);
    expect(exerciseOf(w, "squat-block").series?.[0]).toMatchObject({
      actualRestAfterSec: 300,
      restComparable: true,
    });
  });

  it("refuse de revalider une série et exige une valeur mesurée", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);

    expect(() => validateSeries(w, "squat-block", "s1", { reps: 12 }, at(2), newId)).toThrow(/Modifier/);
    expect(() => validateSeries(w, "squat-block", "s2", { rpe: 8 }, at(2), newId)).toThrow(/valeur mesurée/);
  });

  it("Modifier réécrit une série validée, et elle seule, sans toucher aux repos", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { load: kg(40), reps: 10 }, at(1), newId);
    const rest = w.activeRest;

    w = editSeries(w, "squat-block", "s1", { reps: 11, note: "facile" }, at(2));

    expect(exerciseOf(w, "squat-block").series?.[0]).toMatchObject({ load: kg(40), reps: 11, note: "facile" });
    expect(w.activeRest).toEqual(rest);
    expect(() => editSeries(w, "squat-block", "s2", { reps: 5 }, at(2))).toThrow();
  });

  it("dernière série : brique réalisée, suivante courante, repos démarré quand même", () => {
    let w = activateBlock(workout([squatBlock(), crunchBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);
    w = validateSeries(w, "squat-block", "s2", { reps: 10 }, at(3), newId);
    w = validateSeries(w, "squat-block", "s3", { reps: 9 }, at(5), newId);

    expect(exerciseOf(w, "squat-block").status).toBe("performed");
    expect(w.currentBlockId).toBe("crunch-block");
    expect(w.currentEntryId).toBe("c1");
    expect(exerciseOf(w, "crunch-block").series?.[0]?.status).toBe("active");
    expect(w.activeRest?.afterEntryId).toBe("s3");
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 1, total: 2 });
  });

  it("Ajouter une série rouvre une brique réalisée", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    for (const [id, minute] of [["s1", 1], ["s2", 3], ["s3", 5]] as const) {
      w = validateSeries(w, "squat-block", id, { reps: 10 }, at(minute), newId);
    }
    expect(exerciseOf(w, "squat-block").status).toBe("performed");

    w = addSeries(w, "squat-block", at(6), newId);

    const block = exerciseOf(w, "squat-block");
    expect(block.status).toBe("not_performed");
    expect(block.series).toHaveLength(4);
    expect(block.series?.[3]?.status).toBe("active");
    expect(w.currentEntryId).toBe(block.series?.[3]?.id);
  });

  it("propose les valeurs de la série précédente, sinon de la dernière fois, jamais le RPE", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);

    expect(proposeSeriesValues(exerciseOf(w, "squat-block"), { load: kg(35), reps: 12, rpe: 9 } as never))
      .toEqual({ load: kg(35), reps: 12 });

    w = validateSeries(w, "squat-block", "s1", { load: kg(40), reps: 10, rpe: 8 }, at(1), newId);

    expect(proposeSeriesValues(exerciseOf(w, "squat-block"))).toEqual({ load: kg(40), reps: 10 });
  });
});

describe("repos", () => {
  it("Passer clôt le repos à l'instant du geste sans valider la série suivante", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);
    w = skipRest(w, at(12, 50));

    const block = exerciseOf(w, "squat-block");
    expect(w.activeRest).toBeUndefined();
    expect(block.series?.[0]).toMatchObject({ actualRestAfterSec: 50, restComparable: true });
    expect(block.series?.[1]?.status).toBe("active");
    expect(block.series?.[1]?.completedAt).toBeUndefined();
  });

  it("±30 s ne touche que le repos en cours et ne descend jamais sous l'instant présent", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);

    w = adjustRest(w, 30, at(12, 10));
    expect(w.activeRest?.targetEndAt).toBe(at(14));
    expect(w.activeRest?.plannedDurationSec).toBe(90);
    expect(w.activeRest?.adjustmentSec).toBe(30);

    w = adjustRest(w, -30, at(13, 50));
    expect(w.activeRest?.targetEndAt).toBe(at(13, 50));
    expect(w.activeRest?.adjustmentSec).toBe(0);
  });

  it("+30 s après zéro relance 30 s depuis le geste, sans toucher au repos réel ni au prévu", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);

    /* Fin cible à 13:30, geste à 14:00 : nouveau décompte jusqu'à 14:30. */
    w = adjustRest(w, 30, at(14));
    expect(w.activeRest).toMatchObject({
      startedAt: at(12),
      targetEndAt: at(14, 30),
      plannedDurationSec: 90,
      adjustmentSec: 30,
    });
    expect(getRestCountdown(w.activeRest!, at(14, 5))).toMatchObject({ phase: "running", remainingSec: 25 });

    /* Un second +30 s pendant ce décompte prolonge la nouvelle cible. */
    w = adjustRest(w, 30, at(14, 10));
    expect(w.activeRest?.targetEndAt).toBe(at(15));
    expect(w.activeRest?.adjustmentSec).toBe(60);

    /* −30 s après zéro : rien. */
    const done = adjustRest(w, -30, at(15, 20));
    expect(done.activeRest).toEqual(w.activeRest);

    /* La fin réelle reste la validation suivante, mesurée depuis 12:00 : un seul repos. */
    w = validateSeries(w, "squat-block", "s2", { reps: 10 }, at(15, 40), newId);
    expect(exerciseOf(w, "squat-block").series?.[0]).toMatchObject({
      actualRestAfterSec: 220,
      restComparable: true,
      restAdjustmentSec: 60,
    });
    expect(summarizeRests(w.blocks)).toMatchObject({ comparableCount: 1, totalCount: 1, plannedAverageSec: 90 });
  });

  it("Passer reste possible après un +30 s relancé", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);
    w = adjustRest(w, 30, at(14));
    w = skipRest(w, at(14, 12));

    expect(w.activeRest).toBeUndefined();
    expect(exerciseOf(w, "squat-block").series?.[0]).toMatchObject({
      actualRestAfterSec: 132,
      restAdjustmentSec: 30,
    });
  });

  it("une absence ne change rien : ni au repos, ni à la durée active", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);
    w = recordPresence(w, at(12, 20));

    /* L'app est fermée à 10:12:20 et revient à 10:15. */
    const back = at(15);
    expect(shouldShowResumeSheet(w, back)).toBe(true);
    expect(buildResumeSummary(w, back)).toMatchObject({
      leftAt: at(12, 20),
      absenceSec: 160,
      activeDurationSec: 15 * 60,
      paused: false,
      currentEntryId: "s2",
      rest: { phase: "done", overrunSec: 90 },
    });
    expect(w.activeRest?.targetEndAt).toBe(at(13, 30));

    /* Retour rapide : pas de feuille. */
    expect(shouldShowResumeSheet(w, at(12, 59))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Pause explicite                                                            */
/* -------------------------------------------------------------------------- */

describe("pause explicite", () => {
  it("suspend la durée active, persiste, et ne relance jamais le repos", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);
    w = pauseWorkout(w, at(12, 30), newId);

    expect(w.activeRest?.overlappedPauseId).toBe(w.pauses?.[0]?.id);
    expect(w.activeRest?.targetEndAt).toBe(at(13, 30));

    /* Fermeture de l'app pendant une heure : toujours en pause au retour. */
    const back = at(72, 30);
    expect(shouldShowResumeSheet(recordPresence(w, at(12, 40)), back)).toBe(false);
    expect(buildResumeSummary(w, back)).toMatchObject({ paused: true, activeDurationSec: 12 * 60 + 30 });
    expect(() => pauseWorkout(w, back, newId)).toThrow(/déjà en pause/);

    w = resumeWorkout(w, back);
    expect(w.pauses).toEqual([{ id: expect.any(String), startedAt: at(12, 30), endedAt: back }]);
    expect(w.activeDurationSec).toBe(12 * 60 + 30);

    /* Le repos chevauché trouve sa fin réelle à la validation suivante, non comparable. */
    w = validateSeries(w, "squat-block", "s2", { reps: 10 }, at(73), newId);
    expect(exerciseOf(w, "squat-block").series?.[0]).toMatchObject({
      actualRestAfterSec: 61 * 60,
      restComparable: false,
    });
    expect(w.activeDurationSec).toBe(13 * 60);
    expect(() => resumeWorkout(w, at(74))).toThrow(/n'est pas en pause/);
  });

  it("une pause pendant un repos déjà terminé le rend aussi non comparable", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(12), newId);
    w = pauseWorkout(w, at(15), newId);
    w = resumeWorkout(w, at(20));
    w = validateSeries(w, "squat-block", "s2", { reps: 10 }, at(20, 30), newId);

    expect(exerciseOf(w, "squat-block").series?.[0]?.restComparable).toBe(false);
    expect(summarizeRests(w.blocks)).toEqual({ comparableCount: 0, totalCount: 1 });
  });
});

/* -------------------------------------------------------------------------- */
/* Clôture                                                                    */
/* -------------------------------------------------------------------------- */

describe("clôture", () => {
  it("clôt un repos ouvert à l'instant de la fin, hors repos moyen, et fige les statuts", () => {
    let w = activateBlock(workout([squatBlock(), crunchBlock(), tapisBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);
    w = validateSeries(w, "squat-block", "s2", { reps: 10 }, at(3), newId);
    w = skipBlock(w, "crunch-block", at(4));
    w = pauseWorkout(w, at(5), newId);

    const done = completeWorkoutSession(w, at(9));

    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe(at(9));
    expect(done.activeRest).toBeUndefined();
    expect(done.currentBlockId).toBeUndefined();
    expect(done.pauses?.[0]?.endedAt).toBe(at(9));
    expect(done.activeDurationSec).toBe(5 * 60);

    const squat = exerciseOf(done, "squat-block");
    expect(squat.status).toBe("performed");
    expect(squat.series?.[1]).toMatchObject({ actualRestAfterSec: 6 * 60, restComparable: false });
    expect(squat.series?.[2]?.status).toBe("not_performed");
    expect(formatBlockCompletion(summarizeBlockCompletion(squat))).toBe("2 séries réalisées sur 3");
    expect(exerciseOf(done, "crunch-block").status).toBe("skipped");
    expect(exerciseOf(done, "tapis-block").status).toBe("not_performed");
    expect(summarizeRests(done.blocks)).toMatchObject({ averageSec: 120, comparableCount: 1, totalCount: 2 });
    expect(() => validateSeries(done, "squat-block", "s3", { reps: 1 }, at(10), newId)).toThrow(/terminée/);
  });
});

describe("clôture — rien ne reste à venir", () => {
  it("passe les paliers et les tours non validés en non réalisés", () => {
    let w = activateBlock(workout([tapisBlock(0), groupBlock(1)]), "tapis-block", T0);
    w = validateStep(w, "tapis-block", "p1", { bpm: 120 }, at(5));
    w = activateBlock(w, "group-block", at(6));
    w = validateRoundChild(w, "group-block", "round-1", "round-1-a", { reps: 10 }, at(7), newId);

    const done = completeWorkoutSession(w, at(8));

    const tapis = exerciseOf(done, "tapis-block");
    expect(tapis.status).toBe("performed");
    expect(tapis.cardioSteps?.map((step) => step.status)).toEqual(["completed", "not_performed"]);
    expect(formatBlockCompletion(summarizeBlockCompletion(tapis))).toBe("1 palier réalisé sur 2");

    const group = groupOf(done, "group-block");
    expect(group.status).toBe("performed");
    expect(group.rounds.map((round) => round.status)).toEqual(["not_performed", "not_performed"]);
    expect(group.rounds[0]?.children[0]?.completedAt).toBe(at(7));
    expect(group.rounds[0]?.children[1]?.completedAt).toBeUndefined();

    const allEntries = done.blocks.flatMap((block) =>
      block.kind === "exercise"
        ? [...(block.series ?? []), ...(block.cardioSteps ?? [])].map((entry) => entry.status)
        : block.kind === "group"
          ? block.rounds.map((round) => round.status)
          : [],
    );
    expect(allEntries).not.toContain("upcoming");
    expect(allEntries).not.toContain("active");
  });

  it("une brique jamais abordée reste non réalisée, toutes ses séries aussi", () => {
    const done = completeWorkoutSession(workout([squatBlock()]), at(1));
    const squat = exerciseOf(done, "squat-block");

    expect(squat.status).toBe("not_performed");
    expect(squat.series?.every((series) => series.status === "not_performed")).toBe(true);
    expect(formatBlockCompletion(summarizeBlockCompletion(squat))).toBe("0 série réalisée sur 3");
  });
});

/* -------------------------------------------------------------------------- */
/* Paliers et mesure simple                                                   */
/* -------------------------------------------------------------------------- */

describe("paliers", () => {
  it("s'adapte en direct : consigne d'origine conservée une seule fois, aucun repos", () => {
    let w = activateBlock(workout([tapisBlock(0)]), "tapis-block", T0);

    w = updateStep(w, "tapis-block", "p2", { durationSec: 120, speedKmh: 5, inclinePercent: 5 }, at(1));
    w = updateStep(w, "tapis-block", "p2", { durationSec: 180, speedKmh: 5, inclinePercent: 5 }, at(2));

    const p2 = exerciseOf(w, "tapis-block").cardioSteps?.[1];
    expect(p2?.originalSettings).toEqual({ durationSec: 300, speedKmh: 5, inclinePercent: 12 });
    expect(p2?.settings).toEqual({ durationSec: 180, speedKmh: 5, inclinePercent: 5 });

    w = validateStep(w, "tapis-block", "p1", { bpm: 150 }, at(5));
    expect(w.activeRest).toBeUndefined();
    expect(exerciseOf(w, "tapis-block").cardioSteps?.[0]).toMatchObject({ status: "completed", bpm: 150 });
    expect(exerciseOf(w, "tapis-block").cardioSteps?.[0]?.originalSettings).toBeUndefined();
    expect(w.currentEntryId).toBe("p2");

    w = validateStep(w, "tapis-block", "p2", { settings: { durationSec: 200, speedKmh: 5, inclinePercent: 5 } }, at(8));
    expect(exerciseOf(w, "tapis-block").cardioSteps?.[1]?.settings.durationSec).toBe(200);
    expect(exerciseOf(w, "tapis-block").status).toBe("performed");
    expect(() => updateStep(w, "tapis-block", "p1", { durationSec: 1, speedKmh: 1, inclinePercent: 0 }, at(9))).toThrow();
  });

  it("Modifier un palier terminé corrige BPM, note et réglages sans toucher au reste", () => {
    let w = activateBlock(workout([tapisBlock(0)]), "tapis-block", T0);
    w = validateStep(w, "tapis-block", "p1", {}, at(5));

    const before = w;
    w = editStep(w, "tapis-block", "p1", { bpm: 118, note: "oublié" }, at(6));

    const p1 = exerciseOf(w, "tapis-block").cardioSteps?.[0];
    expect(p1).toMatchObject({ status: "completed", bpm: 118, note: "oublié", completedAt: at(5) });
    expect(p1?.originalSettings).toBeUndefined();
    expect(w.activeRest).toBeUndefined();
    expect(w.currentEntryId).toBe("p2");
    expect(exerciseOf(w, "tapis-block").cardioSteps?.[1]).toEqual(
      exerciseOf(before, "tapis-block").cardioSteps?.[1],
    );
    expect(w.lastActionAt).toBe(at(6));
  });

  it("corriger les réglages garde la consigne d'origine déjà conservée", () => {
    let w = activateBlock(workout([tapisBlock(0)]), "tapis-block", T0);
    w = validateStep(w, "tapis-block", "p1", { settings: { durationSec: 120, speedKmh: 5, inclinePercent: 10 } }, at(5));
    expect(exerciseOf(w, "tapis-block").cardioSteps?.[0]?.originalSettings).toEqual({
      durationSec: 300, speedKmh: 5, inclinePercent: 10,
    });

    w = editStep(w, "tapis-block", "p1", { settings: { durationSec: 150, speedKmh: 5.5, inclinePercent: 10 } }, at(6));

    const p1 = exerciseOf(w, "tapis-block").cardioSteps?.[0];
    expect(p1?.settings).toEqual({ durationSec: 150, speedKmh: 5.5, inclinePercent: 10 });
    expect(p1?.originalSettings).toEqual({ durationSec: 300, speedKmh: 5, inclinePercent: 10 });
  });

  it("un palier corrigé sans adaptation préalable reçoit sa trace", () => {
    let w = activateBlock(workout([tapisBlock(0)]), "tapis-block", T0);
    w = validateStep(w, "tapis-block", "p1", {}, at(5));
    w = editStep(w, "tapis-block", "p1", { settings: { durationSec: 300, speedKmh: 4.5, inclinePercent: 10 } }, at(6));

    expect(exerciseOf(w, "tapis-block").cardioSteps?.[0]?.originalSettings).toEqual({
      durationSec: 300, speedKmh: 5, inclinePercent: 10,
    });
  });

  it("refuse de modifier un palier non validé ou une séance terminée", () => {
    let w = activateBlock(workout([tapisBlock(0)]), "tapis-block", T0);
    expect(() => editStep(w, "tapis-block", "p1", { bpm: 100 }, at(1))).toThrow(/validé/);

    w = validateStep(w, "tapis-block", "p1", {}, at(5));
    const done = completeWorkoutSession(w, at(6));
    expect(() => editStep(done, "tapis-block", "p1", { bpm: 100 }, at(7))).toThrow(/terminée/);
  });

  it("Ajouter un palier reprend les réglages du précédent", () => {
    let w = activateBlock(workout([tapisBlock(0)]), "tapis-block", T0);
    w = addStep(w, "tapis-block", at(1), newId);

    const steps = exerciseOf(w, "tapis-block").cardioSteps!;
    expect(steps).toHaveLength(3);
    expect(steps[2]?.settings).toEqual({ durationSec: 300, speedKmh: 5, inclinePercent: 12 });
    expect(steps[2]?.status).toBe("upcoming");
  });
});

describe("mesure simple", () => {
  it("valide en une fois et clôt le repos précédent", () => {
    const marche: PerformedExerciseBlock = {
      id: "marche-block",
      kind: "exercise",
      position: 1,
      addedDuringWorkout: false,
      exerciseId: "marche",
      status: "not_performed",
      snapshotInstructions: { shape: "distance" },
      simpleMeasurement: {},
    };

    let w = activateBlock(workout([squatBlock(), marche]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);
    w = validateSimpleMeasurement(w, "marche-block", { distanceKm: 7 }, at(3));

    expect(exerciseOf(w, "marche-block")).toMatchObject({
      status: "performed",
      simpleMeasurement: { distanceKm: 7, completedAt: at(3) },
    });
    expect(w.activeRest).toBeUndefined();
    expect(exerciseOf(w, "squat-block").series?.[0]?.actualRestAfterSec).toBe(120);
  });

  it("se corrige après validation, sans repos ni avancement", () => {
    const marche: PerformedExerciseBlock = {
      id: "marche-block",
      kind: "exercise",
      position: 0,
      addedDuringWorkout: true,
      exerciseId: "marche",
      status: "not_performed",
      snapshotInstructions: { shape: "distance" },
      simpleMeasurement: {},
    };

    let w = activateBlock(workout([marche, crunchBlock(1)]), "marche-block", T0);
    expect(() => editSimpleMeasurement(w, "marche-block", { distanceKm: 6 }, at(1))).toThrow(/validée/);

    w = validateSimpleMeasurement(w, "marche-block", { distanceKm: 7 }, at(2));
    expect(w.currentBlockId).toBe("crunch-block");

    w = editSimpleMeasurement(w, "marche-block", { distanceKm: 7.4, note: "pluie" }, at(3));
    expect(exerciseOf(w, "marche-block").simpleMeasurement).toMatchObject({
      distanceKm: 7.4,
      note: "pluie",
      completedAt: at(2),
    });
    expect(exerciseOf(w, "marche-block").status).toBe("performed");
    expect(w.currentBlockId).toBe("crunch-block");
    expect(w.activeRest).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Groupes                                                                    */
/* -------------------------------------------------------------------------- */

describe("groupes tour par tour", () => {
  it("aucun repos entre enfants, repos de groupe en fin de tour, brique réalisée au dernier tour", () => {
    let w = activateBlock(workout([groupBlock()]), "group-block", T0);
    expect(w.currentEntryId).toBe("round-1");

    w = validateRoundChild(w, "group-block", "round-1", "round-1-a", { load: kg(30), reps: 10 }, at(1), newId);
    expect(w.activeRest).toBeUndefined();

    w = validateRoundChild(w, "group-block", "round-1", "round-1-b", { load: kg(25), reps: 10 }, at(2), newId);
    expect(groupOf(w, "group-block").rounds[0]).toMatchObject({ status: "completed", completedAt: at(2) });
    expect(w.activeRest).toMatchObject({ kind: "between_rounds", afterEntryId: "round-1", targetEndAt: at(3) });
    expect(w.currentEntryId).toBe("round-2");

    w = validateRoundChild(w, "group-block", "round-2", "round-2-a", { load: kg(30), reps: 9 }, at(3, 20), newId);
    expect(groupOf(w, "group-block").rounds[0]).toMatchObject({ actualRestAfterSec: 80, restComparable: true });

    w = validateRoundChild(w, "group-block", "round-2", "round-2-b", { load: kg(25), reps: 9 }, at(4), newId);
    expect(groupOf(w, "group-block").status).toBe("performed");
    expect(w.activeRest).toBeUndefined();
    expect(() => validateRoundChild(w, "group-block", "round-2", "round-2-b", { reps: 1 }, at(5), newId)).toThrow();
  });

  it("Repos avant cet exercice : bande intra-tour, rattachée à l'enfant", () => {
    let w = activateBlock(workout([groupBlock(0, 30)]), "group-block", T0);
    w = validateRoundChild(w, "group-block", "round-1", "round-1-a", { reps: 10 }, at(1), newId);

    expect(w.activeRest).toMatchObject({ kind: "before_group_child", afterEntryId: "round-1-b", plannedDurationSec: 30 });

    w = validateRoundChild(w, "group-block", "round-1", "round-1-b", { reps: 10 }, at(1, 45), newId);
    expect(groupOf(w, "group-block").rounds[0]?.children[1]?.actualRestBeforeSec).toBe(45);
    expect(summarizeRests(w.blocks).totalCount).toBe(0);
  });

  it("propose au tour 2 les valeurs du tour 1, sinon la cible", () => {
    let w = activateBlock(workout([groupBlock()]), "group-block", T0);
    expect(proposeRoundChildValues(groupOf(w, "group-block"), "child-a")).toEqual({ reps: 10 });

    w = validateRoundChild(w, "group-block", "round-1", "round-1-a", { load: kg(30), reps: 9, rpe: 8 }, at(1), newId);
    expect(proposeRoundChildValues(groupOf(w, "group-block"), "child-a")).toEqual({ load: kg(30), reps: 9 });
    expect(proposeRoundChildValues(groupOf(w, "group-block"), "child-b", { load: kg(25), reps: 12 })).toEqual({
      load: kg(25),
      reps: 12,
    });
  });

  it("Modifier un enfant de tour validé ne touche ni au repos ni au tour courant", () => {
    let w = activateBlock(workout([groupBlock()]), "group-block", T0);
    w = validateRoundChild(w, "group-block", "round-1", "round-1-a", { load: kg(30), reps: 10 }, at(1), newId);
    w = validateRoundChild(w, "group-block", "round-1", "round-1-b", { load: kg(25), reps: 10 }, at(2), newId);
    const rest = w.activeRest;

    expect(() => editRoundChild(w, "group-block", "round-2", "round-2-a", { reps: 5 }, at(3))).toThrow(/validé/);

    w = editRoundChild(w, "group-block", "round-1", "round-1-a", { reps: 11, note: "facile" }, at(3));

    expect(groupOf(w, "group-block").rounds[0]?.children[0]).toMatchObject({ load: kg(30), reps: 11, note: "facile" });
    expect(w.activeRest).toEqual(rest);
    expect(w.currentEntryId).toBe("round-2");
  });

  it("Ajouter un tour prolonge la boucle", () => {
    let w = activateBlock(workout([groupBlock()]), "group-block", T0);
    w = addRound(w, "group-block", at(1), newId);

    const group = groupOf(w, "group-block");
    expect(group.rounds).toHaveLength(3);
    expect(group.rounds[2]).toMatchObject({ roundNumber: 3, status: "upcoming" });
    expect(group.rounds[2]?.children.map((c) => c.exerciseId)).toEqual(["tirage", "chest"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Brique sans nombre prévu : séance libre                                    */
/* -------------------------------------------------------------------------- */

describe("exercice ajouté, sans nombre de séries prévu", () => {
  function freeSession() {
    return addExerciseBlocks(workout([]), [exercise("presse", "load_reps"), exercise("curl", "load_reps")], T0, newId);
  }

  it("valider l'unique série ne termine pas l'exercice : repos lancé, brique toujours courante", () => {
    let w = freeSession();
    const presse = w.blocks[0]!;
    const seriesId = (presse as PerformedExerciseBlock).series![0]!.id;

    w = validateSeries(w, presse.id, seriesId, { load: kg(40), reps: 10 }, at(1), newId);

    const block = exerciseOf(w, presse.id);
    expect(block.status).toBe("not_performed");
    expect(block.series?.[0]?.status).toBe("completed");
    expect(w.currentBlockId).toBe(presse.id);
    expect(w.currentEntryId).toBeUndefined();
    expect(w.activeRest).toMatchObject({ afterEntryId: seriesId, plannedDurationSec: 90 });
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 0, total: 2 });
  });

  it("Ajouter une série poursuit avec les valeurs précédentes, sans RPE ni note", () => {
    let w = freeSession();
    const presse = w.blocks[0]!;
    const first = (presse as PerformedExerciseBlock).series![0]!.id;

    w = validateSeries(w, presse.id, first, { load: kg(40), reps: 10, rpe: 8, note: "ok" }, at(1), newId);
    w = addSeries(w, presse.id, at(2), newId);

    const block = exerciseOf(w, presse.id);
    expect(block.series).toHaveLength(2);
    expect(block.series?.[1]?.status).toBe("active");
    expect(w.currentEntryId).toBe(block.series?.[1]?.id);
    expect(proposeSeriesValues(block)).toEqual({ load: kg(40), reps: 10 });
  });

  it("Terminer l'exercice le passe réalisé, retire la série jamais commencée et ouvre le suivant", () => {
    let w = freeSession();
    const [presse, curl] = w.blocks as PerformedExerciseBlock[];
    const first = presse!.series![0]!.id;

    w = validateSeries(w, presse!.id, first, { load: kg(40), reps: 10 }, at(1), newId);
    w = addSeries(w, presse!.id, at(2), newId);
    const rest = w.activeRest;

    w = finishBlock(w, presse!.id, at(3));

    const block = exerciseOf(w, presse!.id);
    expect(block.status).toBe("performed");
    expect(block.series).toHaveLength(1);
    expect(w.currentBlockId).toBe(curl!.id);
    expect(exerciseOf(w, curl!.id).series?.[0]?.status).toBe("active");
    expect(w.activeRest).toEqual(rest);
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 1, total: 2 });
  });

  it("refuse de terminer un exercice où rien n'a été validé", () => {
    const w = freeSession();

    expect(() => finishBlock(w, w.blocks[0]!.id, at(1))).toThrow(/Rien n'a été validé/);
  });

  it("terminer la séance après une seule série la conserve et compte l'exercice réalisé", () => {
    let w = freeSession();
    const presse = w.blocks[0]!;
    const first = (presse as PerformedExerciseBlock).series![0]!.id;

    w = validateSeries(w, presse.id, first, { load: kg(40), reps: 10 }, at(1), newId);
    const done = completeWorkoutSession(w, at(2));

    const block = exerciseOf(done, presse.id);
    expect(block.status).toBe("performed");
    expect(block.series).toEqual([
      expect.objectContaining({ status: "completed", load: kg(40), reps: 10, actualRestAfterSec: 60, restComparable: false }),
    ]);
    expect(formatBlockCompletion(summarizeBlockCompletion(block))).toBe("1 série réalisée sur 1");
    expect(exerciseOf(done, done.blocks[1]!.id).status).toBe("not_performed");
  });

  it("une séance planifiée garde l'enchaînement automatique, sauf au-delà des séries prévues", () => {
    let w = activateBlock(workout([squatBlock(), crunchBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);
    w = validateSeries(w, "squat-block", "s2", { reps: 10 }, at(2), newId);
    w = validateSeries(w, "squat-block", "s3", { reps: 10 }, at(3), newId);
    expect(exerciseOf(w, "squat-block").status).toBe("performed");
    expect(w.currentBlockId).toBe("crunch-block");

    w = addSeries(w, "squat-block", at(4), newId);
    const fourth = exerciseOf(w, "squat-block").series![3]!.id;
    w = validateSeries(w, "squat-block", fourth, { reps: 8 }, at(5), newId);

    expect(exerciseOf(w, "squat-block").status).toBe("not_performed");
    expect(w.currentBlockId).toBe("squat-block");

    w = finishBlock(w, "squat-block", at(6));
    expect(exerciseOf(w, "squat-block").status).toBe("performed");
    expect(exerciseOf(w, "squat-block").series).toHaveLength(4);
    expect(w.currentBlockId).toBe("crunch-block");
  });

  it("terminer une brique prévue en cours de route garde ses séries restantes", () => {
    let w = activateBlock(workout([squatBlock(), crunchBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);
    w = finishBlock(w, "squat-block", at(2));

    const squat = exerciseOf(w, "squat-block");
    expect(squat.status).toBe("performed");
    expect(squat.series?.map((series) => series.status)).toEqual(["completed", "upcoming", "upcoming"]);
    expect(completeWorkoutSession(w, at(3)).blocks[0]).toMatchObject({
      series: [
        expect.objectContaining({ status: "completed" }),
        expect.objectContaining({ status: "not_performed" }),
        expect.objectContaining({ status: "not_performed" }),
      ],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Substitution                                                               */
/* -------------------------------------------------------------------------- */

describe("substitution", () => {
  const haltere = exercise("developpe-halteres", "load_reps");
  const planche = exercise("planche", "duration");

  it("remplace un exercice autonome non commencé en gardant le snapshot et l'origine", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    w = substituteExercise(w, "squat-block", haltere, at(1));

    const block = exerciseOf(w, "squat-block");
    expect(block.exerciseId).toBe("developpe-halteres");
    expect(block.originalExerciseId).toBe("squat");
    expect(block.snapshotInstructions).toEqual(squatBlock().snapshotInstructions);
    expect(block.series).toHaveLength(3);

    /* Un second remplacement ne réécrit pas l'origine ; revenir l'efface. */
    w = substituteExercise(w, "squat-block", exercise("presse", "load_reps"), at(2));
    expect(exerciseOf(w, "squat-block").originalExerciseId).toBe("squat");

    w = substituteExercise(w, "squat-block", exercise("squat", "load_reps"), at(3));
    expect(exerciseOf(w, "squat-block").exerciseId).toBe("squat");
    expect(exerciseOf(w, "squat-block").originalExerciseId).toBeUndefined();
  });

  it("refuse une brique commencée, un exercice d'une autre forme, ou une brique sautée", () => {
    let w = activateBlock(workout([squatBlock()]), "squat-block", T0);
    expect(() => substituteExercise(w, "squat-block", planche, at(1))).toThrow(/même façon/);

    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);
    expect(() => substituteExercise(w, "squat-block", haltere, at(2))).toThrow(/commencé/);

    let skipped = activateBlock(workout([squatBlock(), crunchBlock()]), "squat-block", T0);
    skipped = skipBlock(skipped, "crunch-block", at(1));
    expect(() => substituteExercise(skipped, "crunch-block", haltere, at(2))).toThrow(/saut/);
  });

  it("remplace un enfant de groupe pour le tour courant et les suivants, jamais le passé", () => {
    let w = activateBlock(workout([groupBlock()]), "group-block", T0);
    w = validateRoundChild(w, "group-block", "round-1", "round-1-a", { reps: 10 }, at(1), newId);
    w = validateRoundChild(w, "group-block", "round-1", "round-1-b", { reps: 10 }, at(2), newId);

    w = substituteGroupChild(w, "group-block", "child-b", haltere, at(3));

    const group = groupOf(w, "group-block");
    expect(group.rounds[0]?.children[1]?.exerciseId).toBe("chest");
    expect(group.rounds[1]?.children[1]?.exerciseId).toBe("developpe-halteres");
    expect(group.children[1]?.exerciseId).toBe("chest");
    expect(findSubstitutionRound(group, "child-b")).toBe(2);
    expect(findSubstitutionRound(group, "child-a")).toBeUndefined();

    /* Un troisième tour ajouté suit l'exercice courant du tour 2. */
    w = addRound(w, "group-block", at(4), newId);
    expect(groupOf(w, "group-block").rounds[2]?.children[1]?.exerciseId).toBe("chest");
    w = substituteGroupChild(w, "group-block", "child-b", haltere, at(4));
    expect(groupOf(w, "group-block").rounds[2]?.children[1]?.exerciseId).toBe("developpe-halteres");

    /* La progression est attribuée à l'exercice réellement fait. */
    w = validateRoundChild(w, "group-block", "round-2", "round-2-a", { reps: 10 }, at(5), newId);
    w = validateRoundChild(w, "group-block", "round-2", "round-2-b", { load: kg(20), reps: 10 }, at(6), newId);
    expect(groupOf(w, "group-block").rounds[1]?.children[1]).toMatchObject({
      exerciseId: "developpe-halteres",
      load: kg(20),
      completedAt: at(6),
    });

    /* Revenir à l'origine ne touche ni le tour 1 ni le tour 2 terminés : seul le tour 3 change. */
    w = substituteGroupChild(w, "group-block", "child-b", exercise("chest", "load_reps"), at(7));
    const after = groupOf(w, "group-block");
    expect(after.rounds[0]?.children[1]?.exerciseId).toBe("chest");
    expect(after.rounds[1]?.children[1]?.exerciseId).toBe("developpe-halteres");
    expect(after.rounds[2]?.children[1]?.exerciseId).toBe("chest");
    expect(findSubstitutionRound(after, "child-b")).toBe(2);

    expect(() => substituteGroupChild(w, "group-block", "child-b", exercise("chest", "load_reps"), at(8))).toThrow(
      /Aucun tour restant/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Sauter, ajouter                                                            */
/* -------------------------------------------------------------------------- */

describe("sauter et annuler", () => {
  it("sort du dénominateur, reste visible, se rétablit jusqu'à la clôture", () => {
    let w = activateBlock(workout([squatBlock(), crunchBlock(), tapisBlock()]), "squat-block", T0);

    w = skipBlock(w, "crunch-block", at(1));
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 0, total: 2 });

    w = skipBlock(w, "squat-block", at(2));
    expect(w.currentBlockId).toBe("tapis-block");

    w = unskipBlock(w, "crunch-block", at(3));
    expect(exerciseOf(w, "crunch-block").status).toBe("not_performed");
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 0, total: 2 });

    expect(() => unskipBlock(w, "tapis-block", at(4))).toThrow();
  });

  it("un exercice réalisé ne se saute plus", () => {
    let w = activateBlock(workout([crunchBlock(0)]), "crunch-block", T0);
    w = validateSeries(w, "crunch-block", "c1", { reps: 15 }, at(1), newId);
    w = validateSeries(w, "crunch-block", "c2", { reps: 15 }, at(2), newId);

    expect(() => skipBlock(w, "crunch-block", at(3))).toThrow(/réalisé/);
  });
});

describe("ajout d'exercices", () => {
  it("séance libre vide : le premier ajout devient courant, une seule série", () => {
    const w = addExerciseBlocks(workout([]), [exercise("presse", "load_reps"), exercise("tapis", "duration_speed_incline")], at(1), newId);

    expect(w.blocks.map((b) => b.position)).toEqual([0, 1]);
    const presse = w.blocks[0] as PerformedExerciseBlock;
    expect(presse).toMatchObject({ addedDuringWorkout: true, exerciseId: "presse", status: "not_performed" });
    expect(presse.series).toHaveLength(1);
    expect(presse.series?.[0]?.status).toBe("active");
    expect(presse.snapshotInstructions).toMatchObject({ shape: "reps", sets: 1, restBetweenSetsSec: 90 });
    expect(w.currentBlockId).toBe(presse.id);

    const tapis = w.blocks[1] as PerformedExerciseBlock;
    expect(tapis.cardioSteps).toHaveLength(1);
    expect(tapis.cardioSteps?.[0]?.settings).toEqual({ durationSec: 300, speedKmh: 5, inclinePercent: 0 });
  });

  it("séance planifiée non commencée : l'ajout va en fin de liste, jamais devant le prévu", () => {
    const planned = workout([squatBlock(), crunchBlock(), tapisBlock()]);
    const w = addExerciseBlocks(planned, [exercise("a", "reps")], at(1), newId);

    expect(w.blocks.map((b) => (b.kind === "exercise" ? b.exerciseId : b.kind))).toEqual([
      "squat", "crunch", "tapis", "a",
    ]);
    expect(w.blocks.map((b) => b.position)).toEqual([0, 1, 2, 3]);
    expect(w.currentBlockId).toBeUndefined();
  });

  it("s'insère juste après la brique en cours, dans l'ordre de sélection", () => {
    let w = activateBlock(workout([squatBlock(), crunchBlock(), tapisBlock()]), "squat-block", T0);
    w = validateSeries(w, "squat-block", "s1", { reps: 10 }, at(1), newId);
    w = addExerciseBlocks(w, [exercise("a", "reps"), exercise("b", "reps")], at(2), newId);

    expect(w.blocks.map((b) => (b.kind === "exercise" ? b.exerciseId : b.kind))).toEqual([
      "squat", "a", "b", "crunch", "tapis",
    ]);
    expect(w.blocks.map((b) => b.position)).toEqual([0, 1, 2, 3, 4]);
    expect(w.currentBlockId).toBe("squat-block");
  });

  it("sinon après la dernière brique terminée", () => {
    let w = activateBlock(workout([squatBlock(), crunchBlock(), tapisBlock()]), "squat-block", T0);
    for (const [id, minute] of [["s1", 1], ["s2", 2], ["s3", 3]] as const) {
      w = validateSeries(w, "squat-block", id, { reps: 10 }, at(minute), newId);
    }
    w = addExerciseBlocks(w, [exercise("a", "reps")], at(4), newId);

    expect(w.blocks.map((b) => (b.kind === "exercise" ? b.exerciseId : b.kind))).toEqual([
      "squat", "a", "crunch", "tapis",
    ]);
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 1, total: 4 });
  });
});
