import { describe, expect, it } from "vitest";
import type { LoadSteps, PerformedExerciseBlock, WorkoutSession } from "../models";
import {
  assessLoadSession,
  availableLoads,
  estimatePace,
  forecastWeeks,
  isLargeStep,
  mondayOf,
  nextDurationTarget,
  nextLoadDown,
  nextLoadTarget,
  nextLoadUp,
  nextNegativesTarget,
  PACE_CAP,
  raiseTakenThisWeek,
  sessionLevel,
  shapeAt,
  trackResults,
  weeklyLevels,
  weekStatus,
  workSetsOf,
  type LoadPrescription,
  type PerformedSet,
  type SessionResult,
} from "./progressionRules";

/**
 * Perspectives au 31 mars (lot P1) : règles validées le 22/10/2026, sur
 * tes performances réelles (sauvegarde du 22/10 à 08:16).
 */

const NOW = "2026-10-22T08:00:00.000Z";
const HALTERES: LoadSteps = { base: 6, step: 2, below: [4, 5] };
const FIVE: LoadSteps = { base: 5, step: 5 };
const PRESSE: LoadSteps = { base: 10, step: 10 };
const POULIE: LoadSteps = { base: 2.5, step: 2.5 };

const set = (kg: number, reps: number, rpe?: number): PerformedSet => ({ kg, reps, ...(rpe !== undefined ? { rpe } : {}) });
const result = (date: string, sets: PerformedSet[], workoutId = `w-${date}`): SessionResult => ({ workoutId, date, sets });
const presc = (sets: number, repMin: number, repMax: number, rpeMax: number): LoadPrescription => ({ sets, repMin, repMax, rpeMax });

describe("crans réels", () => {
  it("haltères 4, 5, 6 puis de 2 en 2 ; presse de 10 en 10 (jamais 135) ; machines de 5 en 5", () => {
    expect(availableLoads(HALTERES, 12)).toEqual([4, 5, 6, 8, 10, 12]);
    expect([nextLoadUp(HALTERES, 4), nextLoadUp(HALTERES, 5), nextLoadUp(HALTERES, 6), nextLoadUp(HALTERES, 10)]).toEqual([5, 6, 8, 12]);
    expect([nextLoadDown(HALTERES, 8), nextLoadDown(HALTERES, 6), nextLoadDown(HALTERES, 4)]).toEqual([6, 5, undefined]);
    expect(nextLoadUp(PRESSE, 140)).toBe(150);
    expect(availableLoads(PRESSE, 160)).not.toContain(135);
    expect(nextLoadUp(FIVE, 55)).toBe(60);
    expect(nextLoadUp(POULIE, 15)).toBe(17.5);
  });

  it("grand cran au-delà de +15 %", () => {
    expect(isLargeStep(20, 25)).toBe(true);
    expect(isLargeStep(15, 17.5)).toBe(true);
    expect(isLargeStep(6, 8)).toBe(true);
    expect(isLargeStep(50, 55)).toBe(false);
    expect(isLargeStep(140, 150)).toBe(false);
  });
});

