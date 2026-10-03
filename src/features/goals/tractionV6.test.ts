import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import type { BetSet } from "./tractionBet";
import {
  effectiveLoad, isRepli, V6_REFERENCE, v6Color, v6EarlyFreeTry, v6ForceSession, v6LightSession, v6State, v6WeekOf, v6WeightGuard,
} from "./tractionV6";

/**
 * Pari traction V6 (04/10/2026) : référence figée, réel adaptatif ; seul
 * 5/5/5 en séance A valide ; le repli ne change pas A ; le test ne valide
 * jamais A ; couleur par crans, jamais d'écart en semaines.
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
      snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 },
      series: sets.map((item, index) => ({
        id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const,
        load: { kind: "total" as const, kg: item.assistKg }, reps: item.reps, ...(item.rpe !== undefined ? { rpe: item.rpe } : {}),
      })),
    }],
  } as WorkoutSession;
}

describe("référence V6 : figée", () => {
  it("26 dimanches du 04/10 au 28/03, 6 semaines test, paliers de référence 35 → 7", () => {
    expect(V6_REFERENCE).toHaveLength(26);
    for (const week of V6_REFERENCE) expect(new Date(`${week.date}T12:00:00`).getDay(), week.date).toBe(0);
    expect(V6_REFERENCE.filter((week) => week.kind === "test").map((week) => week.number)).toEqual([4, 8, 12, 16, 20, 24]);
    expect(V6_REFERENCE.map((week) => week.refKg)).toEqual([
      35, 35, 35, 35, 28, 28, 28, 28, 21, 21, 21, 21, 21, 14, 14, 14, 14, 14, 7, 7, 7, 7, 7, 7, 7, 7,
    ]);
    expect(V6_REFERENCE.map((week) => week.weightKg).slice(0, 19)).toEqual([92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 75]);
    expect(V6_REFERENCE.slice(-2).map((week) => week.kind)).toEqual(["essai", "essai"]);
    /* Semaine du dimanche au samedi. */
    expect(v6WeekOf("2026-10-06").number).toBe(1);
    expect(v6WeekOf("2026-10-11").number).toBe(2);
    expect(v6WeekOf("2026-09-30").number).toBe(1);
    expect(v6WeekOf("2027-03-31").number).toBe(26);
  });
});

describe("réel : palier A, validation, repli", () => {
  it("départ : A = 35, B = 42 ; le 42 kg du 02/10 est antérieur à la V6 et ignoré", () => {
    const state = v6State([muscuA("2026-10-02", [set(42, 8, 8), set(42, 8, 9), set(42, 6, 10)])], "2026-10-04");
    expect(state).toMatchObject({ aKg: 35, bKg: 42, phase: "travail", events: [] });
  });

  it("5/5/5 à 35 → A = 28 immédiatement, B = 35 ; 4/4/3 ne valide pas", () => {
    expect(v6State([muscuA("2026-10-04", [set(35, 4), set(35, 4), set(35, 3)])], "2026-10-04").aKg).toBe(35);
    const state = v6State([muscuA("2026-10-04", [set(35, 4)]), muscuA("2026-10-11", [set(35, 5), set(35, 5), set(35, 5, 9)])], "2026-10-12");
    expect(state).toMatchObject({ aKg: 28, bKg: 35 });
    expect(state.events.map((event) => [event.kind, event.date, event.detail])).toEqual([["validation", "2026-10-11", "35 kg"]]);
  });

  it("repli : 1ʳᵉ série à 2 reps ou RPE 10 → noté, A inchangé, exclu des régressions", () => {
    expect(isRepli([set(35, 2), set(42, 5), set(42, 5)], 35)).toBe(true);
    expect(isRepli([set(35, 4, 10), set(42, 5), set(42, 5)], 35)).toBe(true);
    expect(isRepli([set(35, 3, 9), set(35, 3), set(35, 2)], 35)).toBe(false);
    const state = v6State([
      muscuA("2026-10-04", [set(35, 4), set(35, 4), set(35, 3)]),
      muscuA("2026-10-11", [set(35, 2, 10), set(42, 5), set(42, 5)]),
    ], "2026-10-12");
    expect(state.aKg).toBe(35);
    expect(state.events.map((event) => event.kind)).toEqual(["repli"]);
    expect(state.consecutiveRegressions).toBe(0);
  });

  it("le test ne valide jamais A : séance test (prescription réduite) et Muscu B ignorées", () => {
    const state = v6State([
      muscuA("2026-10-25", [set(35, 5), set(35, 5), set(35, 5)], { reduced: true }),
      muscuA("2026-10-27", [set(35, 10), set(35, 10), set(35, 10)], { templateId: "v2-muscu-b" }),
    ], "2026-10-28");
    expect(state.aKg).toBe(35);
  });

  it("7 kg validé → phase essai libre (A reste 7 en back-off, B = 14), jamais « 0 × 3 séries » ; 0 kg réussi → gagné", () => {
    const workouts = [muscuA("2027-02-21", [set(7, 5), set(7, 5), set(7, 5)])];
    const free = v6State([muscuA("2026-10-04", [set(35, 5), set(35, 5), set(35, 5)]), muscuA("2026-11-01", [set(28, 5), set(28, 5), set(28, 5)]),
      muscuA("2026-12-06", [set(21, 5), set(21, 5), set(21, 5)]), muscuA("2027-01-10", [set(14, 5), set(14, 5), set(14, 5)]), ...workouts], "2027-02-22");
    expect(free).toMatchObject({ phase: "essai_libre", aKg: 7, bKg: 14 });
    const session = v6ForceSession(free);
    expect(session.sets[0]).toEqual(set(0, 1));
    expect(session.sets.slice(1).every((item) => item.assistKg === 7)).toBe(true);

    const dates = ["2026-10-04", "2026-11-01", "2026-12-06", "2027-01-10", "2027-02-21"];
    const failed = v6State([...[35, 28, 21, 14, 7].map((kg, index) => muscuA(dates[index]!, [set(kg, 5), set(kg, 5), set(kg, 5)])),
      muscuA("2027-03-21", [set(0, 0), set(7, 5), set(7, 4)])], "2027-03-22");
    expect(failed.phase).toBe("essai_libre");
    expect(failed.events.at(-1)?.kind).toBe("essai_echoue");

    const won = v6State([muscuA("2026-10-04", [set(35, 5), set(35, 5), set(35, 5)]), muscuA("2027-03-28", [set(0, 1), set(7, 5)])], "2027-03-31");
    expect(won.phase).toBe("gagne");
    expect(v6Color(won, "2027-03-31")).toBe("gagne");
  });
});

