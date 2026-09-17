import "fake-indexeddb/auto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Exercise, PlannedSession, SessionTemplate } from "../../domain";
import { db } from "../../db/database";
import { saveExercise } from "../../db/repositories/exerciseRepository";
import { getPlannedSession, savePlannedSession } from "../../db/repositories/programRepository";
import { saveSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import {
  getCompletedWorkouts,
  getInProgressWorkout,
  getWorkout,
} from "../../db/repositories/workoutRepository";
import { calculateExecutionProgress } from "../../domain/rules/workoutRules";
import { applyWorkoutAction, recordWorkoutPresence } from "./engine/persistWorkout";
import { summarizeBlockCompletion } from "./engine/workoutBlocks";
import {
  activateBlock,
  addExerciseBlocks,
  addSeries,
  finishBlock,
  pauseWorkout,
  resumeWorkout,
  skipBlock,
  skipRest,
  substituteExercise,
  substituteGroupChild,
  unskipBlock,
  validateRoundChild,
  validateSeries,
  validateSimpleMeasurement,
  validateStep,
} from "./engine/workoutEngine";
import { shouldShowResumeSheet, summarizeRests } from "./engine/workoutTime";
import { finishWorkout } from "./finishWorkout";
import { findLastPerformances } from "./lastPerformance";
import { startFreeWorkout } from "./startFreeWorkout";
import { startWorkout } from "./startWorkout";
import { buildWorkoutRecapLines, summarizeWorkout } from "./workoutRecap";

/* -------------------------------------------------------------------------- */
/* Jeu de données                                                             */
/* -------------------------------------------------------------------------- */

const T0 = "2026-09-17T10:00:00.000Z";
const at = (minutes: number, seconds = 0) =>
  new Date(new Date(T0).getTime() + (minutes * 60 + seconds) * 1000).toISOString();

let counter = 0;
const newId = () => `sc${++counter}`;

function muscu(id: string, name: string, zone: Exercise["zone"], movement: Exercise["movement"], equipment: Exercise["equipment"]): Exercise {
  return {
    id,
    name,
    category: "Musculation",
    zone: zone!,
    movement: movement!,
    equipment: equipment!,
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
  };
}

const exercises: Exercise[] = [
  muscu("chest-press", "Chest press machine", "Pecs", "Poussée", "Machine"),
  muscu("developpe-halteres", "Développé haltères", "Pecs", "Poussée", "Haltères"),
  muscu("tirage-vertical", "Tirage vertical", "Dos", "Tirage", "Poulie"),
  muscu("squat", "Squat barre", "Jambes", "Squat", "Barre"),
  muscu("presse", "Presse à cuisses", "Jambes", "Squat", "Machine"),
  muscu("crunch", "Crunch poulie", "Core", "Isolation", "Poulie"),
  {
    id: "tapis",
    name: "Tapis de course",
    category: "Cardio",
    equipment: "Tapis",
    location: "Salle",
    mode: "steps",
    measurementType: "duration_speed_incline",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "marche",
    name: "Marche",
    category: "Cardio",
    equipment: "Poids du corps",
    location: "Maison",
    mode: "simple",
    measurementType: "distance",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
  },
];

const muscuA: SessionTemplate = {
  id: "muscu-a",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [
    { id: "note", kind: "note", position: 0, title: "Échauffement", text: "5 min de vélo" },
    {
      id: "grp",
      kind: "group",
      position: 1,
      name: "Dos / Pecs",
      rounds: 2,
      restBetweenRoundsSec: 90,
      children: [
        { id: "ga", position: 0, exerciseId: "tirage-vertical", instructions: { shape: "reps", reps: { min: 8, max: 10 } } },
        { id: "gb", position: 1, exerciseId: "chest-press", instructions: { shape: "reps", reps: { min: 8, max: 10 } }, restBeforeSec: 30 },
      ],
    },
    { id: "sq", kind: "exercise", position: 2, exerciseId: "squat", instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 120 } },
    { id: "cr", kind: "exercise", position: 3, exerciseId: "crunch", instructions: { shape: "reps", sets: 3, reps: { min: 15, max: 15 }, restBetweenSetsSec: 45 } },
    {
      id: "tp",
      kind: "exercise",
      position: 4,
      exerciseId: "tapis",
      instructions: {
        shape: "steps",
        steps: [
          { id: "st1", position: 0, durationSec: 300, speedKmh: 5, inclinePercent: 0 },
          { id: "st2", position: 1, durationSec: 300, speedKmh: 5, inclinePercent: 8 },
        ],
      },
    },
  ],
  createdAt: T0,
  updatedAt: T0,
};

