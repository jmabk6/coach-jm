import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { ExerciseBlock, InstallMarkers, PerformedExerciseBlock, SessionTemplate, WeeklyProgram, WorkoutSession } from "../../domain";
import { nextRoutineTarget, type RoutineProgressionRule } from "../../domain/rules/routineProgressionRules";
import { calculateSessionTemplateDuration } from "../../domain/rules/sessionTemplateRules";
import { formatTargetLines } from "../perspectives/dayTargetFormat";
import { loadDayTargetContext, routineDayTarget, withDayTargets } from "../perspectives/dayTargets";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { generateProgramWeek } from "./generateProgramWeek";
import { PROGRAM_V4_START } from "./programV4";
import { ROUTINE_A_V4_ID, ROUTINE_B_V4_ID, ROUTINE_C_V4_ID } from "./programRoutinesV4";
import { seedCalendrierV4 } from "./seedCalendrierV4";
import { seedProgramMuscuV4 } from "./seedProgramMuscuV4";
import { seedRoutinesV4 } from "./seedRoutinesV4";
import { holdCurveOf } from "../goals/goalDetail";
import type { Goal, TestProtocolVersion } from "../../domain";

/** Lot L5 (programme V4) : routines du soir V4 et objectif du jour qui progresse. */

const ACTIVATION = `${PROGRAM_V4_START}T08:00:00.000Z`;
const marker = async () => ((await db.settings.get("install"))?.value as InstallMarkers | undefined)?.routinesV4;
const exercisesOf = (template: SessionTemplate | undefined) => (template?.blocks ?? []).filter((block): block is ExerciseBlock => block.kind === "exercise");
const ABS = new Set(["dead-bug", "planche", "planche-laterale", "pallof-elastique", "bird-dog"]);
/* Spec § 3 : ni flexion lombaire forcée, ni exercice de jambes. */
const FORBIDDEN = ["crunch-inverse", "mobilite-chat-vache", "import-position-enfant", "import-rotation-dos-allonge", "montee-banc", "chaise-60", "marche-laterale-elastique", "mollets-debout"];

describe("règle de progression des routines", () => {
  const rule: RoutineProgressionRule = { measure: "reps", step: 1, max: 12, rpeMax: 7 };
  const set = (reps: number, rpe?: number) => ({ kg: 0, reps, ...(rpe !== undefined ? { rpe } : {}) });
  const last = (done: ReturnType<typeof set>[], extra: Partial<{ target: number; sets: number; pain: boolean }> = {}) => ({ workoutId: "w", target: 8, sets: 3, done, pain: false, ...extra });
  const next = (input: ReturnType<typeof last> | undefined, sets = 3) => nextRoutineTarget({ rule, sets, start: 8, last: input, now: "n" });

  it("première séance : la consigne de départ", () => {
    expect(next(undefined)).toMatchObject({ kind: "progress", sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }], routine: true });
  });
  it("toutes les séries réussies à RPE ≤ 7 : un cran de plus ; nombre de séries du jour", () => {
    expect(next(last([set(8, 6), set(8, 7), set(9, 7)]), 2)).toMatchObject({ kind: "progress", sets: [{ reps: 9 }, { reps: 9 }] });
  });
  it("sinon la cible reste : série manquée, RPE au-dessus ou absent, séance incomplète, douleur", () => {
    expect(next(last([set(8, 6), set(7, 6), set(8, 6)])).sets[0]).toEqual({ reps: 8 });
    expect(next(last([set(8, 6), set(8, 8), set(8, 6)])).sets[0]).toEqual({ reps: 8 });
    expect(next(last([set(8), set(8, 6), set(8, 6)])).sets[0]).toEqual({ reps: 8 });
    expect(next(last([set(8, 6), set(8, 6)])).sets[0]).toEqual({ reps: 8 });
    expect(next(last([set(8, 6), set(8, 6), set(8, 6)], { pain: true }))).toMatchObject({ kind: "consolidate", sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] });
  });
  it("plafond atteint : on y reste ; en durée, +5 s", () => {
    expect(next(last([set(12, 6), set(12, 6), set(12, 6)], { target: 12 }))).toMatchObject({ kind: "repeat", sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }] });
    const plank = nextRoutineTarget({ rule: { measure: "duration", step: 5, max: 60, rpeMax: 7 }, sets: 3, start: 30, last: { workoutId: "w", target: 30, sets: 3, done: [0, 1, 2].map(() => ({ kg: 0, reps: 0, durationSec: 30, rpe: 6 })), pain: false }, now: "n" });
    expect(plank.sets).toEqual([{ durationSec: 35 }, { durationSec: 35 }, { durationSec: 35 }]);
  });
  it("affichage : « 3 × 9 répétitions par côté », « 35 s / 35 s par côté »", () => {
    expect(formatTargetLines({ sets: [{ reps: 9 }, { reps: 9 }, { reps: 9 }] }, false, true)).toEqual(["3 × 9 répétitions par côté"]);
    expect(formatTargetLines({ sets: [{ durationSec: 35 }, { durationSec: 35 }] }, false, true)).toEqual(["35 s / 35 s par côté"]);
  });
});

