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
import { detectStagnation, proposeRaise } from "../../domain/rules/strengthRules";
import { listSeriesByExercise } from "../workout/lastPerformance";
import { formatFrameLoadSuggestion, suggestFrameLoad } from "../workout/suggestedLoad";
import { loadActiveFrameVersions } from "./activeFrameVersions";
import { acceptRaise, createFrame } from "./frameActions";
import { currentLoadOf, proposeStartingLoad } from "./frameReadings";

/**
 * Jeu réel du lot 4B (plan § 8) : la sauvegarde personnelle
 * (`COACH_JM_BACKUP`, ignoré si absent) restaurée sur une base de test,
 * un cadre créé sur un exercice de septembre, une séance faite et
 * validée → **un** jalon ; rien d'autre ne bouge : les séances existantes, les
 * 48 exercices, le modèle, les autres stores sont identiques au fichier.
 * Lot 4C : hausse proposée, acceptée, conseillée à la séance suivante,
 * validée → second jalon et objectif effacé. Puis les séances sont
 * supprimées : les jalons disparaissent, la version redevient modifiable,
 * et la base est de nouveau celle du fichier plus le cadre.
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

    /* 11 séances au 20/09 (0205), 12 depuis la séance libre du 20/09 (sauvegarde du 22/09) : le test suit le fichier. */
    expect(initial.counts.workouts).toBeGreaterThanOrEqual(11);
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
    /* L'échelle capturée au démarrage est celle du fichier : aucune avant le
       lot 4A (sauvegarde du 20/09, clé absente), la V1 active après (22/09). */
    const activeScale = (initial.stores.rpeScaleVersions as Array<{ id: string; status: string }>).find(
      (scale) => scale.status === "active",
    );
    if (activeScale) expect(started.rpeScaleVersionId).toBe(activeScale.id);
    else expect(started).not.toHaveProperty("rpeScaleVersionId");
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
    expect(afterSession.counts.workouts).toBe((initial.counts.workouts ?? 0) + 1);
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

    /* Lot 4C — la boucle : hausse proposée depuis le jalon, acceptée →
       objectif daté ; la séance suivante conseille cet objectif ; validée à
       l'objectif → second jalon, objectif effacé, hausse suivante proposée. */
    const frozenVersion = (await db.strengthFrameVersions.get(version.id))!;
    const raise = proposeRaise(frozenVersion, await db.strengthMilestones.toArray(), await db.workouts.toArray());
    expect(raise).toMatchObject({ value: proposed!.value + 5, unit: "kg", repFloor: 10 });
    await acceptRaise(frozenVersion, raise!, "2026-09-22T17:30:00.000Z");
    const accepted = (await db.strengthFrameVersions.get(version.id))!;
    expect(accepted.currentTarget).toEqual({ value: proposed!.value + 5, unit: "kg", acceptedAt: "2026-09-22T17:30:00.000Z", fromMilestoneId: `milestone-${w.id}-${version.id}` });
    expect(proposeRaise(accepted, await db.strengthMilestones.toArray(), await db.workouts.toArray())).toBeUndefined();

    const lastSeries = listSeriesByExercise(w).get("presse-cuisses");
    expect(formatFrameLoadSuggestion(suggestFrameLoad(accepted, lastSeries))).toBe(
      `${proposed!.value + 5} kg (objectif accepté) · pour valider : 2 × 12 · RPE ≤ 8`,
    );

    const started2 = await startFreeWorkout("2026-09-25", "2026-09-25T17:00:00.000Z");
    const frames2 = await loadActiveFrameVersions();
    let w2 = addExerciseBlocks(started2, [presse], "2026-09-25T17:01:00.000Z", () => "x2", frames2.versionIdByExercise);
    const block2 = w2.blocks[0]!;
    const load2 = { kind: "total" as const, kg: proposed!.value + 5 };
    w2 = validateSeries(w2, block2.id, seriesOf(w2)[0]!.id, { load: load2, reps: 12, rpe: 8, role: "travail", sideLimited: false }, "2026-09-25T17:02:00.000Z", () => "y2");
    w2 = addSeries(w2, block2.id, "2026-09-25T17:03:00.000Z", () => "z2");
    w2 = validateSeries(w2, block2.id, seriesOf(w2).at(-1)!.id, { load: load2, reps: 12, rpe: 8, role: "travail", sideLimited: false }, "2026-09-25T17:05:00.000Z", () => "w2");
    w2 = finishBlock(w2, block2.id, "2026-09-25T17:06:00.000Z");
    await db.workouts.put(w2);
    const second = await finishWorkout(w2.id, "2026-09-25T17:10:00.000Z");
    expect(second.frames[0]).toMatchObject({ result: { validated: true, value: proposed!.value + 5 } });
    const afterSecond = (await db.strengthFrameVersions.get(version.id))!;
    expect(afterSecond).not.toHaveProperty("currentTarget");
    expect(afterSecond.firstOfficialWorkoutId).toBe(w.id);
    expect(await db.strengthMilestones.count()).toBe(2);
    expect(proposeRaise(afterSecond, await db.strengthMilestones.toArray(), await db.workouts.toArray())).toMatchObject({ value: proposed!.value + 10 });
    expect(detectStagnation(afterSecond, await db.workouts.toArray(), await db.strengthMilestones.toArray())).toBeUndefined();

    /* Les 11 séances d'origine toujours identiques. */
    const stillUntouched = ((await readStores(db)).stores.workouts as WorkoutSession[]).filter((item) => originalIds.has(item.id));
    expect(canonicalStringify(stillUntouched)).toBe(canonicalStringify(initial.stores.workouts));

    /* Suppression des deux séances : jalons retirés, version dé-figée, base = fichier + cadre. */
    const removedSecond = await deleteWorkout(w2.id, "2026-09-25T18:00:00.000Z");
    expect(removedSecond).toMatchObject({ removedMilestones: 1, unfrozenVersionIds: [] });
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
