import { describe, expect, it } from "vitest";
import type { Exercise, PerformedGroupBlock, SessionTemplate, WorkoutSession } from "../../domain";
import { createWorkoutSnapshot } from "./createWorkoutSnapshot";
import {
  activateBlock,
  adjustRest,
  completeWorkoutSession,
  pauseWorkout,
  resumeWorkout,
  substituteGroupChild,
  validateRoundChild,
} from "./engine/workoutEngine";
import {
  compareGroupVolumeToPrevious,
  describeGroupRounds,
  describeGroupStructure,
  isGroupComplete,
  listGroupSubstitutions,
  summarizeGroupBlock,
} from "./workoutGroupDetail";

/* ------------------------------------------------------------------------ */
/* Jeu de données : un groupe joué par le moteur, sans rien inventer        */
/* ------------------------------------------------------------------------ */

const T0 = "2026-09-17T10:00:00.000Z";
const at = (minutes: number, seconds = 0) =>
  new Date(new Date(T0).getTime() + (minutes * 60 + seconds) * 1000).toISOString();

let counter = 0;
const newId = () => `g${++counter}`;

function exercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    category: "Musculation",
    zone: "Dos",
    movement: "Tirage",
    equipment: "Poulie",
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
  };
}

const pecDeck = exercise("pec-deck", "Pec deck");

const template: SessionTemplate = {
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
        { id: "ga", position: 0, exerciseId: "tirage", instructions: { shape: "reps", reps: { min: 10, max: 12 }, targetRpe: { min: 7, max: 8 } } },
        { id: "gb", position: 1, exerciseId: "chest-press", instructions: { shape: "reps", reps: { min: 10, max: 12 } }, restBeforeSec: 30 },
      ],
    },
  ],
  createdAt: T0,
  updatedAt: T0,
};

function fresh(id = "w"): WorkoutSession {
  return {
    id,
    sessionTemplateId: "muscu-a",
    source: "planned",
    status: "in_progress",
    date: "2026-09-17",
    startedAt: T0,
    lastActionAt: T0,
    activeDurationSec: 0,
    blocks: createWorkoutSnapshot(template),
    createdAt: T0,
    updatedAt: T0,
  };
}

const groupOf = (w: WorkoutSession) => w.blocks.find((b) => b.kind === "group") as PerformedGroupBlock;

/**
 * Trois tours prévus : tour 1 complet, Chest press → Pec deck à partir du
 * tour 2, pause pendant le repos entre les tours 2 et 3 (+30 s au repos
 * 1 → 2), puis clôture avant le tour 3.
 */
function playScenario(): WorkoutSession {
  let w = fresh();
  const grp = groupOf(w).id;

  w = activateBlock(w, grp, at(0));
  const r1 = groupOf(w).rounds[0]!;
  w = validateRoundChild(w, grp, r1.id, r1.children[0]!.id, { load: { kind: "total", kg: 30 }, reps: 10, rpe: 7 }, at(1), newId);
  /* Repos avant 1b : pris, 35 s. */
  w = validateRoundChild(w, grp, r1.id, r1.children[1]!.id, { load: { kind: "total", kg: 40 }, reps: 10, rpe: 8, note: "Bonne amplitude" }, at(1, 35), newId);
  /* Repos entre tours 1 → 2 : +30 s, pris en 120 s. */
  w = adjustRest(w, 30, at(1, 40));
  w = substituteGroupChild(w, grp, groupOf(w).children[1]!.id, pecDeck, at(2));

  const r2 = groupOf(w).rounds[1]!;
  w = validateRoundChild(w, grp, r2.id, r2.children[0]!.id, { load: { kind: "total", kg: 32.5 }, reps: 10, rpe: 8 }, at(3, 35), newId);
  w = validateRoundChild(w, grp, r2.id, r2.children[1]!.id, { load: { kind: "total", kg: 25 }, reps: 12 }, at(4, 15), newId);
  /* Pause pendant le repos 2 → 3 : ce repos n'est plus comparable. */
  w = pauseWorkout(w, at(4, 45), newId);
  w = resumeWorkout(w, at(9, 45));

  /* Clôture avant le tour 3. */
  return completeWorkoutSession(w, at(10));
}

/* ------------------------------------------------------------------------ */