describe("programme V4 — routines du soir", () => {
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

  it("avant le dimanche d'activation : rien ne change, aucun marqueur", async () => {
    await seedRoutinesV4("2026-11-28T10:00:00.000Z");
    expect(await db.sessionTemplates.get(ROUTINE_A_V4_ID)).toBeUndefined();
    expect((await db.sessionTemplates.get("v1-routine-a"))?.status).toBe("active");
    expect(await marker()).toBeUndefined();
  });

  it("contenu conforme (§ 3, Routine C allégée) : 32 séries d'abdos par semaine, ni flexion lombaire ni jambes ; anciennes routines archivées", async () => {
    await seedRoutinesV4(ACTIVATION);
    const [a, b, c] = await db.sessionTemplates.bulkGet([ROUTINE_A_V4_ID, ROUTINE_B_V4_ID, ROUTINE_C_V4_ID]);
    expect(exercisesOf(a).map((block) => [block.exerciseId, block.instructions.shape === "reps" || block.instructions.shape === "duration" ? block.instructions.sets : 0])).toEqual([
      ["dead-bug", 3], ["planche", 3], ["planche-laterale", 3], ["pallof-elastique", 3], ["bird-dog", 2], ["mobilite-flechisseur-hanche", 2],
    ]);
    expect(exercisesOf(b).map((block) => block.exerciseId)).toEqual([
      "mobilite-flechisseur-hanche", "ischio-sangle", "hanches-90-90", "rotation-thoracique-allongee", "mobilite-ouverture-epaules-mur", "glisses-mur", "extension-haut-dos", "papillon-assis",
    ]);
    expect(exercisesOf(c).map((block) => block.exerciseId)).toEqual(["dead-bug", "planche-laterale", "ischio-sangle", "mobilite-flechisseur-hanche", "rotation-thoracique-allongee"]);
    const absSets = (template: SessionTemplate | undefined) =>
      exercisesOf(template).filter((block) => ABS.has(block.exerciseId)).reduce((sum, block) => sum + ("sets" in block.instructions ? block.instructions.sets : 0), 0);
    expect([absSets(a), absSets(c)]).toEqual([14, 4]);
    expect(absSets(a) * 2 + absSets(c)).toBe(32);
    for (const template of [a, b, c]) for (const block of exercisesOf(template)) expect(FORBIDDEN).not.toContain(block.exerciseId);
    expect([a, b, c].map((template) => calculateSessionTemplateDuration(template!, []).minutes)).toEqual([25, 25, 21]);
    for (const id of ["v1-routine-a", "v1-routine-b", "v1-routine-c"]) expect((await db.sessionTemplates.get(id))?.status).toBe("archived");
    for (const id of ["pallof-elastique", "ischio-sangle", "hanches-90-90", "glisses-mur", "extension-haut-dos"]) expect(await db.exercises.get(id)).toBeDefined();
    expect(await marker()).toBe(ACTIVATION);
  });

  it("calendrier : chaque soir sa routine V4 (A dimanche et mercredi, B lundi et jeudi, C mardi), rien vendredi et samedi", async () => {
    await seedProgramMuscuV4(ACTIVATION);
    await seedRoutinesV4(ACTIVATION);
    await seedCalendrierV4(ACTIVATION);
    expect(((await db.weeklyPrograms.toArray())[0] as WeeklyProgram).eveningByWeekday).toEqual({
      sunday: ROUTINE_A_V4_ID, monday: ROUTINE_B_V4_ID, tuesday: ROUTINE_C_V4_ID, wednesday: ROUTINE_A_V4_ID, thursday: ROUTINE_B_V4_ID,
    });
    await generateProgramWeek("2026-12-06", ACTIVATION);
    const evenings = (await db.plannedSessions.where("date").between("2026-12-06", "2026-12-12", true, true).toArray()).filter((session) => session.slot === "evening");
    expect(evenings.map((session) => [session.date, session.sessionTemplateId])).toEqual([
      ["2026-12-06", ROUTINE_A_V4_ID], ["2026-12-07", ROUTINE_B_V4_ID], ["2026-12-08", ROUTINE_C_V4_ID], ["2026-12-09", ROUTINE_A_V4_ID], ["2026-12-10", ROUTINE_B_V4_ID],
    ]);
  });

  it("objectif du jour partagé : un dead bug réussi en Routine A le dimanche fait monter celui de la Routine C du mardi", async () => {
    await seedRoutinesV4(ACTIVATION);
    const a = (await db.sessionTemplates.get(ROUTINE_A_V4_ID))!;
    const started = await startFreeWorkout("2026-11-29", "2026-11-29T20:00:00.000Z", a);
    const withTargets = withDayTargets(started, await loadDayTargetContext([]), "2026-11-29T20:00:00.000Z");
    const deadBug = withTargets.blocks.find((block) => block.kind === "exercise" && block.exerciseId === "dead-bug") as PerformedExerciseBlock;
    expect(deadBug.dayTarget).toMatchObject({ kind: "progress", sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }], routine: true });

    const done: WorkoutSession = {
      ...withTargets,
      status: "completed",
      endedAt: "2026-11-29T20:30:00.000Z",
      blocks: withTargets.blocks.map((block) =>
        block === deadBug
          ? {
              ...deadBug,
              status: "performed",
              series: (deadBug.series ?? []).map((series) => ({ ...series, status: "completed" as const, rpe: 6, sideValues: [{ side: "left" as const, reps: 8 }, { side: "right" as const, reps: 9 }] })),
            }
          : block,
      ),
    };
    const context = await loadDayTargetContext([done]);
    expect(routineDayTarget("v4-routine-c-dead-bug", "2026-12-01", context, "2026-12-01T20:00:00.000Z")).toMatchObject({ kind: "progress", sets: [{ reps: 9 }, { reps: 9 }] });
    /* Une douleur notée : la cible reste. */
    const painful: WorkoutSession = {
      ...done,
      blocks: done.blocks.map((block) => (block.kind === "exercise" && block.exerciseId === "dead-bug" ? { ...block, series: block.series!.map((series, index) => (index === 1 ? { ...series, note: "douleur bas du dos" } : series)) } : block)),
    };
    expect(routineDayTarget("v4-routine-c-dead-bug", "2026-12-01", await loadDayTargetContext([painful]), "n")).toMatchObject({ kind: "consolidate", sets: [{ reps: 8 }, { reps: 8 }] });
    /* Un exercice suspendu n'a pas d'objectif. */
    const deadBugExercise = (await db.exercises.get("dead-bug"))!;
    await db.exercises.put({ ...deadBugExercise, clearance: { status: "suspendu", since: ACTIVATION } });
    expect(routineDayTarget("v4-routine-c-dead-bug", "2026-12-01", await loadDayTargetContext([done]), "n")).toBeUndefined();
  });

  it("indicateurs : Souplesse (mains dans le dos, papillon, ischio allongé en degrés ; doigts-sol facultatif) et Tronc (planche latérale facultative) ; objectifs mis à jour", async () => {
    await seedRoutinesV4(ACTIVATION);
    const version = async (protocolId: string) => (await db.testProtocolVersions.get((await db.testProtocols.get(protocolId))!.activeVersionId)) as TestProtocolVersion;
    const souplesse = await version("protocol-souplesse");
    expect(souplesse.measures.map((measure) => [measure.key, measure.required, measure.side ?? false])).toEqual([
      ["apley_cm", true, true], ["papillon_cm", true, false], ["ischio_allonge_deg", true, true], ["doigts_sol_cm", false, false],
    ]);
    expect(souplesse.primaryMeasureKey).toBe("apley_cm");
    expect(souplesse.id).toBe("protocol-souplesse-v1");
    const tronc = await version("protocol-tronc");
    expect(tronc.measures.map((measure) => [measure.key, measure.required, measure.side ?? false])).toEqual([["planche_duree_s", true, false], ["planche_laterale_s", false, true]]);
    const flexibility = (await db.goals.where("key").equals("flexibility").first()) as Goal;
    expect(flexibility.segments[0]).toMatchObject({ measure: { measureKey: "apley_cm" }, direction: "decrease" });
    expect(flexibility.secondaryIndicators.map((item) => (item.kind === "test_measure" ? item.measureKey : ""))).toEqual(["ischio_allonge_deg", "papillon_cm", "doigts_sol_cm"]);
    const core = (await db.goals.where("key").equals("core").first()) as Goal;
    expect(core.linkedExercises.map((item) => item.exerciseId)).not.toContain("crunch-inverse");
    expect(core.secondaryIndicators).toEqual([{ kind: "test_measure", protocolId: "protocol-tronc", measureKey: "planche_laterale_s" }]);
  });

  it("une version déjà figée par un résultat n'est pas modifiée : la V4 crée la version suivante, l'ancienne est archivée", async () => {
    const protocol = (await db.testProtocols.get("protocol-souplesse"))!;
    const v1 = (await db.testProtocolVersions.get(protocol.activeVersionId))!;
    await db.testProtocolVersions.put({ ...v1, firstOfficialResultId: "r1", frozenAt: ACTIVATION });
    await seedRoutinesV4(ACTIVATION);
    expect((await db.testProtocols.get("protocol-souplesse"))!.activeVersionId).toBe("protocol-souplesse-v2");
    expect((await db.testProtocolVersions.get("protocol-souplesse-v1"))).toMatchObject({ status: "archived", primaryMeasureKey: "doigts_sol_cm" });
    expect((await db.testProtocolVersions.get("protocol-souplesse-v2"))?.primaryMeasureKey).toBe("apley_cm");
  });
});

