import "fake-indexeddb/auto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Exercise, PlannedSession, SessionTemplate } from "../../domain";
import { db } from "../../db/database";
import { saveExercise } from "../../db/repositories/exerciseRepository";
import { getPlannedSession, savePlannedSession } from "../../db/repositories/programRepository";
import { getSessionTemplate, saveSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts, getWorkout } from "../../db/repositories/workoutRepository";
import { deleteWorkout } from "./deleteWorkout";
import { applyWorkoutAction } from "./engine/persistWorkout";
import {
  activateBlock,
  addExerciseBlocks,
  addSeries,
  adjustRest,
  finishBlock,
  pauseWorkout,
  resumeWorkout,
  substituteGroupChild,
  validateRoundChild,
  validateSeries,
  validateStep,
} from "./engine/workoutEngine";
import { finishWorkout } from "./finishWorkout";
import { findLastPerformances } from "./lastPerformance";
import { startFreeWorkout } from "./startFreeWorkout";
import { startWorkout } from "./startWorkout";
import {
  buildExerciseHistory,
  findBlockNeighbours,
  summarizeExerciseBlock,
} from "./workoutBlockDetail";
import {
  compareGroupVolumeToPrevious,
  describeGroupRounds,
  listGroupSubstitutions,
  summarizeGroupBlock,
} from "./workoutGroupDetail";
import {
  buildWorkoutRecapLines,
  compareVolumeToPrevious,
  splitRecapLines,
  summarizeWorkout,
} from "./workoutRecap";

/* -------------------------------------------------------------------------- */
/* Jeu de données                                                             */
/* -------------------------------------------------------------------------- */

const T0 = "2026-09-17T10:00:00.000Z";
const at = (minutes: number, seconds = 0) =>
  new Date(new Date(T0).getTime() + (minutes * 60 + seconds) * 1000).toISOString();

let counter = 0;
const newId = () => `r7-${++counter}`;

function muscu(id: string, name: string, zone: Exercise["zone"], movement: Exercise["movement"]): Exercise {
  return {
    id,
    name,
    category: "Musculation",
    zone: zone!,
    movement: movement!,
    equipment: "Machine",
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
  };
}

const exercises: Exercise[] = [
  muscu("tirage", "Tirage vertical", "Dos", "Tirage"),
  muscu("chest-press", "Chest press", "Pecs", "Poussée"),
  muscu("pec-deck", "Pec deck", "Pecs", "Poussée"),
  muscu("squat", "Squat barre", "Jambes", "Squat"),
  muscu("crunch", "Crunch poulie", "Core", "Isolation"),
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
];

const muscuA: SessionTemplate = {
  id: "muscu-a",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [
    {
      id: "grp",
      kind: "group",
      position: 0,
      name: "Dos / Pecs",
      rounds: 3,
      restBetweenRoundsSec: 90,
      children: [
        { id: "ga", position: 0, exerciseId: "tirage", instructions: { shape: "reps", reps: { min: 8, max: 10 } } },
        { id: "gb", position: 1, exerciseId: "chest-press", instructions: { shape: "reps", reps: { min: 8, max: 10 } }, restBeforeSec: 30 },
      ],
    },
    { id: "sq", kind: "exercise", position: 1, exerciseId: "squat", instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, targetRpe: { min: 7, max: 8 }, restBetweenSetsSec: 90 } },
  ],
  createdAt: T0,
  updatedAt: T0,
};

function planned(id: string, date: string): PlannedSession {
  return { id, date, sessionTemplateId: "muscu-a", status: "upcoming", source: "manual", createdAt: T0, updatedAt: T0 };
}

const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const ex = (id: string) => byId.get(id)!;

async function resetDatabase() {
  await Promise.all(db.tables.map((table) => table.clear()));
  for (const exercise of exercises) await saveExercise(exercise);
  await saveSessionTemplate(muscuA);
  await savePlannedSession(planned("planned-10", "2026-09-10"));
  await savePlannedSession(planned("planned-17", "2026-09-17"));
}

