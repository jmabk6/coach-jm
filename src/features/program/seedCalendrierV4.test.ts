import "fake-indexeddb/auto";

import { readdir, readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, SessionTemplate, TestScheduleEntry, WeeklyProgram, WorkoutSession } from "../../domain";
import { calculateSessionTemplateDuration } from "../../domain/rules/sessionTemplateRules";
import { readBackup, serializeBackup } from "../backup/exportBackup";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { optionalSessionsFor, tractionTestTomorrow } from "../today/useTodayData";
import { generateProgramWeek, loadTestPlan } from "./generateProgramWeek";
import { PADEL_ID, PADEL_TEST_EVE_WARNING, RECUPERATION_ID, VELO_COTES_ID, VELO_ENDURANCE_ID } from "./programCalendarV4";
import { PROGRAM_V4_START } from "./programV4";
import { plannedSessionsV4, seedCalendrierV4 } from "./seedCalendrierV4";
import { seedProgramMuscuV4 } from "./seedProgramMuscuV4";
import { seedRoutinesV4 } from "./seedRoutinesV4";

/** Lot L4 (programme V4) : le calendrier V4, posé au dimanche d'activation. */

const BEFORE = "2026-11-20T10:00:00.000Z";
const ACTIVATION = `${PROGRAM_V4_START}T08:00:00.000Z`;

const marker = async () => ((await db.settings.get("install"))?.value as InstallMarkers | undefined)?.calendrierV4;
const program = async () => (await db.weeklyPrograms.toArray())[0] as WeeklyProgram;
const between = async (from: string, to: string) => ((await db.plannedSessions.where("date").between(from, to, true, true).toArray()) as PlannedSession[]).filter((session) => !session.removedAt);
const byDay = (sessions: PlannedSession[], slot: "day" | "evening") =>
  Object.fromEntries(sessions.filter((session) => (session.slot ?? "day") === slot).map((session) => [session.date, session.sessionTemplateId]));

/** Aucune date n'a deux séances du même créneau issues de la règle. */
function expectNoDuplicates(sessions: PlannedSession[]) {
  const keys = sessions.filter((session) => session.source === "weekly_program" && !session.removedAt).map((session) => `${session.sourceDate ?? session.date}|${session.slot ?? "day"}`);
  expect(new Set(keys).size).toBe(keys.length);
}

async function activate(now: string = ACTIVATION) {
  await seedProgramMuscuV4(now);
  await seedRoutinesV4(now);
  await seedCalendrierV4(now);
}

/** Les seeds du lancement, ceux de la V4 à la date donnée. */
const seedsAt = (now: string) =>
  SEEDS.map((seed) =>
    seed.name === "programmeMuscuV4" ? { ...seed, run: () => seedProgramMuscuV4(now) } : seed.name === "routinesV4" ? { ...seed, run: () => seedRoutinesV4(now) } : seed.name === "calendrierV4" ? { ...seed, run: () => seedCalendrierV4(now) } : seed,
  );

