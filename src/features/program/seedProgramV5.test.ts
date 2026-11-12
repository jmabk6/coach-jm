import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, SessionTemplate, StrengthFrameVersion, TestScheduleEntry, WeeklyProgram, WorkoutSession } from "../../domain";
import { calculateSessionTemplateDuration } from "../../domain/rules/sessionTemplateRules";
import { parseBackup, restoreBackup } from "../backup/restoreBackup";
import { routineDayTarget, type DayTargetContext } from "../perspectives/dayTargets";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { fixDeveloppeEpaules20261110 } from "../history/seedFixDeveloppeEpaules20261110";
import { generateProgramWeek } from "./generateProgramWeek";
import { PROGRAM_V5_FIRST_DAY, PROGRAM_V5_START, ROUTINE_DOS_ID, ROUTINE_DOS_LEGERE_ID, PONT_FESSIER_ID } from "./programV5";
import { seedCalendrierV4 } from "./seedCalendrierV4";
import { seedProgramMuscuV4 } from "./seedProgramMuscuV4";
import { seedCalendrierV5, seedProgramMuscuV5, seedRoutineDosComplete20261122, seedRoutinesV5 } from "./seedProgramV5";
import { seedRoutinesV4 } from "./seedRoutinesV4";

/** Programme V5 (décisions de JM du 07/11/2026) : seeds 55 à 58. */

const V4 = "2026-11-02T08:00:00.000Z";
const BEFORE = "2026-11-06T20:00:00.000Z";
const ACTIVATION = `${PROGRAM_V5_FIRST_DAY}T07:00:00.000Z`;
/** Le soir du 07/11 : la V5 se pose, le calendrier V5 commence le lendemain. */
const TONIGHT = `${PROGRAM_V5_START}T22:30:00.000Z`;
const COMPLETE = "2026-11-22T07:00:00.000Z";

const install = async () => (await db.settings.get("install"))?.value as InstallMarkers | undefined;
const program = async () => (await db.weeklyPrograms.toArray())[0] as WeeklyProgram;
const template = async (id: string) => (await db.sessionTemplates.get(id)) as SessionTemplate;
const blockIds = async (id: string) => (await template(id)).blocks.map((block) => block.id);
const planned = async () => ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => !session.removedAt);
const at = (sessions: PlannedSession[], date: string, slot: "day" | "evening") => sessions.find((session) => session.date === date && (session.slot ?? "day") === slot)?.sessionTemplateId;

function expectNoDuplicates(sessions: PlannedSession[]) {
  const keys = sessions.filter((session) => session.source === "weekly_program" && !session.removedAt).map((session) => `${session.sourceDate ?? session.date}|${session.slot ?? "day"}`);
  expect(new Set(keys).size).toBe(keys.length);
}

async function activateV4() {
  await seedProgramMuscuV4(V4);
  await seedRoutinesV4(V4);
  await seedCalendrierV4(V4);
  await generateProgramWeek("2026-11-08", V4);
  await generateProgramWeek("2026-11-15", V4);
  await generateProgramWeek("2026-11-22", V4);
}

async function activateV5(now: string = ACTIVATION) {
  await seedProgramMuscuV5(now);
  await seedRoutinesV5(now);
  await seedCalendrierV5(now);
}

