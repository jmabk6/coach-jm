import "fake-indexeddb/auto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { getSetting, saveSetting } from "../../db/repositories/settingsRepository";
import type { Goal, InstallMarkers } from "../../domain";
import { canonicalStringify } from "../backup/canonicalJson";
import { readStores } from "../backup/exportBackup";
import { editGoalSegment } from "../goals/goalActions";
import { goalId } from "../goals/goalsV1";
import { seedWeightGoal8020261005 } from "../goals/seedWeightGoal80";
import { V6_REFERENCE } from "../goals/tractionV6";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { INITIAL_BODY_TARGETS, seedBodyTargets20261005 } from "./seedBodyTargets";

/**
 * Corps, phase 2.1 :
 * - seed 36 : la cible personnelle indicative de composition, valeurs
 *   initiales écrites une fois dans les réglages (modifiables ensuite) ;
 * - seed 37 : l'objectif Poids passe de 75 à 80 kg, échéance gardée ;
 * - cible et objectif Poids restent indépendants ; le pari V6 ne bouge pas.
 */

const NOW = "2026-10-05T09:00:00.000Z";

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  resumeSeedsForTests();
});

afterAll(async () => {
  db.close();
  await db.delete();
});

const weightGoal = async () => (await db.goals.get(goalId("weight")))!;

describe("cible de composition (seed 36)", () => {
  it("valeurs initiales : 78–80 kg, 12–15 %, 9–12 kg, au moins 39 kg", async () => {
    await runSeeds();
    expect(INITIAL_BODY_TARGETS).toEqual({
      weightKg: { min: 78, max: 80 },
      fatPct: { min: 12, max: 15 },
      fatKg: { min: 9, max: 12 },
      skeletalMuscleKg: { min: 39 },
    });
    expect(await getSetting("bodyCompositionTargets")).toMatchObject(INITIAL_BODY_TARGETS);
  });

  it("une seule fois : une cible déjà modifiée n'est jamais écrasée, même si le seed repasse", async () => {
    await saveSetting({ key: "bodyCompositionTargets", value: { ...INITIAL_BODY_TARGETS, weightKg: { min: 76, max: 78 }, updatedAt: NOW } });
    await seedBodyTargets20261005();
    expect((await getSetting("bodyCompositionTargets"))?.weightKg).toEqual({ min: 76, max: 78 });

    await db.settings.put({ key: "install", value: { ...((await getSetting("install")) ?? {}), bodyTargets20261005: undefined } as unknown as InstallMarkers });
    await seedBodyTargets20261005();
    expect((await getSetting("bodyCompositionTargets"))?.weightKg).toEqual({ min: 76, max: 78 });
  });
});

describe("objectif Poids 75 → 80 kg (seed 37)", () => {
  it("seule la cible de l'objectif Poids change ; échéance, mesure, pesées, pari V6 et toutes les autres données identiques", async () => {
    await runSeeds();
    await db.weightEntries.add({ id: "w1", date: "2026-10-05", kg: 91.15, createdAt: NOW, updatedAt: NOW });
    /* Retour à l'état d'avant le seed 37 : l'objectif à 75 kg, sans marqueur. */
    const install = (await getSetting("install"))!;
    const { weightGoalTarget20261005: _done, ...withoutMarker } = install;
    void _done;
    await db.settings.put({ key: "install", value: withoutMarker });
    const before = await weightGoal();
    await db.goals.put({ ...before, segments: before.segments.map((segment) => ({ ...segment, target: 75 })) });
    const snapshot = (await readStores(db)).stores;

    await seedWeightGoal8020261005(NOW);

    const after = (await readStores(db)).stores;
    for (const store of Object.keys(snapshot)) {
      if (store === "goals" || store === "settings") continue;
      expect(canonicalStringify(after[store]), store).toBe(canonicalStringify(snapshot[store]));
    }
    const goals = after.goals as Goal[];
    for (const goal of snapshot.goals as Goal[]) {
      const next = goals.find((item) => item.id === goal.id)!;
      if (goal.key !== "weight") expect(canonicalStringify(next), goal.key).toBe(canonicalStringify(goal));
    }
    const weight = await weightGoal();
    expect(weight.segments).toEqual([expect.objectContaining({ target: 80, dueDate: "2027-03-31", direction: "decrease", measure: { source: "weight_weekly_average" } })]);
    expect(weight.updatedAt).toBe(NOW);
    expect((await getSetting("install"))?.weightGoalTarget20261005).toBe(NOW);
    const otherSettings = (after.settings as Array<{ key: string }>).filter((record) => record.key !== "install");
    expect(canonicalStringify(otherSettings)).toBe(canonicalStringify((snapshot.settings as Array<{ key: string }>).filter((record) => record.key !== "install")));
  });

  it("objectif déjà modifié par l'utilisateur (autre que 75 kg) : laissé tel quel ; une seule fois", async () => {
    await runSeeds();
    const goal = await weightGoal();
    expect(goal.segments[0]!.target).toBe(80);
    await editGoalSegment(goal.id, goal.segments[0]!.id, { target: 82 }, NOW);
    const install = (await getSetting("install"))!;
    await db.settings.put({ key: "install", value: { ...install, weightGoalTarget20261005: undefined } as unknown as InstallMarkers });
    await seedWeightGoal8020261005(NOW);
    expect((await weightGoal()).segments[0]!.target).toBe(82);
  });

  it("le pari traction V6 garde sa trajectoire 92 → 75 kg, figée", async () => {
    await runSeeds();
    const weights = V6_REFERENCE.map((week) => week.weightKg);
    expect(weights[0]).toBe(92);
    expect(weights.at(-1)).toBe(75);
    expect(weights).toHaveLength(26);
    expect(weights.every((kg, index) => index === 0 || kg <= weights[index - 1]!)).toBe(true);
  });
});

describe("cible de composition et objectif Poids : indépendants", () => {
  it("modifier la cible ne modifie pas l'objectif Poids ; modifier l'objectif Poids ne modifie pas la cible", async () => {
    await runSeeds();
    const goalBefore = await weightGoal();
    await saveSetting({ key: "bodyCompositionTargets", value: { ...INITIAL_BODY_TARGETS, weightKg: { min: 70, max: 72 }, updatedAt: NOW } });
    expect(canonicalStringify(await weightGoal())).toBe(canonicalStringify(goalBefore));

    const targetsBefore = await getSetting("bodyCompositionTargets");
    await editGoalSegment(goalBefore.id, goalBefore.segments[0]!.id, { target: 85, dueDate: "2027-06-30" }, NOW);
    expect(await getSetting("bodyCompositionTargets")).toEqual(targetsBefore);
  });
});
