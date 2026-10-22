import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { DayTarget, Exercise, InstallMarkers, PerformedExerciseBlock, ProgressionTrack, StrengthFrameVersion, StrengthMilestone, WorkoutSession } from "../../domain";
import { proposeRaise } from "../../domain/rules/strengthRules";
import { frameInsightsFor } from "../strength/useFrameInsights";
import { readBackup, serializeBackup } from "../backup/exportBackup";
import { parseBackup } from "../backup/restoreBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { LOAD_STEPS_20261022, seedDetailedReferences20261022, seedLoadSteps20261022, seedPerspectiveTracks20261022, seedShoulderRpe20261022 } from "./seedPerspectives20261022";

/**
 * Perspectives au 31 mars, mise en place (lot P1, 22/10/2026) : crans
 * réels, plafond RPE 9 aux épaules, pistes A/B/C et trajectoires initiales.
 */

const NOW = "2026-10-22T10:00:00.000Z";

const install = async () => (await db.settings.get("install"))!.value as InstallMarkers;
const tracks = async () => ((await db.settings.get("progressionTracks"))?.value ?? []) as ProgressionTrack[];
async function withoutMarker(key: keyof InstallMarkers): Promise<void> {
  const markers = { ...(await install()) };
  delete markers[key];
  await db.settings.put({ key: "install", value: markers });
}

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

describe("seed 42 — crans réels", () => {
  it("posés sur chaque exercice confirmé ; jamais d'écrasement ; une seule fois", async () => {
    expect((await db.exercises.get("presse-cuisses"))!.loadSteps).toEqual({ base: 10, step: 10 });
    expect((await db.exercises.get("elevations-laterales-halteres"))!.loadSteps).toEqual({ base: 6, step: 2, below: [4, 5] });
    expect((await db.exercises.get("chest-press"))!.loadSteps).toEqual({ base: 5, step: 5 });
    expect((await db.exercises.get("extension-triceps-dessus-tete"))!.loadSteps).toEqual({ base: 2.5, step: 2.5 });

    await withoutMarker("loadSteps20261022");
    const presse = (await db.exercises.get("presse-cuisses"))!;
    await db.exercises.put({ ...presse, loadSteps: { base: 20, step: 20 } });
    await seedLoadSteps20261022(NOW);
    expect((await db.exercises.get("presse-cuisses"))!.loadSteps).toEqual({ base: 20, step: 20 });
    expect(Object.keys(LOAD_STEPS_20261022)).toHaveLength(15);
  });

  it("la hausse des cadres ne propose que des charges réelles : presse 140 → 150 (jamais 145), épaules 20 → 25, traction 28 → 21", () => {
    const version = (id: string, progressionType: StrengthFrameVersion["progressionType"], increment: number) =>
      ({ id, frameId: `f-${id}`, number: 1, status: "active", progressionType, workSets: 3, repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 120, increment: { unit: "kg", value: increment }, createdAt: "x", updatedAt: "x" }) as StrengthFrameVersion;
    const milestone = (versionId: string, value: number) => ({ id: `m-${versionId}`, frameVersionId: versionId, workoutId: "w", date: "2026-10-21", value, unit: "kg", createdAt: "x" }) as StrengthMilestone;
    expect(proposeRaise(version("p", "charge_croissante", 5), [milestone("p", 140)], [], LOAD_STEPS_20261022["presse-cuisses"])!.value).toBe(150);
    expect(proposeRaise(version("p", "charge_croissante", 5), [milestone("p", 140)], [])!.value).toBe(145);
    expect(proposeRaise(version("e", "charge_croissante", 2.5), [milestone("e", 20)], [], LOAD_STEPS_20261022["developpe-epaules-machine"])!.value).toBe(25);
    expect(proposeRaise(version("t", "assistance_decroissante", 7), [milestone("t", 28)], [], LOAD_STEPS_20261022["traction-assistee"])!.value).toBe(21);
    expect(proposeRaise(version("h", "charge_croissante", 2.5), [milestone("h", 6)], [], LOAD_STEPS_20261022["curl-marteau-halteres"])!.value).toBe(8);
  });

  it("exercice suspendu (presse, douleurs lombaires) : aucun encart de hausse ni de stagnation", () => {
    const presse = { id: "p", frameId: "frame-presse", number: 1, status: "active", progressionType: "charge_croissante", workSets: 3, repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 120, increment: { unit: "kg", value: 5 }, createdAt: "x", updatedAt: "x" } as StrengthFrameVersion;
    const jalon = { id: "m", frameVersionId: "p", workoutId: "w", date: "2026-10-21", value: 140, unit: "kg", createdAt: "x" } as StrengthMilestone;
    expect(frameInsightsFor([presse], [jalon], [], new Map([["frame-presse", LOAD_STEPS_20261022["presse-cuisses"]!]])).get("p")!.raise!.value).toBe(150);
    expect(frameInsightsFor([presse], [jalon], [], new Map(), new Set(["frame-presse"])).has("p")).toBe(false);
  });
});

