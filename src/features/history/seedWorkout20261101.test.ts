import "fake-indexeddb/auto";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, PlannedSession, WorkoutSession } from "../../domain";
import { trackResults } from "../../domain/rules/progressionRules";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { PLANNED_20261101_ID, WORKOUT_20261101_ID, WORKOUT_20261101_NOTE, seedWorkout20261101 } from "./seedWorkout20261101";

/**
 * Seed 49 (01/11/2026) : la Muscu A du 01/11, faite sans téléphone et notée
 * sur papier, enregistrée comme une saisie normale de la séance prévue.
 */

const NOW = "2026-11-01T22:30:00.000Z";

const OWNER: WorkoutSession = {
  id: "workout-weekly-2026-10-29", plannedSessionId: "weekly-2026-10-29", sessionTemplateId: "v2-muscu-c", kind: "training", source: "planned", status: "completed",
  date: "2026-10-29", startedAt: "2026-10-29T16:53:48.209Z", completedAt: "2026-10-29T18:29:23.894Z", endedAt: "2026-10-29T18:29:23.894Z",
  lastActionAt: "2026-10-29T18:29:23.894Z", activeDurationSec: 5736, createdAt: "2026-10-29T16:53:48.209Z", updatedAt: "2026-10-29T18:29:29.344Z", blocks: [],
};

const PLANNED: PlannedSession = {
  id: PLANNED_20261101_ID, date: "2026-11-01", sessionTemplateId: "v2-muscu-a", status: "upcoming", sourceWeekday: "sunday", sourceDate: "2026-11-01",
  source: "weekly_program", createdAt: "2026-10-19T13:42:17.901Z", updatedAt: "2026-10-19T13:42:17.901Z",
} as PlannedSession;

const exerciseBlocks = (workout: WorkoutSession) =>
  [...workout.blocks].sort((a, b) => a.position - b.position).filter((block): block is PerformedExerciseBlock => block.kind === "exercise");

/** [exercice, statut, ajouté, séries « kg × reps @ RPE »] dans l'ordre de la séance. */
const summary = (workout: WorkoutSession) =>
  exerciseBlocks(workout).map((block) => [
    block.exerciseId,
    block.status,
    block.addedDuringWorkout,
    (block.series ?? []).filter((series) => series.status === "completed").map((series) => `${series.load && "kg" in series.load ? series.load.kg : "?"} × ${series.reps} @ ${series.rpe}`),
  ]);

const EXPECTED = [
  ["tapis", "performed", false, []],
  ["traction-assistee", "performed", false, ["21 × 2 @ 9", "28 × 5 @ 8", "28 × 5 @ 8", "21 × 5 @ 9"]],
  ["rowing-poulie-basse", "performed", false, ["55 × 6 @ 9", "55 × 6 @ 9", "50 × 8 @ 9"]],
  ["tirage-vertical", "performed", true, ["50 × 12 @ 8", "50 × 12 @ 9", "50 × 6 @ 10"]],
  ["chest-press", "performed", false, ["50 × 12 @ 8", "50 × 12 @ 9"]],
  ["elevations-laterales-halteres", "performed", false, ["5 × 15 @ 8", "5 × 14 @ 9", "5 × 13 @ 10"]],
  ["curl-halteres", "performed", false, ["8 × 12 @ 8", "8 × 10 @ 8", "8 × 8 @ 9"]],
  ["leg-curl-couche", "skipped", false, []],
  ["presse-cuisses", "skipped", false, []],
];

function checkWorkout(workout: WorkoutSession) {
  expect(summary(workout)).toEqual(EXPECTED);
  expect(workout).toMatchObject({
    id: WORKOUT_20261101_ID, plannedSessionId: PLANNED_20261101_ID, sessionTemplateId: "v2-muscu-a", source: "planned", status: "completed",
    date: "2026-11-01", startedAt: "2026-11-01T18:15:00.000Z", note: WORKOUT_20261101_NOTE, createdAt: NOW, updatedAt: NOW,
  });
  expect(workout.completedAt).toBe(workout.endedAt);
  expect(workout.resumeState).toBeUndefined();
  /* Échauffement 10 min à 5 km/h, pente 0, FC 76. */
  const warmup = exerciseBlocks(workout)[0]!;
  expect(warmup.cardioSteps).toHaveLength(1);
  expect(warmup.cardioSteps![0]).toMatchObject({ status: "completed", settings: { durationSec: 600, speedKmh: 5, inclinePercent: 0 }, bpm: 76, completedAt: "2026-11-01T18:25:00.000Z" });
  /* Repos réels notés : 3 min aux tractions, 2 min 30 au rowing, au tirage et au chest press, 1 min 30 ensuite ; aucun après la dernière série. */
  const rests = exerciseBlocks(workout).map((block) => (block.series ?? []).filter((series) => series.status === "completed").map((series) => series.actualRestAfterSec ?? null));
  expect(rests).toEqual([[], [180, 180, 180, null], [150, 150, null], [150, 150, null], [150, null], [90, 90, null], [90, 90, null], [], []]);
  /* Heures croissantes, séance de 1 h 10 (19 h 15 → 20 h 25 à Paris). */
  const times = exerciseBlocks(workout).flatMap((block) => [...(block.cardioSteps ?? []), ...(block.series ?? [])].flatMap((entry) => (entry.completedAt ? [entry.completedAt] : [])));
  expect([...times].sort()).toEqual(times);
  expect(times.every((time) => time > workout.startedAt && time < workout.completedAt!)).toBe(true);
  expect(workout.activeDurationSec).toBe((Date.parse(workout.completedAt!) - Date.parse(workout.startedAt)) / 1000);
  expect(workout.activeDurationSec).toBe(70 * 60);
}

