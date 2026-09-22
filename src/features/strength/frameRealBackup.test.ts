import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { Exercise, WorkoutSession } from "../../domain";
import { canonicalStringify } from "../backup/canonicalJson";
import { readStores } from "../backup/exportBackup";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { addExerciseBlocks, addSeries, finishBlock, validateSeries } from "../workout/engine/workoutEngine";
import { finishWorkout } from "../workout/finishWorkout";
import { deleteWorkout } from "../workout/deleteWorkout";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { loadActiveFrameVersions } from "./activeFrameVersions";
import { createFrame } from "./frameActions";
import { currentLoadOf, proposeStartingLoad } from "./frameReadings";

/**
 * Jeu réel du lot 4B (plan § 8) : la sauvegarde personnelle
 * (`COACH_JM_BACKUP`, ignoré si absent) restaurée sur une base de test,
 * un cadre créé sur un exercice de septembre, une séance faite et
 * validée → **un** jalon ; rien d'autre ne bouge : les 11 séances, les
 * 48 exercices, le modèle, les autres stores sont identiques au fichier.
 * Puis la séance est supprimée : le jalon disparaît, la version redevient
 * modifiable, et la base est de nouveau celle du fichier plus le cadre.
 */
describe("lot 4B sur la sauvegarde réelle", () => {
  const path = process.env.COACH_JM_BACKUP;

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!path)("un cadre + une séance validée → un jalon, les 11 séances intactes ; suppression → retour à l'état initial", async () => {
    await db.delete();
    await db.open();
    const envelope = parseBackup(await readFile(path!, "utf8"));
    await restoreBackup(envelope, db);
    const initial = await readStores(db);

    expect(initial.counts.workouts).toBe(11);
    expect(initial.counts.strengthFrames).toBe(0);
    expect(initial.counts.strengthMilestones).toBe(0);

    /* La presse à cuisses des feuilles de septembre : la charge de départ
       proposée vient de la dernière séance réelle, elle n'est pas stockée. */
    const presse = (await db.exercises.get("presse-cuisses")) as Exercise;
    expect(presse).toMatchObject({ category: "Musculation", measurementType: "load_reps" });
    const workouts = (await db.workouts.toArray()) as WorkoutSession[];
    const proposed = proposeStartingLoad(presse, workouts);
    expect(proposed).toBeDefined();
    console.info("[jeu réel] charge de départ proposée pour la presse :", proposed);

    const { frame, version } = await createFrame(
      presse,
      { progressionType: "charge_croissante", workSets: 2, repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 90, increment: { unit: "kg", value: 5 } },
      { value: proposed!.value, unit: "kg" },
      "2026-09-22T10:00:00.000Z",
      () => "reel",
    );

    const afterFrame = await readStores(db);
    for (const store of Object.keys(initial.stores)) {
      if (store === "strengthFrames" || store === "strengthFrameVersions") continue;
      expect(canonicalStringify(afterFrame.stores[store]), store).toBe(canonicalStringify(initial.stores[store]));
    }

    /* Une séance libre : la version active est capturée à l'ajout, deux
       séries de travail au haut de plage sous la cible → validée. */
    const started = await startFreeWorkout("2026-09-22", "2026-09-22T17:00:00.000Z");
    expect(started.rpeScaleVersionId).toBeUndefined(); /* le fichier n'a pas d'échelle : clé absente */
    const frames = await loadActiveFrameVersions();
    let w = addExerciseBlocks(started, [presse], "2026-09-22T17:01:00.000Z", () => "x", frames.versionIdByExercise);
    const block = w.blocks[0]!;
    if (block.kind !== "exercise") throw new Error("brique exercice attendue");
    expect(block).toMatchObject({ exerciseId: "presse-cuisses", frameVersionId: version.id });
    const seriesOf = (session: WorkoutSession) => {
      const current = session.blocks[0]!;
      return current.kind === "exercise" ? current.series! : [];
    };
    const load = { kind: "total" as const, kg: proposed!.value };
    w = validateSeries(w, block.id, seriesOf(w)[0]!.id, { load, reps: 12, rpe: 7, role: "travail", sideLimited: false }, "2026-09-22T17:02:00.000Z", () => "y");
    /* Le bloc ajouté n'a qu'une série prévue : on en ajoute une, puis on clôt l'exercice. */
    w = addSeries(w, block.id, "2026-09-22T17:03:00.000Z", () => "z");
    w = validateSeries(w, block.id, seriesOf(w).at(-1)!.id, { load, reps: 12, rpe: 8, role: "travail", sideLimited: false }, "2026-09-22T17:05:00.000Z", () => "w");
    w = finishBlock(w, block.id, "2026-09-22T17:06:00.000Z");
    await db.workouts.put(w);

    const { frames: outcomes } = await finishWorkout(w.id, "2026-09-22T17:10:00.000Z");
    expect(outcomes).toEqual([
      { frameVersionId: version.id, result: { validated: true, value: proposed!.value, unit: "kg" }, milestoneId: `milestone-${w.id}-${version.id}` },
    ]);

    const afterSession = await readStores(db);
    expect(afterSession.counts.strengthMilestones).toBe(1);
    expect(afterSession.counts.workouts).toBe(12);
    const frozen = await db.strengthFrameVersions.get(version.id);
    expect(frozen).toMatchObject({ firstOfficialWorkoutId: w.id });
    expect(frozen).not.toHaveProperty("currentTarget");

    /* Les 11 séances d'origine : strictement identiques au fichier. */
    const originalIds = new Set((initial.stores.workouts as WorkoutSession[]).map((item) => item.id));
    const untouched = (afterSession.stores.workouts as WorkoutSession[]).filter((item) => originalIds.has(item.id));
    expect(canonicalStringify(untouched)).toBe(canonicalStringify(initial.stores.workouts));
    for (const store of ["exercises", "sessionTemplates", "weeklyPrograms", "plannedSessions", "goals", "weightEntries", "rpeScaleVersions"]) {
      expect(canonicalStringify(afterSession.stores[store]), store).toBe(canonicalStringify(initial.stores[store]));
    }
    expect(currentLoadOf("presse-cuisses", "kg", await db.workouts.toArray())).toMatchObject({ value: proposed!.value, workoutId: w.id });

    /* Suppression de la séance : jalon retiré, version dé-figée, base = fichier + cadre. */
    const removed = await deleteWorkout(w.id, "2026-09-22T18:00:00.000Z");
    expect(removed).toMatchObject({ removedMilestones: 1, unfrozenVersionIds: [version.id] });
    const final = await readStores(db);
    expect(final.counts).toEqual({ ...initial.counts, strengthFrames: 1, strengthFrameVersions: 1 });
    for (const store of Object.keys(initial.stores)) {
      if (store === "strengthFrames" || store === "strengthFrameVersions") continue;
      expect(canonicalStringify(final.stores[store]), store).toBe(canonicalStringify(initial.stores[store]));
    }
    expect(await db.strengthFrameVersions.get(version.id)).not.toHaveProperty("firstOfficialWorkoutId");
    expect(await db.strengthFrames.get(frame.id)).toBeDefined();
  });
});