describe("seed 43 — développé épaules : plafond RPE 9", () => {
  it("nouvelle version 3 × 8–10 RPE ≤ 9, l'ancienne archivée ; une seule fois", async () => {
    const frame = (await db.strengthFrames.where("exerciseId").equals("developpe-epaules-machine").first())!;
    const active = (await db.strengthFrameVersions.get(frame.activeVersionId))!;
    expect(active).toMatchObject({ status: "active", workSets: 3, repRange: { min: 8, max: 10 }, rpeTarget: 9 });
    const versions = await db.strengthFrameVersions.where("frameId").equals(frame.id).toArray();
    expect(versions.filter((version) => version.status === "active")).toHaveLength(1);
    expect(versions.find((version) => version.number === active.number - 1)).toMatchObject({ status: "archived", rpeTarget: 8, archiveReason: "changement_programme" });

    await withoutMarker("shoulderRpe20261022");
    await seedShoulderRpe20261022(NOW);
    expect(await db.strengthFrameVersions.where("frameId").equals(frame.id).count()).toBe(versions.length);
  });
});

describe("seed 44 — pistes A/B/C", () => {
  it("une piste par exercice de force (cardio exclu) ; élévations partagées ; presse suspendue ; traction sur le pari ; plafonds en vigueur", async () => {
    const all = await tracks();
    const bySession = (session: string) => all.filter((track) => track.session === session).map((track) => track.exerciseId);
    expect(bySession("A")).toEqual(["traction-assistee", "rowing-poulie-basse", "chest-press", "elevations-laterales-halteres", "curl-halteres", "leg-curl-couche", "presse-cuisses"]);
    expect(bySession("B")).toEqual(["traction-assistee", "chest-press", "developpe-incline-halteres", "rowing-poulie-basse", "developpe-epaules-machine", "elevations-laterales-halteres", "extension-triceps-poulie", "presse-cuisses"]);
    expect(bySession("C")).toEqual(["traction-negative", "suspension-omoplates", "tirage-vertical", "ecarte-poulie", "elevations-laterales-halteres", "face-pull", "curl-marteau-halteres", "extension-triceps-dessus-tete"]);
    expect(all.some((track) => track.exerciseId === "tapis")).toBe(false);
    expect(all.filter((track) => track.shareGroup).map((track) => `${track.session}:${track.exerciseId}`)).toEqual(["A:elevations-laterales-halteres", "B:elevations-laterales-halteres", "C:elevations-laterales-halteres"]);
    expect(all.filter((track) => track.suspension).map((track) => `${track.session}:${track.exerciseId}`)).toEqual(["A:presse-cuisses", "B:presse-cuisses"]);
    expect(all.filter((track) => track.suspension).every((track) => track.initial.weeks.length === 0)).toBe(true);
    expect(all.filter((track) => track.engine === "v6").map((track) => track.session)).toEqual(["A", "B"]);
    expect(all.find((track) => track.exerciseId === "suspension-omoplates")!.references[0]!.from).toBe("2026-10-15");
    expect(all.find((track) => track.exerciseId === "traction-negative")!.engine).toBe("negatives");
    /* Sans séance : trajectoire vide et provisoire (données insuffisantes), sauf la traction (référence du pari). */
    expect(all.find((track) => track.exerciseId === "chest-press" && track.session === "B")!.initial).toMatchObject({ weeks: [], provisional: true });
    expect(all.find((track) => track.engine === "v6" && track.session === "A")!.initial.weeks.at(-1)!.probable!.kg).toBe(7);
  });

  it("trajectoire initiale identique après rechargement de l'app et mise à jour (seeds rejoués)", async () => {
    const before = await tracks();
    db.close();
    await db.open();
    expect(await tracks()).toEqual(before);
    resumeSeedsForTests();
    await runSeeds();
    expect(await tracks()).toEqual(before);
  });

  it("une trajectoire déjà enregistrée n'est jamais réécrite", async () => {
    const before = await tracks();
    const edited = before.map((track, index) => (index === 0 ? { ...track, initial: { ...track.initial, weeks: [{ week: "2026-10-19", level: 1 }] } } : track));
    await db.settings.put({ key: "progressionTracks", value: edited });
    await withoutMarker("perspectiveTracks20261022");
    await seedPerspectiveTracks20261022(NOW);
    expect(await tracks()).toEqual(edited);
  });
});