describe("programme V4 — calendrier (installation neuve)", () => {
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

  it("sous Vitest, les seeds du lancement gardent le programme actuel, quelle que soit la date du jour", async () => {
    expect((await program()).eveningRotation).toBeDefined();
    expect((await db.sessionTemplates.get("v2-muscu-c"))?.name).toBe("Muscu C — Haut du corps + tapis");
  });

  it("avant le dimanche d'activation : rien ne change, aucun marqueur", async () => {
    const before = await program();
    await seedCalendrierV4(BEFORE);
    expect(await program()).toEqual(before);
    expect(await db.sessionTemplates.get(VELO_ENDURANCE_ID)).toBeUndefined();
    expect(await marker()).toBeUndefined();
  });

  it("au dimanche d'activation : règle, modèles, archives, calendrier des tests, objectif Cardio", async () => {
    const scheduleBefore = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    await activate();
    const rule = await program();
    expect(rule.days.map((day) => [day.weekday, day.sessionTemplateId])).toEqual([
      ["sunday", "v2-muscu-a"], ["monday", VELO_ENDURANCE_ID], ["tuesday", "v2-muscu-b"], ["wednesday", VELO_COTES_ID],
      ["thursday", "v2-muscu-c"], ["friday", undefined], ["saturday", undefined],
    ]);
    expect(rule.eveningByWeekday).toEqual({ sunday: "v4-routine-a", monday: "v4-routine-b", tuesday: "v4-routine-c", wednesday: "v4-routine-a", thursday: "v4-routine-b" });
    expect(rule.optionalByWeekday).toEqual({ saturday: [PADEL_ID, RECUPERATION_ID] });
    expect(rule.eveningRotation).toBeUndefined();

    for (const id of [VELO_ENDURANCE_ID, VELO_COTES_ID, PADEL_ID, RECUPERATION_ID]) expect((await db.sessionTemplates.get(id))?.status).toBe("active");
    expect((await db.sessionTemplates.get("v2-cardio-b"))?.status).toBe("archived");
    expect((await db.sessionTemplates.get("v2-cardio-c"))?.status).toBe("archived");
    expect((await db.sessionTemplates.get("v2-cardio-a"))?.status).toBe("active");

    const cotes = (await db.sessionTemplates.get(VELO_COTES_ID))!;
    expect(calculateSessionTemplateDuration(cotes, []).minutes).toBe(41);
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "cardio")).toMatchObject({ templateId: "v2-cardio-a", insteadOfTemplateId: VELO_COTES_ID });
    /* Les autres tests ne bougent pas (pari V6 : le test traction). */
    expect(schedule.filter((entry) => entry.protocolKey !== "cardio")).toEqual(scheduleBefore.filter((entry) => entry.protocolKey !== "cardio"));
    expect((await db.goals.where("key").equals("cardio").first())?.linkedExercises.map((link) => link.exerciseId)).toContain("velo");
    expect((await db.sessionTemplates.get(PADEL_ID))?.notePrefill).toContain("Fatigue jambes");
    expect(await marker()).toBe(ACTIVATION);
  });

  it("semaine type V4 générée après l'activation : journées, routines du soir, vendredi et samedi vides, sans doublon", async () => {
    await activate();
    await generateProgramWeek("2026-12-06", ACTIVATION);
    await generateProgramWeek("2026-12-06", ACTIVATION);
    const week = await between("2026-12-06", "2026-12-12");
    expect(byDay(week, "day")).toEqual({
      "2026-12-06": "v2-muscu-a", "2026-12-07": VELO_ENDURANCE_ID, "2026-12-08": "v2-muscu-b", "2026-12-09": VELO_COTES_ID, "2026-12-10": "v2-muscu-c",
    });
    expect(byDay(week, "evening")).toEqual({
      "2026-12-06": "v4-routine-a", "2026-12-07": "v4-routine-b", "2026-12-08": "v4-routine-c", "2026-12-09": "v4-routine-a", "2026-12-10": "v4-routine-b",
    });
    expectNoDuplicates(week);
  });

  it("semaine de tests (20-26/12) : traction dimanche, tronc et souplesse lundi soir, test cardio sur tapis mercredi à la place du vélo côtes", async () => {
    await activate();
    await generateProgramWeek("2026-12-20", ACTIVATION);
    const week = await between("2026-12-20", "2026-12-26");
    const plan = (await loadTestPlan())!;
    const keyOf = new Map([...plan.protocolIdByKey].map(([key, id]) => [id, key]));
    const testsOn = (date: string, slot: "day" | "evening") => week.find((session) => session.date === date && (session.slot ?? "day") === slot)?.tests?.map((test) => keyOf.get(test.protocolId)).sort();
    expect(byDay(week, "day")).toMatchObject({ "2026-12-20": "v2-muscu-a", "2026-12-23": "v2-cardio-a", "2026-12-24": "v2-muscu-c" });
    expect(testsOn("2026-12-20", "day")).toEqual(["traction"]);
    expect(testsOn("2026-12-21", "evening")).toEqual(["souplesse", "tronc"]);
    expect(week.find((session) => session.date === "2026-12-21" && session.slot === "evening")?.sessionTemplateId).toBe("v4-routine-b");
    expect(testsOn("2026-12-23", "day")).toEqual(["cardio"]);
    expect(testsOn("2026-12-24", "day")).toBeUndefined();
    expect(week.some((session) => session.sessionTemplateId === VELO_COTES_ID)).toBe(false);
    expectNoDuplicates(week);
  });

  it("séances déjà générées : rien avant l'activation ne bouge ; après, seules les séances intactes suivent la V4", async () => {
    /* Semaines générées avec le programme actuel avant l'activation. */
    for (const week of ["2026-11-22", "2026-11-29", "2026-12-06"]) await generateProgramWeek(week, BEFORE);
    const moved = (await db.plannedSessions.get("weekly-2026-12-12"))!;
    await db.plannedSessions.put({ ...moved, date: "2026-12-11", updatedAt: BEFORE });
    const skipped = (await db.plannedSessions.get("weekly-2026-12-07"))!;
    await db.plannedSessions.put({ ...skipped, status: "skipped", updatedAt: BEFORE });
    const before = await between("2026-11-22", "2026-11-28");

    await activate();

    expect(await between("2026-11-22", "2026-11-28")).toEqual(before);
    const after = await between("2026-11-29", "2026-12-12");
    expect(byDay(after, "day")).toEqual({
      "2026-11-29": "v2-muscu-a", "2026-11-30": VELO_ENDURANCE_ID, "2026-12-01": "v2-muscu-b", "2026-12-02": VELO_COTES_ID, "2026-12-03": "v2-muscu-c",
      "2026-12-06": "v2-muscu-a",
      /* Sautée par l'utilisateur : elle lui appartient. */
      "2026-12-07": "v2-cardio-b",
      "2026-12-08": "v2-muscu-b", "2026-12-09": VELO_COTES_ID, "2026-12-10": "v2-muscu-c",
      /* Déplacée par l'utilisateur au vendredi : gardée. */
      "2026-12-11": "v2-cardio-c",
    });
    expect(Object.keys(byDay(after, "evening")).sort()).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-06", "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10"]);
    expect(byDay(after, "evening")["2026-11-29"]).toBe("v4-routine-a");
    expectNoDuplicates(after);

    /* Une seconde génération ne recrée rien. */
    for (const week of ["2026-12-06"]) await generateProgramWeek(week, ACTIVATION);
    expectNoDuplicates(await between("2026-11-29", "2026-12-12"));
  });

  it("semaine d'activation jamais générée : complétée à partir du jour de la bascule, sans séance passée", async () => {
    await activate();
    const week = await between("2026-11-29", "2026-12-05");
    expect(byDay(week, "day")).toEqual({ "2026-11-29": "v2-muscu-a", "2026-11-30": VELO_ENDURANCE_ID, "2026-12-01": "v2-muscu-b", "2026-12-02": VELO_COTES_ID, "2026-12-03": "v2-muscu-c" });
    expect(byDay(week, "evening")["2026-11-29"]).toBe("v4-routine-a");
    expectNoDuplicates(week);
  });

  it("bascule un mardi (application ouverte en retard) : rien n'est créé avant ce mardi", async () => {
    const tuesday = "2026-12-01T18:00:00.000Z";
    await activate(tuesday);
    const week = await between("2026-11-29", "2026-12-05");
    expect(Object.keys(byDay(week, "day")).sort()).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    /* Au lancement suivant, rien n'est recréé. */
    await seedCalendrierV4("2026-12-02T08:00:00.000Z");
    expectNoDuplicates(await between("2026-11-29", "2026-12-05"));
  });

  it("plannedSessionsV4 : une séance démarrée, faite, retirée, ajoutée à la main ou avec un test n'est jamais touchée", () => {
    const base = { status: "upcoming", source: "weekly_program", createdAt: BEFORE, updatedAt: BEFORE } as const;
    const sessions: PlannedSession[] = [
      { ...base, id: "a", date: "2026-12-05", sourceDate: "2026-12-05", sessionTemplateId: "v2-cardio-c" },
      { ...base, id: "b", date: "2026-12-05", sourceDate: "2026-12-05", sessionTemplateId: "v2-cardio-c", status: "done", workoutId: "w" },
      { ...base, id: "c", date: "2026-12-05", sourceDate: "2026-12-05", sessionTemplateId: "v2-cardio-c", removedAt: BEFORE },
      { ...base, id: "d", date: "2026-12-05", sessionTemplateId: "v2-cardio-c", source: "manual" },
      { ...base, id: "e", date: "2026-12-23", sourceDate: "2026-12-23", sessionTemplateId: "v2-cardio-a", tests: [{ protocolId: "p", placement: "replace_block" }] },
      { ...base, id: "f", date: "2026-12-04", sourceDate: "2026-12-04", sessionTemplateId: "v1-routine-b", slot: "evening" },
      { ...base, id: "g", date: "2026-11-28", sourceDate: "2026-11-28", sessionTemplateId: "v2-cardio-c" },
    ];
    expect(plannedSessionsV4(sessions, ACTIVATION)).toEqual({ deleteIds: ["a", "f"], updates: [] });
  });

  it("Accueil : padel et récupération proposés le samedi ; avertissement la veille d'un test traction ; carte masquée une fois la séance faite", async () => {
    await activate();
    const plan = await loadTestPlan();
    const templates = new Map(((await db.sessionTemplates.toArray()) as SessionTemplate[]).map((template) => [template.id, template]));
    const ids = (await program()).optionalByWeekday!.saturday!;
    expect(tractionTestTomorrow("2026-12-19", plan)).toBe(true);
    expect(tractionTestTomorrow("2026-12-12", plan)).toBe(false);
    const eve = optionalSessionsFor("2026-12-19", ids, templates, [], plan);
    expect(eve.map((item) => [item.template.id, item.warning])).toEqual([[PADEL_ID, PADEL_TEST_EVE_WARNING], [RECUPERATION_ID, undefined]]);
    expect(optionalSessionsFor("2026-12-12", ids, templates, [], plan).every((item) => item.warning === undefined)).toBe(true);
    expect(optionalSessionsFor("2026-12-12", ids, templates, [{ sessionTemplateId: PADEL_ID, status: "completed" }], plan).map((item) => item.template.id)).toEqual([RECUPERATION_ID]);
  });

  it("sauvegarde puis restauration après l'activation : la règle V4 est conservée telle quelle", async () => {
    await activate();
    const rule = await program();
    const text = serializeBackup(await readBackup(db, { now: new Date(ACTIVATION), buildTime: "b", userAgent: "t", standalone: true }));
    await resetAndRestore(parseBackup(text), db);
    expect(await program()).toEqual(rule);
  });
});

