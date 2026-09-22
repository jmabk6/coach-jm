import "fake-indexeddb/auto";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise, PlannedSession, SessionTemplate, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { db } from "../../db/database";
import { saveExercise } from "../../db/repositories/exerciseRepository";
import { getPlannedSession, savePlannedSession } from "../../db/repositories/programRepository";
import { getSessionTemplate, saveSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts, getWorkout, saveWorkout } from "../../db/repositories/workoutRepository";
import { calculateSessionTemplateDuration } from "../../domain/rules/sessionTemplateRules";
import { deleteWorkout } from "./deleteWorkout";
import { findLastPerformances } from "./lastPerformance";

const T0 = "2026-09-01T10:00:00.000Z";

const squat: Exercise = {
  id: "squat",
  name: "Squat barre",
  category: "Musculation",
  zone: "Jambes",
  movement: "Squat",
  equipment: "Barre",
  location: "Salle",
  mode: "series",
  measurementType: "load_reps",
  status: "active",
  createdAt: T0,
  updatedAt: T0,
};

const template: SessionTemplate = {
  id: "muscu-a",
  name: "Muscu A",
  category: "Musculation",
  status: "active",
  position: 0,
  blocks: [
    {
      id: "sq",
      kind: "exercise",
      position: 0,
      exerciseId: "squat",
      instructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 120 },
    },
  ],
  createdAt: T0,
  updatedAt: T0,
};

const planned: PlannedSession = {
  id: "planned-10",
  date: "2026-09-10",
  sessionTemplateId: "muscu-a",
  status: "done",
  workoutId: "w-10",
  source: "manual",
  createdAt: T0,
  updatedAt: T0,
};