const plannedToday: PlannedSession = {
  id: "planned-today",
  date: "2026-09-17",
  sessionTemplateId: "muscu-a",
  status: "upcoming",
  source: "manual",
  createdAt: T0,
  updatedAt: T0,
};

const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const ex = (id: string) => byId.get(id)!;

async function resetDatabase() {
  await Promise.all(db.tables.map((table) => table.clear()));
  for (const exercise of exercises) await saveExercise(exercise);
  await saveSessionTemplate(muscuA);
  await savePlannedSession(plannedToday);
}

/* -------------------------------------------------------------------------- */
/* Scénarios                                                                  */
/* -------------------------------------------------------------------------- */

afterAll(() => db.close());

const statusOf = (block: { kind: string; status?: string }) =>
  block.kind === "note" ? "note" : block.status;

describe("scénario de fin d'étape : séance libre au fil de l'eau", () => {
  beforeEach(resetDatabase);

  it("s'ajoute exercice par exercice, se ferme et se relit depuis la base", async () => {
    const started = await startFreeWorkout("2026-09-17", T0);
    const id = started.id;
    const act = (fn: Parameters<typeof applyWorkoutAction>[1], when: string) =>
      applyWorkoutAction(id, fn, when);

    /* Trois exercices ajoutés selon les machines libres, dans l'ordre choisi. */
    let w = await act((c, t) => addExerciseBlocks(c, [ex("chest-press"), ex("crunch")], t, newId), at(1));
    expect(w.blocks.map((b) => (b.kind === "exercise" ? b.exerciseId : ""))).toEqual(["chest-press", "crunch"]);
    expect(w.currentBlockId).toBe(w.blocks[0]!.id);

    const chest = w.blocks[0]!.id;
    const s1 = (w.blocks[0] as { series: { id: string }[] }).series[0]!.id;

    /* Série 1 → repos 90 s ; l'exercice ajouté reste ouvert. */
    w = await act((c, t) => validateSeries(c, chest, s1, { load: { kind: "total", kg: 40 }, reps: 10, rpe: 7 }, t, newId), at(2));
    expect(w.activeRest).toMatchObject({ kind: "between_sets", plannedDurationSec: 90 });
    expect(statusOf(w.blocks[0]!)).toBe("not_performed");

    /* Ajouter une série : proposée depuis la précédente, validée à 2:07 → repos réel 127 s. */
    w = await act((c, t) => addSeries(c, chest, t, newId), at(2, 30));
    const s2 = (w.blocks[0] as { series: { id: string }[] }).series[1]!.id;
    w = await act((c, t) => validateSeries(c, chest, s2, { load: { kind: "total", kg: 42.5 }, reps: 9 }, t, newId), at(4, 7));
    expect((w.blocks[0] as { series: { actualRestAfterSec?: number }[] }).series[0]?.actualRestAfterSec).toBe(127);

    /* Terminer l'exercice → le crunch devient courant. */
    w = await act((c, t) => finishBlock(c, chest, t), at(4, 30));
    expect(statusOf(w.blocks[0]!)).toBe("performed");
    expect(w.currentBlockId).toBe(w.blocks[1]!.id);

    /* Passer le repos, puis un tapis ajouté (un palier, adapté) : rien n'est commencé, il se
       place après la dernière brique terminée (§13), avant le crunch. */
    await act((c, t) => skipRest(c, t), at(5));
    w = await act((c, t) => addExerciseBlocks(c, [ex("tapis")], t, newId), at(5, 10));
    expect(w.blocks.map((b) => (b.kind === "exercise" ? b.exerciseId : ""))).toEqual(["chest-press", "tapis", "crunch"]);

    const tapis = w.blocks[1]!.id;
    w = await act((c, t) => activateBlock(c, tapis, t), at(5, 20));
    const p1 = (w.blocks[1] as { cardioSteps: { id: string }[] }).cardioSteps[0]!.id;
    w = await act((c, t) => validateStep(c, tapis, p1, { settings: { durationSec: 120, speedKmh: 5, inclinePercent: 5 }, bpm: 142 }, t), at(8));
    expect((w.blocks[1] as { cardioSteps: { originalSettings?: unknown }[] }).cardioSteps[0]?.originalSettings).toEqual({
      durationSec: 300,
      speedKmh: 5,
      inclinePercent: 0,
    });
    expect(w.activeRest).toBeUndefined();

    /* Fermeture de l'app pendant 3 min : rien ne bouge, la feuille s'impose au retour. */
    await recordWorkoutPresence(at(8, 10));
    const reopened = (await getInProgressWorkout())!;
    expect(shouldShowResumeSheet(reopened, at(11, 30))).toBe(true);
    expect(reopened.currentBlockId).toBe(tapis);

    /* Pause explicite, une marche ajoutée en mesure simple — juste après
       le tapis en cours —, clôture partielle. */
    await act((c, t) => pauseWorkout(c, t, newId), at(12));
    await act((c, t) => resumeWorkout(c, t), at(17));
    w = await act((c, t) => addExerciseBlocks(c, [ex("marche")], t, newId), at(17, 10));
    expect(w.blocks.map((b) => (b.kind === "exercise" ? b.exerciseId : ""))).toEqual([
      "chest-press",
      "tapis",
      "marche",
      "crunch",
    ]);
    const marche = w.blocks[2]!.id;
    await act((c, t) => validateSimpleMeasurement(c, marche, { distanceKm: 7 }, t), at(18));

    const done = await finishWorkout(id, at(20));
    expect(done.status).toBe("completed");
    expect(done.activeDurationSec).toBe(20 * 60 - 5 * 60);
    expect(done.blocks.map(statusOf)).toEqual(["performed", "performed", "performed", "not_performed"]);
    expect(summarizeBlockCompletion(done.blocks[1] as never)).toMatchObject({ completed: 1, total: 1 });

    /* Relu depuis la base : récap, repos moyen, dernière fois. */
    const stored = (await getWorkout(id))!;
    expect(stored).toEqual(done);
    const head = summarizeWorkout(stored);
    expect(head.performed).toBe(3);
    expect(head.volumeKg).toBe(40 * 10 + 42.5 * 9);
    /* 127 s puis 53 s (Passer) : deux repos réels, tous deux comparables. */
    expect(summarizeRests(stored.blocks)).toMatchObject({ averageSec: 90, comparableCount: 2, totalCount: 2 });
    expect(buildWorkoutRecapLines(stored, byId).map((line) => line.subtitle)).toEqual([
      "2 séries",
      "1 palier · 2 min",
      "7 km",
      "Non réalisé",
    ]);
    expect(findLastPerformances(await getCompletedWorkouts()).get("chest-press")?.series).toMatchObject({
      load: { kind: "total", kg: 42.5 },
      reps: 9,
    });
    expect(await getInProgressWorkout()).toBeUndefined();
  });
});

