import "fake-indexeddb/auto";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { findLastPerformances } from "../workout/lastPerformance";
import { addLegCurlCouche20260927, LEG_CURL_BLOCK_ID, LEG_CURL_WORKOUT_ID, seedLegCurlCouche20260927 } from "./seedLegCurlCouche20260927";

/**
 * Seed 21 — la Muscu A du 27/09/2026 : 3 × 10 de leg curl couché à 20 kg,
 * RPE 8, 8, 9, ajoutés à la place du leg curl assis retiré. Une seule fois,
 * et seulement sur la séance telle que la sauvegarde du 27/09 17:34 la montre.
 */

const NOW = "2026-09-27T18:00:00.000Z";

/** La séance telle qu'observée (blocs utiles, heures exactes de la sauvegarde). */
function observed(): WorkoutSession {
  const series = (id: string, kg: number, at: string[]) =>
    at.map((completedAt, index) => ({ id: `${id}-set-${index + 1}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps: 10, rpe: 8, completedAt }));
  const block = (id: string, position: number, exerciseId: string, kg: number, at: string[]): PerformedExerciseBlock => ({
    id, kind: "exercise", position, addedDuringWorkout: false, exerciseId, status: "performed",
    snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 }, series: series(id, kg, at),
  });
  return {
    id: LEG_CURL_WORKOUT_ID, plannedSessionId: "weekly-2026-09-27", sessionTemplateId: "v1-muscu-a", source: "planned", kind: "training", status: "completed",
    date: "2026-09-27", startedAt: "2026-09-27T11:24:12.118Z", endedAt: "2026-09-27T15:34:11.473Z", completedAt: "2026-09-27T15:34:11.473Z",
    lastActionAt: "2026-09-27T15:34:11.473Z", activeDurationSec: 14999, createdAt: NOW, updatedAt: NOW,
    blocks: [
      block("workout-block-v1-muscu-a-rowing", 4, "rowing-poulie-basse", 40, ["2026-09-27T12:10:00.000Z"]),
      block("workout-block-v1-muscu-a-chest-press", 5, "chest-press", 40, ["2026-09-27T12:23:21.098Z", "2026-09-27T12:25:30.491Z", "2026-09-27T12:27:48.387Z"]),
      block("workout-block-v1-muscu-a-elevations", 6, "elevations-laterales-halteres", 5, ["2026-09-27T12:40:45.914Z", "2026-09-27T12:43:11.082Z", "2026-09-27T12:45:41.955Z"]),
    ],
  } as WorkoutSession;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterEach(async () => {
  db.close();
  await db.delete();
  vi.restoreAllMocks();
});

describe("seed 21 — leg curl couché du 27/09", () => {
  it("ajoute le bloc entre le chest press et les élévations : 3 × 10 à 20 kg, RPE 8, 8, 9, sans cadre ; le reste est intact", () => {
    const before = observed();
    const fixed = addLegCurlCouche20260927(before, NOW)!;
    const byPosition = [...fixed.blocks].sort((a, b) => a.position - b.position) as PerformedExerciseBlock[];
    expect(byPosition.map((block) => [block.position, block.exerciseId])).toEqual([
      [4, "rowing-poulie-basse"],
      [5, "chest-press"],
      [6, "leg-curl-couche"],
      [7, "elevations-laterales-halteres"],
    ]);
    const legCurl = byPosition[2]!;
    expect(legCurl).toMatchObject({ id: LEG_CURL_BLOCK_ID, status: "performed", addedDuringWorkout: true });
    expect(legCurl).not.toHaveProperty("frameVersionId");
    expect(legCurl.series!.map((set) => [set.load, set.reps, set.rpe, set.status])).toEqual([
      [{ kind: "total", kg: 20 }, 10, 8, "completed"],
      [{ kind: "total", kg: 20 }, 10, 8, "completed"],
      [{ kind: "total", kg: 20 }, 10, 9, "completed"],
    ]);
    /* Entre la dernière série du chest press et la première des élévations. */
    for (const set of legCurl.series!) {
      expect(set.completedAt! > "2026-09-27T12:27:48.387Z" && set.completedAt! < "2026-09-27T12:40:45.914Z").toBe(true);
    }
    /* Les autres blocs : identiques, hormis la position décalée après le leg curl. */
    const unchanged = (workout: WorkoutSession) =>
      workout.blocks
        .filter((block) => block.id !== LEG_CURL_BLOCK_ID)
        .map((block) => ({ ...block, position: 0, ...(block.kind === "exercise" ? { series: block.series?.map((set) => ({ ...set, restComparable: undefined })) } : {}) }));
    expect(unchanged(fixed)).toEqual(unchanged(before));

    /* Arrêtée après les élévations : 13:24:12 → 14:45:42 (Paris), le « repos » de 2 h 48 hors moyenne. */
    expect(before.activeDurationSec).toBe(14999);
    expect(fixed.activeDurationSec).toBe(4890);
    const elevations = byPosition[3]!.series!;
    expect(elevations.map((set) => set.restComparable)).toEqual([undefined, undefined, false]);

    /* « Dernière fois » du leg curl couché : le 27/09, 20 kg × 10. */
    const last = findLastPerformances([fixed]).get("leg-curl-couche")!;
    expect(last).toMatchObject({ date: "2026-09-27", series: { load: { kind: "total", kg: 20 }, reps: 10, rpe: 9 } });
  });

  it("état différent (leg curl déjà présent, heures autres, durée déjà corrigée) : rien ; le marqueur est posé une fois, second passage sans écriture", async () => {
    const already = addLegCurlCouche20260927(observed(), NOW)!;
    expect(addLegCurlCouche20260927(already, NOW)).toBeUndefined();
    const moved = observed();
    (moved.blocks[1] as PerformedExerciseBlock).series!.at(-1)!.completedAt = "2026-09-27T12:30:00.000Z";
    expect(addLegCurlCouche20260927(moved, NOW)).toBeUndefined();
    expect(addLegCurlCouche20260927({ ...observed(), activeDurationSec: 4890 }, NOW)).toBeUndefined();

    await db.workouts.put(observed());
    await seedLegCurlCouche20260927(NOW);
    const once = await db.workouts.get(LEG_CURL_WORKOUT_ID);
    expect(once?.blocks).toHaveLength(4);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).legCurlCouche20260927).toBe(NOW);

    await seedLegCurlCouche20260927("2026-09-28T08:00:00.000Z");
    expect(await db.workouts.get(LEG_CURL_WORKOUT_ID)).toEqual(once);
  });

  /* La sauvegarde de l'utilisateur du 27/09 à 17:34 : explicite, ou celle de COACH_JM_BACKUP si elle porte la séance. */
  const REAL = "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-09-27-1734.json";
  const path = existsSync(REAL) ? REAL : process.env.COACH_JM_BACKUP;
  it.skipIf(!path)("sauvegarde réelle : la séance du 27/09 reçoit le leg curl couché, tout le reste est identique", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const file = parseBackup(await readFile(path!, "utf8"));
    await resetAndRestore(file, db);
    resumeSeedsForTests();
    const before = await db.workouts.toArray();
    const planned = await db.plannedSessions.where("date").below("2026-10-04").toArray();

    await runSeeds();

    const after = await db.workouts.toArray();
    expect(await db.exercises.get("leg-curl-couche")).toMatchObject({ name: "Leg curl couché", zone: "Jambes", status: "active" });
    for (const workout of before.filter((item) => item.id !== LEG_CURL_WORKOUT_ID)) {
      expect(after.find((item) => item.id === workout.id), workout.id).toEqual(workout);
    }
    const target = before.find((item) => item.id === LEG_CURL_WORKOUT_ID);
    const fixed = after.find((item) => item.id === LEG_CURL_WORKOUT_ID);
    if (target && addLegCurlCouche20260927(target, NOW)) {
      const legCurl = fixed!.blocks.find((block) => block.id === LEG_CURL_BLOCK_ID) as PerformedExerciseBlock;
      expect(legCurl.series!.map((set) => [set.load, set.reps, set.rpe])).toEqual([
        [{ kind: "total", kg: 20 }, 10, 8],
        [{ kind: "total", kg: 20 }, 10, 8],
        [{ kind: "total", kg: 20 }, 10, 9],
      ]);
      expect([...fixed!.blocks].sort((a, b) => a.position - b.position).map((block) => (block.kind === "exercise" ? block.exerciseId : block.kind))).toEqual([
        "tapis", "test", "traction-assistee", "squat", "rowing-poulie-basse", "chest-press", "leg-curl-couche", "elevations-laterales-halteres",
      ]);
      expect(fixed!.activeDurationSec).toBe(4890);
      const elevations = fixed!.blocks.find((block) => block.id === "workout-block-v1-muscu-a-elevations") as PerformedExerciseBlock;
      expect(elevations.series!.map((set) => set.restComparable)).toEqual([true, true, false]);
    } else {
      expect(fixed).toEqual(target);
    }
    /* La semaine de tests n'est pas touchée. */
    const plannedAfter = await db.plannedSessions.where("date").below("2026-10-04").toArray();
    for (const session of planned) expect(plannedAfter.find((item) => item.id === session.id), session.id).toEqual(session);
  });
});