describe("seed 45 — référence détaillée datée", () => {
  it("ajoutée aux pistes qui n'en ont pas, datée du passage ; le repère initial garde son sens d'origine (meilleure série) et n'est pas touché ; jamais réécrite ; presse suspendue sans référence", async () => {
    const chestWorkout = (date: string, kg: number, reps: number[], rpe: number[]) =>
      ({
        id: `w-${date}`, source: "planned", sessionTemplateId: "v2-muscu-b", status: "completed", date, startedAt: NOW, completedAt: NOW, lastActionAt: NOW, activeDurationSec: 0, createdAt: NOW, updatedAt: NOW,
        blocks: [{ id: "b", sourceBlockId: "v2-muscu-b-chest-press", kind: "exercise", position: 1, addedDuringWorkout: false, exerciseId: "chest-press", status: "performed", snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 }, series: reps.map((value, index) => ({ id: `s${index}`, position: index, status: "completed", role: "travail", load: { kind: "total", kg }, reps: value, rpe: rpe[index], completedAt: NOW })) }],
      }) as unknown as WorkoutSession;
    await db.workouts.bulkPut([chestWorkout("2026-10-06", 45, [8, 8, 8], [8, 8, 8]), chestWorkout("2026-10-13", 50, [8, 8, 8], [8, 8, 9]), chestWorkout("2026-10-21", 55, [8, 8, 6], [8, 9, 9])]);
    /* Pistes telles que créées le 22/10 avant la correction : sans référence détaillée. */
    await db.settings.delete("progressionTracks");
    await withoutMarker("perspectiveTracks20261022");
    await seedPerspectiveTracks20261022(NOW);
    const old = (await tracks()).map((track) => {
      const copy = { ...track };
      delete copy.detailed;
      return copy;
    });
    await db.settings.put({ key: "progressionTracks", value: old });
    await withoutMarker("perspectiveDetailed20261022");

    const LATER = "2026-10-23T08:00:00.000Z";
    await seedDetailedReferences20261022(LATER);
    const after = await tracks();
    const chest = after.find((track) => track.id === "v2-muscu-b-chest-press")!;
    expect(chest.initial).toEqual(old.find((track) => track.id === chest.id)!.initial);
    expect(chest.initial.weeks[0]!.probable).toEqual({ kg: 55, reps: 8 });
    expect(chest.detailed).toMatchObject({ createdAt: LATER, basis: { workoutId: "w-2026-10-21", date: "2026-10-21" }, provisional: true });
    expect(chest.detailed!.weeks[0]).toMatchObject({ week: "2026-10-26", sets: [{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 7, stretch: true }] });
    expect(after.filter((track) => track.exerciseId === "presse-cuisses").every((track) => track.detailed === undefined)).toBe(true);
    expect(after.filter((track) => track.engine === "v6").every((track) => track.detailed === undefined)).toBe(true);
    /* Rythme inconnu (moins de 3 semaines avec séance) : pas encore de référence détaillée. */
    expect(after.find((track) => track.id === "v2-muscu-a-chest-press")!.detailed).toBeUndefined();

    /* Rejoué (rechargement, mise à jour) : rien ne bouge, même avec de nouvelles séances. */
    await db.workouts.put(chestWorkout("2026-10-27", 55, [8, 8, 8], [8, 9, 9]));
    resumeSeedsForTests();
    await runSeeds();
    await withoutMarker("perspectiveDetailed20261022");
    await seedDetailedReferences20261022("2026-11-01T08:00:00.000Z");
    expect(await tracks()).toEqual(after);
  });
});

describe("seed 45 — rythme connu plus tard", () => {
  it("une piste au rythme inconnu reçoit sa référence détaillée, datée, au premier lancement où il devient connu ; ensuite plus jamais réécrite", async () => {
    const chestA = (date: string, kg: number) =>
      ({
        id: `wa-${date}`, source: "planned", sessionTemplateId: "v2-muscu-a", status: "completed", date, startedAt: NOW, completedAt: NOW, lastActionAt: NOW, activeDurationSec: 0, createdAt: NOW, updatedAt: NOW,
        blocks: [{ id: "b", sourceBlockId: "v2-muscu-a-chest-press", kind: "exercise", position: 1, addedDuringWorkout: false, exerciseId: "chest-press", status: "performed", snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 8, max: 12 }, restBetweenSetsSec: 150 }, series: [0, 1].map((index) => ({ id: `s${index}`, position: index, status: "completed", role: "travail", load: { kind: "total", kg }, reps: 10, rpe: 8, completedAt: NOW })) }],
      }) as unknown as WorkoutSession;
    await db.workouts.bulkPut([chestA("2026-10-05", 40), chestA("2026-10-12", 45)]);
    resumeSeedsForTests();
    await runSeeds();
    expect((await tracks()).find((track) => track.id === "v2-muscu-a-chest-press")!.detailed).toBeUndefined();

    await db.workouts.put(chestA("2026-10-19", 50));
    await seedDetailedReferences20261022("2026-10-20T07:00:00.000Z");
    const created = (await tracks()).find((track) => track.id === "v2-muscu-a-chest-press")!.detailed!;
    expect(created).toMatchObject({ createdAt: "2026-10-20T07:00:00.000Z", basis: { date: "2026-10-19" } });

    await db.workouts.put(chestA("2026-10-26", 55));
    await seedDetailedReferences20261022("2026-10-27T07:00:00.000Z");
    expect((await tracks()).find((track) => track.id === "v2-muscu-a-chest-press")!.detailed).toEqual(created);
  });
});

