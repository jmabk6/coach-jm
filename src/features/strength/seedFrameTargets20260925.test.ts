import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers } from "../../domain";
import { resumeSeedsForTests, runSeeds, SEEDS_BEFORE_PROGRAM_V2 } from "../seed/runSeeds";
import { FRAME_TARGETS_20260925, FRAME_TARGETS_20261003, seedFrameTargets20260925, seedTractionIncrement20261003, seedTractionTarget20261003 } from "./seedFrameTargets20260925";
import { programFrameIds } from "./seedProgramFrames";

/**
 * Seed 15 (26/09/2026) : développé épaules machine 20 kg, extension
 * triceps poulie 12,5 kg, développé incliné haltères 8 kg (première
 * cible). Nouvelle version des cadres concernés, rien d'autre.
 */

const NOW = "2026-09-26T09:00:00.000Z";

async function frameState(exerciseId: string) {
  const { frameId } = programFrameIds(exerciseId);
  const frame = (await db.strengthFrames.get(frameId))!;
  const versions = await db.strengthFrameVersions.where("frameId").equals(frameId).sortBy("number");
  return { frame, versions };
}

describe("seed 15 — premières cibles recalées d'après le 25/09", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("chaque cadre passe en V2 avec la nouvelle cible ; la V1 est archivée, paramètres identiques ; les autres cadres ne bougent pas", async () => {
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2); // installation complète, seed 15 compris
    const others = (await db.strengthFrameVersions.toArray()).filter(
      (version) => ![...FRAME_TARGETS_20260925, ...FRAME_TARGETS_20261003].some((spec) => version.frameId === programFrameIds(spec.exerciseId).frameId),
    );
    expect(others.every((version) => version.number === 1 && version.status === "active")).toBe(true);

    for (const spec of FRAME_TARGETS_20260925) {
      const { frame, versions } = await frameState(spec.exerciseId);
      expect(versions.map((version) => [version.number, version.status])).toEqual([
        [1, "archived"],
        [2, "active"],
      ]);
      const [v1, v2] = versions as [(typeof versions)[number], (typeof versions)[number]];
      expect(frame.activeVersionId).toBe(v2.id);
      expect(v1.archiveReason).toBe("erreur_calibration");
      expect(v1).not.toHaveProperty("currentTarget");
      expect(v2.currentTarget).toMatchObject({ value: spec.target, unit: "kg" });
      expect(v2.currentTarget).not.toHaveProperty("fromMilestoneId");
      for (const key of ["progressionType", "workSets", "repRange", "rpeTarget", "restSec", "increment"] as const) {
        expect(v2[key], `${spec.exerciseId} ${key}`).toEqual(v1[key]);
      }
    }
  });

  it("idempotent : le marqueur posé, un second passage n'écrit rien", async () => {
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2);
    const before = await db.strengthFrameVersions.toArray();
    await seedFrameTargets20260925(NOW);
    expect(await db.strengthFrameVersions.toArray()).toEqual(before);
  });

  it("un cadre déjà modifié par l'utilisateur est laissé tel quel ; les autres sont recalés", async () => {
    const markers = await import("../seed/runSeeds");
    await markers.runSeeds(markers.SEEDS_BEFORE_PROGRAM_V2.filter((seed) => seed.name !== "frameTargets20260925"));
    const { versionId } = programFrameIds("developpe-epaules-machine");
    const touched = (await db.strengthFrameVersions.get(versionId))!;
    await db.strengthFrameVersions.put({ ...touched, currentTarget: { value: 30, unit: "kg", acceptedAt: NOW } });

    await seedFrameTargets20260925(NOW);

    const epaules = await frameState("developpe-epaules-machine");
    expect(epaules.versions).toHaveLength(1);
    expect(epaules.versions[0]?.currentTarget?.value).toBe(30);
    expect((await frameState("extension-triceps-poulie")).versions).toHaveLength(2);
    expect((await frameState("developpe-incline-halteres")).versions).toHaveLength(2);
    const install = (await db.settings.get("install"))?.value as InstallMarkers;
    expect(install.frameTargets20260925).toBe(NOW);
  });
});

describe("seed 22 — traction assistée recalée à 42 kg d'aide (03/10/2026)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("V1 à 52 kg → V2 à 42 kg, paramètres identiques (3 × 6-8, RPE ≤ 8) ; V1 archivée ; second passage sans écriture", async () => {
    /* Sans le seed 23 (RPE 9, cran de 7 kg), testé à part. */
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2.filter((seed) => seed.name !== "tractionIncrement20261003"));
    const { frame, versions } = await frameState("traction-assistee");
    expect(versions.map((version) => [version.number, version.status])).toEqual([
      [1, "archived"],
      [2, "active"],
    ]);
    const [v1, v2] = versions as [(typeof versions)[number], (typeof versions)[number]];
    expect(frame.activeVersionId).toBe(v2.id);
    expect(v1.archiveReason).toBe("erreur_calibration");
    expect(v2.currentTarget).toMatchObject({ value: 42, unit: "kg" });
    expect(v2).toMatchObject({ progressionType: "assistance_decroissante", workSets: 3, repRange: { min: 6, max: 8 }, rpeTarget: 8, restSec: v1.restSec });

    const before = await db.strengthFrameVersions.toArray();
    await seedTractionTarget20261003(NOW);
    expect(await db.strengthFrameVersions.toArray()).toEqual(before);
  });

  it("cible déjà changée par l'utilisateur : rien ; le marqueur est posé", async () => {
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2.filter((seed) => seed.name !== "tractionTarget20261003" && seed.name !== "tractionIncrement20261003"));
    const { versionId } = programFrameIds("traction-assistee");
    const touched = (await db.strengthFrameVersions.get(versionId))!;
    await db.strengthFrameVersions.put({ ...touched, currentTarget: { value: 40, unit: "kg", acceptedAt: NOW } });

    await seedTractionTarget20261003(NOW);

    expect((await frameState("traction-assistee")).versions).toHaveLength(1);
    expect(((await db.settings.get("install"))?.value as InstallMarkers).tractionTarget20261003).toBe(NOW);
  });
});

describe("seed 23 — cran de 7 kg de la machine de traction (03/10/2026)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("nouvelle version : RPE 9, cran de 7 kg, cible 42 kg et 3 × 6-8 conservés ; la précédente archivée « changement de programme »", async () => {
    await runSeeds(SEEDS_BEFORE_PROGRAM_V2);
    const { frame, versions } = await frameState("traction-assistee");
    expect(versions.map((version) => [version.number, version.status])).toEqual([
      [1, "archived"],
      [2, "archived"],
      [3, "active"],
    ]);
    const active = versions.find((version) => version.id === frame.activeVersionId)!;
    expect(active).toMatchObject({ number: 3, rpeTarget: 9, increment: { unit: "kg", value: 7 }, currentTarget: { value: 42 }, workSets: 3, repRange: { min: 6, max: 8 } });
    expect(versions[1]).toMatchObject({ archiveReason: "changement_programme", rpeTarget: 8 });

    /* RPE déjà à 9 : seul un cran manquant est saisi, en place ; un cran déjà saisi n'est pas touché. */
    const install = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
    delete install.tractionIncrement20261003;
    await db.settings.put({ key: "install", value: install });
    await db.strengthFrameVersions.put({ ...active, increment: { unit: "kg", value: 5 } });
    await seedTractionIncrement20261003(NOW);
    expect(await db.strengthFrameVersions.where("frameId").equals(frame.id).count()).toBe(3);
    expect((await db.strengthFrameVersions.get(active.id))?.increment).toEqual({ unit: "kg", value: 5 });
  });
});
