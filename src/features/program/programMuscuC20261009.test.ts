import "fake-indexeddb/auto";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { ExerciseBlock, GroupBlock, InstallMarkers, SessionBlock, SessionTemplate, WorkoutSession } from "../../domain";
import { resetAndRestore } from "../backup/resetAndRestore";
import { parseBackup } from "../backup/restoreBackup";
import { V6_NEGATIVES_BLOCK_ID, v6State } from "../goals/tractionV6";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { PROGRAM_V1_ROUTINES, ROUTINE_A_20261009 } from "./programV1";
import { ECARTE_NOTE, MUSCU_C_BLOCKS_BEFORE_20261009, NEGATIVES_NOTE, PROGRAM_V2_TEMPLATES, TAPIS_INCLINE_NOTE } from "./programV2";
import { ROUTINE_A_BLOCKS_BEFORE_20261009, seedProgramMuscuC20261009, toMuscuC20261009 } from "./seedProgramMuscuC20261009";

/**
 * Muscu C du 09/10/2026 (seed 39) : haut du corps — écarté à la poulie et
 * élévations latérales, 20 min de tapis incliné réglé sur les bpm à la place
 * des sprints ; step et « Rester bas » dans la Routine A du soir. Le pari V6
 * (négatives, allègements), les cardios, les autres séances et
 * l'historique ne bougent pas.
 */

const NOW = "2026-10-10T08:00:00.000Z";
const muscuC = () => PROGRAM_V2_TEMPLATES.find((item) => item.id === "v2-muscu-c") as SessionTemplate;
const order = (item: Pick<SessionTemplate, "blocks">) => [...item.blocks].sort((a, b) => a.position - b.position).map((entry) => entry.id);
const exerciseOf = (item: Pick<SessionTemplate, "blocks">, id: string) => item.blocks.find((entry) => entry.id === id) as ExerciseBlock;
const withoutPosition = (entry: object) => {
  const copy = { ...entry } as Record<string, unknown>;
  delete copy.position;
  return copy;
};

