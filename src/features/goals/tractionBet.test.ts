import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import { betProgress, expectedPosition, formatPosition, prescribe, sessionPosition, testHint, type BetSet } from "./tractionBet";

/**
 * Pari traction du 31/03/2027 (03/10/2026) : la performance commande la
 * séance ; le 31/03 est fixe ; pas de prévision avant deux paliers ; la
 * progression dans un palier compte.
 */

const set = (assistKg: number, reps: number, rpe?: number): BetSet => ({ assistKg, reps, ...(rpe !== undefined ? { rpe } : {}) });

function muscuA(date: string, sets: BetSet[], extra: { templateId?: string; reduced?: boolean } = {}): WorkoutSession {
  return {
    id: `w-${date}`, source: "planned", kind: "training", status: "completed", date, sessionTemplateId: extra.templateId ?? "v2-muscu-a",
    startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: `${date}T10:00:00.000Z`, activeDurationSec: 3600,
    createdAt: "x", updatedAt: "x",
    blocks: [{
      id: "b", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "performed",
      ...(extra.reduced ? { reducedPrescription: true as const } : {}),
      snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 },
      series: sets.map((item, index) => ({
        id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const,
        load: { kind: "total" as const, kg: item.assistKg }, reps: item.reps, ...(item.rpe !== undefined ? { rpe: item.rpe } : {}),
      })),
    }],
  } as WorkoutSession;
}

describe("position : paliers validés et progression dans le palier", () => {
  it("8/8/6 à 42 kg → 0,92 ; 8/8/7 → 0,96 ; 3 × 8 à RPE 9 → 1 (42 validé) ; à RPE 10 → pas validé", () => {
    expect(sessionPosition([set(42, 8, 8), set(42, 8, 9), set(42, 6, 10)])).toBeCloseTo(22 / 24, 5);
    expect(sessionPosition([set(42, 8), set(42, 8), set(42, 7)])).toBeCloseTo(23 / 24, 5);
    expect(sessionPosition([set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)])).toBe(1);
    expect(sessionPosition([set(42, 8, 8), set(42, 8, 9), set(42, 8, 10)])).toBeCloseTo(1, 5);
    expect(sessionPosition([set(42, 8, 8), set(42, 8, 9), set(42, 8, 10)])).toBeLessThanOrEqual(1);
    /* Introduction du palier suivant : 35 × 6 compte au palier 35. */
    expect(sessionPosition([set(35, 6), set(42, 8), set(42, 8)])).toBeCloseTo(1.25, 5);
    expect(sessionPosition([set(0, 1), set(7, 8), set(7, 8)])).toBe(7);
    expect(formatPosition(22 / 24)).toBe("42 kg en cours (22 / 24 répétitions)");
    expect(formatPosition(1)).toBe("42 kg validé");
    expect(formatPosition(1.25)).toBe("35 kg en cours (6 / 24 répétitions)");
  });
});

describe("prescription : la prochaine Muscu A, d'après la dernière", () => {
  it("8/8/6 → 8/8/7 minimum ; validation 8/8/8 ; ensuite 35 kg avec une série d'introduction ; Muscu B à 49 kg", () => {
    /* Le 02/10 : 8 / 8 / 6, RPE 8 / 9 / 10 → 8 / 8 / 7 minimum ; le RPE 10 empêche seulement de changer de palier. */
    const next = prescribe([set(42, 8, 8), set(42, 8, 9), set(42, 6, 10)]);
    expect(next.sets).toEqual([set(42, 8), set(42, 8), set(42, 7)]);
    expect(next.minimum).toBe("8 / 8 / 7 minimum");
    expect(next.note).toBe("RPE 10 sur la dernière série : on reste à 42 kg.");
    /* 3 × 8 mais à RPE 10 : pas validé, même objectif 8 / 8 / 8. */
    expect(prescribe([set(42, 8, 8), set(42, 8, 9), set(42, 8, 10)]).sets).toEqual([set(42, 8), set(42, 8), set(42, 8)]);

    const progress = prescribe([set(42, 8, 8), set(42, 8, 9), set(42, 6, 9)]);
    expect(progress).toMatchObject({ levelKg: 42, minimum: "8 / 8 / 7 minimum", validation: "8 / 8 / 8, dernière série à RPE 9 au plus", lightAssistKg: 49 });
    expect(progress.next).toBe("35 kg, avec une série d'introduction (35 × 6)");
  });

  it("palier validé → introduction 35 × 6 · 42 × 8 · 42 × 8 ; puis 2 séries, puis 3 ; très facile → proposition d'accélérer", () => {
    const intro = prescribe([set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]);
    expect(intro.sets).toEqual([set(35, 6), set(42, 8), set(42, 8)]);
    expect(intro.note).toBe("Palier 42 kg validé.");
    expect(intro.minimum).toBe("35 × 6 · 42 × 8 · 42 × 8 minimum");

    expect(prescribe([set(35, 6, 8), set(42, 8, 8), set(42, 8, 9)]).sets).toEqual([set(35, 6), set(35, 6), set(42, 8)]);
    expect(prescribe([set(35, 6, 8), set(35, 6, 8), set(42, 8, 9)]).sets).toEqual([set(35, 6), set(35, 6), set(35, 6)]);
    expect(prescribe([set(35, 5, 9), set(42, 8, 8), set(42, 8, 9)]).note).toBe("Introduction pas encore tenue : même étape.");
    expect(prescribe([set(42, 8, 6), set(42, 8, 7), set(42, 8, 7)]).note).toBe("Très facile : vous pouvez faire 2 séries au nouveau palier.");
  });

  it("7 kg validé → essai de traction stricte en début de séance", () => {
    const strict = prescribe([set(7, 8, 8), set(7, 8, 8), set(7, 8, 9)]);
    expect(strict.sets).toEqual([set(0, 1), set(7, 8), set(7, 8)]);
    expect(strict.next).toBe("essai de traction stricte (0 kg) en début de séance");
  });

  it("le test : un palier plus dur que le palier de travail, pas plus", () => {
    expect(testHint(prescribe([set(35, 7, 8), set(35, 7, 8), set(35, 6, 9)]))).toBe("Au test : commencez à 35 kg, puis 28 kg ; inutile de descendre plus bas.");
    expect(testHint(prescribe([set(7, 6, 8), set(7, 6, 8), set(7, 6, 9)]))).toBe("Essai de traction stricte (0 kg) dès l'échauffement fait.");
  });
});