afterAll(() => db.close());

type Act = (fn: Parameters<typeof applyWorkoutAction>[1], when: string) => ReturnType<typeof applyWorkoutAction>;
const actor = (id: string): Act => (fn, when) => applyWorkoutAction(id, fn, when);

/**
 * Muscu A jouée au complet, sans substitution : la référence des
 * comparaisons. `start` décale toute la séance.
 */
async function playCompleteMuscuA(plannedSessionId: string, start: string, kg: number) {
  const startedAt = new Date(start);
  const when = (minutes: number) => new Date(startedAt.getTime() + minutes * 60000).toISOString();
  const started = await startWorkout(plannedSessionId, start);
  const act = actor(started.id);
  const grp = started.blocks.find((b) => b.kind === "group")!.id;
  const sq = started.blocks.find((b) => b.kind === "exercise")!.id;
  let minute = 0;

  let w = await act((c, t) => activateBlock(c, grp, t), when(++minute));
  for (const round of (w.blocks.find((b) => b.id === grp) as { rounds: { id: string; children: { id: string }[] }[] }).rounds) {
    for (const child of round.children) {
      w = await act((c, t) => validateRoundChild(c, grp, round.id, child.id, { load: { kind: "total", kg }, reps: 10, rpe: 7 }, t, newId), when(++minute));
    }
  }
  for (const series of (w.blocks.find((b) => b.id === sq) as { series: { id: string }[] }).series) {
    await act((c, t) => validateSeries(c, sq, series.id, { load: { kind: "total", kg: kg * 2 }, reps: 10, rpe: 8 }, t, newId), when(++minute));
  }

  return finishWorkout(started.id, when(minute + 1));
}

/* -------------------------------------------------------------------------- */