describe("statut : couleur par crans, reps à aide identique seulement", () => {
  it("S1 à 35 : vert ; S5 encore à 35 : orange ; S9 encore à 35 : rouge ; en avance : vert", () => {
    const at35 = v6State([], "2026-10-04");
    expect(v6Color(at35, "2026-10-04")).toBe("vert");
    expect(v6Color(at35, "2026-11-01")).toBe("orange");
    expect(v6Color(at35, "2026-11-29")).toBe("rouge");
    /* Semaine test S4 : référence = palier de force de S3 (35). */
    expect(v6Color(at35, "2026-10-25")).toBe("vert");
    const ahead = v6State([muscuA("2026-10-04", [set(35, 5), set(35, 5), set(35, 5)])], "2026-10-05");
    expect(v6Color(ahead, "2026-10-05")).toBe("vert");
  });
});

describe("régression et garde-fou poids", () => {
  const weights = [{ date: "2026-10-03", kg: 92 }, { date: "2026-10-10", kg: 91 }, { date: "2026-10-17", kg: 90 }];

  it("deux baisses consécutives au même palier pendant que le poids baisse → message ; un repli entre les deux ne compte pas", () => {
    const state = v6State([
      muscuA("2026-10-04", [set(35, 4), set(35, 4), set(35, 4)]),
      muscuA("2026-10-11", [set(35, 4), set(35, 4), set(35, 3)]),
      muscuA("2026-10-14", [set(35, 1), set(42, 5), set(42, 5)]),
      muscuA("2026-10-18", [set(35, 4), set(35, 3), set(35, 3)]),
    ], "2026-10-19");
    expect(state.events.map((event) => event.kind)).toEqual(["regression", "repli", "regression"]);
    expect(state.consecutiveRegressions).toBe(2);
    expect(v6WeightGuard(state, weights)).toBe("Performance en baisse pendant la perte de poids — réévaluer le rythme du déficit.");
    expect(v6WeightGuard(state, [{ date: "2026-10-01", kg: 92 }])).toBeUndefined();
  });

  it("une remontée remet le compteur à zéro ; un changement de palier ne se compare pas", () => {
    const state = v6State([
      muscuA("2026-10-04", [set(35, 4), set(35, 4), set(35, 4)]),
      muscuA("2026-10-11", [set(35, 4), set(35, 4), set(35, 3)]),
      muscuA("2026-10-18", [set(35, 5), set(35, 4), set(35, 4)]),
    ], "2026-10-19");
    expect(state.consecutiveRegressions).toBe(0);
    expect(v6WeightGuard(state, weights)).toBeUndefined();
  });
});

describe("prescriptions, charge effective, essai anticipé", () => {
  it("dimanche A : 3 × jusqu'à 5 à 35, 3 min, texte de repli ; B : 42 × 3 × 8-10, semaine test 2 × 8", () => {
    const state = v6State([], "2026-10-04");
    const force = v6ForceSession(state);
    expect(force.sets).toEqual([set(35, 5), set(35, 5), set(35, 5)]);
    expect(force.restSec).toBe(180);
    expect(force.lines.join(" ")).toContain("séries 2 et 3 à 42 kg. Le palier reste 35 kg");
    expect(v6LightSession(state, "2026-10-06")).toMatchObject({ assistKg: 42, label: "42 kg — 3 × 8-10, RPE 6-8, jamais à l'échec" });
    expect(v6LightSession(state, "2026-10-27").sets).toHaveLength(2);
  });

  it("charge effective = poids − assistance ; essai libre recommandé à ≥ 90 % du poids", () => {
    expect(effectiveLoad(89.4, 35)).toBe(54.4);
    expect(effectiveLoad(undefined, 35)).toBeUndefined();
    const workouts = [35, 28, 21, 14].map((kg, index) => muscuA(["2026-10-04", "2026-11-01", "2026-12-06", "2027-01-10"][index]!, [set(kg, 5), set(kg, 5), set(kg, 5)]));
    const at7 = v6State([...workouts, muscuA("2027-02-07", [set(7, 5), set(7, 4), set(7, 3)])], "2027-02-08");
    expect(at7.aKg).toBe(7);
    expect(v6EarlyFreeTry(at7, [{ date: "2027-02-06", kg: 75 }])).toContain("Essai traction libre recommandé");
    expect(v6EarlyFreeTry(at7, [{ date: "2027-02-06", kg: 60 }])).toBeUndefined();
    /* 5 reps dans UNE série : 4 + 4 + 4 cumulées ne déclenchent rien. */
    const cumulated = v6State([...workouts, muscuA("2027-02-07", [set(7, 4), set(7, 4), set(7, 4)])], "2027-02-08");
    expect(v6EarlyFreeTry(cumulated, [{ date: "2027-02-06", kg: 75 }])).toBeUndefined();
  });
});
