import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { Exercise, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { calculateSessionTemplateDuration } from "../../domain/rules/sessionTemplateRules";
import { clearanceStatusOf, formatLockedCount, lockedTemplateExerciseIds, practiceLockOf } from "../../domain/rules/exerciseClearanceRules";
import { readBackup, serializeBackup } from "../backup/exportBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { withPracticeSuspensions } from "../perspectives/dayTargets";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { endWorkoutSession, unskipBlock, validateSeries } from "./engine/workoutEngine";
import { withPracticeLocks } from "./practiceLocks";
import { startFreeWorkout } from "./startFreeWorkout";

/**
 * Lot L2 (programme V4, D10 adapté par Q5) : statut de pratique des
 * exercices — « À valider » et « Suspendu » verrouillent l'exercice dans
 * les séances ; « Validé » (ou aucun statut) ne change rien.
 */

const NOW = "2026-11-02T10:00:00.000Z";

const exercise = (id: string, status?: "a_valider" | "valide" | "suspendu") =>
  ({ id, ...(status ? { clearance: { status, since: NOW } } : {}) }) as unknown as Exercise;

const block = (id: string, exerciseId: string, done = false): PerformedExerciseBlock => ({
  id, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId, status: "not_performed",
  snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 },
  series: [
    { id: `${id}-1`, position: 0, status: done ? "completed" : "upcoming", role: "travail", ...(done ? { load: { kind: "total" as const, kg: 20 }, reps: 10 } : {}) },
    { id: `${id}-2`, position: 1, status: "upcoming", role: "travail" },
  ],
});

const workout = (blocks: PerformedExerciseBlock[], currentBlockId?: string): WorkoutSession => ({
  id: "w", kind: "training", source: "free", status: "in_progress", date: "2026-11-02", startedAt: NOW, lastActionAt: NOW, activeDurationSec: 0,
  blocks: blocks.map((item, position) => ({ ...item, position })), createdAt: NOW, updatedAt: NOW, ...(currentBlockId ? { currentBlockId } : {}),
});

describe("statut de pratique — règles", () => {
  it("absent = Validé ; À valider et Suspendu verrouillent ; libellé du nombre d'exercices verrouillés", () => {
    expect(clearanceStatusOf(exercise("a"))).toBe("valide");
    expect(clearanceStatusOf(undefined)).toBe("valide");
    expect(practiceLockOf(exercise("a", "valide"))).toBeUndefined();
    expect(practiceLockOf(exercise("a", "a_valider"))).toBe("a_valider");
    expect(practiceLockOf(exercise("a", "suspendu"))).toBe("suspendu");
    const byId = new Map([exercise("x", "suspendu"), exercise("y"), exercise("z", "a_valider")].map((item) => [item.id, item]));
    expect(lockedTemplateExerciseIds([{ kind: "exercise", exerciseId: "x" }, { kind: "exercise", exerciseId: "y" }, { kind: "note" }, { kind: "exercise", exerciseId: "z" }], byId)).toEqual(["x", "z"]);
    expect(formatLockedCount(0)).toBeUndefined();
    expect(formatLockedCount(1)).toBe("1 exercice à valider ou suspendu : il sera sauté");
    expect(formatLockedCount(2)).toBe("2 exercices à valider ou suspendus : ils seront sautés");
  });
});

