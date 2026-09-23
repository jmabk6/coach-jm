import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { Exercise, WorkoutSession } from "../../domain";
import { checkClassification } from "../../domain/rules/exerciseRules";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { readStores } from "../backup/exportBackup";
import { canonicalStringify } from "../backup/canonicalJson";
import { seedRpeScale } from "../strength/seedRpeScale";

/* En production, les médias du catalogue sont préfixés par la base de la
   PWA (`/coach-jm/`), comme dans la sauvegarde ; sous Vitest la base vaut
   `/`. On aligne l'environnement avant de charger le catalogue, sinon le
   seed resynchroniserait les médias — un artefact de test, pas un effet
   du lot 3. */
vi.stubEnv("BASE_URL", "/coach-jm/");
const { seedExerciseCatalog } = await import("./seedExerciseCatalog");

/**
 * Le seed du lot 3 rejoué sur une **copie** de la sauvegarde réelle
 * (`COACH_JM_BACKUP`, ignoré si absent), dans l'instance de test
 * `coach-jm` de fake-indexeddb : c'est exactement ce que fera le premier
 * lancement après déploiement. Attendu : les exercices de musculation ne
 * diffèrent que par la classification, tout le reste est identique.
 */
describe("seed du lot 3 sur la sauvegarde réelle", () => {
  const path = process.env.COACH_JM_BACKUP;

  afterEach(async () => {
    db.close();
    await db.delete();
    vi.restoreAllMocks();
  });

  afterAll(() => vi.unstubAllEnvs());

  it.skipIf(!path)("complète la classification des exercices du catalogue sans toucher à rien d'autre", async () => {
    await db.delete();
    await db.open();
    const envelope = parseBackup(await readFile(path!, "utf8"));
    await restoreBackup(envelope, db);
    const before = await readStores(db);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await seedExerciseCatalog();

    const after = await readStores(db);
    expect(warn).not.toHaveBeenCalled();

    /* Tout sauf `exercises` : strictement identique. */
    for (const store of Object.keys(before.stores)) {
      if (store === "exercises") continue;
      expect(canonicalStringify(after.stores[store]), store).toBe(canonicalStringify(before.stores[store]));
    }
    expect(after.counts).toEqual(before.counts);

    const beforeById = new Map((before.stores.exercises as Exercise[]).map((e) => [e.id, e]));
    let enriched = 0;
    for (const exercise of after.stores.exercises as Exercise[]) {
      const previous = beforeById.get(exercise.id)!;
      const strippedAfter: Partial<Exercise> = { ...exercise };
      delete strippedAfter.progressionGroup;
      delete strippedAfter.movementFamily;
      delete strippedAfter.loadSemantics;
      const strippedBefore: Partial<Exercise> = { ...previous };
      delete strippedBefore.progressionGroup;
      delete strippedBefore.movementFamily;
      delete strippedBefore.loadSemantics;

      /* Seuls les deux champs de classification — et, depuis le lot a, le
         sens de la charge — peuvent différer ; updatedAt et createdAt sont intacts. */
      expect(strippedAfter, exercise.id).toEqual(strippedBefore);
      expect(exercise.loadSemantics, exercise.id).toBe(
        previous.loadSemantics ??
          (exercise.id === "traction-assistee" || exercise.id === "dips-assistes" ? "assistance" : undefined),
      );
      expect(exercise.updatedAt, exercise.id).toBe(previous.updatedAt);
      expect(checkClassification(exercise), exercise.id).toEqual([]);

      if (exercise.category === "Musculation") {
        expect(exercise.progressionGroup, exercise.id).toBeDefined();
        if (previous.progressionGroup === undefined) enriched += 1;
      } else {
        expect(exercise.progressionGroup, exercise.id).toBeUndefined();
        expect(exercise.movementFamily, exercise.id).toBeUndefined();
      }
      /* Une valeur déjà présente dans la sauvegarde n'a pas été écrasée. */
      if (previous.progressionGroup !== undefined) expect(exercise.progressionGroup).toBe(previous.progressionGroup);
      if (previous.movementFamily !== undefined) expect(exercise.movementFamily).toBe(previous.movementFamily);
    }

    /* Relance : plus aucune écriture. */
    const again = await readStores(db);
    await seedExerciseCatalog();
    expect(canonicalStringify((await readStores(db)).stores)).toBe(canonicalStringify(again.stores));

    console.info("[seed réel]", { exercices: after.counts.exercises, enrichis: enriched, seances: after.counts.workouts });
  });

  it.skipIf(!path)("lot 4A : le seed de l'échelle RPE ajoute une V1 et ne touche à rien d'autre", async () => {
    await db.delete();
    await db.open();
    const envelope = parseBackup(await readFile(path!, "utf8"));
    await restoreBackup(envelope, db);
    await seedExerciseCatalog();
    const before = await readStores(db);

    await seedRpeScale(new Date("2026-09-22T10:00:00.000Z"));

    const after = await readStores(db);
    for (const store of Object.keys(before.stores)) {
      if (store === "rpeScaleVersions") continue;
      expect(canonicalStringify(after.stores[store]), store).toBe(canonicalStringify(before.stores[store]));
    }
    expect(before.counts.rpeScaleVersions).toBe(0);
    expect(after.counts.rpeScaleVersions).toBe(1);
    expect(after.counts.workouts).toBe(before.counts.workouts);

    /* Les séances existantes gardent leurs séries sans rôle ni drapeau. */
    for (const workout of after.stores.workouts as WorkoutSession[]) {
      expect(workout).not.toHaveProperty("rpeScaleVersionId");
      for (const block of workout.blocks) {
        if (block.kind !== "exercise") continue;
        for (const series of block.series ?? []) {
          expect(series).not.toHaveProperty("role");
          expect(series).not.toHaveProperty("sideLimited");
        }
      }
    }
  });
});