describe("scénario de fin d'étape : séance planifiée avec substitution et saut", () => {
  beforeEach(resetDatabase);

  it("respecte le snapshot, remplace sans réécrire le passé, saute et annule, puis clôt", async () => {
    const started = await startWorkout("planned-today", T0);
    const id = started.id;
    const act = (fn: Parameters<typeof applyWorkoutAction>[1], when: string) =>
      applyWorkoutAction(id, fn, when);

    expect((await getPlannedSession("planned-today"))?.status).toBe("in_progress");
    const grp = started.blocks.find((b) => b.kind === "group")!.id;
    const sq = started.blocks.find((b) => b.kind === "exercise" && b.exerciseId === "squat")!.id;
    const cr = started.blocks.find((b) => b.kind === "exercise" && b.exerciseId === "crunch")!.id;
    const tp = started.blocks.find((b) => b.kind === "exercise" && b.exerciseId === "tapis")!.id;

    /* Tour 1 : 1a, repos avant 1b, 1b → fin du tour et repos de groupe. */
    let w = await act((c, t) => activateBlock(c, grp, t), at(0, 30));
    const round1 = (w.blocks.find((b) => b.id === grp) as { rounds: { id: string; children: { id: string }[] }[] }).rounds[0]!;
    w = await act((c, t) => validateRoundChild(c, grp, round1.id, round1.children[0]!.id, { load: { kind: "total", kg: 30 }, reps: 10 }, t, newId), at(1));
    expect(w.activeRest).toMatchObject({ kind: "before_group_child", plannedDurationSec: 30 });
    w = await act((c, t) => validateRoundChild(c, grp, round1.id, round1.children[1]!.id, { load: { kind: "total", kg: 42.5 }, reps: 10 }, t, newId), at(1, 40));
    expect(w.activeRest).toMatchObject({ kind: "between_rounds", plannedDurationSec: 90 });

    /* Le chest press est pris : 1b remplacé par les haltères pour le tour 2, jamais le tour 1. */
    w = await act((c, t) => substituteGroupChild(c, grp, "workout-block-grp-child-gb", ex("developpe-halteres"), t), at(2));
    const group = w.blocks.find((b) => b.id === grp) as { rounds: { children: { exerciseId: string; completedAt?: string }[] }[] };
    expect(group.rounds[0]!.children[1]!.exerciseId).toBe("chest-press");
    expect(group.rounds[1]!.children[1]!.exerciseId).toBe("developpe-halteres");

    /* Rechargement en plein repos entre tours : tout est là. */
    const reloaded = (await getWorkout(id))!;
    expect(reloaded.activeRest?.kind).toBe("between_rounds");
    expect(reloaded.currentBlockId).toBe(grp);

    const round2 = (reloaded.blocks.find((b) => b.id === grp) as { rounds: { id: string; children: { id: string }[] }[] }).rounds[1]!;
    await act((c, t) => validateRoundChild(c, grp, round2.id, round2.children[0]!.id, { load: { kind: "total", kg: 30 }, reps: 10 }, t, newId), at(3, 30));
    w = await act((c, t) => validateRoundChild(c, grp, round2.id, round2.children[1]!.id, { load: { kind: "total", kg: 20 }, reps: 10 }, t, newId), at(4, 30));
    expect(statusOf(w.blocks.find((b) => b.id === grp)!)).toBe("performed");
    expect(w.currentBlockId).toBe(sq);

    /* Le squat est remplacé par la presse avant d'être commencé : snapshot conservé. */
    w = await act((c, t) => substituteExercise(c, sq, ex("presse"), t), at(5));
    const squatBlock = w.blocks.find((b) => b.id === sq) as { exerciseId: string; originalExerciseId?: string; snapshotInstructions: unknown };
    expect(squatBlock.exerciseId).toBe("presse");
    expect(squatBlock.originalExerciseId).toBe("squat");
    expect(squatBlock.snapshotInstructions).toEqual(muscuA.blocks[2]!.kind === "exercise" ? muscuA.blocks[2]!.instructions : undefined);

    /* Le crunch est sauté, on fait le tapis, puis on revient sur le crunch. */
    w = await act((c, t) => skipBlock(c, cr, t), at(5, 10));
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 1, total: 3 });

    const sqSeries = (w.blocks.find((b) => b.id === sq) as { series: { id: string }[] }).series;
    for (const [index, series] of sqSeries.entries()) {
      w = await act((c, t) => validateSeries(c, sq, series.id, { load: { kind: "total", kg: 80 }, reps: 10 }, t, newId), at(7 + index * 2));
    }
    expect(w.currentBlockId).toBe(tp);

    w = await act((c, t) => unskipBlock(c, cr, t), at(13));
    expect(calculateExecutionProgress(w.blocks)).toEqual({ completed: 2, total: 4 });

    /* Clôture avec le crunch et le tapis jamais abordés. */
    const done = await finishWorkout(id, at(15));
    expect(done.blocks.map(statusOf)).toEqual([
      "note",
      "performed",
      "performed",
      "not_performed",
      "not_performed",
    ]);
    expect((await getPlannedSession("planned-today"))?.status).toBe("done");

    /* Le modèle n'a pas bougé. */
    const template = await db.sessionTemplates.get("muscu-a");
    expect(template).toEqual(muscuA);

    /* La progression est attribuée aux exercices réellement faits. */
    const last = findLastPerformances(await getCompletedWorkouts());
    expect(last.get("presse")?.series).toMatchObject({ load: { kind: "total", kg: 80 } });
    expect(last.get("squat")).toBeUndefined();
    expect(last.get("developpe-halteres")?.series).toMatchObject({ load: { kind: "total", kg: 20 } });
    expect(last.get("chest-press")?.series).toMatchObject({ load: { kind: "total", kg: 42.5 } });

    const lines = buildWorkoutRecapLines(done, byId);
    expect(lines.map((line) => line.name)).toEqual([
      "Échauffement",
      "Dos / Pecs",
      "Presse à cuisses (prévu : Squat barre)",
      "Crunch poulie",
      "Tapis de course",
    ]);
    expect(lines[3]?.subtitle).toBe("Non réalisé");
  });
});
