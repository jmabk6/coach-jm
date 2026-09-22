import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Exercise } from "../../domain";
import { db } from "../../db/database";
import {
  acceptRaise,
  archiveFrameVersion,
  createFrame,
  startNextVersion,
  updateFrameVersion,
  type FrameVersionInput,
} from "./frameActions";

const T0 = "2026-09-22T10:00:00.000Z";
const T1 = "2026-09-23T10:00:00.000Z";

const presse: Exercise = {
  id: "presse",
  name: "Presse à cuisses",
  category: "Musculation",
  zone: "Jambes",
  movement: "Squat",
  equipment: "Machine",
  location: "Salle",
  mode: "series",
  measurementType: "load_reps",
  status: "active",
  createdAt: T0,
  updatedAt: T0,
};

const planche: Exercise = { ...presse, id: "planche", name: "Planche", measurementType: "duration" };

const input: FrameVersionInput = {
  progressionType: "charge_croissante",
  workSets: 3,
  repRange: { min: 10, max: 12 },
  rpeTarget: 8,
  restSec: 90,
  increment: { unit: "kg", value: 2.5 },
};

let counter = 0;
const newId = () => `id${++counter}`;

beforeEach(async () => {
  counter = 0;
  await db.delete();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("createFrame", () => {
  it("crée le cadre et sa V1 ; la charge de départ confirmée devient l'objectif en cours", async () => {
    const { frame, version } = await createFrame(presse, { ...input, barWeightKg: 20 }, { value: 100, unit: "kg" }, T0, newId);

    expect(frame).toEqual({ id: "frame-id1", exerciseId: "presse", activeVersionId: "frame-id1-v1", createdAt: T0, updatedAt: T0 });
    expect(version).toEqual({
      id: "frame-id1-v1",
      frameId: "frame-id1",
      number: 1,
      status: "active",
      progressionType: "charge_croissante",
      workSets: 3,
      repRange: { min: 10, max: 12 },
      rpeTarget: 8,
      restSec: 90,
      increment: { unit: "kg", value: 2.5 },
      barWeightKg: 20,
      currentTarget: { value: 100, unit: "kg", acceptedAt: T0 },
      createdAt: T0,
      updatedAt: T0,
    });
    expect(await db.strengthFrames.count()).toBe(1);
    expect(await db.strengthFrameVersions.count()).toBe(1);
    expect(await db.strengthMilestones.count()).toBe(0);
  });

  it("sans confirmation : aucun objectif ; un second cadre pour le même exercice est refusé", async () => {
    const { version } = await createFrame(presse, input, undefined, T0, newId);
    expect(version).not.toHaveProperty("currentTarget");
    expect(version).not.toHaveProperty("barWeightKg");

    await expect(createFrame(presse, input, undefined, T0, newId)).rejects.toThrow(/déjà un cadre/);
    expect(await db.strengthFrames.count()).toBe(1);
  });

  it("durée croissante : durée de départ dans la version, pas d'objectif, pas de plage ni de barre", async () => {
    const { version } = await createFrame(
      planche,
      { progressionType: "duree_croissante", workSets: 3, targetDurationSec: 45, restSec: 60, increment: { unit: "sec", value: 5 }, barWeightKg: 20 },
      { value: 50, unit: "sec" },
      T0,
      newId,
    );

    expect(version).toMatchObject({ progressionType: "duree_croissante", targetDurationSec: 45, increment: { unit: "sec", value: 5 } });
    expect(version).not.toHaveProperty("currentTarget");
    expect(version).not.toHaveProperty("repRange");
    expect(version).not.toHaveProperty("rpeTarget");
    expect(version).not.toHaveProperty("barWeightKg");
  });

  it("refuse une saisie incohérente et un type impossible pour l'exercice", async () => {
    await expect(createFrame(planche, input, undefined, T0, newId)).rejects.toThrow(/type de progression/);
    await expect(createFrame(presse, { ...input, workSets: 0 }, undefined, T0, newId)).rejects.toThrow(/au moins 1/);
    await expect(createFrame(presse, { ...input, repRange: { min: 12, max: 10 } }, undefined, T0, newId)).rejects.toThrow(/cohérente/);
    await expect(createFrame(presse, { ...input, increment: { unit: "kg", value: 0 } }, undefined, T0, newId)).rejects.toThrow(/positif/);
    const { rpeTarget: _omit, ...withoutRpe } = input;
    void _omit;
    await expect(createFrame(presse, withoutRpe, undefined, T0, newId)).rejects.toThrow(/cible de RPE/);
    expect(await db.strengthFrames.count()).toBe(0);
  });
});

describe("updateFrameVersion", () => {
  it("avant figeage : tout se corrige en place, l'objectif de départ est conservé", async () => {
    const { frame } = await createFrame(presse, input, { value: 100, unit: "kg" }, T0, newId);

    const outcome = await updateFrameVersion(presse, frame, { ...input, workSets: 4, repRange: { min: 8, max: 10 } }, T1);

    expect(outcome.kind).toBe("updated");
    expect(outcome.version).toMatchObject({ id: "frame-id1-v1", number: 1, workSets: 4, repRange: { min: 8, max: 10 }, updatedAt: T1, currentTarget: { value: 100 } });
    expect(await db.strengthFrameVersions.count()).toBe(1);
  });

  it("figée : un paramètre crée la V2 (V1 archivée sans motif, objectif effacé) ; la barre seule reste en place", async () => {
    const { frame } = await createFrame(presse, input, { value: 100, unit: "kg" }, T0, newId);
    await db.strengthFrameVersions.update("frame-id1-v1", { firstOfficialWorkoutId: "w1", frozenAt: T0 });

    const bar = await updateFrameVersion(presse, frame, { ...input, barWeightKg: 15 }, T1);
    expect(bar.kind).toBe("updated");
    expect(bar.version).toMatchObject({ id: "frame-id1-v1", barWeightKg: 15, firstOfficialWorkoutId: "w1", currentTarget: { value: 100 } });

    const next = await updateFrameVersion(presse, frame, { ...input, barWeightKg: 15, rpeTarget: 9 }, T1);
    expect(next.kind).toBe("new_version");
    if (next.kind !== "new_version") throw new Error();
    expect(next.archived).toMatchObject({ id: "frame-id1-v1", status: "archived", archivedAt: T1 });
    expect(next.archived).not.toHaveProperty("archiveReason");
    expect(next.archived).not.toHaveProperty("currentTarget");
    expect(next.version).toMatchObject({ id: "frame-id1-v2", number: 2, status: "active", rpeTarget: 9, barWeightKg: 15 });
    expect(next.version).not.toHaveProperty("firstOfficialWorkoutId");
    expect(next.version).not.toHaveProperty("currentTarget");
    expect(await db.strengthFrames.get("frame-id1")).toMatchObject({ activeVersionId: "frame-id1-v2", updatedAt: T1 });
    expect(await db.strengthFrameVersions.count()).toBe(2);
  });
});

describe("archiveFrameVersion et startNextVersion", () => {
  it("archive avec motif, efface l'objectif ; la version suivante repart sans jalon ni objectif sauf charge confirmée", async () => {
    const { frame } = await createFrame(presse, input, { value: 100, unit: "kg" }, T0, newId);

    const archived = await archiveFrameVersion(frame, "changement_materiel", T1);
    expect(archived).toMatchObject({ status: "archived", archivedAt: T1, archiveReason: "changement_materiel" });
    expect(archived).not.toHaveProperty("currentTarget");
    await expect(archiveFrameVersion(frame, "plafond_atteint", T1)).rejects.toThrow(/Aucune version active/);
    await expect(updateFrameVersion(presse, frame, input, T1)).rejects.toThrow(/Aucune version active/);

    const v2 = await startNextVersion(presse, frame, { ...input, increment: { unit: "kg", value: 5 } }, { value: 90, unit: "kg" }, T1);
    expect(v2).toMatchObject({ id: "frame-id1-v2", number: 2, status: "active", increment: { unit: "kg", value: 5 }, currentTarget: { value: 90, unit: "kg", acceptedAt: T1 } });
    expect(await db.strengthFrames.get("frame-id1")).toMatchObject({ activeVersionId: "frame-id1-v2" });
    await expect(startNextVersion(presse, frame, input, undefined, T1)).rejects.toThrow(/déjà active/);
  });
});

describe("acceptRaise — choix daté (décision 12, v1.6 événement 5)", () => {
  it("pose l'objectif en cours rattaché au jalon, sans toucher au jalon ni à la séance ; refuse un jalon disparu ou une version archivée", async () => {
    const { version } = await createFrame(presse, input, undefined, T0, newId);
    const milestone = { id: "m1", frameVersionId: version.id, workoutId: "w1", date: "2026-09-23", value: 100, unit: "kg" as const, createdAt: T1 };
    await db.strengthMilestones.put(milestone);
    const proposal = { milestone, value: 102.5, unit: "kg" as const, repFloor: 10 };

    const next = await acceptRaise(version, proposal, "2026-09-23T18:00:00.000Z");

    expect(next.currentTarget).toEqual({ value: 102.5, unit: "kg", acceptedAt: "2026-09-23T18:00:00.000Z", fromMilestoneId: "m1" });
    expect(await db.strengthFrameVersions.get(version.id)).toMatchObject({ currentTarget: { value: 102.5, fromMilestoneId: "m1" }, updatedAt: "2026-09-23T18:00:00.000Z" });
    expect(await db.strengthMilestones.get("m1")).toEqual(milestone);
    expect(await db.strengthMilestones.count()).toBe(1);

    /* Une nouvelle acceptation remplace l'objectif. */
    const again = await acceptRaise(version, { ...proposal, value: 105 }, "2026-09-24T18:00:00.000Z");
    expect(again.currentTarget?.value).toBe(105);

    await db.strengthMilestones.delete("m1");
    await expect(acceptRaise(version, proposal)).rejects.toThrow(/n'existe plus/);

    await db.strengthMilestones.put(milestone);
    await db.strengthFrameVersions.update(version.id, { status: "archived" });
    await expect(acceptRaise(version, proposal)).rejects.toThrow(/plus active/);
  });
});
