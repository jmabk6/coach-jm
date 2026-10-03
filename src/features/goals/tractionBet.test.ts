import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import { achievedRow, BET_PLAN, BET_PLAN_RANKS, betProgress, formatPosition, prescribe, sessionPosition, testHint, type BetSet } from "./tractionBet";

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

describe("rétroplanning figé : des étapes, pas des kilos", () => {
  it("26 dimanches du 04/10/2026 au 28/03/2027 ; paliers 42 → 7 puis l'essai strict ; 6 semaines TEST ; rang strictement croissant", () => {
    expect(BET_PLAN).toHaveLength(26);
    expect(BET_PLAN[0]!.date).toBe("2026-10-04");
    expect(BET_PLAN.at(-1)).toMatchObject({ date: "2027-03-28", strict: true });
    for (const row of BET_PLAN) expect(new Date(`${row.date}T12:00:00`).getDay(), row.date).toBe(0);
    expect(BET_PLAN.filter((row) => row.test).map((row) => row.date)).toEqual(["2026-10-25", "2026-11-22", "2026-12-20", "2027-01-17", "2027-02-14", "2027-03-14"]);
    expect(BET_PLAN.filter((row) => row.milestone).map((row) => `${row.milestone} ${row.date}`)).toEqual([
      "42 kg validé 2026-10-11",
      "35 kg validé 2026-11-15",
      "28 kg validé 2026-12-27",
      "21 kg validé 2027-01-31",
      "14 kg validé 2027-03-07",
      "7 kg en travail 2027-03-21",
      "Traction stricte 2027-03-28",
    ]);
    for (let index = 1; index < BET_PLAN_RANKS.length; index++) expect(BET_PLAN_RANKS[index]!, BET_PLAN[index]!.date).toBeGreaterThan(BET_PLAN_RANKS[index - 1]!);
    /* Les transitions sont des étapes à part entière. */
    expect(BET_PLAN_RANKS.slice(0, 3)).toEqual([23 / 24, 1, 1.25]);
    expect(BET_PLAN_RANKS[4]).toBeCloseTo(1.75, 5);
  });

  it("étape réelle = ligne la plus avancée égalée : 35 × 6 + 42 × 8 + 42 × 8 atteint le 18/10, pas la semaine TEST du 25/10", () => {
    expect(achievedRow(22 / 24)).toBe(-1);
    expect(achievedRow(sessionPosition([set(42, 8), set(42, 8), set(42, 7)]))).toBe(0);
    expect(achievedRow(sessionPosition([set(35, 6), set(42, 8), set(42, 8)]))).toBe(2);
    expect(achievedRow(sessionPosition([set(35, 6), set(35, 6), set(42, 8)]))).toBe(3);
    expect(achievedRow(sessionPosition([set(35, 7), set(35, 7), set(35, 7)]))).toBe(5);
  });
});

