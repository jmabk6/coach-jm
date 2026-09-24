import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import {
  getActiveTestProtocolVersion,
  getTestProtocolByKey,
  getTestResultsForProtocol,
  hasTestResultOn,
} from "../../db/repositories/testRepository";
import type { TestResult } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { seedSettingsDefaults } from "../seed/seedSettingsDefaults";
import { seedTestProtocols } from "./seedTestProtocols";
import { freezeVersionForResult, reviseTestProtocol } from "./testProtocolVersioning";

/**
 * Lot G.1 — protocoles V1 (seed 4), repository, figeage des versions
 * (conception V2 § 3.7).
 */

const NOW = "2026-09-24T10:00:00.000Z";
const LATER = "2026-10-25T10:00:00.000Z";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedSettingsDefaults(new Date(NOW));
  await db.transaction("rw", db.exercises, () => seedExerciseCatalog());
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("seed 4 : protocoles V1", () => {
  it("7 protocoles, une version 1 active chacun ; traction stricte en pause", async () => {
    await seedTestProtocols(NOW);

    const protocols = await db.testProtocols.toArray();
    expect(protocols.map((protocol) => [protocol.key, protocol.status]).sort()).toEqual([
      ["cardio", "active"],
      ["jambes", "active"],
      ["mensurations", "active"],
      ["souplesse", "active"],
      ["traction", "active"],
      ["traction_stricte", "paused"],
      ["tronc", "active"],
    ]);

    for (const protocol of protocols) {
      const version = await getActiveTestProtocolVersion(protocol.id);
      expect(version).toMatchObject({ protocolId: protocol.id, number: 1, status: "active" });
      expect(version?.firstOfficialResultId).toBeUndefined();
      if (version?.primaryMeasureKey) expect(version.measures.map((measure) => measure.key)).toContain(version.primaryMeasureKey);
    }
  });

  it("mesures : doigts-sol signé, Apley par côté, FC 16 à 20 obligatoires (N9), exercices du catalogue", async () => {
    await seedTestProtocols(NOW);
    const measures = async (key: string) => (await getActiveTestProtocolVersion((await getTestProtocolByKey(key))!.id))!.measures;

    const souplesse = await measures("souplesse");
    expect(souplesse.find((measure) => measure.key === "doigts_sol_cm")).toMatchObject({ signed: true, input: "entered" });
    expect(souplesse.find((measure) => measure.key === "apley_cm")).toMatchObject({ side: true });

    const cardio = await measures("cardio");
    expect(cardio.filter((measure) => measure.required && measure.input === "entered").map((measure) => measure.key)).toEqual([
      "fc_16", "fc_17", "fc_18", "fc_19", "fc_20",
    ]);
    expect(cardio.find((measure) => measure.key === "fc_moy_16_20")).toMatchObject({ input: "derived", required: true });

    const catalog = new Set(exerciseCatalog.map((exercise) => exercise.id));
    for (const version of await db.testProtocolVersions.toArray()) {
      for (const measure of version.measures) {
        if (measure.exerciseId) expect(catalog.has(measure.exerciseId), measure.exerciseId).toBe(true);
      }
    }

    /* D17 : l'unité des sprints n'est pas fixée à l'installation. */
    expect((await getActiveTestProtocolVersion("protocol-jambes"))?.settings?.unit).toBeUndefined();
  });

  it("idempotent : second passage sans rien changer ; une clé existante n'est jamais recréée", async () => {
    await db.testProtocols.add({
      id: "mon-tronc", key: "tronc", name: "Mon gainage", status: "active", activeVersionId: "mon-tronc-v1", createdAt: NOW, updatedAt: NOW,
    });

    await seedTestProtocols(NOW);
    expect((await getTestProtocolByKey("tronc"))?.id).toBe("mon-tronc");
    expect(await db.testProtocols.count()).toBe(7);
    expect((await db.settings.get("install"))?.value).toMatchObject({ testProtocols: NOW });

    const before = JSON.stringify([await db.testProtocols.toArray(), await db.testProtocolVersions.toArray()]);
    await seedTestProtocols(LATER);
    expect(JSON.stringify([await db.testProtocols.toArray(), await db.testProtocolVersions.toArray()])).toBe(before);
  });
});

describe("figeage des versions (§ 3.7.2)", () => {
  beforeEach(() => seedTestProtocols(NOW));

  it("avant le premier résultat officiel : modification sur place (unité des sprints, D17)", async () => {
    const edited = await reviseTestProtocol("protocol-jambes", { settings: { sprintCount: 6, sprintSec: 12, recoverySec: 48, chairAngleDeg: 60, unit: "watts" } }, NOW);
    expect(edited).toMatchObject({ id: "protocol-jambes-v1", number: 1, settings: { unit: "watts" } });
    expect(await db.testProtocolVersions.where("protocolId").equals("protocol-jambes").count()).toBe(1);
  });

  it("figée au premier résultat officiel, une seule fois", async () => {
    const frozen = await db.transaction("rw", db.testProtocolVersions, () =>
      freezeVersionForResult("protocol-traction-v1", "result-1", NOW),
    );
    expect(frozen).toMatchObject({ firstOfficialResultId: "result-1", frozenAt: NOW });

    await db.transaction("rw", db.testProtocolVersions, () => freezeVersionForResult("protocol-traction-v1", "result-2", LATER));
    expect(await db.testProtocolVersions.get("protocol-traction-v1")).toMatchObject({ firstOfficialResultId: "result-1", frozenAt: NOW });
  });

  it("après figeage : toute modification crée la version suivante, l'ancienne est archivée", async () => {
    await db.transaction("rw", db.testProtocolVersions, () => freezeVersionForResult("protocol-traction-v1", "result-1", NOW));

    const next = await reviseTestProtocol("protocol-traction", { settings: { firstTrialKg: 38 } }, LATER);

    expect(next).toMatchObject({ id: "protocol-traction-v2", number: 2, status: "active", settings: { firstTrialKg: 38 } });
    expect(next.firstOfficialResultId).toBeUndefined();
    expect(next.frozenAt).toBeUndefined();
    expect(await db.testProtocolVersions.get("protocol-traction-v1")).toMatchObject({ status: "archived", firstOfficialResultId: "result-1" });
    expect((await getTestProtocolByKey("traction"))?.activeVersionId).toBe("protocol-traction-v2");
  });
});

describe("repository des résultats", () => {
  const result = (id: string, date: string, protocolId = "protocol-traction"): TestResult => ({
    id, protocolId, versionId: `${protocolId}-v1`, date, origin: "manual", status: "complete", measures: [], createdAt: NOW, updatedAt: NOW,
  });

  it("résultats d'un protocole par date ; présence d'un résultat à une date", async () => {
    await db.testResults.bulkPut([result("b", "2026-10-25"), result("a", "2026-09-27"), result("c", "2026-09-28", "protocol-souplesse")]);

    expect((await getTestResultsForProtocol("protocol-traction")).map((item) => item.id)).toEqual(["a", "b"]);
    expect(await hasTestResultOn("protocol-traction", "2026-09-27")).toBe(true);
    expect(await hasTestResultOn("protocol-traction", "2026-09-28")).toBe(false);
  });
});