describe("programme V4 — calendrier sur la sauvegarde réelle", () => {
  const path = process.env.COACH_JM_BACKUP;

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!path)("tous les seeds passent ; rien avant l'activation ne change ; la Muscu C affiche l'estimation V4 (≈ 108 min) et non la moyenne historique", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(path!, "utf8")), db);
    const workoutsBefore = await db.workouts.toArray();
    const sessionsBefore = ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V4_START);
    resumeSeedsForTests();
    const report = await runSeeds(seedsAt(ACTIVATION));
    expect(report.failed).toEqual([]);
    expect(await marker()).toBe(ACTIVATION);
    /* Les séances faites ne changent pas. */
    for (const workout of workoutsBefore) expect(await db.workouts.get(workout.id)).toEqual(workout);
    /* Avant l'activation, rien ne change (sauf la séance du 01/11, ajoutée par le seed 49 si la sauvegarde ne l'avait pas). */
    const untouched = (sessions: PlannedSession[]) => sessions.filter((session) => session.id !== "weekly-2026-11-01");
    expect(untouched(((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V4_START))).toEqual(untouched(sessionsBefore));

    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    const completedC = ((await db.workouts.toArray()) as WorkoutSession[]).filter((workout) => workout.status === "completed" && workout.sessionTemplateId === "v2-muscu-c");
    expect(completedC.length).toBeGreaterThanOrEqual(3);
    expect(calculateSessionTemplateDuration(c, completedC)).toEqual({ kind: "estimated", minutes: 108 });

    await generateProgramWeek("2026-12-06", ACTIVATION);
    await generateProgramWeek("2026-12-20", ACTIVATION);
    expectNoDuplicates((await db.plannedSessions.toArray()) as PlannedSession[]);
  });
});