describe("programme V5 — installation passée en V4", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    await activateV4();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("sous Vitest, les seeds du lancement ne posent pas la V5", async () => {
    resumeSeedsForTests();
    const report = await runSeeds();
    expect(report.failed).toEqual([]);
    expect((await install())?.programmeMuscuV5).toBeUndefined();
    expect((await program()).name).toBe("Programme V4");
  });

  it("avant le dimanche d'activation : rien ne change, aucun marqueur", async () => {
    const a = await template("v2-muscu-a");
    await activateV5(BEFORE);
    expect(await template("v2-muscu-a")).toEqual(a);
    expect(await db.sessionTemplates.get(ROUTINE_DOS_ID)).toBeUndefined();
    const markers = await install();
    expect(markers?.programmeMuscuV5).toBeUndefined();
    expect(markers?.routinesV5).toBeUndefined();
    expect(markers?.calendrierV5).toBeUndefined();
  });

  it("Muscu A, B et C : épaules avant la 10e série, tirage en A, rowing léger en C", async () => {
    await activateV5();
    expect(await blockIds("v2-muscu-a")).toEqual([
      "v2-muscu-a-echauffement", "v2-muscu-a-traction", "v2-muscu-a-rowing", "v2-muscu-a-elevations", "v2-muscu-c-tirage-vertical", "v2-muscu-a-chest-press", "v2-muscu-a-curl",
    ]);
    expect(await blockIds("v2-muscu-b")).toEqual([
      "v2-muscu-b-echauffement", "v2-muscu-b-traction", "v2-muscu-b-developpe-epaules", "v2-muscu-b-elevations", "v2-muscu-b-chest-press", "v2-muscu-b-developpe-incline", "v2-muscu-c-ecarte", "v2-muscu-b-extension-triceps",
    ]);
    expect(await blockIds("v2-muscu-c")).toEqual([
      "v2-muscu-c-echauffement", "v2-muscu-c-negatives", "v2-muscu-c-suspension", "v2-muscu-c-elevations", "v2-muscu-c-face-pull", "v2-muscu-b-rowing", "v2-muscu-c-curl-marteau", "v2-muscu-c-triceps-tete",
    ]);

    const b = await template("v2-muscu-b");
    const traction = b.blocks.find((block) => block.id === "v2-muscu-b-traction")!;
    expect(traction.kind === "exercise" && traction.outsideFrame).toBe(true);
    expect(traction.kind === "exercise" && traction.instructions.shape === "reps" && traction.instructions.sets).toBe(2);
    const c = await template("v2-muscu-c");
    const rowing = c.blocks.find((block) => block.id === "v2-muscu-b-rowing")!;
    expect(rowing.kind === "exercise" && rowing.outsideFrame).toBe(true);
    const elevationsC = c.blocks.find((block) => block.id === "v2-muscu-c-elevations")!;
    expect(elevationsC.kind === "exercise" && elevationsC.instructions.shape === "reps" && elevationsC.instructions.reps).toEqual({ min: 15, max: 20 });

    /* La traction de force reste celle du pari V6 (rien ne change). */
    const a = await template("v2-muscu-a");
    const force = a.blocks.find((block) => block.id === "v2-muscu-a-traction")!;
    expect(force.kind === "exercise" && force.instructions.shape === "reps" && force.instructions.reps).toEqual({ min: 1, max: 5 });

    for (const id of ["v2-muscu-a", "v2-muscu-b", "v2-muscu-c"]) {
      const duration = calculateSessionTemplateDuration(await template(id), []);
      expect(duration.kind).toBe("estimated");
      expect(duration.minutes, id).toBeLessThanOrEqual(75);
    }
  });

  it("cadres : nouvelle version pour les exercices dont la consigne change", async () => {
    await activateV5();
    const frames = await db.strengthFrames.toArray();
    const active = async (exerciseId: string) => {
      const frame = frames.find((item) => item.exerciseId === exerciseId)!;
      return (await db.strengthFrameVersions.get(frame.activeVersionId)) as StrengthFrameVersion;
    };
    expect((await active("developpe-epaules-machine")).repRange).toEqual({ min: 8, max: 12 });
    expect((await active("chest-press")).repRange).toEqual({ min: 6, max: 10 });
    expect((await active("developpe-incline-halteres")).workSets).toBe(2);
    expect((await active("tirage-vertical")).repRange).toEqual({ min: 10, max: 12 });
    expect((await active("traction-assistee")).repRange).toEqual({ min: 1, max: 5 });
  });

  it("calendrier : 3 cardios sur tapis, routine légère tous les soirs, vélos et routines V4 archivés", async () => {
    const before = ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V5_FIRST_DAY);
    await activateV5();
    expect((await program()).days.map((day) => day.sessionTemplateId ?? null)).toEqual(["v2-muscu-a", "v2-cardio-a", "v2-muscu-b", "v2-cardio-b", "v2-muscu-c", "v2-cardio-c", null]);
    expect(Object.values((await program()).eveningByWeekday ?? {})).toEqual(Array(7).fill(ROUTINE_DOS_LEGERE_ID));
    expect((await program()).optionalByWeekday).toBeUndefined();

    for (const id of ["v2-cardio-a", "v2-cardio-b", "v2-cardio-c", ROUTINE_DOS_ID, ROUTINE_DOS_LEGERE_ID]) expect((await template(id)).status, id).toBe("active");
    for (const id of ["v4-velo-endurance", "v4-velo-cotes", "v4-recuperation", "v4-routine-a", "v4-routine-b", "v4-routine-c"]) expect((await template(id)).status, id).toBe("archived");
    expect(await blockIds("v2-cardio-a")).toEqual(["v2-cardio-a-tapis", "v5-cardio-a-montee", "v5-cardio-a-chaise"]);
    expect(await db.exercises.get(PONT_FESSIER_ID)).toBeDefined();

    const sessions = await planned();
    expect(at(sessions, "2026-11-08", "day")).toBe("v2-muscu-a");
    expect(at(sessions, "2026-11-08", "evening")).toBe(ROUTINE_DOS_LEGERE_ID);
    expect(at(sessions, "2026-11-09", "day")).toBe("v2-cardio-a");
    expect(at(sessions, "2026-11-11", "day")).toBe("v2-cardio-b");
    expect(at(sessions, "2026-11-13", "day")).toBe("v2-cardio-c");
    expect(at(sessions, "2026-11-14", "evening")).toBe(ROUTINE_DOS_LEGERE_ID);
    /* Semaines suivantes déjà générées en V4 : complétées (vendredi, soirs du vendredi et du samedi). */
    expect(at(sessions, "2026-11-20", "day")).toBe("v2-cardio-c");
    expect(at(sessions, "2026-11-21", "evening")).toBe(ROUTINE_DOS_LEGERE_ID);
    expect(at(sessions, "2026-11-16", "day")).toBe("v2-cardio-a");
    expectNoDuplicates(await db.plannedSessions.toArray() as PlannedSession[]);

    /* Rien avant l'activation ne change. */
    expect(((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V5_FIRST_DAY)).toEqual(before);

    /* Test cardio : il prend la place des intervalles du mercredi. */
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "cardio")?.insteadOfTemplateId).toBe("v2-cardio-b");
  });

  it("le soir du 07/11 : tout bascule, rien n'est prévu le 07/11, le calendrier V5 commence le 08/11", async () => {
    const before = ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V5_FIRST_DAY);
    await activateV5(TONIGHT);
    expect((await install())?.calendrierV5).toBe(TONIGHT);
    expect(await blockIds("v2-muscu-c")).not.toContain("v2-muscu-c-tapis-incline");
    const sessions = await planned();
    expect(at(sessions, "2026-11-07", "evening")).toBeUndefined();
    expect(at(sessions, "2026-11-08", "day")).toBe("v2-muscu-a");
    expect(at(sessions, "2026-11-09", "day")).toBe("v2-cardio-a");
    expect(at(sessions, "2026-11-11", "day")).toBe("v2-cardio-b");
    expect(at(sessions, "2026-11-12", "day")).toBe("v2-muscu-c");
    expect(at(sessions, "2026-11-13", "day")).toBe("v2-cardio-c");
    expect(at(sessions, "2026-11-08", "evening")).toBe(ROUTINE_DOS_LEGERE_ID);
    expect(at(sessions, "2026-11-14", "evening")).toBe(ROUTINE_DOS_LEGERE_ID);
    expect(((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V5_FIRST_DAY)).toEqual(before);
    expectNoDuplicates((await db.plannedSessions.toArray()) as PlannedSession[]);
  });

  it("une seule fois : relancer ne change rien", async () => {
    await activateV5();
    const templates = await db.sessionTemplates.toArray();
    const sessions = await db.plannedSessions.toArray();
    await activateV5("2026-11-09T07:00:00.000Z");
    expect(await db.sessionTemplates.toArray()).toEqual(templates);
    expect(await db.plannedSessions.toArray()).toEqual(sessions);
  });

  it("à partir du 22/11 : routine complète du dimanche au vendredi, légère le samedi", async () => {
    await activateV5();
    await seedRoutineDosComplete20261122("2026-11-21T20:00:00.000Z");
    expect((await install())?.routineDosComplete20261122).toBeUndefined();
    await seedRoutineDosComplete20261122(COMPLETE);
    const evening = (await program()).eveningByWeekday ?? {};
    expect(evening.sunday).toBe(ROUTINE_DOS_ID);
    expect(evening.friday).toBe(ROUTINE_DOS_ID);
    expect(evening.saturday).toBe(ROUTINE_DOS_LEGERE_ID);
    const sessions = await planned();
    expect(at(sessions, "2026-11-21", "evening")).toBe(ROUTINE_DOS_LEGERE_ID);
    expect(at(sessions, "2026-11-22", "evening")).toBe(ROUTINE_DOS_ID);
    expect(at(sessions, "2026-11-28", "evening")).toBe(ROUTINE_DOS_LEGERE_ID);
  });
});