describe("objectif de la prochaine séance (exemples réels)", () => {
  it("développé épaules B, 20 kg · 8/8/8 · RPE 8/8/10 (plafond 9) : à consolider, mêmes répétitions, aucun +1", () => {
    const target = nextLoadTarget({ prescription: presc(3, 8, 10, 9), steps: FIVE, last: result("2026-10-21", [set(20, 8, 8), set(20, 8, 8), set(20, 8, 10)]), now: NOW });
    expect(target).toMatchObject({ kind: "consolidate", rpeMax: 9, sets: [{ kg: 20, reps: 8 }, { kg: 20, reps: 8 }, { kg: 20, reps: 8 }] });
    expect(target.reason).toContain("RPE 10");
  });

  it("chest press B, 55 kg · 8/8/6 · RPE 8/9/9 (plafond 9) : RPE 9 accepté ; +1 visé sur la 3e série seulement dans le plafond ; refaire 6 compte comme atteint", () => {
    const target = nextLoadTarget({ prescription: presc(3, 6, 8, 9), steps: FIVE, last: result("2026-10-21", [set(55, 8, 8), set(55, 8, 9), set(55, 6, 9)]), now: NOW });
    expect(target).toMatchObject({ kind: "progress", sets: [{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 7, stretch: true }] });
    expect(target.sets[0]!.stretch).toBeUndefined();
    expect(target.reason).toContain("seulement sans dépasser RPE 9");
    expect(assessLoadSession(target, [set(55, 8, 8), set(55, 8, 9), set(55, 6, 9)])).toMatchObject({ kind: "reached" });
    expect(assessLoadSession(target, [set(55, 8, 8), set(55, 8, 9), set(55, 7, 9)])).toMatchObject({ kind: "reached" });
    expect(assessLoadSession(target, [set(55, 8, 8), set(55, 8, 9), set(55, 8, 9)])).toMatchObject({ kind: "exceeded" });
    expect(assessLoadSession(target, [set(55, 8, 8), set(55, 8, 9), set(55, 5, 9)])).toMatchObject({ kind: "consolidate" });
    expect(assessLoadSession(target, [set(55, 8, 8), set(55, 8, 9), set(55, 7, 10)])).toMatchObject({ kind: "consolidate" });
  });

  it("non-régression (22/10) : séances répétées au plafond RPE 9, jamais de stagnation permanente — +1 visé à chaque séance, puis hausse de charge", () => {
    const chest = (sets: PerformedSet[]) => nextLoadTarget({ prescription: presc(3, 6, 8, 9), steps: FIVE, last: result("2026-10-21", sets), now: NOW });
    /* 8/8/6 au plafond : 6–7 visé ; refaire 6 au plafond redonne le même +1 visé, pas « mêmes répétitions ». */
    for (const rpe of [[8, 9, 9], [9, 9, 9]]) {
      expect(chest([set(55, 8, rpe[0]), set(55, 8, rpe[1]), set(55, 6, rpe[2])]).sets.map((item) => [item.reps, item.stretch ?? false])).toEqual([[8, false], [8, false], [7, true]]);
    }
    /* 7 obtenu au plafond : 8 visé ; 8/8/8 au plafond : palier validé, 60 kg. */
    expect(chest([set(55, 8, 9), set(55, 8, 9), set(55, 7, 9)]).sets.at(-1)).toEqual({ kg: 55, reps: 8, stretch: true });
    expect(chest([set(55, 8, 9), set(55, 8, 9), set(55, 8, 9)])).toMatchObject({ kind: "raise", sets: [{ kg: 60, reps: 6 }, { kg: 60, reps: 6 }, { kg: 60, reps: 6 }] });
  });

  it("+1 seulement sur les séries à au moins 1 point sous le plafond, jamais au-delà du haut de la fourchette", () => {
    const target = nextLoadTarget({ prescription: presc(3, 6, 8, 9), steps: FIVE, last: result("2026-10-21", [set(55, 8, 7), set(55, 7, 8), set(55, 6, 9)]), now: NOW });
    expect(target).toMatchObject({ kind: "progress", sets: [{ reps: 8 }, { reps: 8 }, { reps: 6 }] });
  });

  it("palier validé, petit cran : rowing A 50 kg · 8/8/8 → 55 kg, retour à 6", () => {
    const target = nextLoadTarget({ prescription: presc(3, 6, 8, 9), steps: FIVE, last: result("2026-10-19", [set(50, 8, 8), set(50, 8, 8), set(50, 8, 8)]), now: NOW });
    expect(target).toMatchObject({ kind: "raise", sets: [{ kg: 55, reps: 6 }, { kg: 55, reps: 6 }, { kg: 55, reps: 6 }] });
  });

  it("palier validé, grand cran : face pull C 15 kg · 15/15/15 → transition, 1 série à 17,5 kg", () => {
    const target = nextLoadTarget({ prescription: presc(3, 12, 15, 8), steps: POULIE, last: result("2026-10-15", [set(15, 15, 8), set(15, 15, 8), set(15, 15, 8)]), now: NOW });
    expect(target).toMatchObject({ kind: "transition", sets: [{ kg: 17.5, reps: 12 }, { kg: 15, reps: 15 }, { kg: 15, reps: 15 }] });
  });

  it("transition en cours : la série au nouveau cran atteint le bas de la fourchette → une série de plus au nouveau cran", () => {
    const target = nextLoadTarget({ prescription: presc(3, 12, 15, 8), steps: POULIE, last: result("2026-10-22", [set(17.5, 12, 8), set(15, 15, 7), set(15, 15, 7)]), now: NOW });
    expect(target).toMatchObject({ kind: "transition", sets: [{ kg: 17.5, reps: 12 }, { kg: 17.5, reps: 12 }, { kg: 15, reps: 15 }] });
    const stuck = nextLoadTarget({ prescription: presc(3, 12, 15, 8), steps: POULIE, last: result("2026-10-22", [set(17.5, 10, 8), set(15, 15, 7), set(15, 15, 7)]), now: NOW });
    expect(stuck).toMatchObject({ kind: "transition", sets: [{ kg: 17.5, reps: 10 }, { kg: 15, reps: 15 }, { kg: 15, reps: 15 }] });
  });

  it("transition faite dans l'autre sens : écarté C 5 · 5 · 7,5 kg (série lourde en dernier) → 7,5 · 7,5 · 5 kg, nouveau cran en premier", () => {
    const target = nextLoadTarget({ prescription: presc(3, 12, 15, 8), steps: POULIE, last: result("2026-10-15", [set(5, 15, 8), set(5, 15, 8), set(7.5, 12, 8)]), now: NOW });
    /* La série à 7,5 kg (12 rép., RPE 8) a atteint le bas de la fourchette : une série de plus au nouveau cran,
       et le nouveau cran toujours en premier — l'ordre de la séance du 15/10 n'est pas repris. */
    expect(target).toMatchObject({ kind: "transition", sets: [{ kg: 7.5, reps: 12, step: "new" }, { kg: 7.5, reps: 12, step: "new" }, { kg: 5, reps: 15, step: "previous" }] });
    expect(target.reason).toContain("toutes des séries de travail : séries 1 et 2 à 7,5 kg (nouveau cran), série 3 à 5 kg (ancien cran)");
  });

  it("hausse ratée : curl haltères A 8 kg · 12/8/7 · RPE 8/9/9 → 1 série à 8 kg, 2 à 6 kg (×12)", () => {
    const target = nextLoadTarget({ prescription: presc(3, 8, 12, 8), steps: HALTERES, last: result("2026-10-19", [set(8, 12, 8), set(8, 8, 9), set(8, 7, 9)]), now: NOW });
    expect(target).toMatchObject({ kind: "transition", sets: [{ kg: 8, reps: 12 }, { kg: 6, reps: 12 }, { kg: 6, reps: 12 }] });
  });

  it("RPE manquant ou série manquante : à consolider, jamais un palier supposé validé", () => {
    expect(nextLoadTarget({ prescription: presc(3, 10, 12, 8), steps: PRESSE, last: result("2026-10-19", [set(140, 12), set(140, 12, 8), set(140, 12, 8)]), now: NOW })).toMatchObject({ kind: "consolidate" });
    const partial = nextLoadTarget({ prescription: presc(3, 10, 12, 8), steps: PRESSE, last: result("2026-10-19", [set(140, 12, 8), set(140, 12, 8)]), now: NOW });
    expect(partial).toMatchObject({ kind: "consolidate", sets: [{ kg: 140, reps: 12 }, { kg: 140, reps: 12 }, { kg: 140, reps: 10 }] });
  });

  it("progression suspendue : ni objectif ni charge ; aucune séance : données insuffisantes ; crans inconnus : pas de hausse", () => {
    expect(nextLoadTarget({ prescription: presc(3, 10, 12, 8), steps: PRESSE, last: result("2026-10-21", [set(140, 12, 8), set(140, 12, 8), set(140, 12, 8)]), suspended: { reason: "douleurs lombaires" }, now: NOW })).toMatchObject({ kind: "suspended", sets: [] });
    expect(nextLoadTarget({ prescription: presc(3, 10, 12, 8), now: NOW })).toMatchObject({ kind: "insufficient", sets: [] });
    expect(nextLoadTarget({ prescription: presc(3, 10, 12, 8), last: result("2026-10-21", [set(140, 12, 8), set(140, 12, 8), set(140, 12, 8)]), now: NOW })).toMatchObject({ kind: "repeat", sets: [{ kg: 140 }, { kg: 140 }, { kg: 140 }] });
  });

  it("groupe partagé : au plus un cran par semaine pour A + B + C", () => {
    const history = [result("2026-10-15", [set(4, 15, 8), set(4, 15, 8), set(4, 15, 8)]), result("2026-10-20", [set(5, 15, 7), set(5, 15, 7), set(5, 15, 7)])];
    expect(raiseTakenThisWeek(history, "2026-10-22")).toBe(true);
    expect(raiseTakenThisWeek(history, "2026-10-26")).toBe(false);
    const target = nextLoadTarget({ prescription: presc(3, 12, 15, 8), steps: HALTERES, last: history[1], raiseThisWeek: true, now: NOW });
    expect(target).toMatchObject({ kind: "repeat", sets: [{ kg: 5, reps: 15 }, { kg: 5, reps: 15 }, { kg: 5, reps: 15 }] });
  });
});

