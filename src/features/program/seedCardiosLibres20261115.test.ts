import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { Exercise, ExerciseBlock, Goal, InstallMarkers, PlannedSession, SessionTemplate, WorkoutSession } from "../../domain";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { buildExercisePerformanceHistory } from "../exercises/exercisePerformance";
import { routineDayTarget, type DayTargetContext } from "../perspectives/dayTargets";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { advisedLoadOf } from "../workout/advisedLoad";
import { generateProgramWeek } from "./generateProgramWeek";
import { ABDOS_ID, ENDURANCE_ID, FRACTIONNE_ID, PROGRAM_4P2_FIRST_DAY, PROGRAM_4P2_START, SOUPLESSE_ID } from "./program20261115";
import { seedCalendrierV4 } from "./seedCalendrierV4";
import { seedCardiosLibres20261115, seedProgramMuscu20261115 } from "./seedProgram20261115";
import { seedProgramMuscuV4 } from "./seedProgramMuscuV4";
import { seedCalendrierV5, seedProgramMuscuV5, seedRoutinesV5 } from "./seedProgramV5";
import { seedRoutinesV4 } from "./seedRoutinesV4";

/**
 * Programme 4+2, lot 2 (validé par JM le 13/11/2026) : seed 61, cardios sur
 * tapis, bloc jambes, séances libres Souplesse et Abdos, à partir du
 * dimanche 15/11/2026.
 */

const V4 = "2026-11-02T08:00:00.000Z";
const V5 = "2026-11-07T22:30:00.000Z";
const BEFORE = "2026-11-12T20:00:00.000Z";
const SWITCH = `${PROGRAM_4P2_FIRST_DAY}T07:00:00.000Z`;

const install = async () => (await db.settings.get("install"))?.value as InstallMarkers | undefined;
const template = async (id: string) => (await db.sessionTemplates.get(id)) as SessionTemplate;
const minutes = (block: SessionTemplate["blocks"][number]) => {
  const instructions = (block as ExerciseBlock).instructions;
  return instructions.shape === "steps" ? instructions.steps.reduce((sum, step) => sum + (typeof step.durationSec === "number" ? step.durationSec : step.durationSec.max), 0) / 60 : 0;
};

async function installV5() {
  await seedProgramMuscuV4(V4);
  await seedRoutinesV4(V4);
  await seedCalendrierV4(V4);
  await generateProgramWeek("2026-11-08", V4);
  await seedProgramMuscuV5(V5);
  await seedRoutinesV5(V5);
  await seedCalendrierV5(V5);
}

const exerciseSeries = (kg: number, reps: number) => [0, 1].map((index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, rpe: 8 }));

function done(date: string, templateId: string, blocks: Array<{ sourceBlockId: string; exerciseId: string; series: unknown[] }>): WorkoutSession {
  return {
    id: `w-${date}-${templateId}`, source: "planned", sessionTemplateId: templateId, status: "completed", date,
    startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: "x", activeDurationSec: 3600, createdAt: "x", updatedAt: "x",
    blocks: blocks.map((block, position) => ({ id: `wb-${block.sourceBlockId}`, kind: "exercise", position, addedDuringWorkout: false, status: "performed", snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 }, ...block })),
  } as WorkoutSession;
}