/**
 * Compatibilité des anciennes sauvegardes (lot L4, changement de la règle
 * hebdomadaire) : chaque sauvegarde de Téléchargements restaurée, puis la V4
 * posée, sans échec ni doublon. Lancé seulement avec COACH_JM_ALL_BACKUPS=1.
 */
describe("programme V4 — toutes les sauvegardes de Téléchargements", () => {
  const dir = "C:/Users/JMA/Downloads";

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!process.env.COACH_JM_ALL_BACKUPS)("chaque sauvegarde lisible passe à la V4 sans échec ni doublon, la règle V4 en place", async () => {
    const files = (await readdir(dir)).filter((name) => /^coach-jm-sauvegarde-.*\.json$/.test(name)).sort();
    const unreadable: string[] = [];
    let checked = 0;
    for (const name of files) {
      let envelope;
      try {
        envelope = parseBackup(await readFile(`${dir}/${name}`, "utf8"));
      } catch {
        unreadable.push(name);
        continue;
      }
      await db.delete();
      await db.open();
      await restoreBackup(envelope, db);
      const sessionsBefore = ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V4_START);
      resumeSeedsForTests();
      const report = await runSeeds(seedsAt(ACTIVATION));
      expect(report.failed, name).toEqual([]);
      expect((await program()).eveningByWeekday, name).toBeDefined();
      const kept = ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => sessionsBefore.some((item) => item.id === session.id && item.date < PROGRAM_V4_START));
      expect(kept.length, name).toBe(sessionsBefore.length);
      await generateProgramWeek("2026-12-06", ACTIVATION);
      expectNoDuplicates((await db.plannedSessions.toArray()) as PlannedSession[]);
      checked += 1;
      db.close();
    }
    process.stdout.write(`
[L4] ${checked} sauvegardes vérifiées, ${unreadable.length} illisibles : ${unreadable.join(", ")}`);
    expect(checked).toBeGreaterThan(0);
  }, 600000);
});
