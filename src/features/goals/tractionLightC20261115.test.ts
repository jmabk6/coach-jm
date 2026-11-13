import { describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { betBannerFor } from "../workout/betBanner";
import { V6_LIGHT_BLOCK_ID, v6LightTemplateIdAt, v6SnapshotAdjustments, v6State } from "./tractionV6";

/**
 * Programme 4+2 (15/11/2026) : la traction légère du pari V6 passe de la
 * Muscu B à la Muscu C avec sa brique `v2-muscu-b-traction`. Mêmes règles :
 * aide = palier A validé + 7 kg, 3 × 8-10 préremplies à 8, 2 × 8 en semaine
 * test. Avant le 15/11, rien ne change.
 */

const block: PerformedExerciseBlock = {
  id: "t", kind: "exercise", position: 1, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "not_performed",
  snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 8, max: 10 }, restBetweenSetsSec: 120 },
  series: [],
};

/** Une Muscu A : palier A validé à 21 kg (3 × 5 à RPE 9). */
const forceA = (date: string, kg: number) =>
  ({
    id: `w-${date}`, source: "planned", kind: "training", status: "completed", date, sessionTemplateId: "v2-muscu-a",
    startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
    blocks: [{ ...block, sourceBlockId: "v2-muscu-a-traction", status: "performed", series: [0, 1, 2].map((index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps: 5, rpe: 9 })) }],
  }) as WorkoutSession;

const on = (date: string, templateId: string) => ({ id: "now", date, sessionTemplateId: templateId, blocks: [] }) as unknown as WorkoutSession;

/* Comme JM au 14/11 : 35, 28 puis 21 kg validés (3 × 5 le 08/11) → palier A à 14 kg, traction légère à 28 kg (21 + 7). */
const state = v6State([35, 28, 21].map((kg, index) => forceA(["2026-10-04", "2026-11-01", "2026-11-08"][index]!, kg)), "2026-11-14");

/** Les briques utiles des modèles B et C, avant et après la bascule. */
const muscuB = { id: "v2-muscu-b", blocks: [{ id: "v2-muscu-b-echauffement", kind: "exercise", role: "warmup" as const, instructions: { shape: "steps" } }, { id: "v2-muscu-b-developpe-epaules", kind: "exercise", instructions: { shape: "reps", sets: 3 } }] };
const muscuBV5 = { ...muscuB, blocks: [...muscuB.blocks, { id: V6_LIGHT_BLOCK_ID, kind: "exercise", instructions: { shape: "reps", sets: 2 } }] };
const muscuC = {
  id: "v2-muscu-c",
  blocks: [
    { id: "v2-muscu-c-echauffement", kind: "exercise", role: "warmup" as const, instructions: { shape: "steps" } },
    { id: "v2-muscu-c-suspension", kind: "exercise", instructions: { shape: "duration", sets: 2 } },
    { id: V6_LIGHT_BLOCK_ID, kind: "exercise", instructions: { shape: "reps", sets: 3 } },
    { id: "v2-muscu-c-negatives", kind: "exercise", instructions: { shape: "reps", sets: 2 } },
    { id: "v2-muscu-c-tirage-vertical", kind: "exercise", instructions: { shape: "reps", sets: 3 } },
  ],
};

describe("traction légère : Muscu B jusqu'au 14/11, Muscu C à partir du 15/11", () => {
  it("le modèle léger selon la date", () => {
    expect(v6LightTemplateIdAt("2026-11-10")).toBe("v2-muscu-b");
    expect(v6LightTemplateIdAt("2026-11-14")).toBe("v2-muscu-b");
    expect(v6LightTemplateIdAt("2026-11-15")).toBe("v2-muscu-c");
    expect(v6LightTemplateIdAt("2026-12-30")).toBe("v2-muscu-c");
  });

  it("bandeau : en C le 18/11, 21 kg validé → 28 kg, 3 × 8-10 préremplies à 8 ; en B le 10/11, même règle ; plus rien en B le 16/11", () => {
    expect(state.aKg).toBe(14);
    expect(state.bKg).toBe(28);
    const c = betBannerFor(on("2026-11-18", "v2-muscu-c"), block, state)!;
    expect(c.title).toBe("Traction légère — 28 kg d'aide (volume après 21 kg validé)");
    expect(c.lines).toEqual([{ label: "Cette séance", value: "28 kg — 3 × 8-10, RPE 6-8, jamais à l'échec" }]);
    expect(c.sets).toEqual([{ assistKg: 28, reps: 8 }, { assistKg: 28, reps: 8 }, { assistKg: 28, reps: 8 }]);
    expect(betBannerFor(on("2026-11-10", "v2-muscu-b"), block, state)).toEqual(c);
    expect(betBannerFor(on("2026-11-16", "v2-muscu-b"), block, state)).toBeUndefined();
    expect(betBannerFor(on("2026-11-12", "v2-muscu-c"), block, state)).toBeUndefined();
  });

  it("semaine test du 22/11 : en C, la traction légère à 2 séries (2 × 8) ; préremplissage 2 × 8", () => {
    const adjustments = v6SnapshotAdjustments(muscuC, "2026-11-25");
    expect(adjustments.find((item) => item.blockId === V6_LIGHT_BLOCK_ID)).toEqual({ blockId: V6_LIGHT_BLOCK_ID, sets: 2 });
    /* Les autres briques de C gardent la règle de la semaine test (moitié, arrondie au-dessus), l'échauffement ne bouge pas. */
    expect(adjustments).toEqual([
      { blockId: "v2-muscu-c-suspension", sets: 1 },
      { blockId: V6_LIGHT_BLOCK_ID, sets: 2 },
      { blockId: "v2-muscu-c-negatives", sets: 1 },
      { blockId: "v2-muscu-c-tirage-vertical", sets: 2 },
    ]);
    const banner = betBannerFor(on("2026-11-25", "v2-muscu-c"), block, state)!;
    expect(banner.lines[0]!.value).toBe("28 kg — 2 × 8, RPE 6-8 (semaine test)");
    expect(banner.sets).toHaveLength(2);
    /* B n'a plus de traction : aucun allègement. */
    expect(v6SnapshotAdjustments(muscuB, "2026-11-23")).toEqual([]);
  });

  it("hors semaine test : rien en C ; avant le 15/11, B garde sa règle (semaine test du 25/10 : 2 séries)", () => {
    expect(v6SnapshotAdjustments(muscuC, "2026-11-18")).toEqual([]);
    expect(v6SnapshotAdjustments(muscuBV5, "2026-10-27")).toEqual([{ blockId: V6_LIGHT_BLOCK_ID, sets: 2 }]);
    expect(v6SnapshotAdjustments(muscuBV5, "2026-11-10")).toEqual([]);
  });
});
