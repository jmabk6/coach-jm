import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PlannedSession, SessionTemplate, TestScheduleEntry } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { CARDIO_A, CARDIO_A_FORMER } from "./programV1";
import { seedCardioASingleBlock } from "./seedCardioASingleBlock";

/**
 * Seed 9 (décision du 24/09/2026) : le Cardio A installé en trois blocs
 * devient un bloc à trois paliers, seulement s'il n'a pas été modifié ;
 * le test cardio passe du bloc principal au palier principal.
 */

const T = "2026-09-24T20:00:00.000Z";
const FORMER_ENTRY: TestScheduleEntry = {
  protocolKey: "cardio", weekday: "wednesday", slot: "day", templateId: "v1-cardio-a", placement: "replace_block", targetBlockId: "v1-cardio-a-principal",
};

function planned(id: string, status: PlannedSession["status"]): PlannedSession {
  return {
    id, date: "2026-10-28", sessionTemplateId: "v1-cardio-a", status, source: "weekly_program", createdAt: T, updatedAt: T,
    tests: [{ protocolId: "protocol-cardio", placement: "replace_block", targetBlockId: "v1-cardio-a-principal" }],
  };
}

/** Une base installée avant le 24/09 : ancien Cardio A, ancienne place du test, séances déjà planifiées. */
async function installedBefore(blocks = CARDIO_A_FORMER.blocks): Promise<void> {
  const template = (await db.sessionTemplates.get("v1-cardio-a"))!;
  await db.sessionTemplates.put({ ...template, mainBlockId: CARDIO_A_FORMER.mainBlockId!, blocks: structuredClone(blocks) } as SessionTemplate);
  const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
  await db.settings.put({ key: "testSchedule", value: schedule.map((entry) => (entry.protocolKey === "cardio" ? FORMER_ENTRY : entry)) });
  await db.plannedSessions.bulkPut([planned("a-venir", "upcoming"), planned("faite", "done")]);
  const install = (await db.settings.get("install"))!.value as InstallMarkers;
  delete install.cardioASingleBlock;
  await db.settings.put({ key: "install", value: install });
}

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

describe("seed 9 — Cardio A en un seul bloc", () => {
  it("base neuve : déjà en un bloc, le test visant le palier principal", async () => {
    const template = (await db.sessionTemplates.get("v1-cardio-a"))!;
    expect(template.blocks.map((block) => block.id)).toEqual(["v1-cardio-a-tapis"]);
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "cardio")).toMatchObject({ targetBlockId: "v1-cardio-a-tapis", targetStepId: "v1-cardio-a-principal-p1" });
  });

  it("ancien modèle intact : remplacé ; place du test et séances à venir redirigées ; séance faite intacte", async () => {
    await installedBefore();
    await seedCardioASingleBlock(T);

    const template = (await db.sessionTemplates.get("v1-cardio-a"))!;
    expect(template.blocks).toEqual(CARDIO_A.blocks);
    expect(template.mainBlockId).toBe("v1-cardio-a-tapis");
    expect(template.updatedAt).toBe(T);

    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "cardio")).toMatchObject({ targetBlockId: "v1-cardio-a-tapis", targetStepId: "v1-cardio-a-principal-p1" });

    expect((await db.plannedSessions.get("a-venir"))!.tests).toEqual([
      { protocolId: "protocol-cardio", placement: "replace_block", targetBlockId: "v1-cardio-a-tapis", targetStepId: "v1-cardio-a-principal-p1" },
    ]);
    expect((await db.plannedSessions.get("faite"))!.tests![0]!.targetBlockId).toBe("v1-cardio-a-principal");
    expect(((await db.settings.get("install"))!.value as InstallMarkers).cardioASingleBlock).toBe(T);
  });

  it("modèle modifié par l'utilisateur : rien n'est touché, le marqueur est posé", async () => {
    const edited = structuredClone(CARDIO_A_FORMER.blocks);
    (edited[1] as { notes?: string }).notes = "Mon réglage";
    await installedBefore(edited);
    await seedCardioASingleBlock(T);

    expect((await db.sessionTemplates.get("v1-cardio-a"))!.blocks).toEqual(edited);
    const schedule = (await db.settings.get("testSchedule"))!.value as TestScheduleEntry[];
    expect(schedule.find((entry) => entry.protocolKey === "cardio")).toEqual(FORMER_ENTRY);
    expect((await db.plannedSessions.get("a-venir"))!.tests![0]!.targetBlockId).toBe("v1-cardio-a-principal");
    expect(((await db.settings.get("install"))!.value as InstallMarkers).cardioASingleBlock).toBe(T);
  });

  it("marqueur posé : ne se rejoue plus", async () => {
    await installedBefore();
    await db.settings.put({ key: "install", value: { ...((await db.settings.get("install"))!.value as InstallMarkers), cardioASingleBlock: "2026-09-25" } });
    await seedCardioASingleBlock(T);
    expect((await db.sessionTemplates.get("v1-cardio-a"))!.mainBlockId).toBe("v1-cardio-a-principal");
  });
});
