import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, SessionTemplate } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { HOLD_PROGRESSION, PROGRAM_V1_ROUTINES, PROGRAM_V1_ROUTINES_EMPTY } from "./programV1";
import { CORE_LINKED, FLEXIBILITY_LINKED, seedRoutinesContent } from "./seedProgramV1";

/**
 * Lot K.1 — routines du soir remplies seulement si encore vides et non
 * modifiées ; exercices liés de Tronc et Souplesse seulement si vides.
 */

const T = "2026-09-25T20:00:00.000Z";

/** Une base installée avant le lot K : routines vides, listes vides, marqueur absent. */
async function installedBefore(): Promise<void> {
  for (const content of PROGRAM_V1_ROUTINES_EMPTY) {
    const template = (await db.sessionTemplates.get(content.id))!;
    await db.sessionTemplates.put({ ...template, name: content.name, blocks: [] } as SessionTemplate);
    delete (template as Partial<SessionTemplate>).subtitle;
  }
  for (const key of ["core", "flexibility"] as const) {
    const goal = (await db.goals.where("key").equals(key).first())!;
    await db.goals.put({ ...goal, linkedExercises: [] });
  }
  const install = (await db.settings.get("install"))!.value as InstallMarkers;
  delete install.routinesContent;
  await db.settings.put({ key: "install", value: install });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await installedBefore();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("seed 13 — contenu des routines du soir", () => {
  it("routines vides : remplies ; listes vides : remplies ; marqueur posé", async () => {
    await seedRoutinesContent(T);

    const a = (await db.sessionTemplates.get("v1-routine-a"))!;
    expect(a.name).toBe("Routine A — Avant du tronc et hanches");
    expect(a.blocks.map((block) => block.kind === "exercise" && block.exerciseId)).toEqual([
      "planche",
      "dead-bug",
      "mobilite-flechisseur-hanche",
      "mobilite-ischio-jambiers",
      "import-position-enfant",
    ]);
    expect(a.blocks[0]).toMatchObject({ instructions: { shape: "duration", sets: 3, durationSec: 30 }, notes: HOLD_PROGRESSION });
    expect(a.blocks[2]).toMatchObject({ notes: expect.stringContaining("Coussin sous le genou au sol ; en cas de gêne, le faire debout.") });

    const b = (await db.sessionTemplates.get("v1-routine-b"))!;
    expect(b.blocks[0]).toMatchObject({ exerciseId: "planche-laterale", instructions: { sets: 3, durationSec: 20 } });
    expect(b.blocks[2]).toMatchObject({ exerciseId: "mobilite-chat-vache", instructions: { shape: "reps", sets: 1, reps: { min: 10, max: 10 } } });
    const c = (await db.sessionTemplates.get("v1-routine-c"))!;
    expect(c.blocks[1]).toMatchObject({ exerciseId: "hollow-body-genoux", notes: HOLD_PROGRESSION });
    expect(c.blocks[4]).toMatchObject({ exerciseId: "papillon-assis", instructions: { sets: 1, durationSec: 60 } });

    expect((await db.goals.get("goal-core"))!.linkedExercises.map((item) => item.exerciseId)).toEqual(CORE_LINKED);
    expect((await db.goals.get("goal-flexibility"))!.linkedExercises.map((item) => item.exerciseId)).toEqual(FLEXIBILITY_LINKED);
    expect(((await db.settings.get("install"))!.value as InstallMarkers).routinesContent).toBe(T);
  });

  it("une routine modifiée (nom ou bloc) et une liste déjà remplie ne sont jamais écrasées", async () => {
    const renamed = (await db.sessionTemplates.get("v1-routine-b"))!;
    await db.sessionTemplates.put({ ...renamed, name: "Ma routine du soir" });
    const withBlock = (await db.sessionTemplates.get("v1-routine-c"))!;
    await db.sessionTemplates.put({ ...withBlock, blocks: [PROGRAM_V1_ROUTINES[0]!.blocks[0]!] });
    await db.goals.update("goal-core", { linkedExercises: [{ exerciseId: "planche" }] });

    await seedRoutinesContent(T);

    expect((await db.sessionTemplates.get("v1-routine-a"))!.blocks).toHaveLength(5);
    expect((await db.sessionTemplates.get("v1-routine-b"))!).toMatchObject({ name: "Ma routine du soir", blocks: [] });
    expect((await db.sessionTemplates.get("v1-routine-c"))!.blocks).toHaveLength(1);
    expect((await db.goals.get("goal-core"))!.linkedExercises).toEqual([{ exerciseId: "planche" }]);
    expect((await db.goals.get("goal-flexibility"))!.linkedExercises).toHaveLength(FLEXIBILITY_LINKED.length);
  });

  it("marqueur posé : ne se rejoue plus", async () => {
    await seedRoutinesContent(T);
    await installedBefore();
    const install = (await db.settings.get("install"))!.value as InstallMarkers;
    await db.settings.put({ key: "install", value: { ...install, routinesContent: T } });
    await seedRoutinesContent("2026-09-26T08:00:00.000Z");
    expect((await db.sessionTemplates.get("v1-routine-a"))!.blocks).toHaveLength(0);
  });
});