describe("le pari : où j'en suis, où je devrais en être, vais-je y arriver", () => {
  it("04/10 après le 02/10 (8/8/6) : conforme à la trajectoire, 7 paliers, 26 semaines, sans date prévisionnelle", () => {
    const progress = betProgress([muscuA("2026-10-02", [set(42, 8, 8), set(42, 8, 9), set(42, 6, 10)], { templateId: "v1-muscu-a" })], [], "2026-10-04");
    expect(progress).toMatchObject({ status: "on_track", statusLabel: "Conforme à la trajectoire", levelsLeft: 7, weeksLeft: 26 });
    expect(progress.forecast).toBeUndefined();
    expect(progress.weeksPerLevelNeeded).toBeCloseTo(26 / (7 - 22 / 24), 0);
    expect(progress.weight).toEqual({ target: 93.1 });
  });

  it("encore 42 kg 8/8/6 le 15/11 : à surveiller ; toujours le 15/12 : en retard ; un peu de retard au 10/11 : à surveiller", () => {
    const stuck = [muscuA("2026-11-15", [set(42, 8, 9), set(42, 8, 9), set(42, 6, 10)])];
    expect(betProgress(stuck, [], "2026-11-15").status).toBe("watch");
    expect(betProgress(stuck, [], "2026-12-15")).toMatchObject({ status: "late", statusLabel: "En retard" });
    const oneBehind = [muscuA("2026-11-01", [set(42, 8, 9), set(42, 8, 9), set(42, 7, 9)])];
    expect(betProgress(oneBehind, [], "2026-11-10")).toMatchObject({ status: "watch", statusLabel: "À surveiller" });
  });

  it("deux paliers validés en avance : « Dans les temps » et une date prévisionnelle avant le 31/03", () => {
    const fast = [
      muscuA("2026-10-11", [set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]),
      muscuA("2026-10-25", [set(35, 8, 8), set(35, 8, 8), set(35, 8, 9)]),
    ];
    const progress = betProgress(fast, [], "2026-10-27");
    expect(progress.statusLabel).toBe("Dans les temps");
    expect(progress.forecast).toBeDefined();
    expect(progress.forecast! <= "2027-03-31").toBe(true);
    expect(progress.trajectory.slice(0, 2).map((point) => point.reached)).toEqual([true, true]);

    /* Deux paliers, mais à un rythme qui mène après le 31/03 : à surveiller, même en avance sur la trajectoire. */
    const slow = [
      muscuA("2026-10-11", [set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]),
      muscuA("2026-11-08", [set(35, 8, 8), set(35, 8, 8), set(35, 8, 9)]),
    ];
    const slowProgress = betProgress(slow, [], "2026-11-10");
    expect(slowProgress.gap).toBeGreaterThan(0);
    expect(slowProgress.forecast! > "2027-03-31").toBe(true);
    expect(slowProgress.status).toBe("watch");
  });

  it("un palier validé ne se perd pas ; un jour de test (2 séries) et les autres séances ne comptent pas ; le poids est affiché à côté", () => {
    const workouts = [
      muscuA("2026-10-11", [set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]),
      muscuA("2026-10-18", [set(35, 4, 10), set(42, 8, 9), set(42, 7, 10)]),
      muscuA("2026-10-25", [set(35, 6), set(35, 6)], { reduced: true }),
      muscuA("2026-10-20", [set(28, 10), set(28, 10)], { templateId: "v2-muscu-b" }),
    ];
    const progress = betProgress(workouts, [{ date: "2026-10-24", kg: 89.4 }], "2026-10-26");
    expect(progress.last?.date).toBe("2026-10-18");
    expect(progress.position).toBeGreaterThanOrEqual(1);
    expect(progress.weight.last).toEqual({ date: "2026-10-24", kg: 89.4 });
    expect(progress.weight.target).toBeLessThan(89.4);
    expect(expectedPosition("2027-04-02")).toBe(7);
  });
});
