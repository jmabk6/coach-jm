import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { ExerciseBlock, InstallMarkers, ProgressionTrack, SessionTemplate, WorkoutSession } from "../../domain";
import { calculateSessionTemplateDuration } from "../../domain/rules/sessionTemplateRules";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { v6SnapshotAdjustments } from "../goals/tractionV6";
import { dayTargetForTrack, loadDayTargetContext } from "../perspectives/dayTargets";
import { trackSpecsFrom } from "../perspectives/tracks";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { CURL_POULIE_ID, PROGRAM_V4_START } from "./programV4";
import { muscuTemplatesV4, seedProgramMuscuV4 } from "./seedProgramMuscuV4";

/** Lot L3 (programme V4) : Muscu A, B et C de la V4, posées au dimanche d'activation. */

const BEFORE = "2026-11-01T10:00:00.000Z";
const ACTIVATION = `${PROGRAM_V4_START}T08:00:00.000Z`;

const ids = (template: SessionTemplate | undefined) => (template?.blocks ?? []).slice().sort((a, b) => a.position - b.position).map((block) => block.id);
const block = (template: SessionTemplate | undefined, id: string) => template?.blocks.find((item) => item.id === id) as ExerciseBlock | undefined;
const tracks = async () => ((await db.settings.get("progressionTracks"))?.value as ProgressionTrack[] | undefined) ?? [];
const marker = async () => ((await db.settings.get("install"))?.value as InstallMarkers | undefined)?.programmeMuscuV4;