describe("Étape 7 — récapitulatif de bout en bout, sur base réelle", () => {
  beforeEach(resetDatabase);

  it("séance libre : ajouts, séries, repos, cardio adapté, pause, clôture partielle → récap sans section Ajouts ni comparaison", async () => {
    const started = await startFreeWorkout("2026-09-17", T0);
    const act = actor(started.id);

    let w = await act((c, t) => addExerciseBlocks(c, [ex("squat"), ex("crunch")], t, newId), at(1));
    const sq = w.blocks[0]!.id;
    const s1 = (w.blocks[0] as { series: { id: string }[] }).series[0]!.id;
    await act((c, t) => validateSeries(c, sq, s1, { load: { kind: "total", kg: 60 }, reps: 10, rpe: 7 }, t, newId), at(2));
    w = await act((c, t) => addSeries(c, sq, t, newId), at(2, 30));
    const s2 = (w.blocks[0] as { series: { id: string }[] }).series[1]!.id;
    await act((c, t) => validateSeries(c, sq, s2, { load: { kind: "total", kg: 60 }, reps: 9, rpe: 8, note: "Dernière rep dure" }, t, newId), at(3, 40));
    /* Pause pendant le repos qui suit : ce repos sort de la moyenne. */
    await act((c, t) => pauseWorkout(c, t, newId), at(4));
    await act((c, t) => resumeWorkout(c, t), at(7));
    await act((c, t) => finishBlock(c, sq, t), at(7, 10));

    /* Tapis ajouté, un palier adapté avant validation. */
    w = await act((c, t) => addExerciseBlocks(c, [ex("tapis")], t, newId), at(7, 20));
    const tapis = w.blocks.find((b) => b.kind === "exercise" && b.exerciseId === "tapis")!.id;
    w = await act((c, t) => activateBlock(c, tapis, t), at(7, 30));
    const p1 = (w.blocks.find((b) => b.id === tapis) as { cardioSteps: { id: string }[] }).cardioSteps[0]!.id;
    await act((c, t) => validateStep(c, tapis, p1, { settings: { durationSec: 120, speedKmh: 5, inclinePercent: 6 }, bpm: 140 }, t), at(10));

    /* Clôture avant le crunch. */
    const done = await finishWorkout(started.id, at(11));
    const stored = (await getWorkout(done.id))!;
    expect(stored).toEqual(done);

    const head = summarizeWorkout(stored);
    expect(head.plannedDurationSec).toBeUndefined();
    expect(head).toMatchObject({
      volumeKg: 60 * 19,
      seriesDone: 2,
      seriesPlanned: 3,
      performed: 2,
      notPerformed: 1,
      added: 3,
      cardioSteps: 1,
      bpmKnown: 1,
    });
    /* Repos 1 : 100 s comparable ; repos 2 : coupé par la pause, compté hors moyenne. */
    /* Aucun « prévu » : les exercices sont ajoutés, leur repos par défaut
       n'est pas une consigne — le détail du squat n'en montre pas non plus. */
    expect(head.rest).toEqual({ averageSec: 100, comparableCount: 1, totalCount: 2 });
    expect(head.pauses).toHaveLength(1);
    expect(compareVolumeToPrevious(stored, await getCompletedWorkouts())).toBeUndefined();

    /* Séance libre : tout en liste, rien dans « Ajouts ». */
    const { planned, added } = splitRecapLines(buildWorkoutRecapLines(stored, byId), stored.sessionTemplateId !== undefined);
    expect(added).toEqual([]);
    expect(planned.map((line) => [line.number, line.name, line.subtitle])).toEqual([
      ["1", "Squat barre", "2 séries"],
      ["2", "Tapis de course", "1 palier · 2 min"],
      ["3", "Crunch poulie", "Non réalisé"],
    ]);

    /* Détail du squat : ajout → aucun prévu, pas d'historique, repos non comparable visible. */
    const squatBlock = stored.blocks[0] as Extract<(typeof stored.blocks)[number], { kind: "exercise" }>;
    const history = buildExerciseHistory("squat", await getCompletedWorkouts(), stored, ex("squat"));
    expect(history).toEqual([]);
    expect(summarizeExerciseBlock(squatBlock, ex("squat"), history)).toEqual({
      kind: "series",
      seriesDone: 2,
      volumeKg: 1140,
      rpe: { value: 7.5, count: 2, total: 2 },
      rest: { averageSec: 100, comparableCount: 1, totalCount: 2 },
    });
    expect(squatBlock.series?.[1]?.restComparable).toBe(false);

    /* Détail du tapis : adaptation tracée, BPM couvert. */
    const tapisBlock = stored.blocks[1] as Extract<(typeof stored.blocks)[number], { kind: "exercise" }>;
    expect(summarizeExerciseBlock(tapisBlock, ex("tapis"), [])).toMatchObject({
      kind: "steps",
      stepsDone: 1,
      stepsPlanned: 1,
      durationSec: 120,
      bpm: { min: 140, max: 140, average: 140, count: 1, total: 1 },
      adaptations: 1,
      ranges: "5 km/h · 6 %",
    });
    expect(findBlockNeighbours(planned.map((line) => line.block), tapis)).toMatchObject({
      previous: { id: sq },
      next: { exerciseId: "crunch" },
    });
  });

  it("séance planifiée : groupe avec substitution au 2e tour, repos ajusté, pause pendant un repos, dernier tour non joué → comparaisons seulement où elles ont un sens", async () => {
    /* Référence : Muscu A complète le 10/09, 30 kg au groupe, 60 kg au squat. */
    const reference = await playCompleteMuscuA("planned-10", "2026-09-10T10:00:00.000Z", 30);
    expect(reference.status).toBe("completed");

    const started = await startWorkout("planned-17", T0);
    const act = actor(started.id);
    const grp = started.blocks.find((b) => b.kind === "group")!.id;
    const sq = started.blocks.find((b) => b.kind === "exercise")!.id;

    let w = await act((c, t) => activateBlock(c, grp, t), at(0, 30));
    const r1 = (w.blocks.find((b) => b.id === grp) as { rounds: { id: string; children: { id: string }[] }[] }).rounds[0]!;
    await act((c, t) => validateRoundChild(c, grp, r1.id, r1.children[0]!.id, { load: { kind: "total", kg: 32 }, reps: 10, rpe: 7 }, t, newId), at(1));
    await act((c, t) => validateRoundChild(c, grp, r1.id, r1.children[1]!.id, { load: { kind: "total", kg: 32 }, reps: 10, rpe: 8 }, t, newId), at(1, 35));
    await act((c, t) => adjustRest(c, 30, t), at(1, 40));
    w = await act((c, t) => substituteGroupChild(c, grp, "workout-block-grp-child-gb", ex("pec-deck"), t), at(2));

    const r2 = (w.blocks.find((b) => b.id === grp) as { rounds: { id: string; children: { id: string }[] }[] }).rounds[1]!;
    await act((c, t) => validateRoundChild(c, grp, r2.id, r2.children[0]!.id, { load: { kind: "total", kg: 32 }, reps: 10, rpe: 8 }, t, newId), at(3, 35));
    await act((c, t) => validateRoundChild(c, grp, r2.id, r2.children[1]!.id, { load: { kind: "total", kg: 25 }, reps: 12 }, t, newId), at(4, 15));
    await act((c, t) => pauseWorkout(c, t, newId), at(4, 45));
    await act((c, t) => resumeWorkout(c, t), at(9, 45));

    /* Le groupe est laissé là ; squat complet, même nombre de séries que la référence. */
    w = await act((c, t) => activateBlock(c, sq, t), at(10));
    for (const [index, series] of (w.blocks.find((b) => b.id === sq) as { series: { id: string }[] }).series.entries()) {
      await act((c, t) => validateSeries(c, sq, series.id, { load: { kind: "total", kg: 66 }, reps: 10, rpe: 8 }, t, newId), at(12 + index * 2));
    }
    const done = await finishWorkout(started.id, at(17));
    const stored = (await getWorkout(done.id))!;
    expect(stored).toEqual(done);
    expect((await getPlannedSession("planned-17"))?.status).toBe("done");

    /* Récap global : durée prévue depuis le modèle, pauses, périmètre non intact → pas de % global. */
    const template = await getSessionTemplate("muscu-a");
    const head = summarizeWorkout(stored, template);
    expect(head.plannedDurationSec).toBeGreaterThan(0);
    expect(head.pauses).toHaveLength(1);
    expect(head.seriesPlanned).toBe(3 * 2 + 3);
    expect(head.seriesDone).toBe(4 + 3);
    expect(compareVolumeToPrevious(stored, await getCompletedWorkouts())).toBeUndefined();

    /* Détail du groupe : tours, substitution, repos ajusté, repos coupé, tour 3 vide. */
    const group = stored.blocks.find((b) => b.id === grp) as Extract<(typeof stored.blocks)[number], { kind: "group" }>;
    expect(listGroupSubstitutions(group)).toEqual([
      expect.objectContaining({ fromExerciseId: "chest-press", toExerciseId: "pec-deck", fromRound: 2, roundsDone: 1 }),
    ]);
    const rounds = describeGroupRounds(group);
    expect(rounds.map((round) => round.status)).toEqual(["completed", "completed", "not_performed"]);
    expect(rounds[0]!.restAfter).toMatchObject({ plannedSec: 90, actualSec: 120, adjustmentSec: 30, comparable: true });
    expect(rounds[1]!.restAfter).toMatchObject({ plannedSec: 90, comparable: false });
    expect(rounds[0]!.children[1]!.restBefore).toEqual({ plannedSec: 30, actualSec: 35 });
    expect(rounds[2]!.children.every((child) => child.series === undefined)).toBe(true);
    const groupSummary = summarizeGroupBlock(group, compareGroupVolumeToPrevious(stored, group, await getCompletedWorkouts()));
    expect(groupSummary).toMatchObject({ roundsDone: 2, roundsPlanned: 3, restBetweenRounds: { averageSec: 120, comparableCount: 1, totalCount: 2 } });
    expect(groupSummary.volumeVsLast).toBeUndefined();

    /* Détail du squat : comparable à la référence (3 séries complètes des deux côtés) → +10 %. */
    const squatBlock = stored.blocks.find((b) => b.id === sq) as Extract<(typeof stored.blocks)[number], { kind: "exercise" }>;
    const history = buildExerciseHistory("squat", await getCompletedWorkouts(), stored, ex("squat"));
    expect(history.map((entry) => [entry.date, entry.complete, entry.seriesCount])).toEqual([["2026-09-10", true, 3]]);
    const squatSummary = summarizeExerciseBlock(squatBlock, ex("squat"), history);
    expect(squatSummary).toMatchObject({
      kind: "series",
      seriesDone: 3,
      seriesPlanned: 3,
      volumeKg: 1980,
      volumeVsLast: { previousWorkoutId: reference.id, previousVolumeKg: 1800, deltaPercent: 10 },
      rpe: { value: 8, position: "within" },
      rest: { plannedSec: 90 },
      plannedLine: "8–10 reps · RPE 7–8 · Repos 1 min 30",
    });

    /* L'historique du remplaçant se nourrit de la substitution ; celui du prévu n'en voit rien. */
    expect(buildExerciseHistory("pec-deck", await getCompletedWorkouts(), undefined, ex("pec-deck")).map((e) => e.label)).toEqual(["25 kg × 12"]);
    expect(buildExerciseHistory("chest-press", await getCompletedWorkouts(), undefined, ex("chest-press")).map((e) => [e.date, e.seriesCount])).toEqual([
      ["2026-09-17", 1],
      ["2026-09-10", 3],
    ]);

    /* Suppression de la référence : la comparaison et « Dernière fois » se recalculent sur ce qui reste. */
    await deleteWorkout(reference.id, at(30));
    const remaining = await getCompletedWorkouts();
    expect(remaining.map((item) => item.id)).toEqual([stored.id]);
    expect((await getPlannedSession("planned-10"))?.status).toBe("upcoming");
    expect(buildExerciseHistory("squat", remaining, stored, ex("squat"))).toEqual([]);
    const afterDelete = summarizeExerciseBlock(squatBlock, ex("squat"), []);
    expect(afterDelete.kind === "series" && afterDelete.volumeVsLast).toBeUndefined();
    expect(findLastPerformances(remaining).get("squat")?.workoutId).toBe(stored.id);
    expect(await getSessionTemplate("muscu-a")).toEqual(muscuA);
  });

  it("deux réalisations complètes du même modèle : le % global et celui du groupe apparaissent, puis disparaissent avec la référence", async () => {
    const first = await playCompleteMuscuA("planned-10", "2026-09-10T10:00:00.000Z", 30);
    const second = await playCompleteMuscuA("planned-17", T0, 33);
    const completed = await getCompletedWorkouts();

    expect(compareVolumeToPrevious(second, completed)).toMatchObject({ previousWorkoutId: first.id, deltaPercent: 10 });
    const group = second.blocks.find((b) => b.kind === "group") as Extract<(typeof second.blocks)[number], { kind: "group" }>;
    expect(compareGroupVolumeToPrevious(second, group, completed)).toMatchObject({ previousWorkoutId: first.id, deltaPercent: 10 });

    await deleteWorkout(first.id, at(60));
    const after = await getCompletedWorkouts();
    expect(compareVolumeToPrevious(second, after)).toBeUndefined();
    expect(compareGroupVolumeToPrevious(second, group, after)).toBeUndefined();
  });
});