describe("retour après la dernière série", () => {
  const target = nextLoadTarget({ prescription: presc(3, 8, 10, 9), steps: FIVE, last: result("2026-10-21", [set(20, 8, 7), set(20, 8, 9), set(20, 8, 9)]), now: NOW });

  it("cible 9/8/8 réussie en 10/9/8 dans le plafond : objectif dépassé", () => {
    expect(target.sets.map((item) => item.reps)).toEqual([9, 8, 8]);
    expect(assessLoadSession(target, [set(20, 10, 8), set(20, 9, 9), set(20, 8, 9)])).toMatchObject({ kind: "exceeded" });
    expect(assessLoadSession(target, [set(20, 9, 8), set(20, 8, 8), set(20, 8, 9)])).toMatchObject({ kind: "reached" });
  });

  it("RPE 10, série manquante, RPE absent : à consolider ou incomplet, jamais « atteint »", () => {
    expect(assessLoadSession(target, [set(20, 10, 8), set(20, 9, 9), set(20, 8, 10)])).toMatchObject({ kind: "consolidate" });
    expect(assessLoadSession(target, [set(20, 9, 8), set(20, 8, 8)])).toMatchObject({ kind: "incomplete" });
    expect(assessLoadSession(target, [set(20, 9, 8), set(20, 8), set(20, 8, 8)])).toMatchObject({ kind: "incomplete" });
  });
});

