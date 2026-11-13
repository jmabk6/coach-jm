import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { ExerciseBlock, InstallMarkers, PerformedBlock, PlannedSession, SessionTemplate, WeeklyProgram, WorkoutSession } from "../../domain";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { dayTargetForTrack, loadDayTargetContext, routineDayTarget } from "../perspectives/dayTargets";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import { generateProgramWeek } from "./generateProgramWeek";
import { ABDOS_ID, ENDURANCE_ID, FRACTIONNE_ID, MUSCU_D_ID, PROGRAM_4P2_FIRST_DAY, PROGRAM_4P2_START, SOUPLESSE_ID } from "./program20261115";
import { seedCalendrierV4 } from "./seedCalendrierV4";
import { seedCalendrier20261115, seedCardiosLibres20261115, seedProgramMuscu20261115 } from "./seedProgram20261115";
import { seedProgramMuscuV4 } from "./seedProgramMuscuV4";
import { seedCalendrierV5, seedProgramMuscuV5, seedRoutineDosComplete20261122, seedRoutinesV5 } from "./seedProgramV5";
import { seedRoutinesV4 } from "./seedRoutinesV4";

/**
 * Programme 4+2, lot 3 (validé par JM le 13/11/2026) : seed 62, calendrier
 * du 15/11, tests de la semaine du 22/11, plus de routine du soir.
 */

const V4 = "2026-11-02T08:00:00.000Z";
const V5 = "2026-11-07T22:30:00.000Z";
const BEFORE = "2026-11-12T20:00:00.000Z";
const SWITCH = `${PROGRAM_4P2_FIRST_DAY}T07:00:00.000Z`;

const install = async () => (await db.settings.get("install"))?.value as InstallMarkers | undefined;
const live = async () => ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => !session.removedAt);
const day = (sessions: PlannedSession[], date: string) => sessions.filter((session) => session.date === date && (session.slot ?? "day") === "day");
const evening = (sessions: PlannedSession[], date: string) => sessions.filter((session) => session.date === date && session.slot === "evening");

async function installV5() {
  await seedProgramMuscuV4(V4);
  await seedRoutinesV4(V4);
  await seedCalendrierV4(V4);
  await generateProgramWeek("2026-11-08", V4);
  await seedProgramMuscuV5(V5);
  await seedRoutinesV5(V5);
  await seedCalendrierV5(V5);
  /* Comme sur l'iPhone : semaines du 15, du 22 (tests) et du 29/11 déjà générées en V5. */
  for (const week of ["2026-11-15", "2026-11-22", "2026-11-29"]) await generateProgramWeek(week, "2026-11-12T19:00:00.000Z");
}

async function switchTo4p2(now = SWITCH) {
  await seedProgramMuscu20261115(now);
  await seedCardiosLibres20261115(now);
  await seedCalendrier20261115(now);
}