describe("définitions", () => {
  it("Muscu C : échauffement, négatives (V6), suspension, tirage, écarté, élévations, face pull, curl marteau, triceps, tapis incliné ; plus de sprints, de montée ni de circuit", () => {
    expect(order(muscuC())).toEqual([
      "v2-muscu-c-echauffement", "v2-muscu-c-negatives", "v2-muscu-c-suspension", "v2-muscu-c-tirage-vertical", "v2-muscu-c-ecarte",
      "v2-muscu-c-elevations", "v2-muscu-c-face-pull", "v2-muscu-c-curl-marteau", "v2-muscu-c-triceps-tete", "v2-muscu-c-tapis-incline",
    ]);
    expect(muscuC().blocks.some((entry) => entry.kind === "group")).toBe(false);
    expect(muscuC().blocks.some((entry) => entry.kind === "exercise" && ["sprint-velo", "montee-banc"].includes(entry.exerciseId))).toBe(false);
    expect([muscuC().name, muscuC().subtitle]).toEqual(["Muscu C — Haut du corps + tapis", "Haut du corps + tapis"]);
    expect(exerciseOf(muscuC(), "v2-muscu-c-ecarte")).toMatchObject({ exerciseId: "ecarte-poulie", notes: ECARTE_NOTE, instructions: { shape: "reps", sets: 3, reps: { min: 12, max: 15 }, restBetweenSetsSec: 90 } });
    expect(exerciseOf(muscuC(), "v2-muscu-c-elevations")).toMatchObject({ exerciseId: "elevations-laterales-halteres", instructions: { sets: 3, reps: { min: 12, max: 15 }, restBetweenSetsSec: 90 } });
  });

  it("tapis incliné : 3 min de montée, 14 min de travail, 3 min de retour (20 min) ; la consigne vise 115-125 bpm, pente ajustée", () => {
    const tapis = exerciseOf(muscuC(), "v2-muscu-c-tapis-incline");
    expect(tapis.exerciseId).toBe("tapis");
    expect(tapis.role).toBeUndefined();
    expect(tapis.instructions).toEqual({
      shape: "steps",
      steps: [
        { id: "v2-muscu-c-tapis-incline-montee", position: 0, durationSec: 180, speedKmh: 5, inclinePercent: { min: 3, max: 6 } },
        { id: "v2-muscu-c-tapis-incline-travail", position: 1, durationSec: 840, speedKmh: 5, inclinePercent: { min: 6, max: 10 } },
        { id: "v2-muscu-c-tapis-incline-retour", position: 2, durationSec: 180, speedKmh: 4.5, inclinePercent: { min: 0, max: 2 } },
      ],
    });
    expect(tapis.notes).toBe(TAPIS_INCLINE_NOTE);
    expect(TAPIS_INCLINE_NOTE).toContain("115-125 bpm");
  });

  it("pari V6 : la brique des négatives inchangée (2 × 2, 2 min 30, juste après l'échauffement)", () => {
    expect(exerciseOf(muscuC(), V6_NEGATIVES_BLOCK_ID)).toMatchObject({
      position: 1, exerciseId: "traction-negative", notes: NEGATIVES_NOTE, instructions: { shape: "reps", sets: 2, reps: { min: 2, max: 2 }, restBetweenSetsSec: 150 },
    });
  });

  it("Routine A : planche, dead bug, montée 3 × 8-10 par jambe, « Rester bas » 3 tours, puis les étirements ; le contenu d'origine (seed 13) est gardé à part", () => {
    expect(order(ROUTINE_A_20261009)).toEqual([
      "v1-routine-a-planche", "v1-routine-a-dead-bug", "v1-routine-a-montee", "v1-routine-a-rester-bas",
      "v1-routine-a-flechisseurs", "v1-routine-a-ischios", "v1-routine-a-enfant",
    ]);
    expect(exerciseOf(ROUTINE_A_20261009, "v1-routine-a-montee")).toMatchObject({ exerciseId: "montee-banc", instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 60 } });
    const group = ROUTINE_A_20261009.blocks.find((entry) => entry.kind === "group") as GroupBlock;
    expect(group).toMatchObject({ name: "Rester bas", rounds: 3, restBetweenRoundsSec: 90 });
    expect(group.children.map((child) => child.exerciseId)).toEqual(["chaise-60", "marche-laterale-elastique", "mollets-debout"]);
    expect(ROUTINE_A_20261009.description).toBe("~25 min.");
    expect(order(PROGRAM_V1_ROUTINES.find((item) => item.id === "v1-routine-a")!)).toEqual([...ROUTINE_A_BLOCKS_BEFORE_20261009]);
  });
});

/* -------------------------------------------------------------------------- */
/* Seed 39                                                                    */
/* -------------------------------------------------------------------------- */

/** Muscu C telle que le seed 38 l'a laissée (05/10/2026). */
function muscuCBefore(current: SessionTemplate): SessionTemplate {
  const legacy: SessionBlock[] = [
    { id: "v2-muscu-c-sprints", kind: "exercise", position: 3, exerciseId: "sprint-velo", instructions: { shape: "duration", sets: 6, durationSec: 12, restBetweenSetsSec: 48 }, notes: "Première séance : étalonne la résistance." },
    { id: "v2-muscu-c-montee-banc", kind: "exercise", position: 4, exerciseId: "montee-banc", instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 8 }, restBetweenSetsSec: 60 }, notes: "8 par jambe." },
    {
      id: "v2-muscu-c-rester-bas", kind: "group", position: 5, name: "Rester bas", rounds: 3, restBetweenRoundsSec: 90,
      children: [{ id: "v2-muscu-c-chaise", position: 0, exerciseId: "chaise-60", instructions: { shape: "duration", durationSec: { min: 30, max: 45 } } }],
    },
  ];
  const places: Record<string, number> = { "v2-muscu-c-echauffement": 0, "v2-muscu-c-negatives": 1, "v2-muscu-c-suspension": 2, "v2-muscu-c-tirage-vertical": 6, "v2-muscu-c-face-pull": 7, "v2-muscu-c-curl-marteau": 8, "v2-muscu-c-triceps-tete": 9 };
  const kept = current.blocks.filter((entry) => places[entry.id] !== undefined).map((entry) => ({ ...entry, position: places[entry.id]! }));
  return { ...current, name: "Muscu C — Jambes padel + rappel haut", subtitle: "Jambes padel + rappel haut", tags: ["Jambes", "Padel"], description: "Environ 70 min.", blocks: [...kept, ...legacy] };
}

