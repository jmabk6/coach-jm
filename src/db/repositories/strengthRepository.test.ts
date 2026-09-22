import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StrengthFrame, StrengthFrameVersion, StrengthMilestone } from "../../domain";
import { db } from "../database";
import {
  getActiveRpeScaleVersion,
  getAllRpeScaleVersions,
  getRpeScaleVersion,
  saveRpeScaleVersion,
} from "./rpeScaleRepository";
import {
  deleteStrengthMilestonesOfWorkout,
  getActiveStrengthFrameVersion,
  getAllStrengthFrames,
  getStrengthFrame,
  getStrengthFrameByExercise,
  getStrengthFrameVersion,
  getStrengthFrameVersions,
  getStrengthMilestonesByVersion,
  getStrengthMilestonesByWorkout,
  saveStrengthFrame,
  saveStrengthFrameVersion,
  saveStrengthMilestone,
} from "./strengthRepository";

const T = "2026-09-22T10:00:00.000Z";

function frame(id: string, exerciseId: string, activeVersionId: string): StrengthFrame {
  return { id, exerciseId, activeVersionId, createdAt: T, updatedAt: T };
}

function version(id: string, frameId: string, number: number, status: StrengthFrameVersion["status"] = "active"): StrengthFrameVersion {
  return {
    id,
    frameId,
    number,
    status,
    progressionType: "charge_croissante",
    workSets: 3,
    repRange: { min: 10, max: 12 },
    restSec: 90,
    increment: { unit: "kg", value: 2.5 },
    createdAt: T,
    updatedAt: T,
  };
}

function milestone(id: string, frameVersionId: string, workoutId: string, date: string, value: number, createdAt = T): StrengthMilestone {
  return { id, frameVersionId, workoutId, date, value, unit: "kg", createdAt };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("strengthRepository", () => {
  it("cadres : par identifiant, par exercice, tous", async () => {
    await saveStrengthFrame(frame("f-presse", "presse", "v1"));
    await saveStrengthFrame(frame("f-tirage", "tirage", "v2"));

    expect(await getStrengthFrame("f-presse")).toMatchObject({ exerciseId: "presse" });
    expect(await getStrengthFrameByExercise("tirage")).toMatchObject({ id: "f-tirage" });
    expect(await getStrengthFrameByExercise("squat")).toBeUndefined();
    expect((await getAllStrengthFrames()).map((item) => item.id).sort()).toEqual(["f-presse", "f-tirage"]);
  });

  it("versions : celles d'un cadre dans l'ordre des numéros, la version active par le cadre", async () => {
    const presse = frame("f-presse", "presse", "v3");
    await saveStrengthFrame(presse);
    await saveStrengthFrameVersion(version("v3", "f-presse", 3));
    await saveStrengthFrameVersion(version("v1", "f-presse", 1, "archived"));
    await saveStrengthFrameVersion(version("v2", "f-presse", 2, "archived"));
    await saveStrengthFrameVersion(version("autre", "f-tirage", 1));

    expect((await getStrengthFrameVersions("f-presse")).map((item) => item.number)).toEqual([1, 2, 3]);
    expect(await getStrengthFrameVersion("v2")).toMatchObject({ status: "archived" });
    expect(await getActiveStrengthFrameVersion(presse)).toMatchObject({ id: "v3", status: "active" });
    expect(await getActiveStrengthFrameVersion(frame("f-x", "x", "disparue"))).toBeUndefined();
  });

  it("jalons : par version dans l'ordre chronologique, par séance, suppression par séance", async () => {
    await saveStrengthMilestone(milestone("m2", "v1", "w-b", "2026-10-06", 37.5));
    await saveStrengthMilestone(milestone("m1", "v1", "w-a", "2026-10-01", 35));
    await saveStrengthMilestone(milestone("m3", "v1", "w-b", "2026-10-06", 40, "2026-10-06T11:00:00.000Z"));
    await saveStrengthMilestone(milestone("m9", "v9", "w-a", "2026-10-01", 20));

    expect((await getStrengthMilestonesByVersion("v1")).map((item) => item.id)).toEqual(["m1", "m2", "m3"]);
    expect((await getStrengthMilestonesByWorkout("w-a")).map((item) => item.id).sort()).toEqual(["m1", "m9"]);

    expect(await deleteStrengthMilestonesOfWorkout("w-b")).toBe(2);
    expect((await getStrengthMilestonesByVersion("v1")).map((item) => item.id)).toEqual(["m1"]);
    expect(await db.strengthMilestones.count()).toBe(2);
    expect(await deleteStrengthMilestonesOfWorkout("inconnue")).toBe(0);
  });
});

describe("rpeScaleRepository", () => {
  it("version active = la plus récente des actives ; historique dans l'ordre", async () => {
    expect(await getActiveRpeScaleVersion()).toBeUndefined();

    await saveRpeScaleVersion({ id: "v2", number: 2, status: "active", table: [], startDate: "2027-01-01", createdAt: T });
    await saveRpeScaleVersion({ id: "v1", number: 1, status: "archived", table: [], startDate: "2026-09-22", createdAt: T });

    expect(await getActiveRpeScaleVersion()).toMatchObject({ id: "v2" });
    expect((await getAllRpeScaleVersions()).map((item) => item.number)).toEqual([1, 2]);
    expect(await getRpeScaleVersion("v1")).toMatchObject({ status: "archived" });
    expect(await getRpeScaleVersion("v7")).toBeUndefined();
  });
});