describe("seed 49 — base neuve avec la séance prévue du 01/11", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete markers.addWorkout20261101;
    await db.settings.put({ key: "install", value: markers });
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("enregistre la Muscu A du 01/11 telle que notée sur papier ; l'instance prévue passe « Faite »", async () => {
    await db.workouts.put(OWNER);
    await db.plannedSessions.put(PLANNED);

    await seedWorkout20261101(NOW);

    checkWorkout((await db.workouts.get(WORKOUT_20261101_ID))!);
    expect(await db.plannedSessions.get(PLANNED_20261101_ID)).toEqual({ ...PLANNED, status: "done", workoutId: WORKOUT_20261101_ID, updatedAt: NOW });
    expect(((await db.settings.get("install"))!.value as InstallMarkers).addWorkout20261101).toBe(NOW);
    expect(await db.workouts.get(OWNER.id)).toEqual(OWNER);
  });

  it("une seule fois : supprimée ensuite, elle ne revient pas", async () => {
    await db.workouts.put(OWNER);
    await db.plannedSessions.put(PLANNED);
    await seedWorkout20261101(NOW);
    await db.workouts.delete(WORKOUT_20261101_ID);
    await db.plannedSessions.put(PLANNED);

    await seedWorkout20261101("2026-11-02T08:00:00.000Z");

    expect(await db.workouts.get(WORKOUT_20261101_ID)).toBeUndefined();
  });

  it("rien hors de la base de l'utilisateur, ni si une séance existe déjà ce jour-là, ni si l'instance n'est plus à faire", async () => {
    await db.plannedSessions.put(PLANNED);
    await seedWorkout20261101(NOW);
    expect(await db.workouts.get(WORKOUT_20261101_ID)).toBeUndefined();
    expect((await db.plannedSessions.get(PLANNED_20261101_ID))!.status).toBe("upcoming");

    for (const setup of [
      async () => db.workouts.put({ ...OWNER, id: "free-2026-11-01", date: "2026-11-01", source: "free", plannedSessionId: undefined } as unknown as WorkoutSession),
      async () => db.plannedSessions.put({ ...PLANNED, status: "skipped" }),
    ]) {
      await db.workouts.clear();
      await db.plannedSessions.put(PLANNED);
      const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
      delete markers.addWorkout20261101;
      await db.settings.put({ key: "install", value: markers });
      await db.workouts.put(OWNER);
      await setup();

      await seedWorkout20261101(NOW);

      expect(await db.workouts.get(WORKOUT_20261101_ID)).toBeUndefined();
    }
  });
});

/* La sauvegarde de l'utilisateur du 01/11 à 22:06 : explicite, ou celle de COACH_JM_BACKUP si elle porte l'instance encore à faire. */
const REAL = "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-11-01-2206.json";
const realPath = existsSync(REAL) ? REAL : process.env.COACH_JM_BACKUP;

describe.skipIf(!realPath)("seed 49 — sur la sauvegarde réelle", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("la séance s'ajoute une fois, compte pour les pistes, et rien d'autre ne bouge", async () => {
    const file = parseBackup(await readFile(realPath!, "utf8"));
    const planned = (file.stores.plannedSessions as PlannedSession[] | undefined)?.find((session) => session.id === PLANNED_20261101_ID);
    const sameDay = ((file.stores.workouts ?? []) as WorkoutSession[]).some((workout) => workout.date === "2026-11-01");
    if (planned?.status !== "upcoming" || sameDay) return;

    await db.delete();
    await db.open();
    await resetAndRestore(file, db);
    resumeSeedsForTests();
    const before = await db.workouts.toArray();
    await runSeeds();

    const workout = (await db.workouts.get(WORKOUT_20261101_ID))!;
    expect(summary(workout)).toEqual(EXPECTED);
    expect(workout.note).toBe(WORKOUT_20261101_NOTE);
    expect((await db.plannedSessions.get(PLANNED_20261101_ID))!).toMatchObject({ status: "done", workoutId: WORKOUT_20261101_ID });
    /* Cadres capturés comme au démarrage ; objectifs du jour figés sur les briques suivies (hors traction, pari V6). */
    const blocks = exerciseBlocks(workout);
    const rowing = blocks.find((block) => block.exerciseId === "rowing-poulie-basse")!;
    expect(rowing.frameVersionId).toBeDefined();
    expect(rowing.dayTarget).toBeDefined();
    expect(blocks.find((block) => block.exerciseId === "traction-assistee")!.dayTarget).toBeUndefined();
    /* Les séries comptent pour la piste du rowing de Muscu A. */
    expect(trackResults([workout], ["v2-muscu-a-rowing"], "2026-10-01").at(-1)).toMatchObject({ date: "2026-11-01" });

    /* Les autres séances sont inchangées (hors corrections déjà passées des seeds précédents). */
    const after = await db.workouts.toArray();
    expect(after.length).toBe(before.length + 1);

    /* Second lancement : rien ne bouge. */
    const snapshot = await db.workouts.toArray();
    await runSeeds();
    expect(await db.workouts.toArray()).toEqual(snapshot);
  });
});
