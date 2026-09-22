import { describe, expect, it } from "vitest";
import type { Exercise, PerformedExerciseBlock, PerformedSeries, StrengthFrameVersion, WorkoutSession } from "../../domain";
import { buildWorkoutRecapLines, withFrameLines } from "../workout/workoutRecap";
import { currentLoadOf, frameOutcomesOf, lastSessionOutcome, latestMilestone, proposeStartingLoad } from "./frameReadings";

const T = "2026-09-22T10:00:00.000Z";
const kg = (value: number) => ({ kind: "total" as const, kg: value });

const version: StrengthFrameVersion = {
  id: "v1",
  frameId: "f1",
  number: 1,
  status: "active",
  progressionType: "charge_croissante",
  workSets: 2,
  repRange: { min: 10, max: 12 },
  rpeTarget: 8,
  restSec: 90,
  increment: { unit: "kg", value: 2.5 },
  createdAt: T,
  updatedAt: T,
};

function series(id: string, load: number, reps: number, rpe: number, extra: Partial<PerformedSeries> = {}): PerformedSeries {
  return { id, position: 0, status: "completed", role: "travail", load: kg(load), reps, rpe, ...extra };
}

function block(id: string, exerciseId: string, list: PerformedSeries[], frameVersionId?: string): PerformedExerciseBlock {
  return {
    id,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId,
    ...(frameVersionId ? { frameVersionId } : {}),
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: list.length, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
    series: list,
  };
}

function workout(id: string, date: string, blocks: PerformedExerciseBlock[], extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    source: "free",
    status: "completed",
    kind: "training",
    date,
    startedAt: `${date}T16:00:00.000Z`,
    lastActionAt: `${date}T16:40:00.000Z`,
    completedAt: `${date}T16:40:00.000Z`,
    activeDurationSec: 2400,
    blocks,
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T16:40:00.000Z`,
    ...extra,
  };
}

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
  createdAt: T,
  updatedAt: T,
};

describe("lectures d'un cadre", () => {
  const w1 = workout("import-2026-09-10", "2026-09-10", [block("b", "presse", [series("s1", 90, 12, 7), series("s2", 90, 12, 8)])]);
  const w2 = workout("w2", "2026-09-20", [
    block("b", "presse", [series("s0", 60, 12, 5, { role: "echauffement" }), series("s1", 100, 12, 8), series("s2", 100, 11, 9)], "v1"),
  ]);
  const w3 = workout("w3", "2026-09-24", [block("b", "presse", [series("s1", 100, 12, 8), series("s2", 100, 12, 8)], "v1")]);
  const running = workout("w4", "2026-09-26", [block("b", "presse", [series("s1", 110, 12, 8)], "v1")], { status: "in_progress" });

  it("charge en cours : dernière série de travail de la dernière séance terminée, séances importées comprises", () => {
    expect(currentLoadOf("presse", "kg", [w1, w2, running])).toEqual({ value: 100, unit: "kg", workoutId: "w2", date: "2026-09-20" });
    expect(currentLoadOf("presse", "kg", [w1])).toEqual({ value: 90, unit: "kg", workoutId: "import-2026-09-10", date: "2026-09-10" });
    expect(currentLoadOf("presse", "kg", [])).toBeUndefined();
    expect(currentLoadOf("autre", "kg", [w1, w2])).toBeUndefined();
    expect(proposeStartingLoad(presse, [w2, w1])).toMatchObject({ value: 100 });
  });

  it("dernière séance sous la version : recalculée, séances importées ignorées", () => {
    expect(lastSessionOutcome(version, [w1, w2])).toEqual({
      workoutId: "w2",
      date: "2026-09-20",
      result: { validated: false, reason: "reps_insuffisantes" },
    });
    expect(lastSessionOutcome(version, [w1, w2, w3, running])).toEqual({
      workoutId: "w3",
      date: "2026-09-24",
      result: { validated: true, value: 100, unit: "kg" },
    });
    expect(lastSessionOutcome(version, [w1])).toBeUndefined();
  });

  it("dernier jalon : par date puis création", () => {
    const base = { frameVersionId: "v1", workoutId: "w", unit: "kg" as const };
    expect(
      latestMilestone([
        { ...base, id: "a", date: "2026-09-20", value: 100, createdAt: "2026-09-20T17:00:00.000Z" },
        { ...base, id: "b", date: "2026-09-24", value: 102.5, createdAt: "2026-09-24T17:00:00.000Z" },
        { ...base, id: "c", date: "2026-09-24", value: 105, createdAt: "2026-09-24T18:00:00.000Z" },
      ])?.id,
    ).toBe("c");
    expect(latestMilestone([])).toBeUndefined();
  });

  it("récap : la ligne de cadre sur la brique, rien hors cadre, rien pour un bilan ou un import", () => {
    const versionById = new Map([["v1", version]]);
    const exerciseById = new Map([["presse", presse]]);

    const outcomes = frameOutcomesOf(w2, versionById);
    expect(outcomes.get("v1")).toEqual({ validated: false, reason: "reps_insuffisantes" });
    const lines = withFrameLines(buildWorkoutRecapLines(w2, exerciseById), outcomes, exerciseById, versionById);
    expect(lines[0]?.frameLine).toBe("Non validé — répétitions insuffisantes");

    const ok = withFrameLines(buildWorkoutRecapLines(w3, exerciseById), frameOutcomesOf(w3, versionById), exerciseById, versionById);
    expect(ok[0]?.frameLine).toBe("Validé — 100 kg");

    /* Charges différentes : l'explication de la précision du 22/09/2026, avec le nombre de séries du cadre. */
    const climbing = workout("w5", "2026-09-28", [block("b", "presse", [series("s1", 100, 12, 8), series("s2", 105, 12, 8)], "v1")]);
    const lines5 = withFrameLines(buildWorkoutRecapLines(climbing, exerciseById), frameOutcomesOf(climbing, versionById), exerciseById, versionById);
    expect(lines5[0]?.frameLine).toBe("Palier validé à 100 kg — 105 kg reste à confirmer sur 2 séries");

    expect(frameOutcomesOf(w1, versionById).size).toBe(0);
    expect(frameOutcomesOf({ ...w3, kind: "mobility_assessment" }, versionById).size).toBe(0);
    expect(frameOutcomesOf({ ...w3, id: "import-x" }, versionById).size).toBe(0);
    const bare = withFrameLines(buildWorkoutRecapLines(w1, exerciseById), new Map(), exerciseById, versionById);
    expect(bare[0]).not.toHaveProperty("frameLine");
  });
});