describe("suspension et négatives", () => {
  it("suspension sans assistance : +2 s là où il reste de la réserve, jusqu'à 30 s", () => {
    const p = { sets: 3, durationMin: 20, durationMax: 30, rpeMax: 8 };
    const last = { workoutId: "w", date: "2026-10-15", sets: [{ kg: 0, reps: 0, durationSec: 20, rpe: 7 }, { kg: 0, reps: 0, durationSec: 20, rpe: 8 }, { kg: 0, reps: 0, durationSec: 20, rpe: 8 }] };
    expect(nextDurationTarget(p, last, NOW)).toMatchObject({ kind: "progress", sets: [{ durationSec: 22 }, { durationSec: 20 }, { durationSec: 20 }] });
    expect(nextDurationTarget(p, undefined, NOW)).toMatchObject({ kind: "insufficient" });
  });

  it("négatives : descente 3 → 5 s, puis +1 répétition, descente ramenée à 3 s ; plafond 4 répétitions", () => {
    const at = (descents: number[], reps = 2) => ({ workoutId: "w", date: "2026-11-05", sets: [{ kg: 0, reps, repDurationsSec: descents }, { kg: 0, reps, repDurationsSec: descents }] });
    expect(nextNegativesTarget(2, undefined, NOW)).toMatchObject({ kind: "insufficient" });
    expect(nextNegativesTarget(2, at([3, 3]), NOW)).toMatchObject({ kind: "progress", sets: [{ reps: 2, durationSec: 4 }, { reps: 2, durationSec: 4 }] });
    expect(nextNegativesTarget(2, at([5, 5]), NOW)).toMatchObject({ kind: "progress", sets: [{ reps: 3, durationSec: 3 }, { reps: 3, durationSec: 3 }] });
    expect(nextNegativesTarget(2, at([5, 5, 5, 5], 4), NOW)).toMatchObject({ kind: "repeat" });
  });
});

