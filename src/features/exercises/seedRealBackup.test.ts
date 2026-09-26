import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { Exercise } from "../../domain";
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
const { exerciseCatalog } = await import("./exerciseCatalog");

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
    const beforeById = new Map((before.stores.exercises as Exercise[]).map((e) => [e.id, e]));
    /* Lot D : les exercices du catalogue absents de la sauvegarde sont
       ajoutés, identiques au catalogue ; rien d'autre ne change de compte. */
    const missing = exerciseCatalog.filter((exercise) => !beforeById.has(exercise.id));
    expect(after.counts).toEqual({ ...before.counts, exercises: (before.counts.exercises ?? 0) + missing.length });

    let enriched = 0;
    for (const exercise of after.stores.exercises as Exercise[]) {
      const previous = beforeById.get(exercise.id);
      if (!previous) {
        expect(exercise, exercise.id).toEqual(exerciseCatalog.find((entry) => entry.id === exercise.id));
        continue;
      }
      const strippedAfter: Partial<Exercise> = { ...exercise };
      delete strippedAfter.progressionGroup;
      delete strippedAfter.movementFamily;
      delete strippedAfter.loadSemantics;
      delete strippedAfter.media;
      const strippedBefore: Partial<Exercise> = { ...previous };
      delete strippedBefore.progressionGroup;
      delete strippedBefore.movementFamily;
      delete strippedBefore.loadSemantics;
      delete strippedBefore.media;
      /* Les médias officiels suivent toujours le catalogue (nouvelles images comprises). */
      const officialMedia = exerciseCatalog.find((entry) => entry.id === exercise.id)?.media;
      expect(exercise.media, `${exercise.id} media`).toEqual(officialMedia ?? previous.media);

      /* Seuls les deux champs de classification — et, depuis le lot a, le
         sens de la charge — peuvent différer ; updatedAt et createdAt sont intacts. */
      expect(strippedAfter, exercise.id).toEqual(strippedBefore);
      expect(exercise.loadSemantics, exercise.id).toBe(
        previous.loadSemantics ??
          (exercise.id === "traction-assistee" || exercise.id === "dips-assistes" ? "assistance" : undefined),
      );
      expect(exercise.updatedAt, exercise.id).toBe(previous.updatedAt);
      expect(checkClassification(exercise), exercise.id).toEqual([]);

      /* Mollets debout (lot D) : sans groupe, par décision — aucun n'existe pour eux. */
      if (exercise.category === "Musculation" && exercise.id !== "mollets-debout") {
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

    console.info("[seed réel]", { exercices: after.counts.exercises, ajoutes: missing.length, enrichis: enriched, seances: after.counts.workouts });
  });

  it.skipIf(!path)("lot 4A : le seed de l'échelle RPE pose une V1 si elle manque, n'écrit rien sinon, et ne touche à rien d'autre", async () => {
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
    /* Indépendant de l'âge de la sauvegarde : un fichier antérieur au
       lot 4A (20/09) n'a aucune échelle et reçoit la V1 ; un fichier
       postérieur (22/09) en a déjà une et le seed n'écrit rien. */
    const scalesBefore = before.stores.rpeScaleVersions as Array<{ id: string; number: number; status: string }>;
    expect(before.counts.rpeScaleVersions ?? 0).toBeLessThanOrEqual(1);
    expect(after.counts.rpeScaleVersions).toBe(1);
    if (scalesBefore.length === 0) {
      expect(after.stores.rpeScaleVersions).toMatchObject([{ id: "rpe-scale-v1", number: 1, status: "active", startDate: "2026-09-22" }]);
    } else {
      expect(canonicalStringify(after.stores.rpeScaleVersions)).toBe(canonicalStringify(before.stores.rpeScaleVersions));
    }
    expect(after.counts.workouts).toBe(before.counts.workouts);

    /* Les séances du fichier sont relues à l'identique : le seed ne pose ni
       échelle, ni rôle, ni drapeau sur une séance existante. */
    expect(canonicalStringify(after.stores.workouts)).toBe(canonicalStringify(envelope.stores.workouts));

    /* Idempotence : une seconde passe n'écrit plus rien, quel que soit l'état de départ. */
    await seedRpeScale(new Date("2026-09-30T10:00:00.000Z"));
    expect(canonicalStringify((await readStores(db)).stores)).toBe(canonicalStringify(after.stores));
  });
});
