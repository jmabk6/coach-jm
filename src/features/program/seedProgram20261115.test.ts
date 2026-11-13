import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { ExerciseBlock, InstallMarkers, ProgressionTrack, SessionTemplate, WorkoutSession } from "../../domain";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { v6State } from "../goals/tractionV6";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { betBannerFor } from "../workout/betBanner";
import { generateProgramWeek } from "./generateProgramWeek";
import { MUSCU_D_ID, PROGRAM_4P2_FIRST_DAY, PROGRAM_4P2_START } from "./program20261115";
import { seedCalendrierV4 } from "./seedCalendrierV4";
import { seedProgram20261115Ready, seedProgramMuscu20261115 } from "./seedProgram20261115";
import { seedProgramMuscuV4 } from "./seedProgramMuscuV4";
import { seedCalendrierV5, seedProgramMuscuV5, seedRoutinesV5 } from "./seedProgramV5";
import { seedRoutinesV4 } from "./seedRoutinesV4";

/**
 * Programme 4+2, lot 1 (validé par JM le 12/11/2026) : seed 60, Muscu A,
 * B, C et D à partir du dimanche 15/11/2026.
 */

const V4 = "2026-11-02T08:00:00.000Z";
const V5 = "2026-11-07T22:30:00.000Z";
const BEFORE = "2026-11-12T20:00:00.000Z";
const SWITCH = `${PROGRAM_4P2_FIRST_DAY}T07:00:00.000Z`;

const install = async () => (await db.settings.get("install"))?.value as InstallMarkers | undefined;
const template = async (id: string) => (await db.sessionTemplates.get(id)) as SessionTemplate;
const blockIds = async (id: string) => (await template(id)).blocks.map((block) => block.id);
const tracks = async () => ((await db.settings.get("progressionTracks"))?.value ?? []) as ProgressionTrack[];
const track = async (id: string) => (await tracks()).find((item) => item.id === id);

async function installV5() {
  await seedProgramMuscuV4(V4);
  await seedRoutinesV4(V4);
  await seedCalendrierV4(V4);
  await generateProgramWeek("2026-11-08", V4);
  await seedProgramMuscuV5(V5);
  await seedRoutinesV5(V5);
  await seedCalendrierV5(V5);
}

/** Une séance faite, avec les briques V5 qui vont changer de séance (Muscu B du 10/11 : traction légère, incliné, écarté). */
function doneB(): WorkoutSession {
  const series = (kg: number, reps: number) => [0, 1].map((index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, rpe: 8 }));
  const block = (sourceBlockId: string, exerciseId: string, kg: number, reps: number, position: number) => ({
    id: `workout-block-${sourceBlockId}`, sourceBlockId, kind: "exercise" as const, position, addedDuringWorkout: false, exerciseId, status: "performed" as const,
    snapshotInstructions: { shape: "reps" as const, sets: 2, reps: { min: 8, max: 12 }, restBetweenSetsSec: 120 }, series: series(kg, reps),
  });
  return {
    id: "workout-weekly-2026-11-10", source: "planned", plannedSessionId: "weekly-2026-11-10", sessionTemplateId: "v2-muscu-b", status: "completed",
    date: "2026-11-10", startedAt: "2026-11-10T14:08:25.230Z", completedAt: "2026-11-10T15:19:48.833Z", lastActionAt: "2026-11-10T15:19:48.833Z",
    activeDurationSec: 4200, createdAt: "2026-11-10T14:08:25.230Z", updatedAt: "2026-11-10T15:19:54.763Z",
    blocks: [block("v2-muscu-b-traction", "traction-assistee", 28, 8, 1), block("v2-muscu-b-developpe-incline", "developpe-incline-halteres", 12, 10, 5), block("v2-muscu-c-ecarte", "ecarte-poulie", 10, 11, 6)],
  } as WorkoutSession;
}

