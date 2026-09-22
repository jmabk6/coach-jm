import { describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, PerformedSeries, StrengthFrameVersion, StrengthMilestone, WorkoutSession } from "../models";
import { detectStagnation, formatFrameGoal, listVersionSessions, nextStep, proposeRaise } from "./strengthRules";

const T = "2026-09-22T10:00:00.000Z";
const kg = (value: number) => ({ kind: "total" as const, kg: value });

function version(overrides: Partial<StrengthFrameVersion> = {}): StrengthFrameVersion {
  return {
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
    ...overrides,
  };
}

let n = 0;
function series(load: number, reps: number, extra: Partial<PerformedSeries> = {}): PerformedSeries {
  n += 1;
  return { id: `s${n}`, position: n, status: "completed", role: "travail", load: kg(load), reps, rpe: 8, ...extra };
}

function session(id: string, date: string, list: PerformedSeries[], frameVersionId = "v1"): WorkoutSession {
  const block: PerformedExerciseBlock = {
    id: `${id}-b`,
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId: "presse",
    frameVersionId,
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
    series: list,
  };
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
    blocks: [block],
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T16:40:00.000Z`,
  };
}

function milestone(id: string, workoutId: string, date: string, value: number, extra: Partial<StrengthMilestone> = {}): StrengthMilestone {
  return { id, frameVersionId: "v1", workoutId, date, value, unit: "kg", createdAt: `${date}T16:40:00.000Z`, ...extra };
}

describe("cran suivant et objectif", () => {
  it("+ incrément pour la charge et la durée, − incrément borné à zéro pour l'assistance", () => {
    expect(nextStep(version(), 100)).toBe(102.5);
    expect(nextStep(version({ progressionType: "duree_croissante", increment: { unit: "sec", value: 5 } }), 45)).toBe(50);
    expect(nextStep(version({ progressionType: "assistance_decroissante", increment: { unit: "kg", value: 5 } }), 20)).toBe(15);
    expect(nextStep(version({ progressionType: "assistance_decroissante", increment: { unit: "kg", value: 5 } }), 2.5)).toBe(0);
    expect(nextStep(version({ increment: { unit: "kg", value: 0.1 } }), 0.2)).toBe(0.3);
  });

  it("formule l'objectif pour valider", () => {
    expect(formatFrameGoal(version())).toBe("2 × 12 · RPE ≤ 8");
    const plank = version({ progressionType: "duree_croissante", targetDurationSec: 45, currentTarget: { value: 50, unit: "sec", acceptedAt: T } });
    delete plank.repRange;
    delete plank.rpeTarget;
    expect(formatFrameGoal(plank)).toBe("2 × 50 s");
  });
});

describe("proposeRaise — hausse proposée (spec § 7, v1.6 événements 5 et 6)", () => {
  const w1 = session("w1", "2026-09-20", [series(100, 12), series(100, 12)]);
  const m1 = milestone("m1", "w1", "2026-09-20", 100);

  it("après un jalon : le cran suivant et le bas de la plage ; rien sans jalon ni sur une version archivée", () => {
    expect(proposeRaise(version(), [m1], [w1])).toEqual({ milestone: m1, value: 102.5, unit: "kg", repFloor: 10 });
    expect(proposeRaise(version(), [], [w1])).toBeUndefined();
    expect(proposeRaise(version({ status: "archived" }), [m1], [w1])).toBeUndefined();
    /* Le jalon d'une autre version ne compte pas. */
    expect(proposeRaise(version({ id: "v2" }), [m1], [w1])).toBeUndefined();
  });

  it("hausse déjà acceptée depuis ce jalon : plus proposée ; acceptée depuis un jalon antérieur : proposée depuis le nouveau", () => {
    const accepted = version({ currentTarget: { value: 102.5, unit: "kg", acceptedAt: T, fromMilestoneId: "m1" } });
    expect(proposeRaise(accepted, [m1], [w1])).toBeUndefined();

    const w2 = session("w2", "2026-09-24", [series(102.5, 12), series(102.5, 12)]);
    const m2 = milestone("m2", "w2", "2026-09-24", 102.5);
    /* Après w2 le jalon a effacé l'objectif ; même si un ancien objectif traînait, il ne vient pas de m2. */
    expect(proposeRaise(accepted, [m1, m2], [w1, w2])).toMatchObject({ milestone: m2, value: 105 });
  });

  it("« rester » n'écrit rien : la proposition s'éteint dès qu'une séance sous la version suit le jalon", () => {
    const w2 = session("w2", "2026-09-24", [series(100, 11), series(100, 12)]);
    expect(proposeRaise(version(), [m1], [w1, w2])).toBeUndefined();

    /* Une séance postérieure sans cette version, ou importée, ou en cours, ne l'éteint pas. */
    const other = session("w3", "2026-09-25", [series(50, 12)], "v-autre");
    const imported = { ...session("import-2026-09-26", "2026-09-26", [series(100, 12)]), id: "import-2026-09-26" };
    const running: WorkoutSession = { ...session("w4", "2026-09-27", [series(100, 12)]), status: "in_progress" };
    expect(proposeRaise(version(), [m1], [w1, other, imported, running])).toMatchObject({ value: 102.5 });
  });

  it("assistance : cran vers le bas ; plafond atteint (zéro) : aucune hausse", () => {
    const pullups = version({ progressionType: "assistance_decroissante", increment: { unit: "kg", value: 5 }, repRange: { min: 6, max: 8 } });
    const m = milestone("m", "w1", "2026-09-20", 20);
    expect(proposeRaise(pullups, [m], [w1])).toEqual({ milestone: m, value: 15, unit: "kg", repFloor: 6 });
    expect(proposeRaise(pullups, [milestone("m0", "w1", "2026-09-20", 0, { ceilingReached: true })], [w1])).toBeUndefined();
  });

  it("durée : cran en secondes, sans bas de plage", () => {
    const plank = version({ progressionType: "duree_croissante", targetDurationSec: 45, increment: { unit: "sec", value: 5 } });
    delete plank.repRange;
    const m = { ...milestone("m", "w1", "2026-09-20", 45), unit: "sec" as const };
    expect(proposeRaise(plank, [m], [w1])).toEqual({ milestone: m, value: 50, unit: "sec" });
  });
});

describe("detectStagnation — trois séances consécutives (décision 8)", () => {
  const w1 = session("w1", "2026-09-20", [series(60, 12, { role: "echauffement" }), series(100, 11), series(100, 10)]);
  const w2 = session("w2", "2026-09-24", [series(100, 11), series(100, 9)]);
  const w3 = session("w3", "2026-09-28", [series(100, 10), series(100, 10)]);

  it("même charge, aucun total au-dessus du premier, aucun jalon : stagnation avec les trois totaux", () => {
    expect(detectStagnation(version(), [w1, w2, w3], [])).toEqual({
      sessions: [
        { workoutId: "w1", date: "2026-09-20", load: 100, total: 21 },
        { workoutId: "w2", date: "2026-09-24", load: 100, total: 20 },
        { workoutId: "w3", date: "2026-09-28", load: 100, total: 20 },
      ],
      load: 100,
      unit: "kg",
    });
    /* L'échauffement n'entre ni dans la charge ni dans le total. */
    expect(listVersionSessions(version(), [w1])[0]).toEqual({ workoutId: "w1", date: "2026-09-20", load: 100, total: 21 });
  });

  it("deux séances seulement, charge différente, total en hausse, ou jalon : pas de stagnation", () => {
    expect(detectStagnation(version(), [w1, w2], [])).toBeUndefined();

    const lighter = session("w3", "2026-09-28", [series(97.5, 12), series(97.5, 12)]);
    expect(detectStagnation(version(), [w1, w2, lighter], [])).toBeUndefined();

    const better = session("w3", "2026-09-28", [series(100, 12), series(100, 10)]);
    expect(detectStagnation(version(), [w1, w2, better], [])).toBeUndefined();

    expect(detectStagnation(version(), [w1, w2, w3], [milestone("m", "w3", "2026-09-28", 100)])).toBeUndefined();
  });

  it("seules les trois dernières comptent : une quatrième séance plus ancienne ne change rien, une plus récente déplace la fenêtre", () => {
    const old = session("w0", "2026-09-16", [series(100, 12), series(100, 12)]);
    expect(detectStagnation(version(), [old, w1, w2, w3], [])).toBeDefined();

    const w4 = session("w4", "2026-10-01", [series(100, 12), series(100, 11)]);
    /* Fenêtre w2, w3, w4 : w4 dépasse le total de w2 → pas de stagnation. */
    expect(detectStagnation(version(), [w1, w2, w3, w4], [])).toBeUndefined();
  });
});