describe("courbe des maintiens", () => {
  it("une valeur par séance : la série la plus faible, le côté le plus faible ; échauffements et séances non enregistrées exclus", () => {
    const series = (values: Array<number | [number, number]>) =>
      values.map((value, position) => ({
        id: `s${position}`,
        position,
        status: "completed" as const,
        ...(Array.isArray(value) ? { sideValues: [{ side: "left" as const, durationSec: value[0] }, { side: "right" as const, durationSec: value[1] }] } : { durationSec: value }),
      }));
    const workout = (id: string, date: string, status: "completed" | "in_progress", exerciseId: string, values: Array<number | [number, number]>) =>
      ({ id, date, status, blocks: [{ id: `b-${id}`, kind: "exercise", exerciseId, status: "performed", position: 0, addedDuringWorkout: false, snapshotInstructions: { shape: "duration", sets: 3, durationSec: 30, restBetweenSetsSec: 30 }, series: series(values) }] }) as unknown as WorkoutSession;
    expect(holdCurveOf("planche", [workout("w2", "2026-12-06", "completed", "planche", [35, 32, 35]), workout("w1", "2026-11-29", "completed", "planche", [30, 30, 28]), workout("w3", "2026-12-09", "in_progress", "planche", [40])])).toEqual({
      series: [{ segmentId: "planche", points: [{ date: "2026-11-29", value: 28 }, { date: "2026-12-06", value: 32 }] }],
    });
    expect(holdCurveOf("planche-laterale", [workout("w4", "2026-11-29", "completed", "planche-laterale", [[20, 18], [22, 21]])]).series[0]!.points).toEqual([{ date: "2026-11-29", value: 18 }]);
    expect(holdCurveOf("planche", [])).toEqual({ series: [] });
  });
});
