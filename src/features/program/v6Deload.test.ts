import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { InstallMarkers, PerformedBlock, PerformedExerciseBlock, PerformedGroupBlock, SessionTemplate } from "../../domain";
import { v6SnapshotAdjustments } from "../goals/tractionV6";
import { createWorkoutSnapshot, type SnapshotTest } from "../workout/createWorkoutSnapshot";
import { resumeSeedsForTests, runSeeds, SEEDS } from "../seed/runSeeds";
import { PROGRAM_V2_TEMPLATES, PROGRAM_V2_TEST_SCHEDULE } from "./programV2";
import { muscuCWithNegatives, seedNegativesMuscuC20261005 } from "./seedNegativesMuscuC";

/**
 * Programme du pari V6 (05/10/2026) : semaines test allégées et
 * tractions négatives à partir du 01/11.
 * - Muscu B en semaine test : traction 2 × 8 ;
 * - Muscu C en semaine test : 3 séries → 2, 2 → 1, « Rester bas » 2 tours,
 *   suspension gardée (allégée comme le reste), échauffement intact ;
 * - Muscu C : négatives 2 × 2 juste après la suspension, dès le 01/11 ;
 * - Cardio C du samedi avant un test : sans le 2e bloc soutenu (≈ 42 min).
 */

const template = (id: string) => PROGRAM_V2_TEMPLATES.find((item) => item.id === id) as SessionTemplate;
const snapshot = (id: string, date: string, tests: SnapshotTest[] = []) => createWorkoutSnapshot(template(id), undefined, undefined, tests, v6SnapshotAdjustments(template(id), date));
const ids = (blocks: PerformedBlock[]) => blocks.map((block) => (block.kind === "test" ? `test:${block.protocolId.replace("protocol-", "")}` : block.sourceBlockId));
const exerciseBlock = (blocks: PerformedBlock[], id: string) => blocks.find((block) => block.kind !== "test" && block.sourceBlockId === id) as PerformedExerciseBlock;
const sets = (blocks: PerformedBlock[], id: string) => exerciseBlock(blocks, id).series?.length;
const jambes: SnapshotTest = (() => {
  const entry = PROGRAM_V2_TEST_SCHEDULE.find((item) => item.protocolKey === "jambes")!;
  return { test: { protocolId: "protocol-jambes", placement: entry.placement!, targetBlockId: entry.targetBlockId! }, protocolVersionId: "protocol-jambes-v1" };
})();

describe("Muscu C : négatives à partir du 01/11, juste après la suspension", () => {
  it("jeudi 08/10 : pas de négatives ; jeudi 05/11 : 2 × 2 après la suspension, avant les sprints", () => {
    expect(ids(snapshot("v2-muscu-c", "2026-10-08"))).not.toContain("v2-muscu-c-negatives");
    const november = snapshot("v2-muscu-c", "2026-11-05");
    expect(ids(november).slice(0, 4)).toEqual(["v2-muscu-c-echauffement", "v2-muscu-c-suspension", "v2-muscu-c-negatives", "v2-muscu-c-sprints"]);
    expect(sets(november, "v2-muscu-c-negatives")).toBe(2);
    expect(exerciseBlock(november, "v2-muscu-c-negatives").snapshotInstructions).toMatchObject({ reps: { min: 2, max: 2 }, restBetweenSetsSec: 150 });
    expect(exerciseBlock(november, "v2-muscu-c-negatives").note).toContain("descente contrôlée d'environ 5 s");
    /* Hors semaine test : rien d'allégé. */
    expect(sets(november, "v2-muscu-c-suspension")).toBe(3);
    expect((november.find((block) => block.kind === "group") as PerformedGroupBlock).plannedRounds).toBe(3);
  });
});

describe("semaine test : Muscu C −50 %", () => {
  it("jeudi 29/10 (S4) : 3 → 2, 2 → 1, Rester bas 2 tours, suspension gardée, échauffement intact ; le test jambes remplace les sprints", () => {
    const blocks = snapshot("v2-muscu-c", "2026-10-29", [jambes]);
    expect(ids(blocks)).toEqual([
      "v2-muscu-c-echauffement", "v2-muscu-c-suspension", "test:jambes", "v2-muscu-c-montee-banc", "v2-muscu-c-rester-bas",
      "v2-muscu-c-pullover", "v2-muscu-c-face-pull", "v2-muscu-c-curl-marteau", "v2-muscu-c-triceps-tete",
    ]);
    expect(exerciseBlock(blocks, "v2-muscu-c-echauffement").cardioSteps).toHaveLength(1);
    expect(sets(blocks, "v2-muscu-c-suspension")).toBe(2);
    expect(sets(blocks, "v2-muscu-c-montee-banc")).toBe(2);
    expect(sets(blocks, "v2-muscu-c-pullover")).toBe(2);
    expect(sets(blocks, "v2-muscu-c-face-pull")).toBe(2);
    expect(sets(blocks, "v2-muscu-c-curl-marteau")).toBe(2);
    expect(sets(blocks, "v2-muscu-c-triceps-tete")).toBe(1);
    const group = blocks.find((block) => block.kind === "group") as PerformedGroupBlock;
    expect(group.plannedRounds).toBe(2);
    expect(group.rounds).toHaveLength(2);
  });

  it("jeudi 26/11 (S8) : les négatives aussi, 2 → 1 ; sans test jambes, les sprints 6 → 3", () => {
    const blocks = snapshot("v2-muscu-c", "2026-11-26");
    expect(sets(blocks, "v2-muscu-c-negatives")).toBe(1);
    expect(sets(blocks, "v2-muscu-c-sprints")).toBe(3);
  });
});