describe("programme V5 — routine dos : la cible change au plus une fois par semaine", () => {
  const routine = (date: string, reps: number, target: number): WorkoutSession =>
    ({
      id: `w-${date}`,
      status: "completed",
      date,
      startedAt: `${date}T18:00:00.000Z`,
      blocks: [
        {
          id: `b-${date}`,
          kind: "exercise",
          position: 0,
          exerciseId: "dead-bug",
          status: "performed",
          sourceBlockId: `${ROUTINE_DOS_LEGERE_ID}-dead-bug`,
          dayTarget: { computedAt: `${date}T18:00:00.000Z`, kind: "progress", rpeMax: 7, routine: true, sets: [{ reps: target }], reason: "" },
          series: [{ id: `s-${date}`, position: 0, status: "completed", reps, rpe: 6 }],
        },
      ],
    }) as unknown as WorkoutSession;
  const context = (completed: WorkoutSession[]): DayTargetContext => ({ tracks: [], specs: [], completed, exerciseById: new Map() });

  it("première séance : la consigne de départ (6)", () => {
    expect(routineDayTarget(`${ROUTINE_DOS_LEGERE_ID}-dead-bug`, "2026-11-08", context([]), ACTIVATION)?.sets).toEqual([{ reps: 6 }]);
  });

  it("même semaine : la cible de la semaine reste, même réussie", () => {
    const target = routineDayTarget(`${ROUTINE_DOS_LEGERE_ID}-dead-bug`, "2026-11-10", context([routine("2026-11-08", 6, 6), routine("2026-11-09", 6, 6)]), ACTIVATION);
    expect(target?.sets).toEqual([{ reps: 6 }]);
    expect(target?.kind).toBe("consolidate");
  });

  it("semaine suivante : +1 répétition si la dernière séance était réussie", () => {
    const target = routineDayTarget(`${ROUTINE_DOS_ID}-dead-bug`, "2026-11-15", context([routine("2026-11-13", 6, 6)]), ACTIVATION);
    expect(target?.sets).toEqual([{ reps: 7 }, { reps: 7 }, { reps: 7 }]);
  });
});

