import { describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, WorkoutSession } from "../../../domain";
import {
  activateBlock,
  adjustRest,
  editSeries,
  endSeries,
  endWorkoutSession,
  pauseWorkout,
  resumeWorkout,
  validateSeries,
} from "./workoutEngine";
import { getRestCountdown, summarizeRests } from "./workoutTime";

/**
 * Repos depuis la fin de série (15/10/2026) : « Série terminée » pose la
 * fin de série et démarre le décompte ; la saisie se fait pendant le repos ;
 * « Enregistrer » ne touche pas au chrono. Depuis le 22/10/2026, plus de
 * « Démarrer la série suivante » : aucun repos réel n'est mesuré pour ces
 * séries (« non mesuré », hors repos moyen), seul le repos prévu compte.
 * Les anciennes séances (sans fin de série) gardent leur fonctionnement.
 */

const T0 = "2026-10-15T17:00:00.000Z";
const at = (minutes: number, seconds = 0) => new Date(new Date(T0).getTime() + (minutes * 60 + seconds) * 1000).toISOString();
let counter = 0;
const newId = () => `id${++counter}`;
const kg = (value: number) => ({ kind: "total" as const, kg: value });

function bench(sets = 3, rest = 120): PerformedExerciseBlock {
  return {
    id: "bench", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "dc", status: "not_performed",
    snapshotInstructions: { shape: "reps", sets, reps: { min: 8, max: 10 }, restBetweenSetsSec: rest },
    series: Array.from({ length: sets }, (_, index) => ({ id: `b${index + 1}`, position: index, status: "upcoming" as const })),
  };
}

function rowing(): PerformedExerciseBlock {
  return {
    id: "row", kind: "exercise", position: 1, addedDuringWorkout: false, exerciseId: "tv", status: "not_performed",
    snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 10, max: 10 }, restBetweenSetsSec: 90 },
    series: [{ id: "r1", position: 0, status: "upcoming" }, { id: "r2", position: 1, status: "upcoming" }],
  };
}

function plank(): PerformedExerciseBlock {
  return {
    id: "plank", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "planche", status: "not_performed",
    snapshotInstructions: { shape: "duration", sets: 2, durationSec: 45, restBetweenSetsSec: 30 },
    series: [{ id: "p1", position: 0, status: "upcoming" }, { id: "p2", position: 1, status: "upcoming" }],
  } as PerformedExerciseBlock;
}

function session(blocks: PerformedExerciseBlock[]): WorkoutSession {
  const w: WorkoutSession = {
    id: "w", source: "free", status: "in_progress", date: "2026-10-15", startedAt: T0, lastActionAt: T0, activeDurationSec: 0,
    blocks, createdAt: T0, updatedAt: T0,
  };
  return activateBlock(w, blocks[0]!.id, T0);
}

const seriesOf = (w: WorkoutSession, blockId: string, id: string) =>
  (w.blocks.find((block) => block.id === blockId) as PerformedExerciseBlock).series!.find((series) => series.id === id)!;

describe("le repos démarre à la fin de la série", () => {
  it("« Série terminée » : fin de série datée, décompte de 2 min parti de cet instant, série pas encore enregistrée", () => {
    const w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    expect(seriesOf(w, "bench", "b1")).toMatchObject({ status: "active", endedAt: at(1) });
    expect(seriesOf(w, "bench", "b1").completedAt).toBeUndefined();
    expect(w.activeRest).toMatchObject({ kind: "between_sets", startedAt: at(1), targetEndAt: at(3), plannedDurationSec: 120, afterBlockId: "bench", afterEntryId: "b1", fromSeriesEnd: true });
    expect(w.currentEntryId).toBe("b1");
  });

  it("saisie de 25 s : « Enregistrer » garde le chrono (il reste 1:35), l'heure d'enregistrement est distincte, la série 2 devient active", () => {
    let w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    const rest = w.activeRest;
    w = validateSeries(w, "bench", "b1", { load: kg(40), reps: 10, rpe: 8 }, at(1, 25), newId);
    expect(w.activeRest).toEqual(rest);
    expect(getRestCountdown(w.activeRest!, at(1, 25))).toMatchObject({ phase: "running", remainingSec: 95 });
    expect(seriesOf(w, "bench", "b1")).toMatchObject({ status: "completed", endedAt: at(1), completedAt: at(1, 25), load: kg(40), reps: 10, rpe: 8 });
    expect(seriesOf(w, "bench", "b2").status).toBe("active");
    expect(w.currentEntryId).toBe("b2");
  });

  it("saisie plus longue que le repos : « Repos terminé », pas de nouveau décompte, la série 2 ne démarre pas toute seule", () => {
    let w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    w = validateSeries(w, "bench", "b1", { reps: 10 }, at(3, 40), newId);
    expect(getRestCountdown(w.activeRest!, at(3, 40))).toMatchObject({ phase: "done" });
    expect(w.activeRest!.targetEndAt).toBe(at(3));
    expect(seriesOf(w, "bench", "b2").status).toBe("active");
    expect(seriesOf(w, "bench", "b2").startedAt).toBeUndefined();
  });

  it("double appui sur « Série terminée » : un seul repos, l'heure de fin de série ne bouge pas", () => {
    const once = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    const twice = endSeries(once, "bench", "b1", at(1, 1), newId);
    expect(twice).toBe(once);
  });

  it("après un rechargement (même séance relue), le décompte se recalcule depuis la fin de série", () => {
    const w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    const reloaded = JSON.parse(JSON.stringify(w)) as WorkoutSession;
    expect(getRestCountdown(reloaded.activeRest!, at(2, 10))).toMatchObject({ phase: "running", remainingSec: 50 });
  });
});