describe("programme V4 — Muscu A, B, C (installation neuve)", () => {
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

  it("avant le dimanche d'activation : rien ne change, aucun marqueur (retenté au lancement suivant)", async () => {
    const before = await db.sessionTemplates.bulkGet(["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]);
    await seedProgramMuscuV4(BEFORE);
    expect(await db.sessionTemplates.bulkGet(["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"])).toEqual(before);
    expect(await db.exercises.get(CURL_POULIE_ID)).toBeUndefined();
    expect(await marker()).toBeUndefined();
  });

  it("au dimanche d'activation : contenu de A, B et C conforme à la spec (§ 2)", async () => {
    await seedProgramMuscuV4(ACTIVATION);
    const [a, b, c] = await db.sessionTemplates.bulkGet(["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]);

    expect(ids(a)).toEqual(["v2-muscu-a-echauffement", "v2-muscu-a-traction", "v2-muscu-a-rowing", "v2-muscu-a-chest-press", "v2-muscu-a-elevations", "v2-muscu-a-curl", "v2-muscu-a-curl-poulie"]);
    expect(block(a, "v2-muscu-a-curl-poulie")).toMatchObject({ exerciseId: CURL_POULIE_ID, instructions: { sets: 2, reps: { min: 10, max: 15 }, restBetweenSetsSec: 90 } });

    expect(ids(b)).toEqual([
      "v2-muscu-b-echauffement", "v2-muscu-b-traction", "v2-muscu-b-chest-press", "v2-muscu-b-developpe-incline", "v2-muscu-c-ecarte",
      "v2-muscu-b-rowing", "v2-muscu-b-developpe-epaules", "v2-muscu-b-elevations", "v2-muscu-b-extension-triceps",
    ]);
    expect(block(b, "v2-muscu-c-ecarte")).toMatchObject({ exerciseId: "ecarte-poulie", instructions: { sets: 3, reps: { min: 12, max: 15 } } });

    expect(ids(c)).toEqual([
      "v2-muscu-c-echauffement", "v2-muscu-c-negatives", "v2-muscu-c-suspension", "v2-muscu-c-tirage-vertical", "v2-muscu-c-elevations",
      "v2-muscu-c-face-pull", "v2-muscu-c-curl-marteau", "v2-muscu-c-triceps-tete", "v2-muscu-c-montee", "v2-muscu-c-position-basse",
      "v2-muscu-c-marche-laterale", "v2-muscu-a-leg-curl", "v2-muscu-c-tapis-incline",
    ]);
    expect(block(c, "v2-muscu-c-elevations")).toMatchObject({ outsideFrame: true, instructions: { sets: 2, reps: { min: 12, max: 15 }, targetRpe: { min: 7, max: 8 } } });
    expect(block(c, "v2-muscu-a-leg-curl")).toMatchObject({ exerciseId: "leg-curl-couche", instructions: { sets: 2, reps: { min: 12, max: 15 } } });
    expect(block(c, "v2-muscu-c-position-basse")).toMatchObject({ exerciseId: "chaise-60", instructions: { shape: "duration", sets: 3, durationSec: { min: 15, max: 25 } } });
    /* Consignes de sécurité des jambes. */
    for (const id of ["v2-muscu-c-montee", "v2-muscu-c-position-basse"]) expect(block(c, id)?.notes).toContain("Douleur au genou : arrêt.");
    for (const id of ["v2-muscu-c-montee", "v2-muscu-c-position-basse", "v2-muscu-c-marche-laterale"]) expect(block(c, id)?.notes).toContain("RPE 7 au plus");
    expect(c?.name).toBe("Muscu C — Jambes, haut du corps, traction");

    /* Presse retirée du programme actif, l'exercice reste au catalogue. */
    expect([a, b, c].some((template) => template!.blocks.some((item) => item.kind === "exercise" && item.exerciseId === "presse-cuisses"))).toBe(false);
    expect(await db.exercises.get("presse-cuisses")).toBeDefined();
    /* Aucun exercice verrouillé (Q5). */
    expect((await db.exercises.get(CURL_POULIE_ID))?.clearance).toBeUndefined();
    expect(await marker()).toBe(ACTIVATION);
  });

  it("durées estimées : C ≈ 108 min (spec), A ≈ 70 min", async () => {
    await seedProgramMuscuV4(ACTIVATION);
    const [a, c] = await db.sessionTemplates.bulkGet(["v2-muscu-a", "v2-muscu-c"]);
    const durationC = calculateSessionTemplateDuration(c!, []);
    const durationA = calculateSessionTemplateDuration(a!, []);
    expect(durationC.kind).toBe("estimated");
    expect(durationC.minutes).toBeGreaterThanOrEqual(100);
    expect(durationC.minutes).toBeLessThanOrEqual(112);
    expect(durationA.minutes).toBeGreaterThanOrEqual(60);
    expect(durationA.minutes).toBeLessThanOrEqual(80);
  });

  it("pistes : écarté en B et leg curl en C (même identifiant), presse close, élévations de C hors du groupe partagé, nouvelles pistes", async () => {
    await seedProgramMuscuV4(ACTIVATION);
    const all = await tracks();
    const byId = new Map(all.map((track) => [track.id, track]));
    expect(byId.get("v2-muscu-c-ecarte")).toMatchObject({ session: "B", templateId: "v2-muscu-b" });
    expect(byId.get("v2-muscu-a-leg-curl")).toMatchObject({ session: "C", templateId: "v2-muscu-c" });
    expect(byId.get("v2-muscu-a-presse")?.closedAt).toBe(ACTIVATION);
    expect(byId.get("v2-muscu-b-presse")?.closedAt).toBe(ACTIVATION);
    const elevationsC = byId.get("v2-muscu-c-elevations")!;
    expect(elevationsC.shareGroup).toBeUndefined();
    expect(elevationsC.references.at(-1)?.from).toBe(PROGRAM_V4_START);
    expect(byId.get("v2-muscu-a-elevations")?.shareGroup).toBe("shared:elevations-laterales-halteres");
    expect(byId.get("v2-muscu-a-curl-poulie")).toMatchObject({ session: "A", engine: "load" });
    expect(byId.get("v2-muscu-c-position-basse")).toMatchObject({ session: "C", engine: "duration" });
    /* Ordre d'affichage : celui des séances et de leurs briques ; pistes closes en dernier. */
    expect(all.filter((track) => track.session === "C" && !track.closedAt).map((track) => track.id)).toEqual([
      "v2-muscu-c-negatives", "v2-muscu-c-suspension", "v2-muscu-c-tirage-vertical", "v2-muscu-c-elevations", "v2-muscu-c-face-pull",
      "v2-muscu-c-curl-marteau", "v2-muscu-c-triceps-tete", "v2-muscu-c-position-basse", "v2-muscu-a-leg-curl",
    ]);
    expect(all.filter((track) => track.session === "B").map((track) => track.id).indexOf("v2-muscu-c-ecarte")).toBe(3);
    expect(all.slice(-2).map((track) => track.id)).toEqual(["v2-muscu-a-presse", "v2-muscu-b-presse"]);

    /* Les specs recalculées sur les nouveaux modèles : A et B toujours partagées, C seule. */
    const context = await loadDayTargetContext([]);
    const spec = (id: string) => context.specs.find((item) => item.id === id);
    expect(spec("v2-muscu-a-elevations")?.shareGroup).toBe("shared:elevations-laterales-halteres");
    expect(spec("v2-muscu-b-elevations")?.shareGroup).toBe("shared:elevations-laterales-halteres");
    expect(spec("v2-muscu-c-elevations")?.shareGroup).toBeUndefined();
    expect(spec("v2-muscu-a-leg-curl")?.session).toBe("C");
  });

  it("idempotent : un second passage ne change rien", async () => {
    await seedProgramMuscuV4(ACTIVATION);
    const once = { templates: await db.sessionTemplates.toArray(), tracks: await tracks(), frames: await db.strengthFrameVersions.toArray() };
    await seedProgramMuscuV4("2026-11-03T08:00:00.000Z");
    expect({ templates: await db.sessionTemplates.toArray(), tracks: await tracks(), frames: await db.strengthFrameVersions.toArray() }).toEqual(once);
  });

  it("cadres : leg curl 2 × 12-15 (nouvelle version), curl poulie créé ; objectif Haut du corps lié au curl poulie", async () => {
    await seedProgramMuscuV4(ACTIVATION);
    const active = await db.strengthFrameVersions.where("status").equals("active").toArray();
    const frames = await db.strengthFrames.toArray();
    const versionOf = (exerciseId: string) => active.find((version) => version.id === frames.find((frame) => frame.exerciseId === exerciseId)?.activeVersionId);
    expect(versionOf("leg-curl-couche")).toMatchObject({ workSets: 2, repRange: { min: 12, max: 15 } });
    expect(versionOf(CURL_POULIE_ID)).toMatchObject({ workSets: 2, repRange: { min: 10, max: 15 }, rpeTarget: 8 });
    const upper = await db.goals.where("key").equals("upper_body").first();
    expect(upper?.linkedExercises.map((link) => link.exerciseId)).toContain(CURL_POULIE_ID);
  });

  it("un modèle modifié à la main n'est pas réorganisé (les trois restent tels quels)", async () => {
    const a = (await db.sessionTemplates.get("v2-muscu-a"))!;
    const edited = { ...a, blocks: a.blocks.filter((item) => item.id !== "v2-muscu-a-presse") };
    expect(muscuTemplatesV4([edited, (await db.sessionTemplates.get("v2-muscu-b"))!, (await db.sessionTemplates.get("v2-muscu-c"))!], ACTIVATION)).toBeUndefined();
  });

  it("séance C démarrée après l'activation : les jambes y sont ; en semaine test, leurs séries sont divisées par deux (règle V6 gardée)", async () => {
    await seedProgramMuscuV4(ACTIVATION);
    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    const started = await startFreeWorkout("2026-12-03", "2026-12-03T17:00:00.000Z", c);
    const exerciseIds = started.blocks.flatMap((item) => (item.kind === "exercise" ? [item.exerciseId] : []));
    expect(exerciseIds).toEqual(expect.arrayContaining(["montee-banc", "chaise-60", "marche-laterale-elastique", "leg-curl-couche"]));
    const testWeek = v6SnapshotAdjustments(c, "2026-12-24");
    expect(testWeek).toEqual(expect.arrayContaining([{ blockId: "v2-muscu-c-position-basse", sets: 2 }, { blockId: "v2-muscu-a-leg-curl", sets: 1 }]));
  });
});

describe("programme V4 — sur la sauvegarde réelle", () => {
  const path = process.env.COACH_JM_BACKUP;

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!path)("l'écarté (en B) et le leg curl (en C) gardent leur historique ; les séances faites ne changent pas", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(path!, "utf8")), db);
    /* Comme au lancement : d'abord toutes les mises à jour d'avant la V4 (programme V2, pistes, corrections). */
    resumeSeedsForTests();
    expect((await runSeeds()).failed).toEqual([]);
    const workoutsBefore = await db.workouts.toArray();
    await seedProgramMuscuV4(ACTIVATION);

    expect(await db.workouts.toArray()).toEqual(workoutsBefore);
    const completed = (await db.workouts.where("status").equals("completed").toArray()) as WorkoutSession[];
    const context = await loadDayTargetContext(completed);
    /* L'historique n'est vérifié que si la sauvegarde en contient (les sauvegardes de septembre n'ont ni écarté ni leg curl couché). */
    const performed = (sourceBlockId: string) => completed.some((workout) => workout.blocks.some((block) => block.kind === "exercise" && block.sourceBlockId === sourceBlockId && block.status === "performed"));
    if (performed("v2-muscu-c-ecarte")) {
      const ecarte = dayTargetForTrack("v2-muscu-c-ecarte", "2026-12-01", context, ACTIVATION);
      expect(ecarte?.kind).not.toBe("insufficient");
      expect(ecarte?.sets.length).toBe(3);
      expect(ecarte?.basisWorkoutId).toBeDefined();
    }
    if (performed("v2-muscu-a-leg-curl")) {
      const legCurl = dayTargetForTrack("v2-muscu-a-leg-curl", "2026-12-03", context, ACTIVATION);
      expect(legCurl?.kind).not.toBe("insufficient");
      expect(legCurl?.sets.length).toBe(2);
    }
    const [a, b, c] = await db.sessionTemplates.bulkGet(["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]);
    expect(trackSpecsFrom([a!, b!, c!], context.exerciseById, new Map()).find((spec) => spec.id === "v2-muscu-c-ecarte")?.session).toBe("B");
    expect(ids(b)).toContain("v2-muscu-c-ecarte");
    expect(ids(c)).toContain("v2-muscu-a-leg-curl");
    /* Référence détaillée du leg curl : l'ancienne (2 × 10-12) n'est jamais gardée ; recalculée sur 2 × 12-15 dès que le rythme est connu. */
    const legTrack = (await tracks()).find((track) => track.id === "v2-muscu-a-leg-curl");
    if (legTrack?.detailed) expect(legTrack.detailed.createdAt).toBe(ACTIVATION);
  });

  it.skipIf(!path)("restauration d'une ancienne sauvegarde après l'activation : tous les seeds passent, la V4 est posée en dernier", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(path!, "utf8")), db);
    resumeSeedsForTests();
    const report = await runSeeds(SEEDS.map((seed) => (seed.name === "programmeMuscuV4" ? { ...seed, run: () => seedProgramMuscuV4(ACTIVATION) } : seed)));
    expect(report.failed).toEqual([]);
    expect(await marker()).toBe(ACTIVATION);
    expect(ids(await db.sessionTemplates.get("v2-muscu-b"))).toContain("v2-muscu-c-ecarte");
  });
});