describe("programme 4+2 — Muscu A, B, C, D (seed 60)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    await installV5();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("sous Vitest, les seeds du lancement ne posent pas le programme 4+2", async () => {
    resumeSeedsForTests();
    expect((await runSeeds()).failed).toEqual([]);
    expect((await install())?.programmeMuscu20261115).toBeUndefined();
    expect(await db.sessionTemplates.get(MUSCU_D_ID)).toBeUndefined();
  });

  it("avant le 13/11 : rien ne change, aucun marqueur", async () => {
    const before = await db.sessionTemplates.toArray();
    const tracksBefore = await tracks();
    await seedProgramMuscu20261115(BEFORE);
    expect(await db.sessionTemplates.toArray()).toEqual(before);
    expect(await tracks()).toEqual(tracksBefore);
    expect((await install())?.programmeMuscu20261115).toBeUndefined();
  });

  it("le 15/11 : A, B, C, D dans l'ordre du brief, briques déplacées avec leur identifiant, D actif", async () => {
    await seedProgramMuscu20261115(SWITCH);
    expect((await install())?.programmeMuscu20261115).toBe(SWITCH);
    expect(await blockIds("v2-muscu-a")).toEqual(["v2-muscu-a-echauffement", "v2-muscu-a-traction", "v2-muscu-a-rowing", "v2-muscu-c-elevations", "v2-muscu-a-curl"]);
    expect(await blockIds("v2-muscu-b")).toEqual([
      "v2-muscu-b-echauffement", "v2-muscu-b-developpe-epaules", "v2-muscu-b-chest-press", "v2-muscu-b-elevations", "v2-muscu-b-extension-triceps", "v2-muscu-b-crunch", "v2-muscu-b-rotary",
    ]);
    expect(await blockIds("v2-muscu-c")).toEqual([
      "v2-muscu-c-echauffement", "v2-muscu-c-suspension", "v2-muscu-b-traction", "v2-muscu-c-negatives", "v2-muscu-c-tirage-vertical", "v2-muscu-c-face-pull", "v2-muscu-c-curl-marteau",
    ]);
    expect(await blockIds(MUSCU_D_ID)).toEqual([
      "v2-muscu-d-echauffement", "v2-muscu-a-elevations", "v2-muscu-b-developpe-incline", "v2-muscu-c-ecarte", "v2-muscu-d-face-pull", "v2-muscu-c-triceps-tete", "v2-muscu-d-crunch", "v2-muscu-d-rotary",
    ]);
    const d = await template(MUSCU_D_ID);
    expect(d).toMatchObject({ name: "Muscu D — Poussée hypertrophie", category: "Musculation", letter: "D", status: "active", origin: "program_v2", contentSince: PROGRAM_4P2_START });
    expect(d.blocks.map((block) => block.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    /* Dans Séances, D vient juste après C (ordre des modèles actifs). */
    const active = (await db.sessionTemplates.toArray()).filter((item) => item.status === "active").sort((a, b) => a.position - b.position).map((item) => item.id);
    expect(active.indexOf(MUSCU_D_ID), active.join()).toBe(active.indexOf("v2-muscu-c") + 1);

    /* Séries du brief (13 + 12 + 14 + 14, abdos et échauffements à part). */
    const work = (blocks: SessionTemplate["blocks"]) =>
      blocks.filter((block): block is ExerciseBlock => block.kind === "exercise" && block.role !== "warmup" && !["crunch-machine", "rotary", "suspension-omoplates"].includes(block.exerciseId));
    const sets = (blocks: SessionTemplate["blocks"]) => work(blocks).reduce((sum, block) => sum + ("sets" in block.instructions ? (block.instructions.sets ?? 0) : 0), 0);
    expect(sets((await template("v2-muscu-a")).blocks)).toBe(13);
    expect(sets((await template("v2-muscu-b")).blocks)).toBe(12);
    expect(sets((await template("v2-muscu-c")).blocks)).toBe(14);
    expect(sets(d.blocks)).toBe(14);

    /* Élévations à 6 kg : version légère 12-20 en A, hors cadre ; 12-15 en B et D. */
    const a = await template("v2-muscu-a");
    const light = a.blocks.find((block) => block.id === "v2-muscu-c-elevations") as ExerciseBlock;
    expect(light.instructions).toEqual({ shape: "reps", sets: 3, reps: { min: 12, max: 20 }, restBetweenSetsSec: 90, targetRpe: { min: 7, max: 8 } });
    expect(light.outsideFrame).toBe(true);
    for (const id of ["v2-muscu-b", MUSCU_D_ID]) {
      const block = (await template(id)).blocks.find((item) => item.kind === "exercise" && item.exerciseId === "elevations-laterales-halteres") as ExerciseBlock;
      expect(block.instructions).toMatchObject({ sets: 3, reps: { min: 12, max: 15 } });
      expect(block.notes).toContain("6 kg");
    }

    /* Traction légère en C, hors cadre ; échauffements à 8 min. */
    const c = await template("v2-muscu-c");
    expect(c.blocks.find((block) => block.id === "v2-muscu-b-traction")).toMatchObject({ exerciseId: "traction-assistee", outsideFrame: true, instructions: { sets: 3, reps: { min: 8, max: 10 } } });
    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c", MUSCU_D_ID]) {
      const warmup = (await template(id)).blocks[0] as ExerciseBlock;
      expect(warmup.role).toBe("warmup");
      expect(warmup.instructions).toMatchObject({ shape: "steps", steps: [{ durationSec: 480, speedKmh: 5, inclinePercent: 0 }] });
    }
  });

  it("RPE 10 n'est la cible d'aucune brique de A, B, C et D", async () => {
    await seedProgramMuscu20261115(SWITCH);
    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c", MUSCU_D_ID]) {
      for (const block of (await template(id)).blocks) {
        if (block.kind !== "exercise" || !("targetRpe" in block.instructions) || !block.instructions.targetRpe) continue;
        expect(block.instructions.targetRpe.max, `${id} / ${block.id}`).toBeLessThanOrEqual(9);
      }
    }
  });

  it("pistes : déplacées (séance D, traction légère en C), closes, élévations B et D à 6 kg, nouvelles pistes pour abdos machine, rotary et face pull de D", async () => {
    await seedProgramMuscu20261115(SWITCH);
    for (const [id, session] of [
      ["v2-muscu-c-elevations", "A"], ["v2-muscu-a-elevations", "D"], ["v2-muscu-b-traction", "C"], ["v2-muscu-c-tirage-vertical", "C"],
      ["v2-muscu-b-developpe-incline", "D"], ["v2-muscu-c-ecarte", "D"], ["v2-muscu-c-triceps-tete", "D"],
    ] as const) {
      expect((await track(id))?.session, id).toBe(session);
      expect((await track(id))?.closedAt, id).toBeUndefined();
    }
    expect((await track("v2-muscu-a-chest-press"))?.closedAt).toBe(SWITCH);
    expect((await track("v2-muscu-b-rowing"))?.closedAt).toBe(SWITCH);
    expect((await track("v2-muscu-c-ecarte"))?.references.at(-1)).toEqual({ from: PROGRAM_4P2_FIRST_DAY, reason: "Programme 4+2 : 3 × 12-15, départ 10 kg puis 7,5 kg." });
    for (const id of ["v2-muscu-a-elevations", "v2-muscu-b-elevations"]) {
      expect((await track(id))?.references.at(-1)).toEqual({ from: PROGRAM_4P2_FIRST_DAY, reason: "Programme 4+2 : 6 kg partout, 3 × 12-15." });
      expect((await track(id))?.shareGroup).toBe("shared:elevations-laterales-halteres");
    }
    for (const [id, session, exerciseId] of [
      ["v2-muscu-b-crunch", "B", "crunch-machine"], ["v2-muscu-b-rotary", "B", "rotary"], ["v2-muscu-d-face-pull", "D", "face-pull"], ["v2-muscu-d-crunch", "D", "crunch-machine"], ["v2-muscu-d-rotary", "D", "rotary"],
    ] as const) {
      expect(await track(id), id).toMatchObject({ session, exerciseId, engine: "load", templateId: session === "B" ? "v2-muscu-b" : MUSCU_D_ID });
    }
    /* Ordre : A, B, C, D, closes en dernier. */
    const order = (await tracks()).filter((item) => !item.closedAt).map((item) => item.session);
    expect(order).toEqual([...order].sort());
    expect((await tracks()).findIndex((item) => item.closedAt)).toBeGreaterThan((await tracks()).findLastIndex((item) => !item.closedAt));
  });

  it("séances faites : identiques avant et après, même avec des briques qui changent de séance", async () => {
    await db.workouts.put(doneB());
    const before = await db.workouts.toArray();
    await seedProgramMuscu20261115(SWITCH);
    expect(await db.workouts.toArray()).toEqual(before);
  });

  it("une seule fois : le 2e passage ne change rien", async () => {
    await seedProgramMuscu20261115(SWITCH);
    const templates = await db.sessionTemplates.toArray();
    const stored = await tracks();
    await seedProgramMuscu20261115("2026-11-16T07:00:00.000Z");
    expect(await db.sessionTemplates.toArray()).toEqual(templates);
    expect(await tracks()).toEqual(stored);
  });

  it("modèle modifié par JM (une brique en plus en B) : rien n'est touché, pas de D ; le marqueur est posé", async () => {
    const b = await template("v2-muscu-b");
    await db.sessionTemplates.put({ ...b, blocks: [...b.blocks, { ...b.blocks[1]!, id: "perso", position: 99 }] });
    const before = await db.sessionTemplates.toArray();
    const tracksBefore = await tracks();
    await seedProgramMuscu20261115(SWITCH);
    expect(await db.sessionTemplates.toArray()).toEqual(before);
    expect(await tracks()).toEqual(tracksBefore);
    expect((await install())?.programmeMuscu20261115).toBe(SWITCH);
  });

  it("garde-fou interne : seedProgram20261115Ready vaut faux sans modèles V5", async () => {
    expect(seedProgram20261115Ready([])).toBe(false);
    expect(seedProgram20261115Ready(await db.sessionTemplates.toArray())).toBe(true);
  });
});