describe("détail d'un groupe (§14, mockup 19.2)", () => {
  const done = playScenario();
  const block = groupOf(done);

  it("expose la structure prévue : exercices, ordre, tours, consignes, repos", () => {
    expect(describeGroupStructure(block, "1")).toEqual([
      { groupChildId: block.children[0]!.id, label: "1a", exerciseId: "tirage", instructions: "10–12 reps · RPE 7–8" },
      { groupChildId: block.children[1]!.id, label: "1b", exerciseId: "chest-press", instructions: "10–12 reps", restBeforeSec: 30 },
    ]);
    expect(block.plannedRounds).toBe(3);
    expect(block.plannedRestBetweenRoundsSec).toBe(90);
  });

  it("lit la réalisation tour par tour, exercice réellement fait et données, sans inventer le tour 3", () => {
    const rounds = describeGroupRounds(block);

    expect(rounds.map((round) => [round.roundNumber, round.status, round.doneCount])).toEqual([
      [1, "completed", 2],
      [2, "completed", 2],
      [3, "not_performed", 0],
    ]);

    const [r1, r2, r3] = rounds;
    expect(r1!.children[0]).toMatchObject({ exerciseId: "tirage", substituted: false, series: { load: { kind: "total", kg: 30 }, reps: 10, rpe: 7 } });
    expect(r1!.children[1]).toMatchObject({
      exerciseId: "chest-press",
      substituted: false,
      series: { load: { kind: "total", kg: 40 }, reps: 10, rpe: 8, note: "Bonne amplitude" },
      restBefore: { plannedSec: 30, actualSec: 35 },
    });
    expect(r2!.children[1]).toMatchObject({
      exerciseId: "pec-deck",
      substituted: true,
      series: { load: { kind: "total", kg: 25 }, reps: 12 },
      restBefore: { plannedSec: 30, actualSec: 40 },
    });
    expect(r2!.children[1]!.series?.rpe).toBeUndefined();

    /* Tour 3 : le remplaçant y était prévu, rien n'a été fait, rien n'est inventé. */
    expect(r3!.children.map((child) => [child.exerciseId, child.series])).toEqual([
      ["tirage", undefined],
      ["pec-deck", undefined],
    ]);
    expect(r3!.children[1]!.restBefore).toEqual({ plannedSec: 30 });
    expect(r3!.restAfter).toBeUndefined();
  });

  it("nomme la substitution « prévu → remplaçant » avec le tour de départ et les tours réalisés", () => {
    expect(listGroupSubstitutions(block)).toEqual([
      {
        groupChildId: block.children[1]!.id,
        fromExerciseId: "chest-press",
        toExerciseId: "pec-deck",
        fromRound: 2,
        roundsDone: 1,
      },
    ]);
  });

  it("donne les repos entre tours : prévu, réel, ajustement, hors moyenne quand une pause les coupe", () => {
    const [r1, r2] = describeGroupRounds(block);

    expect(r1!.restAfter).toEqual({ fromRound: 1, toRound: 2, plannedSec: 90, actualSec: 120, adjustmentSec: 30, comparable: true });
    expect(r2!.restAfter).toEqual({ fromRound: 2, toRound: 3, plannedSec: 90, actualSec: 345, comparable: false });
  });

  it("résume tours, volume, RPE et repos : le repos coupé et les repos avant un enfant restent hors moyenne", () => {
    const summary = summarizeGroupBlock(block, undefined);

    expect(summary).toEqual({
      roundsDone: 2,
      roundsPlanned: 3,
      childrenCount: 2,
      volumeKg: 300 + 400 + 325 + 300,
      rpe: { value: (7 + 8 + 8) / 3, count: 3, total: 4 },
      restBetweenRounds: { averageSec: 120, plannedSec: 90, deltaSec: 30, comparableCount: 1, totalCount: 2 },
      /* 35 s avant 1b au tour 1, 40 s avant le remplaçant au tour 2. */
      restBeforeChildren: { count: 2, totalSec: 75 },
    });
    expect(isGroupComplete(block)).toBe(false);
  });

  it("ne compare le volume qu'entre deux groupes complets, sans substitution, de même structure", () => {
    const complete = (id: string, date: string, kg: number): WorkoutSession => {
      let w = { ...fresh(id), date, startedAt: `${date}T10:00:00.000Z` };
      const grp = groupOf(w).id;
      w = activateBlock(w, grp, `${date}T10:00:00.000Z`);
      for (const [index, round] of groupOf(w).rounds.entries()) {
        for (const [childIndex, child] of round.children.entries()) {
          w = validateRoundChild(
            w,
            grp,
            round.id,
            child.id,
            { load: { kind: "total", kg }, reps: 10 },
            `${date}T10:${String(10 + index * 3 + childIndex).padStart(2, "0")}:00.000Z`,
            newId,
          );
        }
      }
      return completeWorkoutSession(w, `${date}T10:30:00.000Z`);
    };

    const previous = complete("w-prev", "2026-09-10", 30);
    const current = complete("w-cur", "2026-09-17", 33);

    expect(isGroupComplete(groupOf(current))).toBe(true);
    expect(compareGroupVolumeToPrevious(current, groupOf(current), [previous, current])).toEqual({
      previousWorkoutId: "w-prev",
      previousDate: "2026-09-10",
      previousVolumeKg: 30 * 10 * 6,
      deltaPercent: 10,
    });

    /* Groupe courant partiel ou avec substitution : pas de référence. */
    expect(compareGroupVolumeToPrevious(done, block, [previous])).toBeUndefined();
    /* Dernière fois partielle : pas de référence non plus, on ne remonte pas plus loin. */
    const older = complete("w-old", "2026-09-03", 28);
    expect(compareGroupVolumeToPrevious(current, groupOf(current), [older, { ...done, id: "w-mid", date: "2026-09-12", startedAt: "2026-09-12T10:00:00.000Z" }])).toBeUndefined();
    /* Séance libre sans modèle : rien. */
    const free = { ...current };
    delete free.sessionTemplateId;
    expect(compareGroupVolumeToPrevious(free, groupOf(free), [previous])).toBeUndefined();
  });

  it("marque un tour partiel quand la séance s'arrête au milieu d'un tour", () => {
    let w = fresh("w-partial");
    const grp = groupOf(w).id;
    w = activateBlock(w, grp, at(0));
    const r1 = groupOf(w).rounds[0]!;
    w = validateRoundChild(w, grp, r1.id, r1.children[0]!.id, { load: { kind: "total", kg: 30 }, reps: 10 }, at(1), newId);
    const stopped = completeWorkoutSession(w, at(2));
    const [round1] = describeGroupRounds(groupOf(stopped));

    expect(round1).toMatchObject({ status: "partial", doneCount: 1 });
    expect(round1!.children[1]!.series).toBeUndefined();
    /* Le repos avant 1b a été coupé par la fin de séance : enregistré, hors moyenne. */
    expect(round1!.children[1]!.restBefore).toMatchObject({ plannedSec: 30 });
    expect(summarizeGroupBlock(groupOf(stopped), undefined)).toMatchObject({ roundsDone: 0, roundsPlanned: 3, volumeKg: 300 });
  });
});