describe("seed 39", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  async function installBefore() {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "programmeMuscuC20261009"));
    await db.sessionTemplates.put(muscuCBefore((await db.sessionTemplates.get("v2-muscu-c"))!));
    const upper = (await db.goals.where("key").equals("upper_body").first())!;
    await db.goals.put({ ...upper, linkedExercises: upper.linkedExercises.filter((link) => link.exerciseId !== "ecarte-poulie") });
  }

  it("base d'avant : Muscu C et Routine A selon le programme (contenu existant gardé), nom et sous-titre suivis ; cadre de l'écarté et objectif Haut du corps ; tout le reste intact ; second passage : rien", async () => {
    await installBefore();
    expect(order((await db.sessionTemplates.get("v2-muscu-c"))!).sort()).toEqual([...MUSCU_C_BLOCKS_BEFORE_20261009].sort());
    expect(order((await db.sessionTemplates.get("v1-routine-a"))!)).toEqual([...ROUTINE_A_BLOCKS_BEFORE_20261009]);
    const tirageBefore = exerciseOf((await db.sessionTemplates.get("v2-muscu-c"))!, "v2-muscu-c-tirage-vertical");
    const done = { id: "w-done", date: "2026-10-09", status: "completed", sessionTemplateId: "v2-muscu-c", blocks: [] } as unknown as WorkoutSession;
    const started = { id: "w-started", date: "2026-10-10", status: "in_progress", sessionTemplateId: "v2-muscu-c", blocks: [{ id: "x", kind: "exercise", exerciseId: "sprint-velo" }] } as unknown as WorkoutSession;
    await db.workouts.bulkPut([done, started]);
    const others = (await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-c", "v1-routine-a"].includes(item.id));
    const workouts = await db.workouts.toArray();
    const planned = await db.plannedSessions.toArray();
    const versions = await db.strengthFrameVersions.toArray();
    const goals = (await db.goals.toArray()).filter((goal) => goal.key !== "upper_body");
    expect(await db.strengthFrames.where("exerciseId").equals("ecarte-poulie").first()).toBeUndefined();

    await seedProgramMuscuC20261009(NOW);

    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    expect(order(c)).toEqual(order(muscuC()));
    expect([c.name, c.subtitle, c.tags, c.description]).toEqual([muscuC().name, muscuC().subtitle, muscuC().tags, muscuC().description]);
    expect(exerciseOf(c, "v2-muscu-c-tirage-vertical")).toEqual({ ...tirageBefore, position: 3 });
    for (const id of ["v2-muscu-c-ecarte", "v2-muscu-c-elevations", "v2-muscu-c-tapis-incline"]) expect(withoutPosition(exerciseOf(c, id)), id).toEqual(withoutPosition(exerciseOf(muscuC(), id)));
    expect([...c.blocks].map((entry) => entry.position).sort((x, y) => x - y)).toEqual(c.blocks.map((_, index) => index));

    const a = (await db.sessionTemplates.get("v1-routine-a"))!;
    expect(order(a)).toEqual(order(ROUTINE_A_20261009));
    for (const entry of a.blocks) expect(withoutPosition(entry), entry.id).toEqual(withoutPosition(ROUTINE_A_20261009.blocks.find((item) => item.id === entry.id)!));
    expect(a.description).toBe("~25 min.");

    const frame = (await db.strengthFrames.where("exerciseId").equals("ecarte-poulie").first())!;
    expect(await db.strengthFrameVersions.get(frame.activeVersionId)).toMatchObject({ status: "active", workSets: 3, repRange: { min: 12, max: 15 }, rpeTarget: 8, restSec: 90, increment: { unit: "kg", value: 2.5 } });
    expect((await db.strengthFrameVersions.get(frame.activeVersionId))!.currentTarget).toBeUndefined();
    const upper = (await db.goals.where("key").equals("upper_body").first())!.linkedExercises.map((link) => link.exerciseId);
    expect(upper.slice(upper.indexOf("developpe-incline-halteres"), upper.indexOf("developpe-incline-halteres") + 2)).toEqual(["developpe-incline-halteres", "ecarte-poulie"]);

    expect((await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-c", "v1-routine-a"].includes(item.id))).toEqual(others);
    expect(await db.workouts.toArray()).toEqual(workouts);
    expect(await db.plannedSessions.toArray()).toEqual(planned);
    for (const version of versions) expect(await db.strengthFrameVersions.get(version.id), version.id).toEqual(version);
    expect((await db.goals.toArray()).filter((goal) => goal.key !== "upper_body")).toEqual(goals);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).programmeMuscuC20261009).toBe(NOW);

    /* Idempotent : marqueur retiré, rien ne change. */
    const templates = await db.sessionTemplates.toArray();
    const allVersions = await db.strengthFrameVersions.toArray();
    const allGoals = await db.goals.toArray();
    const install: InstallMarkers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete install.programmeMuscuC20261009;
    await db.settings.put({ key: "install", value: install });
    await seedProgramMuscuC20261009("2026-10-11T08:00:00.000Z");
    expect(await db.sessionTemplates.toArray()).toEqual(templates);
    expect(await db.strengthFrameVersions.toArray()).toEqual(allVersions);
    expect(await db.goals.toArray()).toEqual(allGoals);
  });

  it("modèles modifiés par l'utilisateur (Muscu C ou Routine A) : laissés tels quels", async () => {
    await installBefore();
    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    const customC = { ...c, blocks: c.blocks.filter((entry) => entry.id !== "v2-muscu-c-curl-marteau") };
    const a = (await db.sessionTemplates.get("v1-routine-a"))!;
    const customA = { ...a, blocks: a.blocks.filter((entry) => entry.id !== "v1-routine-a-enfant") };
    await db.sessionTemplates.bulkPut([customC, customA]);
    await seedProgramMuscuC20261009(NOW);
    expect(await db.sessionTemplates.get("v2-muscu-c")).toEqual(customC);
    expect(await db.sessionTemplates.get("v1-routine-a")).toEqual(customA);
    expect(toMuscuC20261009(customC, NOW)).toBeUndefined();
  });

  it("installation neuve : Muscu C et Routine A du programme, cadre de l'écarté créé", async () => {
    const report = await runSeeds();
    expect(report.failed).toEqual([]);
    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    expect(order(c)).toEqual(order(muscuC()));
    expect(c.name).toBe(muscuC().name);
    expect(order((await db.sessionTemplates.get("v1-routine-a"))!)).toEqual(order(ROUTINE_A_20261009));
    expect(await db.strengthFrames.where("exerciseId").equals("ecarte-poulie").first()).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Sauvegarde réelle                                                          */
/* -------------------------------------------------------------------------- */

const REAL = process.env.COACH_JM_BACKUP ?? "C:/Users/JMA/Downloads/coach-jm-sauvegarde-2026-10-09-2353.json";
const realPath = existsSync(REAL) ? REAL : undefined;

describe("sauvegarde réelle", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  it.skipIf(!realPath)("seed 39 sur la base réelle : Muscu C et Routine A du programme ; séances, jalons, autres modèles, cadres existants et pari V6 intacts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await resetAndRestore(parseBackup(await readFile(realPath!, "utf8")), db);
    resumeSeedsForTests();
    await runSeeds(SEEDS.filter((seed) => seed.name !== "programmeMuscuC20261009"));
    const workouts = await db.workouts.toArray();
    const milestones = await db.strengthMilestones.toArray();
    const planned = await db.plannedSessions.toArray();
    const others = (await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-c", "v1-routine-a"].includes(item.id));
    const versions = await db.strengthFrameVersions.toArray();
    const v6Before = v6State(workouts, "2026-10-10");

    resumeSeedsForTests();
    const report = await runSeeds();
    expect(report.failed).toEqual([]);

    expect(order((await db.sessionTemplates.get("v2-muscu-c"))!)).toEqual(order(muscuC()));
    expect(order((await db.sessionTemplates.get("v1-routine-a"))!)).toEqual(order(ROUTINE_A_20261009));
    expect(await db.workouts.toArray()).toEqual(workouts);
    expect(await db.strengthMilestones.toArray()).toEqual(milestones);
    expect(await db.plannedSessions.toArray()).toEqual(planned);
    expect((await db.sessionTemplates.toArray()).filter((item) => !["v2-muscu-c", "v1-routine-a"].includes(item.id))).toEqual(others);
    for (const version of versions) expect(await db.strengthFrameVersions.get(version.id), version.id).toEqual(version);
    expect(v6State(await db.workouts.toArray(), "2026-10-10")).toEqual(v6Before);
  }, 30000);
});