describe("programme 4+2 — calendrier du 15/11 (seed 62)", () => {
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

  it("avant le 13/11 : rien ne change, aucun marqueur ; le planning V5 du 14/11 (routine du soir) reste", async () => {
    const before = await db.plannedSessions.toArray();
    await seedCalendrier20261115(BEFORE);
    expect(await db.plannedSessions.toArray()).toEqual(before);
    expect((await install())?.calendrier20261115).toBeUndefined();
  });

  it("le 15/11 : semaine type A / B / Cardio A / C / D / repos / Cardio B, plus aucune routine du soir ; avant le 15/11, rien ne bouge", async () => {
    const before14 = (await db.plannedSessions.toArray()).filter((session) => session.date < PROGRAM_4P2_FIRST_DAY);
    await switchTo4p2();
    expect((await install())?.calendrier20261115).toBe(SWITCH);
    const program = (await db.weeklyPrograms.toArray())[0] as WeeklyProgram;
    expect(program.name).toBe("Programme 4+2");
    expect(program.eveningByWeekday).toEqual({});

    const sessions = await live();
    const expected: Array<[string, string | undefined]> = [
      ["2026-11-15", "v2-muscu-a"], ["2026-11-16", "v2-muscu-b"], ["2026-11-17", FRACTIONNE_ID], ["2026-11-18", "v2-muscu-c"],
      ["2026-11-19", MUSCU_D_ID], ["2026-11-20", undefined], ["2026-11-21", ENDURANCE_ID],
    ];
    for (const [date, templateId] of expected) {
      expect(day(sessions, date).map((session) => session.sessionTemplateId), date).toEqual(templateId ? [templateId] : []);
      expect(evening(sessions, date), `soir du ${date}`).toEqual([]);
    }
    /* Semaine du 29/11 aussi. */
    expect(day(sessions, "2026-12-03").map((session) => session.sessionTemplateId)).toEqual([MUSCU_D_ID]);
    expect(sessions.filter((session) => session.date >= PROGRAM_4P2_FIRST_DAY && session.slot === "evening" && session.date !== "2026-11-23")).toEqual([]);
    expect((await db.plannedSessions.toArray()).filter((session) => session.date < PROGRAM_4P2_FIRST_DAY)).toEqual(before14);

    /* Archivés, jamais supprimés. */
    for (const id of ["v2-cardio-c", "v5-routine-dos", "v5-routine-dos-legere"]) expect((await db.sessionTemplates.get(id))?.status, id).toBe("archived");
  });

  it("semaine de tests du 22/11 : traction le dimanche en A ; souplesse et tronc le lundi soir (sur Souplesse) ; test cardio le samedi dans le Cardio B ; mercredi = Muscu C", async () => {
    await switchTo4p2();
    const sessions = await live();
    const sunday = day(sessions, "2026-11-22")[0]!;
    expect(sunday.sessionTemplateId).toBe("v2-muscu-a");
    expect(sunday.tests?.map((test) => test.protocolId)).toEqual(["protocol-traction"]);
    const monday = evening(sessions, "2026-11-23");
    expect(monday.map((session) => session.sessionTemplateId)).toEqual([SOUPLESSE_ID]);
    expect(monday[0]!.tests?.map((test) => test.protocolId).sort()).toEqual(["protocol-souplesse", "protocol-tronc"]);
    expect(day(sessions, "2026-11-25").map((session) => [session.sessionTemplateId, session.tests?.length ?? 0])).toEqual([["v2-muscu-c", 0]]);
    const saturday = day(sessions, "2026-11-28")[0]!;
    expect(saturday.sessionTemplateId).toBe(ENDURANCE_ID);
    expect(saturday.tests).toEqual([expect.objectContaining({ protocolId: "protocol-cardio", placement: "replace_block", targetBlockId: "v2-cardio-a-tapis", targetStepIds: ["v2-cardio-a-continu"] })]);

    /* Samedi 28/11 : progressif 10 min, test de 20 min, retour au calme ; plus de partie continue de 40 min. */
    const template = (await db.sessionTemplates.get(ENDURANCE_ID)) as SessionTemplate;
    const version = (await db.testProtocolVersions.where("protocolId").equals("protocol-cardio").toArray()).at(-1)!;
    const blocks: PerformedBlock[] = createWorkoutSnapshot(template, undefined, undefined, [{ test: saturday.tests![0]!, protocolVersionId: version.id }]);
    expect(blocks.some((block) => block.kind === "test")).toBe(true);
    const json = JSON.stringify(blocks);
    expect(json).toContain("v2-cardio-a-progressif");
    expect(json).toContain("v2-cardio-a-retour");
    expect(json).not.toContain("v2-cardio-a-continu");
  });

  it("séances de l'utilisateur gardées : faite, déplacée, retirée ; le passage à la routine complète du 22/11 n'a plus lieu", async () => {
    const all = (await db.plannedSessions.toArray()) as PlannedSession[];
    const moved = { ...day(all, "2026-11-16")[0]!, date: "2026-11-17", updatedAt: "x" };
    const removed = { ...evening(all, "2026-11-18")[0]!, removedAt: "2026-11-12T20:00:00.000Z" };
    await db.plannedSessions.bulkPut([moved, removed]);
    await switchTo4p2();
    expect(await db.plannedSessions.get(moved.id)).toEqual(moved);
    expect(await db.plannedSessions.get(removed.id)).toEqual(removed);
    /* Le lundi 16 (source du déplacement) ne reçoit pas de 2e séance. */
    expect(day(await live(), "2026-11-16")).toEqual([]);

    const program = (await db.weeklyPrograms.toArray())[0];
    await seedRoutineDosComplete20261122("2026-11-22T07:00:00.000Z");
    expect((await db.weeklyPrograms.toArray())[0]).toEqual(program);
    expect((await live()).filter((session) => session.date >= "2026-11-22" && session.slot === "evening" && session.date !== "2026-11-23")).toEqual([]);
  });

  it("Souplesse et Abdos jamais planifiées (hors soir de test du 23/11) ; faites, elles s'affichent sous leur nom (séance libre, sans instance)", async () => {
    await switchTo4p2();
    const sessions = await live();
    expect(sessions.filter((session) => session.sessionTemplateId === ABDOS_ID)).toEqual([]);
    expect(sessions.filter((session) => session.sessionTemplateId === SOUPLESSE_ID).map((session) => session.date)).toEqual(["2026-11-23"]);
  });

  it("élévations : en B et D, la 1re séance repart de zéro (aucune recommandation à 5 kg), puis progression à 6 kg ; en A (légère), 6 kg depuis le 12/11", async () => {
    await switchTo4p2();
    const series = (kg: number, reps: number[], rpe: number[]) => reps.map((value, index) => ({ id: `s${index}`, position: index, status: "completed", role: "travail", load: { kind: "total", kg }, reps: value, rpe: rpe[index] }));
    const workout = (date: string, templateId: string, sourceBlockId: string, kg: number, reps: number[], rpe: number[]) =>
      ({
        id: `w-${date}`, source: "planned", sessionTemplateId: templateId, status: "completed", date, startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
        blocks: [{ id: `wb-${date}`, kind: "exercise", position: 0, addedDuringWorkout: false, status: "performed", sourceBlockId, exerciseId: "elevations-laterales-halteres", snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 12, max: 15 }, restBetweenSetsSec: 90 }, series: series(kg, reps, rpe) }],
      }) as unknown as WorkoutSession;
    const history = [
      workout("2026-11-10", "v2-muscu-b", "v2-muscu-b-elevations", 5, [15, 15, 15], [8, 8, 9]),
      workout("2026-11-12", "v2-muscu-c", "v2-muscu-c-elevations", 6, [13, 13, 12], [8, 8, 9]),
    ];
    let context = await loadDayTargetContext(history);
    const b = dayTargetForTrack("v2-muscu-b-elevations", "2026-11-16", context, SWITCH)!;
    expect(b.kind).toBe("insufficient");
    expect(b.sets).toEqual([]);
    const light = dayTargetForTrack("v2-muscu-c-elevations", "2026-11-15", context, SWITCH)!;
    expect(light.sets.every((set) => set.kg === 6)).toBe(true);
    expect(light.rpeMax).toBe(8);

    /* 1re B à 6 kg (12 / 12 / 12, RPE 8) → D du jeudi : 6 kg, +1 répétition visée. */
    context = await loadDayTargetContext([...history, workout("2026-11-16", "v2-muscu-b", "v2-muscu-b-elevations", 6, [12, 12, 12], [8, 8, 8])]);
    const d = dayTargetForTrack("v2-muscu-a-elevations", "2026-11-19", context, SWITCH)!;
    expect(d.kind).toBe("progress");
    expect(d.sets.every((set) => set.kg === 6)).toBe(true);
    expect(d.sets.some((set) => (set.reps ?? 0) >= 13)).toBe(true);
  });

  it("plafonds de RPE : chest press, développé épaules et rowing à 9 au plus, isolations à 8 ; RPE 10 saisi → reproduire sans dépasser", async () => {
    await switchTo4p2();
    const context = await loadDayTargetContext([]);
    const rpeOf = (id: string) => context.specs.find((spec) => spec.id === id)?.load?.rpeMax;
    expect(rpeOf("v2-muscu-b-chest-press")).toBe(9);
    expect(rpeOf("v2-muscu-b-developpe-epaules")).toBe(9);
    expect(rpeOf("v2-muscu-a-rowing")).toBe(9);
    expect(rpeOf("v2-muscu-b-elevations")).toBe(8);
    expect(rpeOf("v2-muscu-d-face-pull")).toBe(8);
    expect(context.specs.every((spec) => (spec.load?.rpeMax ?? 0) <= 9 && (spec.duration?.rpeMax ?? 0) <= 9)).toBe(true);

    const chest = {
      id: "w-chest", source: "planned", sessionTemplateId: "v2-muscu-b", status: "completed", date: "2026-11-16", startedAt: "2026-11-16T09:00:00.000Z", completedAt: "x", lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
      blocks: [{ id: "wb", kind: "exercise", position: 0, addedDuringWorkout: false, status: "performed", sourceBlockId: "v2-muscu-b-chest-press", exerciseId: "chest-press", snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 10 }, restBetweenSetsSec: 150 },
        series: [7, 7, 6].map((reps, index) => ({ id: `s${index}`, position: index, status: "completed", role: "travail", load: { kind: "total", kg: 60 }, reps, rpe: index === 2 ? 10 : 9 })) }],
    } as unknown as WorkoutSession;
    const target = dayTargetForTrack("v2-muscu-b-chest-press", "2026-11-23", await loadDayTargetContext([chest]), SWITCH)!;
    expect(target.kind).toBe("consolidate");
    expect(target.rpeMax).toBe(9);
    expect(target.sets.map((set) => set.kg)).toEqual([60, 60, 60]);
  });

  it("Souplesse : +15 s par position à RPE 6 au plus (RPE 7 : même cible) ; Abdos : Pallof +1 répétition à RPE 7 au plus", async () => {
    await switchTo4p2();
    const session = (blockId: string, exerciseId: string, target: { durationSec?: number; reps?: number }, done: Array<{ durationSec?: number; reps?: number }>, rpe: number) =>
      ({
        id: `w-${blockId}-${rpe}`, source: "free", sessionTemplateId: "x", status: "completed", date: "2026-11-16", startedAt: "2026-11-16T19:00:00.000Z", completedAt: "x", lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
        blocks: [{ id: "wb", kind: "exercise", position: 0, addedDuringWorkout: false, status: "performed", sourceBlockId: blockId, exerciseId, snapshotInstructions: { shape: "duration", sets: done.length, durationSec: 45, restBetweenSetsSec: 15 },
          dayTarget: { computedAt: "x", kind: "progress", sets: done.map(() => target) },
          series: done.map((values, index) => ({ id: `s${index}`, position: index, status: "completed", role: "travail", ...values, rpe })) }],
      }) as unknown as WorkoutSession;
    const context = await loadDayTargetContext([]);
    const papillon = (rpe: number) => routineDayTarget("libre-souplesse-papillon", "2026-11-18", { ...context, completed: [session("libre-souplesse-papillon", "papillon-assis", { durationSec: 60 }, [{ durationSec: 60 }, { durationSec: 60 }], rpe)] }, SWITCH)!;
    expect(papillon(6).sets).toEqual([{ durationSec: 75 }, { durationSec: 75 }]);
    expect(papillon(6).rpeMax).toBe(6);
    expect(papillon(7).sets).toEqual([{ durationSec: 60 }, { durationSec: 60 }]);
    const pallof = routineDayTarget("libre-abdos-pallof", "2026-11-18", { ...context, completed: [session("libre-abdos-pallof", "pallof-elastique", { reps: 10 }, [{ reps: 10 }, { reps: 10 }, { reps: 10 }], 7)] }, SWITCH)!;
    expect(pallof.sets).toEqual([{ reps: 11 }, { reps: 11 }, { reps: 11 }]);
  });

  it("activation le vendredi 13/11 au soir : le 13 et le 14 gardent l'ancien programme (Cardio C, routines du soir, pas de Cardio B le samedi 14) ; le nouveau calendrier commence le 15/11", async () => {
    const tonight = `${PROGRAM_4P2_START}T21:00:00.000Z`;
    const kept = (await db.plannedSessions.toArray()).filter((session) => session.date < PROGRAM_4P2_FIRST_DAY);
    await switchTo4p2(tonight);
    expect((await install())?.programmeMuscu20261115).toBe(tonight);
    expect((await install())?.calendrier20261115).toBe(tonight);
    expect((await db.plannedSessions.toArray()).filter((session) => session.date < PROGRAM_4P2_FIRST_DAY)).toEqual(kept);
    const sessions = await live();
    expect(day(sessions, "2026-11-13").map((session) => session.sessionTemplateId)).toEqual(["v2-cardio-c"]);
    expect(evening(sessions, "2026-11-13").map((session) => session.sessionTemplateId)).toEqual(["v5-routine-dos-legere"]);
    expect(evening(sessions, "2026-11-14").map((session) => session.sessionTemplateId)).toEqual(["v5-routine-dos-legere"]);
    expect(day(sessions, "2026-11-14")).toEqual([]);
    expect(day(sessions, "2026-11-15").map((session) => session.sessionTemplateId)).toEqual(["v2-muscu-a"]);
    expect(day(sessions, "2026-11-19").map((session) => session.sessionTemplateId)).toEqual([MUSCU_D_ID]);
    expect(sessions.filter((session) => session.date >= PROGRAM_4P2_FIRST_DAY && session.slot === "evening").map((session) => session.date)).toEqual(["2026-11-23"]);
    /* Les modèles du 13 et du 14 sont archivés mais restent lisibles par leurs séances prévues. */
    expect((await db.sessionTemplates.get("v2-cardio-c"))?.blocks.length).toBeGreaterThan(0);
  });

  it("une seule fois ; sans Muscu D (modèles modifiés à la main) : le calendrier V5 reste", async () => {
    await switchTo4p2();
    const sessions = await db.plannedSessions.toArray();
    await seedCalendrier20261115("2026-11-16T07:00:00.000Z");
    expect(await db.plannedSessions.toArray()).toEqual(sessions);
  });
});