describe("Cardio C du samedi avant un test : sans le 2e bloc soutenu", () => {
  const minutes = (blocks: PerformedBlock[]) => (blocks[0] as PerformedExerciseBlock).cardioSteps!.reduce((sum, step) => sum + (step.settings.durationSec ?? 0), 0) / 60;

  it("samedi 24/10 (veille du test S4) : 42 min, plus de récupération ni de 2e bloc ; samedi 17/10 et 31/10 : 57 min", () => {
    const deload = snapshot("v2-cardio-c", "2026-10-24");
    expect((deload[0] as PerformedExerciseBlock).cardioSteps!.map((step) => step.id.replace("workout-block-v2-cardio-c-tapis-step-", ""))).toEqual([
      "v2-cardio-c-progressif", "v2-cardio-c-soutenu-1", "v2-cardio-c-facile", "v2-cardio-c-retour",
    ]);
    expect(minutes(deload)).toBe(42);
    expect(minutes(snapshot("v2-cardio-c", "2026-10-17"))).toBe(57);
    expect(minutes(snapshot("v2-cardio-c", "2026-10-31"))).toBe(57);
    for (const saturday of ["2026-11-21", "2026-12-19", "2027-01-16", "2027-02-13", "2027-03-13"]) expect(minutes(snapshot("v2-cardio-c", saturday)), saturday).toBe(42);
  });
});

describe("Muscu B et le reste : inchangés hors règle", () => {
  it("Muscu B : 2 séries en semaine test, 3 sinon ; Muscu A et Cardio A : aucun allègement automatique", () => {
    expect(sets(snapshot("v2-muscu-b", "2026-10-27"), "v2-muscu-b-traction")).toBe(2);
    expect(sets(snapshot("v2-muscu-b", "2026-10-20"), "v2-muscu-b-traction")).toBe(3);
    expect(v6SnapshotAdjustments(template("v2-muscu-a"), "2026-10-25")).toEqual([]);
    expect(v6SnapshotAdjustments(template("v2-cardio-a"), "2026-10-28")).toEqual([]);
    /* Avant le pari : rien. */
    expect(v6SnapshotAdjustments(template("v2-cardio-c"), "2026-09-26")).toEqual([]);
  });
});

describe("seed 28 : les négatives entrent dans Muscu C", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  const NOW = "2026-10-05T08:00:00.000Z";
  const order = (item: SessionTemplate) => [...item.blocks].sort((a, b) => a.position - b.position).map((block) => block.id);

  it("installation neuve : Muscu C identique au modèle du programme, négatives après la suspension", async () => {
    await runSeeds();
    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    expect(order(c)).toEqual(order(template("v2-muscu-c")));
    expect(order(c).slice(1, 4)).toEqual(["v2-muscu-c-suspension", "v2-muscu-c-negatives", "v2-muscu-c-sprints"]);
  });

  it("base d'avant (Muscu C sans négatives) : insérées après la suspension, positions décalées ; second passage : rien", async () => {
    await runSeeds(SEEDS.filter((seed) => seed.name !== "negativesMuscuC20261005"));
    const c = (await db.sessionTemplates.get("v2-muscu-c"))!;
    const without: SessionTemplate = {
      ...c,
      blocks: c.blocks.filter((block) => block.id !== "v2-muscu-c-negatives").map((block) => (block.position > 2 ? { ...block, position: block.position - 1 } : block)),
    };
    await db.sessionTemplates.put(without);
    await seedNegativesMuscuC20261005(NOW);
    const after = (await db.sessionTemplates.get("v2-muscu-c"))!;
    expect(order(after)).toEqual(order(template("v2-muscu-c")));
    expect([...after.blocks].map((block) => block.position).sort((a, b) => a - b)).toEqual(after.blocks.map((_, index) => index));
    expect(((await db.settings.get("install"))!.value as InstallMarkers).negativesMuscuC20261005).toBe(NOW);
    expect(muscuCWithNegatives(after, NOW)).toBeUndefined();
  });
});
