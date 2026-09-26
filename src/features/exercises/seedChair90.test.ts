import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { GroupBlock, TestResult } from "../../domain";
import { CHAISE_NOTE } from "../program/programV1";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { testProtocolVersionId } from "../tests/testProtocolsV1";
import { CHAIR_60_INSTRUCTION, CHAIR_60_NAME, CHAIR_60_TECHNIQUE, CHAIR_90_INSTRUCTION, seedChair90 } from "./seedChair90";

/**
 * Seed 16 (26/09/2026) : la chaise contre le mur à 90°, cuisses
 * parallèles au sol. Version 1 du protocole Jambes modifiée sur place,
 * sans figeage, tant qu'aucun résultat n'existe.
 */

const NOW = "2026-09-26T10:00:00.000Z";
const JAMBES_V1 = testProtocolVersionId("jambes", 1);

function withoutNotes<T extends { notes?: string }>(child: T): T {
  const copy = { ...child };
  delete copy.notes;
  return copy;
}

/** La base telle que l'iPhone l'a avant ce seed : chaise à 60°, sans consigne dans Muscu C. */
async function installAt60(): Promise<void> {
  await runSeeds(SEEDS.filter((seed) => seed.name !== "chair90"));
  const chair = (await db.exercises.get("chaise-60"))!;
  await db.exercises.put({ ...chair, name: CHAIR_60_NAME, technique: CHAIR_60_TECHNIQUE });
  const version = (await db.testProtocolVersions.get(JAMBES_V1))!;
  await db.testProtocolVersions.put({
    ...version,
    instructions: version.instructions.map((line) => (line === CHAIR_90_INSTRUCTION ? CHAIR_60_INSTRUCTION : line)),
    settings: { ...version.settings, chairAngleDeg: 60 },
  });
  const template = (await db.sessionTemplates.get("v1-muscu-c"))!;
  await db.sessionTemplates.put({
    ...template,
    blocks: template.blocks.map((block) =>
      block.kind === "group" && block.id === "v1-muscu-c-rester-bas"
        ? { ...block, children: block.children.map((child) => (child.id === "v1-muscu-c-chaise" ? withoutNotes(child) : child)) }
        : block,
    ),
  });
}

async function chairChild() {
  const template = (await db.sessionTemplates.get("v1-muscu-c"))!;
  const group = template.blocks.find((block) => block.id === "v1-muscu-c-rester-bas") as GroupBlock;
  return group.children.find((child) => child.id === "v1-muscu-c-chaise")!;
}

describe("seed 16 — la chaise contre le mur à 90°", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("installation neuve : tout est déjà à 90°", async () => {
    await runSeeds();
    expect((await db.exercises.get("chaise-60"))?.name).toBe("Chaise contre le mur");
    const version = (await db.testProtocolVersions.get(JAMBES_V1))!;
    expect(version.instructions).toContain(CHAIR_90_INSTRUCTION);
    expect(version.settings?.chairAngleDeg).toBe(90);
    expect((await chairChild()).notes).toBe(CHAISE_NOTE);
  });

  it("base à 60° : nom, technique, protocole (V1 sur place, non figée) et consigne de Muscu C passent à 90° ; second passage sans écriture", async () => {
    await installAt60();
    expect((await chairChild()).notes).toBeUndefined();

    await seedChair90(NOW);

    const chair = (await db.exercises.get("chaise-60"))!;
    expect(chair.name).toBe("Chaise contre le mur");
    expect(chair.technique).toContain("cuisses parallèles au sol");
    const version = (await db.testProtocolVersions.get(JAMBES_V1))!;
    expect(version.number).toBe(1);
    expect(version.instructions).toContain(CHAIR_90_INSTRUCTION);
    expect(version.instructions).not.toContain(CHAIR_60_INSTRUCTION);
    expect(version.settings?.chairAngleDeg).toBe(90);
    expect(version).not.toHaveProperty("frozenAt");
    expect(await db.testProtocolVersions.where("protocolId").equals(version.protocolId).count()).toBe(1);
    expect((await chairChild()).notes).toBe(CHAISE_NOTE);

    const before = JSON.stringify([await db.exercises.toArray(), await db.testProtocolVersions.toArray(), await db.sessionTemplates.toArray()]);
    await seedChair90("2026-09-27T10:00:00.000Z");
    expect(JSON.stringify([await db.exercises.toArray(), await db.testProtocolVersions.toArray(), await db.sessionTemplates.toArray()])).toBe(before);
  });

  it("un nom saisi par l'utilisateur est gardé ; un protocole qui a déjà un résultat n'est pas touché", async () => {
    await installAt60();
    const chair = (await db.exercises.get("chaise-60"))!;
    await db.exercises.put({ ...chair, name: "Ma chaise" });
    await db.testResults.put({ id: "r1", protocolId: "protocol-jambes", versionId: JAMBES_V1, date: "2026-10-01" } as unknown as TestResult);

    await seedChair90(NOW);

    expect((await db.exercises.get("chaise-60"))?.name).toBe("Ma chaise");
    expect((await db.exercises.get("chaise-60"))?.technique).toContain("cuisses parallèles au sol");
    const version = (await db.testProtocolVersions.get(JAMBES_V1))!;
    expect(version.instructions).toContain(CHAIR_60_INSTRUCTION);
    expect(version.settings?.chairAngleDeg).toBe(60);
  });
});