/** La vraie sauvegarde (chemin dans COACH_JM_BACKUP) : le programme 4+2 se pose sans échec, l'historique ne bouge pas, le pari V6 suit en C. */
describe("programme 4+2 — sauvegarde réelle", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!process.env.COACH_JM_BACKUP)("seed 60 sur la sauvegarde : séances faites intactes ; traction légère en C = palier A validé + 7 kg", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(process.env.COACH_JM_BACKUP!, "utf8")), db);
    resumeSeedsForTests();
    expect((await runSeeds()).failed).toEqual([]);
    /* Une sauvegarde déjà passée au programme 4+2 (iPhone du 13/11) : D est là, rien à rejouer. */
    if ((await install())?.programmeMuscu20261115 !== undefined) {
      expect(await db.sessionTemplates.get(MUSCU_D_ID)).toBeDefined();
      return;
    }
    /* Une sauvegarde encore en V5 (non modifiée à la main) doit recevoir le programme ; une plus ancienne, non. */
    const ready = seedProgram20261115Ready(await db.sessionTemplates.toArray());
    if ((await install())?.programmeMuscuV5 !== undefined) expect(ready).toBe(true);
    if (!ready) return;
    const workouts = await db.workouts.toArray();
    const stateBefore = v6State(workouts as WorkoutSession[], "2026-11-14");

    await seedProgramMuscu20261115(SWITCH);
    expect((await install())?.programmeMuscu20261115).toBe(SWITCH);
    expect(await db.workouts.toArray()).toEqual(workouts);
    expect(await db.sessionTemplates.get(MUSCU_D_ID)).toBeDefined();

    const stateAfter = v6State((await db.workouts.toArray()) as WorkoutSession[], "2026-11-14");
    expect(stateAfter).toEqual(stateBefore);
    const traction = (await template("v2-muscu-c")).blocks.find((block) => block.id === "v2-muscu-b-traction")!;
    const performed = { id: "t", kind: "exercise", position: 2, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "not_performed", sourceBlockId: traction.id, snapshotInstructions: (traction as ExerciseBlock).instructions, series: [] } as never;
    const banner = betBannerFor({ id: "now", date: "2026-11-18", sessionTemplateId: "v2-muscu-c", blocks: [] } as unknown as WorkoutSession, performed, stateAfter)!;
    expect(banner.title).toContain(`${stateAfter.bKg} kg d'aide`);
    expect(banner.sets.every((set) => set.assistKg === stateAfter.bKg)).toBe(true);
    /* Les nouvelles pistes existent ; aucune piste ouverte n'a perdu son historique de référence. */
    expect((await track("v2-muscu-d-face-pull"))?.session).toBe("D");
    expect((await track("v2-muscu-b-traction"))?.session).toBe("C");
  });
});