function workout(id: string, date: string, kg: number, extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    sessionTemplateId: "muscu-a",
    source: "free",
    status: "completed",
    date,
    startedAt: `${date}T16:00:00.000Z`,
    lastActionAt: `${date}T16:40:00.000Z`,
    completedAt: `${date}T16:40:00.000Z`,
    activeDurationSec: 2400,
    blocks: [
      {
        id: `${id}-sq`,
        kind: "exercise",
        position: 0,
        addedDuringWorkout: false,
        exerciseId: "squat",
        status: "performed",
        snapshotInstructions: template.blocks[0]!.kind === "exercise" ? template.blocks[0]!.instructions : { shape: "distance" },
        series: [
          { id: `${id}-s1`, position: 0, status: "completed", load: { kind: "total", kg }, reps: 10 },
        ],
      },
    ],
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T16:40:00.000Z`,
    ...extra,
  };
}

async function reset() {
  await Promise.all(db.tables.map((table) => table.clear()));
  await saveExercise(squat);
  await saveSessionTemplate(template);
  await savePlannedSession(planned);
  await saveWorkout(workout("w-03", "2026-09-03", 35));
  await saveWorkout(workout("w-10", "2026-09-10", 40, { source: "planned", plannedSessionId: "planned-10" }));
  await saveWorkout(workout("w-17", "2026-09-17", 45));
}

afterAll(() => db.close());

describe("deleteWorkout", () => {
  beforeEach(reset);

  it("supprime la séance seule : le modèle et les autres séances restent, les calculs se refont sur le reste", async () => {
    expect(findLastPerformances(await getCompletedWorkouts()).get("squat")?.series).toMatchObject({
      load: { kind: "total", kg: 45 },
    });

    const result = await deleteWorkout("w-17", "2026-09-18T08:00:00.000Z");

    expect(result).toEqual({ deletedId: "w-17", removedMilestones: 0, unfrozenVersionIds: [] });
    expect(await getWorkout("w-17")).toBeUndefined();
    expect((await getCompletedWorkouts()).map((item) => item.id).sort()).toEqual(["w-03", "w-10"]);
    expect(await getSessionTemplate("muscu-a")).toEqual(template);

    /* Dernière fois et durée moyenne repartent des réalisations restantes. */
    const remaining = await getCompletedWorkouts();
    expect(findLastPerformances(remaining).get("squat")).toMatchObject({
      workoutId: "w-10",
      series: { load: { kind: "total", kg: 40 } },
    });
    expect(calculateSessionTemplateDuration(template, remaining)).toEqual({
      kind: "estimated",
      minutes: expect.any(Number),
    });
  });

  it("remet l'instance planifiée À venir quand aucune autre réalisation ne lui est rattachée", async () => {
    const result = await deleteWorkout("w-10", "2026-09-18T08:00:00.000Z");

    expect(result.plannedSession).toMatchObject({ id: "planned-10", status: "upcoming" });
    expect(result.plannedSession?.workoutId).toBeUndefined();
    expect(await getPlannedSession("planned-10")).toMatchObject({ status: "upcoming" });
    expect(await getWorkout("w-03")).toBeDefined();
    expect(await getWorkout("w-17")).toBeDefined();
  });

  it("garde l'instance Faite, rattachée à la réalisation restante la plus récente, s'il y en a une autre", async () => {
    await saveWorkout(workout("w-10b", "2026-09-10", 42, {
      source: "planned",
      plannedSessionId: "planned-10",
      startedAt: "2026-09-10T18:00:00.000Z",
    }));

    const result = await deleteWorkout("w-10", "2026-09-18T08:00:00.000Z");

    expect(result.plannedSession).toMatchObject({ status: "done", workoutId: "w-10b" });
    expect(await getPlannedSession("planned-10")).toMatchObject({ status: "done", workoutId: "w-10b" });
    expect(await getWorkout("w-10b")).toBeDefined();
  });

  it("refuse une séance en cours ou introuvable, sans rien supprimer", async () => {
    await saveWorkout(workout("w-run", "2026-09-18", 50, { status: "in_progress" }));

    await expect(deleteWorkout("w-run")).rejects.toThrow(/en cours/);
    await expect(deleteWorkout("w-nope")).rejects.toThrow(/introuvable/);
    expect((await db.workouts.count())).toBe(4);
  });

  it("ne touche à rien tant que la suppression n'est pas confirmée", async () => {
    /* L'écran n'appelle deleteWorkout qu'au geste « Supprimer définitivement » :
       sans cet appel, la base est intacte. */
    expect((await db.workouts.count())).toBe(3);
    expect(await getPlannedSession("planned-10")).toMatchObject({ status: "done", workoutId: "w-10" });
  });
});

/* -------------------------------------------------------------------------- */
/* Cadres : jalons et figeage suivent la séance (v1.6, décision 11)           */
/* -------------------------------------------------------------------------- */

function frameVersion(overrides: Partial<StrengthFrameVersion> = {}): StrengthFrameVersion {
  return {
    id: "v1",
    frameId: "f-squat",
    number: 1,
    status: "active",
    progressionType: "charge_croissante",
    workSets: 1,
    repRange: { min: 8, max: 10 },
    rpeTarget: 8,
    restSec: 120,
    increment: { unit: "kg", value: 2.5 },
    firstOfficialWorkoutId: "w-03",
    frozenAt: "2026-09-03T16:40:00.000Z",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** Une séance dont la brique porte la version `v1`. */
function framedWorkout(id: string, date: string, kg: number): WorkoutSession {
  const base = workout(id, date, kg);
  const block = base.blocks[0]!;
  if (block.kind === "exercise") block.frameVersionId = "v1";
  return base;
}

function milestone(id: string, workoutId: string, date: string, value: number) {
  return { id, frameVersionId: "v1", workoutId, date, value, unit: "kg" as const, createdAt: `${date}T16:40:00.000Z` };
}

describe("deleteWorkout — jalons et figeage", () => {
  beforeEach(async () => {
    await reset();
    await db.strengthFrames.put({ id: "f-squat", exerciseId: "squat", activeVersionId: "v1", createdAt: T0, updatedAt: T0 });
    await db.strengthFrameVersions.put(frameVersion());
    await saveWorkout(framedWorkout("w-03", "2026-09-03", 35));
    await saveWorkout(framedWorkout("w-17", "2026-09-17", 45));
    await db.strengthMilestones.bulkPut([
      milestone("m-03", "w-03", "2026-09-03", 35),
      milestone("m-17", "w-17", "2026-09-17", 45),
    ]);
  });

  afterEach(() => vi.restoreAllMocks());

  it("retire les jalons de la séance ; la version reste figée tant qu'une autre séance la référence, la référence est reprise", async () => {
    const result = await deleteWorkout("w-03", "2026-09-20T10:00:00.000Z");

    expect(result).toMatchObject({ deletedId: "w-03", removedMilestones: 1, unfrozenVersionIds: [] });
    expect((await db.strengthMilestones.toArray()).map((m) => m.id)).toEqual(["m-17"]);
    expect(await db.strengthFrameVersions.get("v1")).toMatchObject({
      firstOfficialWorkoutId: "w-17",
      frozenAt: "2026-09-03T16:40:00.000Z",
      updatedAt: "2026-09-20T10:00:00.000Z",
    });
  });

  it("dé-fige la version quand plus aucune séance terminée ne la référence", async () => {
    await deleteWorkout("w-03");
    const result = await deleteWorkout("w-17", "2026-09-20T10:00:00.000Z");

    expect(result).toMatchObject({ removedMilestones: 1, unfrozenVersionIds: ["v1"] });
    expect(await db.strengthMilestones.count()).toBe(0);
    const version = await db.strengthFrameVersions.get("v1");
    expect(version).not.toHaveProperty("firstOfficialWorkoutId");
    expect(version).not.toHaveProperty("frozenAt");
    /* Le cadre et la version existent toujours : seule la séance a disparu. */
    expect(await db.strengthFrames.get("f-squat")).toBeDefined();
    expect(version?.status).toBe("active");
  });

  it("un objectif en cours issu du jalon supprimé disparaît ; un objectif de départ reste", async () => {
    await db.strengthFrameVersions.put(
      frameVersion({ currentTarget: { value: 47.5, unit: "kg", acceptedAt: "2026-09-17T17:00:00.000Z", fromMilestoneId: "m-17" } }),
    );
    await deleteWorkout("w-17");
    expect(await db.strengthFrameVersions.get("v1")).not.toHaveProperty("currentTarget");

    await db.strengthFrameVersions.put(frameVersion({ currentTarget: { value: 40, unit: "kg", acceptedAt: T0 } }));
    await deleteWorkout("w-03");
    expect((await db.strengthFrameVersions.get("v1"))?.currentTarget).toEqual({ value: 40, unit: "kg", acceptedAt: T0 });
  });

  it("une séance sans cadre ne touche ni aux jalons ni aux versions", async () => {
    const before = await db.strengthFrameVersions.get("v1");
    const result = await deleteWorkout("w-10");

    expect(result).toMatchObject({ removedMilestones: 0, unfrozenVersionIds: [] });
    expect(await db.strengthMilestones.count()).toBe(2);
    expect(await db.strengthFrameVersions.get("v1")).toEqual(before);
  });

  it("transactionnel : si les jalons ne peuvent pas être retirés, la séance n'est pas supprimée", async () => {
    vi.spyOn(db.strengthMilestones, "where").mockImplementation(() => {
      throw new Error("index indisponible");
    });

    await expect(deleteWorkout("w-17")).rejects.toThrow("index indisponible");

    expect(await getWorkout("w-17")).toBeDefined();
    expect(await db.strengthMilestones.count()).toBe(2);
    expect(await db.strengthFrameVersions.get("v1")).toMatchObject({ firstOfficialWorkoutId: "w-03" });
  });
});