describe("séances comparables", () => {
  const block = (sourceBlockId: string, series: NonNullable<PerformedExerciseBlock["series"]>): PerformedExerciseBlock => ({
    id: `workout-block-${sourceBlockId}`, sourceBlockId, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "presse-cuisses", status: "performed",
    snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 10, max: 12 }, restBetweenSetsSec: 120 }, series,
  });
  const workout = (id: string, date: string, blocks: PerformedExerciseBlock[], status: WorkoutSession["status"] = "completed") =>
    ({ id, date, status, blocks, source: "planned", startedAt: `${date}T10:00:00.000Z`, lastActionAt: "", activeDurationSec: 0, createdAt: "", updatedAt: "" }) as WorkoutSession;

  it("échauffement exclu ; pistes A et B distinctes ; séance non enregistrée ignorée ; anciennes séances avec repos réel acceptées", () => {
    const b = block("v2-muscu-b-presse", [
      { id: "1", position: 0, status: "completed", role: "echauffement", load: { kind: "total", kg: 100 }, reps: 10 },
      { id: "2", position: 1, status: "completed", role: "travail", load: { kind: "total", kg: 140 }, reps: 12, rpe: 8, actualRestAfterSec: 120, restComparable: true },
    ]);
    expect(workSetsOf(b)).toEqual([{ kg: 140, reps: 12, rpe: 8 }]);
    const a = block("v2-muscu-a-presse", [{ id: "3", position: 0, status: "completed", load: { kind: "total", kg: 140 }, reps: 10, rpe: 8 }]);
    const workouts = [workout("w1", "2026-10-19", [a]), workout("w2", "2026-10-21", [b]), workout("w3", "2026-10-22", [b], "in_progress")];
    expect(trackResults(workouts, ["v2-muscu-b-presse"]).map((item) => item.workoutId)).toEqual(["w2"]);
    expect(trackResults(workouts, ["v2-muscu-a-presse"]).map((item) => item.workoutId)).toEqual(["w1"]);
    expect(trackResults(workouts, ["v2-muscu-b-presse"], "2026-10-22")).toEqual([]);
  });
});