describe("statut de pratique — séance", () => {
  it("brique verrouillée : sautée avec son motif ; une brique commencée ou libre n'est pas touchée ; la brique courante cède la place", () => {
    const byId = new Map([exercise("leg", "a_valider"), exercise("curl", "suspendu"), exercise("row")].map((item) => [item.id, item]));
    const locked = withPracticeLocks(workout([block("b1", "leg"), block("b2", "curl", true), block("b3", "row")], "b1"), byId);
    expect(locked.blocks.map((item) => [item.id, item.kind === "exercise" ? item.status : undefined, item.kind === "exercise" ? item.locked : undefined])).toEqual([
      ["b1", "skipped", "a_valider"],
      ["b2", "not_performed", undefined],
      ["b3", "not_performed", undefined],
    ]);
    expect(locked.currentBlockId).toBeUndefined();
    /* Tout est libre : la séance est rendue telle quelle. */
    const free = workout([block("b3", "row")], "b3");
    expect(withPracticeLocks(free, byId)).toBe(free);
  });

  it("une brique verrouillée ne se reprend pas et ne se note pas ; à la fin elle reste sautée", () => {
    const byId = new Map([["leg", exercise("leg", "a_valider")]]);
    const locked = withPracticeLocks(workout([block("b1", "leg"), block("b3", "row")]), byId);
    expect(() => unskipBlock(locked, "b1", NOW)).toThrow("changez d'abord son statut");
    expect(() => validateSeries(locked, "b1", "b1-1", { load: { kind: "total", kg: 20 }, reps: 10 }, NOW)).toThrow("changez d'abord son statut");
    const ended = endWorkoutSession(locked, NOW);
    expect(ended.blocks.find((item) => item.id === "b1")).toMatchObject({ status: "skipped", locked: "a_valider" });
  });

  it("durée estimée : les exercices verrouillés en sont retirés ; une moyenne réelle ne change pas", () => {
    const template = {
      id: "t", name: "T", category: "Musculation", status: "active", position: 0, createdAt: NOW, updatedAt: NOW,
      blocks: [
        { id: "e1", kind: "exercise", position: 0, exerciseId: "leg", instructions: { shape: "reps", sets: 2, reps: { min: 10, max: 10 }, restBetweenSetsSec: 90 } },
        { id: "e2", kind: "exercise", position: 1, exerciseId: "row", instructions: { shape: "reps", sets: 2, reps: { min: 10, max: 10 }, restBetweenSetsSec: 90 } },
      ],
    } as never;
    const all = calculateSessionTemplateDuration(template, []);
    const without = calculateSessionTemplateDuration(template, [], new Set(["leg"]));
    expect(all.kind).toBe("estimated");
    expect(without.minutes).toBeLessThan(all.minutes);
  });

  it("perspectives : la piste d'un exercice verrouillé se lit suspendue (sans l'écrire) ; une suspension posée l'emporte", () => {
    const tracks = [
      { id: "p1", exerciseId: "leg" },
      { id: "p2", exerciseId: "row" },
      { id: "p3", exerciseId: "press", suspension: { from: "2026-10-22", reason: "Douleur" } },
    ] as never[];
    const byId = new Map([exercise("leg", "suspendu"), exercise("row"), exercise("press", "a_valider")].map((item) => [item.id, item]));
    const read = withPracticeSuspensions(tracks, byId);
    expect(read.map((track) => track.suspension)).toEqual([{ from: "2026-11-02", reason: "Exercice suspendu" }, undefined, { from: "2026-10-22", reason: "Douleur" }]);
    expect((tracks[0] as unknown as { suspension?: unknown }).suspension).toBeUndefined();
  });
});

describe("statut de pratique — base et sauvegarde", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("aucun exercice verrouillé au départ (Q5) ; le catalogue ne touche jamais un statut posé", async () => {
    const all = await db.exercises.toArray();
    expect(all.filter((item) => practiceLockOf(item))).toEqual([]);
    const leg = (await db.exercises.get("leg-curl-couche"))!;
    await db.exercises.put({ ...leg, clearance: { status: "suspendu", since: NOW } });
    resumeSeedsForTests();
    await runSeeds();
    expect((await db.exercises.get("leg-curl-couche"))!.clearance).toEqual({ status: "suspendu", since: NOW });
  });

  it("une séance démarrée sur un modèle saute et verrouille l'exercice suspendu, les autres restent libres", async () => {
    const leg = (await db.exercises.get("leg-curl-couche"))!;
    await db.exercises.put({ ...leg, clearance: { status: "suspendu", since: NOW } });
    const template = (await db.sessionTemplates.get("v2-muscu-a"))!;
    const started = await startFreeWorkout("2026-11-02", NOW, template);
    const legBlock = started.blocks.find((item) => item.kind === "exercise" && item.exerciseId === "leg-curl-couche");
    expect(legBlock).toMatchObject({ status: "skipped", locked: "suspendu" });
    expect(started.blocks.filter((item) => item.kind === "exercise" && item.locked)).toHaveLength(1);
  });

  it("sauvegarde puis restauration : le statut est conservé ; un exercice sans statut reste Validé", async () => {
    const leg = (await db.exercises.get("leg-curl-couche"))!;
    await db.exercises.put({ ...leg, clearance: { status: "a_valider", since: NOW, note: "Avis du kiné attendu" } });
    const text = serializeBackup(await readBackup(db, { now: new Date(NOW), buildTime: "b", userAgent: "t", standalone: true }));
    await db.exercises.put({ ...leg });
    await resetAndRestore(parseBackup(text), db);
    expect((await db.exercises.get("leg-curl-couche"))!.clearance).toEqual({ status: "a_valider", since: NOW, note: "Avis du kiné attendu" });
    expect(clearanceStatusOf(await db.exercises.get("rowing-poulie-basse"))).toBe("valide");
  });
});