describe("programme 4+2 — cardios, bloc jambes, Souplesse et Abdos (seed 61)", () => {
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

  it("sous Vitest, les seeds du lancement ne le posent pas ; avant le 13/11 : rien, aucun marqueur", async () => {
    resumeSeedsForTests();
    expect((await runSeeds()).failed).toEqual([]);
    expect((await install())?.cardiosLibres20261115).toBeUndefined();
    const before = await db.sessionTemplates.toArray();
    const goals = await db.goals.toArray();
    await seedCardiosLibres20261115(BEFORE);
    expect(await db.sessionTemplates.toArray()).toEqual(before);
    expect(await db.goals.toArray()).toEqual(goals);
    expect((await install())?.cardiosLibres20261115).toBeUndefined();
  });

  it("le 15/11 : Cardio A = fractionné (36 min) + bloc jambes ; Cardio B = endurance longue (55 min), hôte du test cardio", async () => {
    await seedCardiosLibres20261115(SWITCH);
    expect((await install())?.cardiosLibres20261115).toBe(SWITCH);

    const fractionne = await template(FRACTIONNE_ID);
    expect(fractionne).toMatchObject({ name: "Cardio A — Fractionné + jambes", letter: "A", status: "active", contentSince: PROGRAM_4P2_START });
    expect(fractionne.blocks.map((block) => block.id)).toEqual(["v2-cardio-b-tapis", "v2-cardio-b-presse-une-jambe", "v5-cardio-a-montee", "v5-cardio-a-chaise", "v2-cardio-b-squat-chaise"]);
    expect(fractionne.blocks.map((block) => block.position)).toEqual([0, 1, 2, 3, 4]);
    expect(minutes(fractionne.blocks[0]!)).toBe(36);
    const steps = (fractionne.blocks[0] as ExerciseBlock).instructions;
    expect(steps.shape === "steps" && steps.steps.filter((step) => step.id.includes("effort")).map((step) => ("speedKmh" in step ? [step.durationSec, step.speedKmh, step.inclinePercent] : []))).toEqual(Array.from({ length: 5 }, () => [180, 5.5, 10]));
    expect(steps.shape === "steps" && steps.steps.filter((step) => step.id.includes("recup"))).toHaveLength(4);
    /* Bloc jambes : répétitions par jambe, consignes de sécurité. */
    const presse = fractionne.blocks[1] as ExerciseBlock;
    expect(presse).toMatchObject({ exerciseId: "presse-cuisses-une-jambe", instructions: { sets: 2, reps: { min: 15, max: 20 }, restBetweenSetsSec: 60 } });
    expect(presse.notes).toContain("PAR JAMBE");
    expect(presse.notes).toContain("jambe la plus faible");
    expect((fractionne.blocks[2] as ExerciseBlock).notes).toContain("PAR JAMBE");
    expect(fractionne.blocks[3]).toMatchObject({ exerciseId: "chaise-60", instructions: { shape: "duration", sets: 2, durationSec: { min: 45, max: 60 } } });
    expect(fractionne.blocks[4]).toMatchObject({ exerciseId: "squat-chaise", instructions: { sets: 2, reps: { min: 15, max: 20 } } });

    const endurance = await template(ENDURANCE_ID);
    expect(endurance).toMatchObject({ name: "Cardio B — Endurance longue", letter: "B", mainBlockId: "v2-cardio-a-tapis" });
    expect(endurance.blocks.map((block) => block.id)).toEqual(["v2-cardio-a-tapis"]);
    expect(minutes(endurance.blocks[0]!)).toBe(55);
    expect(fractionne.position).toBeLessThan(endurance.position);
  });

  it("Souplesse et Abdos : actives, dans Séances (catégorie Routine), jamais planifiées ; objectifs Souplesse et Tronc alimentés", async () => {
    await seedCardiosLibres20261115(SWITCH);
    const souplesse = await template(SOUPLESSE_ID);
    const abdos = await template(ABDOS_ID);
    expect(souplesse).toMatchObject({ name: "Souplesse", category: "Routine", status: "active", estimatedMinutes: 22 });
    expect(abdos).toMatchObject({ name: "Abdos à la maison", category: "Routine", status: "active", estimatedMinutes: 20 });
    expect(souplesse.blocks).toHaveLength(8);
    expect(abdos.blocks.map((block) => (block as ExerciseBlock).exerciseId)).toEqual(["planche", "planche-laterale", "pallof-elastique", "hollow-body-genoux", "crunch-inverse"]);

    /* Jamais au planning : ni jour, ni soir, ni facultatif, sur plusieurs semaines générées. */
    for (const week of ["2026-11-15", "2026-11-22", "2026-11-29"]) await generateProgramWeek(week, SWITCH);
    const planned = (await db.plannedSessions.toArray()) as PlannedSession[];
    expect(planned.some((session) => [SOUPLESSE_ID, ABDOS_ID].includes(session.sessionTemplateId))).toBe(false);
    const programs = await db.weeklyPrograms.toArray();
    expect(JSON.stringify(programs)).not.toContain(SOUPLESSE_ID);
    expect(JSON.stringify(programs)).not.toContain(ABDOS_ID);

    const goals = (await db.goals.toArray()) as Goal[];
    const linked = (key: string) => goals.find((goal) => goal.key === key)!.linkedExercises.map((link) => link.exerciseId);
    for (const block of abdos.blocks) expect(linked("core")).toContain((block as ExerciseBlock).exerciseId);
    for (const block of souplesse.blocks) expect(linked("flexibility")).toContain((block as ExerciseBlock).exerciseId);
  });

  it("cibles des séances libres : historique partagé avec les routines (planche de la routine V5 → planche des Abdos) ; hollow et crunch inversé suivis", async () => {
    await seedCardiosLibres20261115(SWITCH);
    const exerciseById = new Map(((await db.exercises.toArray()) as Exercise[]).map((exercise) => [exercise.id, exercise]));
    const plank = { id: "wb", kind: "exercise", position: 0, addedDuringWorkout: false, status: "performed", sourceBlockId: "v5-routine-dos-planche-laterale", exerciseId: "planche-laterale",
      snapshotInstructions: { shape: "duration", sets: 1, durationSec: 15, restBetweenSetsSec: 30 },
      dayTarget: { computedAt: "x", kind: "consolidate", sets: [{ durationSec: 15 }] },
      series: [{ id: "s", position: 0, status: "completed", role: "travail", sideValues: [{ side: "left", durationSec: 15 }, { side: "right", durationSec: 15 }], rpe: 6 }] };
    const routine = { ...done("2026-11-12", "v5-routine-dos", []), blocks: [plank] } as unknown as WorkoutSession;
    const context: DayTargetContext = { tracks: [], specs: [], completed: [routine], exerciseById };
    const target = routineDayTarget("libre-abdos-planche-laterale", "2026-11-16", context, SWITCH)!;
    expect(target.basisWorkoutId).toBe(routine.id);
    expect(target.sets[0]!.durationSec).toBeGreaterThanOrEqual(15);
    expect(routineDayTarget("libre-abdos-hollow", "2026-11-16", { ...context, completed: [] }, SWITCH)?.sets).toEqual([{ durationSec: 20 }, { durationSec: 20 }, { durationSec: 20 }]);
    expect(routineDayTarget("libre-abdos-crunch-inverse", "2026-11-16", { ...context, completed: [] }, SWITCH)?.sets).toEqual([{ reps: 10 }, { reps: 10 }]);
    expect(routineDayTarget("libre-souplesse-papillon", "2026-11-16", { ...context, completed: [] }, SWITCH)?.sets).toEqual([{ durationSec: 60 }, { durationSec: 60 }]);
  });

  it("charge conseillée de la presse à une jambe : la dernière charge, jamais de hausse automatique (pas de cadre ni de piste)", async () => {
    const exercise = (await db.exercises.get("presse-cuisses-une-jambe")) as Exercise;
    expect(exercise).toMatchObject({ measurementType: "load_reps", loadSteps: { base: 10, step: 10 }, measurementLabels: { value: "Reps par jambe (la plus faible)" } });
    expect(await db.strengthFrames.where("exerciseId").equals("presse-cuisses-une-jambe").count()).toBe(0);
    expect(advisedLoadOf(exercise, undefined, exerciseSeries(40, 20) as never)).toEqual({ value: 40, unit: "kg", assistance: false });
    expect(advisedLoadOf(exercise, undefined, undefined)).toBeUndefined();
  });

  it("séances faites : identiques ; historique complet de chaque exercice déplacé (élévations à 5 kg, montée sur banc) après les seeds 60 et 61", async () => {
    await db.workouts.bulkPut([
      done("2026-11-08", "v2-muscu-a", [{ sourceBlockId: "v2-muscu-a-elevations", exerciseId: "elevations-laterales-halteres", series: exerciseSeries(5, 15) }]),
      done("2026-11-10", "v2-muscu-b", [{ sourceBlockId: "v2-muscu-b-elevations", exerciseId: "elevations-laterales-halteres", series: exerciseSeries(5, 15) }]),
      done("2026-11-09", "v2-cardio-a", [{ sourceBlockId: "v5-cardio-a-montee", exerciseId: "montee-banc", series: [] }]),
    ]);
    const before = await db.workouts.toArray();
    await seedProgramMuscu20261115(SWITCH);
    await seedCardiosLibres20261115(SWITCH);
    expect(await db.workouts.toArray()).toEqual(before);
    const elevations = (await db.exercises.get("elevations-laterales-halteres")) as Exercise;
    const history = buildExercisePerformanceHistory(elevations, (await db.workouts.toArray()) as WorkoutSession[]);
    expect(history.map((entry) => entry.date).sort()).toEqual(["2026-11-08", "2026-11-10"]);
  });

  it("une seule fois ; cardio modifié à la main : non touché, mais Souplesse et Abdos sont créées", async () => {
    const endurance = await template(ENDURANCE_ID);
    await db.sessionTemplates.put({ ...endurance, blocks: endurance.blocks.slice(0, 1) });
    const cardiosBefore = await db.sessionTemplates.bulkGet([FRACTIONNE_ID, ENDURANCE_ID]);
    await seedCardiosLibres20261115(SWITCH);
    expect(await db.sessionTemplates.bulkGet([FRACTIONNE_ID, ENDURANCE_ID])).toEqual(cardiosBefore);
    expect(await db.sessionTemplates.get(SOUPLESSE_ID)).toBeDefined();
    const all = await db.sessionTemplates.toArray();
    await seedCardiosLibres20261115("2026-11-16T07:00:00.000Z");
    expect(await db.sessionTemplates.toArray()).toEqual(all);
  });
});

describe("programme 4+2, lot 2 — sauvegarde réelle", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!process.env.COACH_JM_BACKUP)("seeds 60 et 61 sur la sauvegarde : séances faites intactes, cardios et séances libres en place", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(process.env.COACH_JM_BACKUP!, "utf8")), db);
    resumeSeedsForTests();
    expect((await runSeeds()).failed).toEqual([]);
    const v5 = (await install())?.calendrierV5 !== undefined;
    const workouts = await db.workouts.toArray();
    await seedProgramMuscu20261115(SWITCH);
    await seedCardiosLibres20261115(SWITCH);
    expect(await db.workouts.toArray()).toEqual(workouts);
    expect(await db.sessionTemplates.get(SOUPLESSE_ID)).toMatchObject({ status: "active" });
    if (v5) expect((await template(FRACTIONNE_ID)).name).toBe("Cardio A — Fractionné + jambes");
  });
});