describe("sauvegarde et restauration", () => {
  it("crans, pistes et objectif du jour figé voyagent dans la sauvegarde ; une ancienne sauvegarde se restaure, pistes recréées", async () => {
    const target: DayTarget = { computedAt: NOW, kind: "repeat", sets: [{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 6 }], rpeMax: 9, basisWorkoutId: "w0", reason: "Séries faites au plafond." };
    const block = {
      id: "workout-block-v2-muscu-b-chest-press", sourceBlockId: "v2-muscu-b-chest-press", kind: "exercise", position: 1, addedDuringWorkout: false, exerciseId: "chest-press", status: "performed",
      snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 }, dayTarget: target,
      series: [{ id: "s1", position: 0, status: "completed", load: { kind: "total", kg: 55 }, reps: 8, rpe: 8, completedAt: NOW }],
    } as PerformedExerciseBlock;
    const workout = { id: "w-b", source: "planned", status: "completed", date: "2026-10-27", startedAt: NOW, lastActionAt: NOW, activeDurationSec: 0, blocks: [block], createdAt: NOW, updatedAt: NOW } as WorkoutSession;
    await db.workouts.put(workout);
    const tracksBefore = await tracks();

    const file = serializeBackup(await readBackup(db, { now: new Date(NOW), buildTime: "b", userAgent: "t", standalone: true }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await resetAndRestore(parseBackup(file), db);
    expect(((await db.workouts.get("w-b"))!.blocks[0] as PerformedExerciseBlock).dayTarget).toEqual(target);
    expect(await tracks()).toEqual(tracksBefore);
    expect(((await db.exercises.get("presse-cuisses")) as Exercise).loadSteps).toEqual({ base: 10, step: 10 });

    /* Ancienne sauvegarde (avant le 22/10) : ni pistes ni marqueur ; restaurée, puis les seeds recréent les pistes. */
    await db.settings.delete("progressionTracks");
    await withoutMarker("perspectiveTracks20261022");
    const legacy = serializeBackup(await readBackup(db, { now: new Date(NOW), buildTime: "b", userAgent: "t", standalone: true }));
    await resetAndRestore(parseBackup(legacy), db);
    expect(await db.settings.get("progressionTracks")).toBeUndefined();
    resumeSeedsForTests();
    await runSeeds();
    expect((await tracks()).map((track) => track.id)).toEqual(tracksBefore.map((track) => track.id));
  }, 20000);
});

describe.skipIf(!process.env.COACH_JM_BACKUP)("sur la sauvegarde réelle", () => {
  it("pistes calculées sur ton historique : chest press B provisoire, 60–70 kg au 31 mars ; épaules stables ; aucune séance modifiée", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await resetAndRestore(parseBackup(await readFile(process.env.COACH_JM_BACKUP!, "utf8")), db);
    const workoutsBefore = await db.workouts.toArray();
    resumeSeedsForTests();
    await runSeeds();
    const all = await tracks();
    if (all.length === 0) return;
    expect(await db.workouts.toArray()).toHaveLength(workoutsBefore.length);
    const chest = all.find((track) => track.id === "v2-muscu-b-chest-press")!;
    if (chest.initial.weeks.length > 0) {
      const last = chest.initial.weeks.at(-1)!;
      expect(last.week <= "2027-03-31").toBe(true);
      expect(last.probable!.kg!).toBeGreaterThanOrEqual(55);
      expect(last.probable!.kg!).toBeLessThanOrEqual(75);
    }
    expect(all.filter((track) => track.suspension).map((track) => track.exerciseId)).toEqual(["presse-cuisses", "presse-cuisses"]);

    /* Sauvegarde puis restauration (avec les pistes) : trajectoires strictement identiques, rien de recréé. */
    const file = serializeBackup(await readBackup(db, { now: new Date(NOW), buildTime: "b", userAgent: "t", standalone: true }));
    await resetAndRestore(parseBackup(file), db);
    resumeSeedsForTests();
    await runSeeds();
    expect(await tracks()).toEqual(all);
  }, 60000);
});