describe("prévision au 31 mars (hypothèses)", () => {
  /* Chest press B réelle : 45 · 8/8/8, 50 · 8/8/8, 55 · 8/8/6. */
  const chest = [
    result("2026-10-06", [set(45, 8, 8), set(45, 8, 8), set(45, 8, 8)]),
    result("2026-10-13", [set(50, 8, 8), set(50, 8, 8), set(50, 8, 9)]),
    result("2026-10-21", [set(55, 8, 8), set(55, 8, 9), set(55, 6, 9)]),
  ];

  it("rythme : médiane brute ≈ +10 %/semaine, retenue à 1,5 % ; provisoire sous 5 semaines ; stagnation → 0", () => {
    const pace = estimatePace(weeklyLevels(chest));
    expect(pace.raw!).toBeGreaterThan(0.08);
    expect(pace).toMatchObject({ weekly: PACE_CAP, points: 3, provisional: true });
    const shoulders = [result("2026-10-06", [set(20, 10, 8), set(20, 10, 9), set(20, 7, 10)]), result("2026-10-13", [set(20, 10, 8), set(20, 10, 9), set(20, 7, 9)]), result("2026-10-21", [set(20, 8, 8), set(20, 8, 8), set(20, 8, 10)])];
    expect(estimatePace(weeklyLevels(shoulders)).weekly).toBe(0);
  });

  it("plusieurs séances d'une même semaine ne font qu'un point (groupe partagé)", () => {
    expect(weeklyLevels([result("2026-10-19", [set(5, 12, 8)]), result("2026-10-21", [set(5, 15, 8)]), result("2026-10-22", [set(5, 15, 8)])])).toHaveLength(1);
  });

  it("chest press : jusqu'au 31/03 au plus, jamais sous 55 kg, au plus un cran par semaine, fourchette ordonnée, 60–70 kg en mars", () => {
    const pace = estimatePace(weeklyLevels(chest));
    const weeks = forecastWeeks({ level: sessionLevel(chest[2]!), pace, fromWeek: mondayOf("2026-10-26"), until: "2027-03-31", prescription: presc(3, 6, 8, 9), steps: FIVE, currentKg: 55 });
    expect(weeks[0]!.week).toBe("2026-10-26");
    expect(weeks.at(-1)!.week <= "2027-03-31").toBe(true);
    expect(weeks.at(-1)!.week).toBe("2027-03-29");
    weeks.forEach((week, index) => {
      expect(week.probable!.kg!).toBeGreaterThanOrEqual(55);
      expect(week.low!.kg!).toBeLessThanOrEqual(week.probable!.kg!);
      expect(week.high!.kg!).toBeGreaterThanOrEqual(week.probable!.kg!);
      if (index > 0) expect(week.probable!.kg! - weeks[index - 1]!.probable!.kg!).toBeLessThanOrEqual(5);
    });
    expect(weeks.at(-1)!.probable!.kg!).toBeGreaterThanOrEqual(60);
    expect(weeks.at(-1)!.probable!.kg!).toBeLessThanOrEqual(70);
  });

  it("double progression : on reste à la charge tant que le haut de la fourchette n'est pas atteint", () => {
    expect(shapeAt(55 * (1 + (7 + 1) / 30), presc(3, 6, 8, 9), FIVE, 55)).toEqual({ kg: 55, reps: 7 });
    expect(shapeAt(60 * (1 + (6 + 1) / 30), presc(3, 6, 8, 9), FIVE, 55)).toEqual({ kg: 60, reps: 6 });
  });
});

describe("statut d'une semaine", () => {
  it("à venir jamais jugée ; non faite ; en avance ; dans la trajectoire ; à consolider ; suspendue", () => {
    expect(weekStatus({ week: "2026-11-02", today: "2026-10-22", initialLevel: 70, actualLevel: 90 })).toBe("upcoming");
    expect(weekStatus({ week: "2026-10-12", today: "2026-10-22", initialLevel: 70 })).toBe("missed");
    expect(weekStatus({ week: "2026-10-19", today: "2026-10-22", initialLevel: 70, actualLevel: 73.3 })).toBe("ahead");
    expect(weekStatus({ week: "2026-10-19", today: "2026-10-22", initialLevel: 73, actualLevel: 73.3 })).toBe("on_track");
    expect(weekStatus({ week: "2026-10-19", today: "2026-10-22", initialLevel: 80, actualLevel: 73.3 })).toBe("consolidate");
    expect(weekStatus({ week: "2026-10-19", today: "2026-10-22", initialLevel: 80, actualLevel: 73.3, suspended: true })).toBe("suspended");
  });
});