describe("le pari : prévu, réalisé, prochaine séance, écart en semaines", () => {
  it("03/10, la veille du rétroplanning : rien d'attendu, ni avance ni retard", () => {
    const progress = betProgress([muscuA("2026-10-02", [set(42, 8, 8), set(42, 8, 9), set(42, 6, 10)], { templateId: "v1-muscu-a" })], [], "2026-10-03");
    expect(progress).toMatchObject({ expected: -1, achieved: -1, delayWeeks: 0, gapLabel: "Conforme au rétroplanning" });
  });

  it("04/10, avant la séance (dernier résultat 8/8/6 le 02/10) : conforme, 7 paliers, 26 semaines, sans prévision", () => {
    const progress = betProgress([muscuA("2026-10-02", [set(42, 8, 8), set(42, 8, 9), set(42, 6, 10)], { templateId: "v1-muscu-a" })], [], "2026-10-04");
    expect(progress).toMatchObject({ delayWeeks: 0, gapLabel: "Conforme au rétroplanning", status: "on_track", statusLabel: "Conforme à la trajectoire", levelsLeft: 7, weeksLeft: 26 });
    expect(progress.forecast).toBeUndefined();
    expect(progress.prescription.minimum).toBe("8 / 8 / 7 minimum");
    expect(progress.rows[0]!.state).toBe("current");
    expect(progress.weight).toEqual({ target: 93.1 });
  });

  it("le 11/10 : 8/8/7 au lieu de 8/8/8 → en retard de 1 semaine, la séance suivante redemande 8/8/8, les dates ne bougent pas", () => {
    const workouts = [muscuA("2026-10-04", [set(42, 8, 8), set(42, 8, 9), set(42, 7, 9)]), muscuA("2026-10-11", [set(42, 8, 8), set(42, 8, 9), set(42, 7, 9)])];
    const progress = betProgress(workouts, [], "2026-10-11");
    expect(progress).toMatchObject({ achieved: 0, expected: 1, delayWeeks: 1, gapLabel: "En retard de 1 semaine", status: "watch" });
    expect(progress.prescription.minimum).toBe("8 / 8 / 8 minimum");
    expect(progress.rows.slice(0, 3).map((row) => [row.row.date, row.state])).toEqual([
      ["2026-10-04", "done"],
      ["2026-10-11", "current"],
      ["2026-10-18", "upcoming"],
    ]);
    expect(progress.rows[1]!.done?.sets.map((item) => item.reps)).toEqual([8, 8, 7]);
    /* Toujours bloqué le 15/11 : en retard de plusieurs semaines, rouge. */
    const stuck = betProgress([muscuA("2026-11-15", [set(42, 8, 9), set(42, 8, 9), set(42, 6, 10)])], [], "2026-11-15");
    expect(stuck).toMatchObject({ status: "late", statusLabel: "En retard" });
    expect(stuck.delayWeeks).toBeGreaterThan(3);
    expect(stuck.rows.filter((row) => row.state === "late").length).toBeGreaterThan(3);
  });

  it("plus vite que prévu : la séance s'adapte tout de suite et l'avance s'affiche", () => {
    const workouts = [muscuA("2026-10-04", [set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]), muscuA("2026-10-11", [set(35, 6, 8), set(42, 8, 8), set(42, 8, 9)])];
    const progress = betProgress(workouts, [], "2026-10-11");
    expect(progress).toMatchObject({ achieved: 2, expected: 1, delayWeeks: -1, gapLabel: "En avance de 1 semaine", status: "on_track" });
    expect(progress.prescription.minimum).toBe("35 × 6 · 35 × 6 · 42 × 8 minimum");
    expect(progress.rows[2]!.state).toBe("ahead");
  });

  it("deux paliers validés tôt : « Dans les temps » et une prévision avant le 31/03 ; deux paliers mais trop lents : à surveiller", () => {
    const fast = [
      muscuA("2026-10-11", [set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]),
      muscuA("2026-10-25", [set(35, 8, 8), set(35, 8, 8), set(35, 8, 9)]),
    ];
    const progress = betProgress(fast, [], "2026-10-27");
    expect(progress.statusLabel).toBe("Dans les temps");
    expect(progress.forecast! <= "2027-03-31").toBe(true);
    expect(progress.trajectory.slice(0, 2).map((point) => point.reached)).toEqual([true, true]);

    const slow = [
      muscuA("2026-10-11", [set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]),
      muscuA("2026-11-08", [set(35, 8, 8), set(35, 8, 8), set(35, 8, 9)]),
    ];
    const slowProgress = betProgress(slow, [], "2026-11-10");
    expect(slowProgress.delayWeeks).toBeLessThan(0);
    expect(slowProgress.forecast! > "2027-03-31").toBe(true);
    expect(slowProgress.status).toBe("watch");
  });

  it("semaine TEST : le résultat du test et les 2 séries apparaissent sur la ligne ; un palier validé ne se perd pas ; le poids reste à côté", () => {
    const workouts = [
      muscuA("2026-10-11", [set(42, 8, 8), set(42, 8, 8), set(42, 8, 9)]),
      muscuA("2026-10-18", [set(35, 4, 10), set(42, 8, 9), set(42, 7, 10)]),
      muscuA("2026-10-25", [set(35, 6), set(35, 6)], { reduced: true }),
      muscuA("2026-10-20", [set(28, 10), set(28, 10)], { templateId: "v2-muscu-b" }),
    ];
    const results = [{ protocolId: "protocol-traction", date: "2026-10-25", measures: [{ key: "assistance_min_kg", value: 21 }] }];
    const progress = betProgress(workouts, [{ date: "2026-10-24", kg: 89.4 }], "2026-10-26", results);
    expect(progress.last?.date).toBe("2026-10-18");
    expect(progress.position).toBeGreaterThanOrEqual(1);
    const testRow = progress.rows[3]!;
    expect(testRow).toMatchObject({ testResultKg: 21, row: { test: { targetKg: 21 } } });
    expect(testRow.done?.sets.map((item) => item.assistKg)).toEqual([35, 35]);
    expect(progress.weight.last).toEqual({ date: "2026-10-24", kg: 89.4 });
    expect(progress.weight.target).toBeLessThan(89.4);
  });
});