describe("pas de repos réel (22/10/2026) : seul le repos prévu compte", () => {
  it("le décompte à zéro ne clôt rien ; « Série terminée » suivante : repos précédent non mesuré, hors repos moyen, nouveau décompte", () => {
    let w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    w = validateSeries(w, "bench", "b1", { reps: 10 }, at(1, 25), newId);
    expect(getRestCountdown(w.activeRest!, at(4))).toMatchObject({ phase: "done" });
    expect(w.activeRest).toMatchObject({ afterEntryId: "b1" });
    w = endSeries(w, "bench", "b2", at(5), newId);
    const first = seriesOf(w, "bench", "b1");
    expect(first.actualRestAfterSec).toBeUndefined();
    expect(first).toMatchObject({ restUnmeasured: true, restComparable: false });
    expect(w.activeRest).toMatchObject({ afterEntryId: "b2", startedAt: at(5), targetEndAt: at(7) });
    expect(summarizeRests(w.blocks).averageSec).toBeUndefined();
  });

  it("±30 s modifient le décompte en cours, jamais le repos prévu ; pause : le décompte continue", () => {
    let w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    w = adjustRest(w, 30, at(1, 10));
    expect(w.activeRest).toMatchObject({ targetEndAt: at(3, 30), plannedDurationSec: 120, adjustmentSec: 30 });
    w = adjustRest(w, -30, at(1, 20));
    expect(w.activeRest).toMatchObject({ targetEndAt: at(3), adjustmentSec: 0 });
    w = pauseWorkout(w, at(1, 30), newId);
    w = resumeWorkout(w, at(1, 50));
    expect(w.activeRest?.targetEndAt).toBe(at(3));
  });

  it("fin de séance pendant le repos : chrono arrêté, repos non mesuré", () => {
    let w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    w = validateSeries(w, "bench", "b1", { reps: 10 }, at(1, 20), newId);
    w = endWorkoutSession(w, at(2));
    expect(w.activeRest).toBeUndefined();
    expect(seriesOf(w, "bench", "b1")).toMatchObject({ restUnmeasured: true, restComparable: false });
  });
});

describe("dernière série et exercice suivant", () => {
  it("dernière série : repos prévu conservé ; après « Enregistrer », l'exercice suivant est courant et le chrono continue", () => {
    let w = session([bench(2), rowing()]);
    w = endSeries(w, "bench", "b1", at(1), newId);
    w = validateSeries(w, "bench", "b1", { reps: 10 }, at(1, 20), newId);
    w = endSeries(w, "bench", "b2", at(4), newId);
    expect(w.activeRest).toMatchObject({ afterEntryId: "b2", plannedDurationSec: 120, targetEndAt: at(6) });
    expect(w.currentBlockId).toBe("bench");
    w = validateSeries(w, "bench", "b2", { reps: 9 }, at(4, 30), newId);
    expect(w.currentBlockId).toBe("row");
    expect(w.activeRest).toMatchObject({ afterBlockId: "bench", afterEntryId: "b2", targetEndAt: at(6) });
    /* Première série de l'exercice suivant terminée : le repos d'avant se clôt, non mesuré. */
    w = endSeries(w, "row", "r1", at(7), newId);
    expect(seriesOf(w, "bench", "b2")).toMatchObject({ restUnmeasured: true });
    expect(w.activeRest).toMatchObject({ afterBlockId: "row", afterEntryId: "r1", plannedDurationSec: 90 });
  });

  it("série en durée (gainage) : même parcours, la durée saisie reste celle du champ", () => {
    let w = session([plank()]);
    w = endSeries(w, "plank", "p1", at(1), newId);
    expect(w.activeRest).toMatchObject({ plannedDurationSec: 30, startedAt: at(1) });
    w = validateSeries(w, "plank", "p1", { durationSec: 45 }, at(1, 10), newId);
    expect(seriesOf(w, "plank", "p1")).toMatchObject({ durationSec: 45, endedAt: at(1), completedAt: at(1, 10) });
    expect(w.activeRest?.startedAt).toBe(at(1));
  });
});

describe("anciennes séances et règles inchangées", () => {
  it("validation directe (sans « Série terminée ») : fonctionnement d'avant, repos réel jusqu'à la validation suivante", () => {
    let w = session([bench()]);
    w = validateSeries(w, "bench", "b1", { reps: 10 }, at(1), newId);
    expect(w.activeRest).toMatchObject({ startedAt: at(1) });
    expect(w.activeRest!.fromSeriesEnd).toBeUndefined();
    w = validateSeries(w, "bench", "b2", { reps: 10 }, at(4), newId);
    expect(seriesOf(w, "bench", "b1")).toMatchObject({ actualRestAfterSec: 180, restComparable: true });
    expect(seriesOf(w, "bench", "b1").restUnmeasured).toBeUndefined();
  });

  it("« Modifier » une série enregistrée ne touche ni au repos ni aux heures", () => {
    let w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    w = validateSeries(w, "bench", "b1", { reps: 10 }, at(1, 20), newId);
    const rest = w.activeRest;
    w = editSeries(w, "bench", "b1", { reps: 9 }, at(1, 40));
    expect(w.activeRest).toEqual(rest);
    expect(seriesOf(w, "bench", "b1")).toMatchObject({ reps: 9, endedAt: at(1), completedAt: at(1, 20) });
  });

  it("le repos prévu du programme n'est jamais modifié", () => {
    let w = endSeries(session([bench()]), "bench", "b1", at(1), newId);
    w = adjustRest(w, 30, at(1, 5));
    const block = w.blocks[0] as PerformedExerciseBlock;
    expect(block.snapshotInstructions).toMatchObject({ restBetweenSetsSec: 120 });
    expect(w.activeRest!.plannedDurationSec).toBe(120);
  });
});