describe("programme 4+2, lot 3 — sans Muscu D", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("modèle B modifié à la main : ni D ni nouveau calendrier, les routines du soir restent ; marqueur posé", async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    await installV5();
    const b = (await db.sessionTemplates.get("v2-muscu-b")) as SessionTemplate;
    await db.sessionTemplates.put({ ...b, blocks: [...b.blocks, { ...(b.blocks[1] as ExerciseBlock), id: "perso", position: 99 }] });
    const sessions = await db.plannedSessions.toArray();
    await switchTo4p2();
    expect(await db.plannedSessions.toArray()).toEqual(sessions);
    expect((await install())?.calendrier20261115).toBe(SWITCH);
  });
});

describe("programme 4+2, lot 3 — sauvegarde réelle", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!process.env.COACH_JM_BACKUP)("seeds 60 à 62 : séances faites intactes, planning du 15/11 et tests du 22/11 en place, plus de routine du soir", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(process.env.COACH_JM_BACKUP!, "utf8")), db);
    resumeSeedsForTests();
    expect((await runSeeds()).failed).toEqual([]);
    if ((await install())?.calendrierV5 === undefined) return;
    const workouts = await db.workouts.toArray();
    const before = (await db.plannedSessions.toArray()).filter((session) => session.date < PROGRAM_4P2_FIRST_DAY);
    await switchTo4p2();
    expect(await db.workouts.toArray()).toEqual(workouts);
    expect((await db.plannedSessions.toArray()).filter((session) => session.date < PROGRAM_4P2_FIRST_DAY)).toEqual(before);
    const sessions = await live();
    expect(day(sessions, "2026-11-19").map((session) => session.sessionTemplateId)).toEqual([MUSCU_D_ID]);
    expect(day(sessions, "2026-11-28")[0]?.tests?.map((test) => test.protocolId)).toEqual(["protocol-cardio"]);
    expect(sessions.filter((session) => session.date >= PROGRAM_4P2_FIRST_DAY && session.slot === "evening").map((session) => session.date)).toEqual(["2026-11-23"]);
  });
});
