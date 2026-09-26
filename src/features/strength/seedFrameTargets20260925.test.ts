import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { FRAME_TARGETS_20260925, seedFrameTargets20260925 } from "./seedFrameTargets20260925";
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
    await runSeeds(); // installation complète, seed 15 compris
    const others = (await db.strengthFrameVersions.toArray()).filter(
      (version) => !FRAME_TARGETS_20260925.some((spec) => version.frameId === programFrameIds(spec.exerciseId).frameId),
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
    await runSeeds();
    const before = await db.strengthFrameVersions.toArray();
    await seedFrameTargets20260925(NOW);
    expect(await db.strengthFrameVersions.toArray()).toEqual(before);
  });

  it("un cadre déjà modifié par l'utilisateur est laissé tel quel ; les autres sont recalés", async () => {
    const markers = await import("../seed/runSeeds");
    await markers.runSeeds(markers.SEEDS.filter((seed) => seed.name !== "frameTargets20260925"));
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