/** La vraie sauvegarde (chemin dans COACH_JM_BACKUP) : la V5 se pose sans échec, l'historique ne bouge pas. */
describe("programme V5 — sauvegarde réelle", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it.skipIf(!process.env.COACH_JM_BACKUP)("la V5 se pose sur la sauvegarde, séances faites intactes", async () => {
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(await readFile(process.env.COACH_JM_BACKUP!, "utf8")), db);
    const workouts = await db.workouts.toArray();
    const before = ((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V5_FIRST_DAY);
    resumeSeedsForTests();
    const steps = SEEDS.map((seed) =>
      seed.name === "programmeMuscuV5" ? { ...seed, run: () => seedProgramMuscuV5(TONIGHT) } : seed.name === "routinesV5" ? { ...seed, run: () => seedRoutinesV5(TONIGHT) } : seed.name === "calendrierV5" ? { ...seed, run: () => seedCalendrierV5(TONIGHT) } : seed,
    );
    const report = await runSeeds(steps);
    expect(report.failed).toEqual([]);
    const markers = await install();
    expect(markers?.programmeMuscuV5).toBeDefined();
    expect(markers?.calendrierV5).toBeDefined();
    expect(await blockIds("v2-muscu-b")).toContain("v2-muscu-b-developpe-epaules");
    expect((await blockIds("v2-muscu-b"))[2]).toBe("v2-muscu-b-developpe-epaules");
    /* Seule exception : le seed 59 corrige la Muscu B du 10/11 si la sauvegarde la contient dans l'état constaté. */
    const after = await db.workouts.toArray();
    expect(after).toEqual(workouts.map((workout) => fixDeveloppeEpaules20261110(workout, after.find((item) => item.id === workout.id)?.updatedAt ?? "") ?? workout));
    expect(((await db.plannedSessions.toArray()) as PlannedSession[]).filter((session) => session.date < PROGRAM_V5_FIRST_DAY)).toEqual(before);
    expectNoDuplicates((await db.plannedSessions.toArray()) as PlannedSession[]);
    const sessions = await planned();
    expect(at(sessions, "2026-11-08", "day")).toBe("v2-muscu-a");
    expect(at(sessions, "2026-11-13", "day")).toBe("v2-cardio-c");
    const tracks = (await db.settings.get("progressionTracks"))?.value as Array<{ id: string; session: string; closedAt?: string }>;
    expect(tracks.find((track) => track.id === "v2-muscu-c-tirage-vertical")?.session).toBe("A");
    expect(tracks.find((track) => track.id === "v2-muscu-a-curl-poulie")?.closedAt).toBeDefined();
  }, 120000);
});
