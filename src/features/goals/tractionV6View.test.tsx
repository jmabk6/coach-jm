// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import type { BetSet } from "./tractionBet";
import { TractionBetSection } from "./TractionBetSection";
import { v6Progress, v6ShortStatus } from "./tractionV6View";

/**
 * Écran Objectif Traction en V6 (04/10/2026) : référence fixe face au
 * réel, statut par écart de paliers, reps face à la référence sans effet
 * sur la couleur, poids et charge effective, garde-fou, semaines test et
 * S25-S26, phase essai libre. Jamais d'écart en semaines.
 */

afterEach(cleanup);

const set = (assistKg: number, reps: number, rpe?: number): BetSet => ({ assistKg, reps, ...(rpe !== undefined ? { rpe } : {}) });

function muscuA(date: string, sets: BetSet[], extra: { reduced?: boolean } = {}): WorkoutSession {
  return {
    id: `w-${date}`, source: "planned", kind: "training", status: "completed", date, sessionTemplateId: "v2-muscu-a",
    startedAt: "x", lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
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

const five = (kg: number) => [set(kg, 5, 9), set(kg, 5, 9), set(kg, 5, 9)];

describe("vue V6 : référence face au réel", () => {
  it("04/10 avant la séance : vert « Conforme », A 35, B 42, poids et charge effective ; S1 en cours, S2-S26 à venir", () => {
    const progress = v6Progress([muscuA("2026-10-02", [set(42, 8), set(42, 8), set(42, 6, 10)])], [{ date: "2026-10-04", kg: 92.4 }], "2026-10-04");
    expect(progress).toMatchObject({ color: "vert", statusLabel: "Conforme à la référence", state: { aKg: 35, bKg: 42 }, week: { number: 1, refKg: 35 } });
    expect(progress.weight).toEqual({ date: "2026-10-04", kg: 92.4 });
    expect(progress.effectiveKg).toBe(57.4);
    expect(progress.light.label).toBe("42 kg — 3 × 8-10, RPE 6-8, jamais à l'échec");
    expect(progress.rows[0]).toMatchObject({ state: "now", aKg: 35, color: "vert", weightKg: 92.4 });
    expect(progress.rows.slice(1).every((row) => row.state === "upcoming" && row.color === undefined)).toBe(true);
    expect(v6ShortStatus(progress.state, "2026-10-04")).toEqual({ label: "Conforme", tone: "on_track" });
  });

  it("reps réelles face à la référence à aide identique, sans effet sur la couleur ; repli marqué ; validation marquée", () => {
    const workouts = [
      muscuA("2026-10-04", five(35)),
      muscuA("2026-10-11", [set(28, 3, 9), set(28, 3, 9), set(28, 2, 9)]),
      muscuA("2026-10-18", [set(28, 2, 9), set(35, 5), set(35, 5)]),
      muscuA("2026-11-01", five(28)),
    ];
    const progress = v6Progress(workouts, [], "2026-11-03");
    const [s1, s2, s3, , s5] = progress.rows;
    /* S1 : 35 validé comme la référence ; le chip montre le palier du début de semaine. */
    expect(s1).toMatchObject({ state: "past", validatedKg: 35, aKg: 35, color: "vert", compare: { real: [5, 5, 5], ref: [5, 5, 5] } });
    /* 3/3/2 sous la référence ≥ 3/3/3 : la couleur reste verte. */
    expect(s2).toMatchObject({ aKg: 28, color: "vert", compare: { real: [3, 3, 2], ref: [3, 3, 3] } });
    expect(s3).toMatchObject({ repli: true, aKg: 28, color: "vert" });
    expect(s5).toMatchObject({ state: "now", validatedKg: 28, aKg: 28, color: "vert", sessionAKg: 28 });
    expect(progress).toMatchObject({ state: { aKg: 21, bKg: 35 }, statusLabel: "Conforme à la référence" });
    /* S6 : le palier du début de semaine (21) est en avance sur la référence (28). */
    expect(v6Progress(workouts, [], "2026-11-08")).toMatchObject({ color: "vert", statusLabel: "En avance sur la référence" });
  });

  it("semaine test : référence = le palier en cours (S4 → 28, S8 → 21) ; le test s'affiche, ne valide pas", () => {
    const results = [{ id: "r1", protocolId: "protocol-traction", date: "2026-10-25", measures: [{ key: "assistance_min_kg", value: 21 }] }];
    const progress = v6Progress([muscuA("2026-10-04", five(35)), muscuA("2026-10-25", five(28), { reduced: true })], [], "2026-10-26", results);
    expect(progress.week).toMatchObject({ number: 4, kind: "test", refKg: 28 });
    expect(progress.rows[3]).toMatchObject({ testKg: 21, aKg: 28, color: "vert" });
    expect(progress.rows[3]!.session).toBeUndefined();
    expect(progress.state).toMatchObject({ aKg: 28, bKg: 42 });
    expect(v6Progress([], [], "2026-11-24").week).toMatchObject({ number: 8, refKg: 21 });
    expect(v6Progress([], [], "2026-11-24").color).toBe("rouge");
  });

  it("toujours 35 en S5 : orange « 1 cran » ; en S9 : rouge « 2 crans » ; S25-S26 : référence 7", () => {
    expect(v6Progress([], [], "2026-11-02")).toMatchObject({ color: "orange", statusLabel: "1 cran plus assisté que la référence (28 kg)" });
    expect(v6ShortStatus(v6Progress([], [], "2026-11-02").state, "2026-11-02")).toEqual({ label: "1 cran derrière", tone: "warning" });
    expect(v6Progress([], [], "2026-11-30")).toMatchObject({ color: "rouge", statusLabel: "2 crans plus assisté que la référence (21 kg)" });
    expect(v6Progress([], [], "2027-03-22").week).toMatchObject({ number: 25, kind: "essai", refKg: 7 });
  });

  it("garde-fou : deux baisses au même palier pendant que le poids baisse → message affiché", () => {
    const workouts = [
      muscuA("2026-10-04", [set(35, 4), set(35, 4), set(35, 4)]),
      muscuA("2026-10-11", [set(35, 4), set(35, 4), set(35, 3)]),
      muscuA("2026-10-18", [set(35, 4), set(35, 3), set(35, 3)]),
    ];
    const weights = [{ date: "2026-10-03", kg: 92 }, { date: "2026-10-10", kg: 91 }, { date: "2026-10-17", kg: 90 }];
    const progress = v6Progress(workouts, weights, "2026-10-19");
    expect(progress.guard).toBe("Performance en baisse pendant la perte de poids — réévaluer le rythme du déficit.");
    expect(progress.rows[2]).toMatchObject({ regression: true });
  });

  it("7 kg validé : phase essai libre, B à 14 ; 0 kg réussi : gagné", () => {
    const dates = ["2026-10-04", "2026-11-01", "2026-12-06", "2027-01-10", "2027-02-21"];
    const workouts = [35, 28, 21, 14, 7].map((kg, index) => muscuA(dates[index]!, five(kg)));
    const free = v6Progress(workouts, [], "2027-02-22");
    expect(free).toMatchObject({ state: { phase: "essai_libre", aKg: 7, bKg: 14 }, color: "vert" });
    const won = v6Progress([...workouts, muscuA("2027-03-21", [set(0, 1), set(7, 5)])], [], "2027-03-22");
    expect(won).toMatchObject({ color: "gagne", statusLabel: "Objectif gagné" });
    expect(won.effectiveKg).toBeUndefined();
  });
});

describe("écran Objectif Traction", () => {
  it("statut V6, palier réel face à la référence, poids et charge effective ; aucune mention de semaines d'avance ou de retard", () => {
    const progress = v6Progress([muscuA("2026-10-04", [set(35, 4, 9), set(35, 3, 9), set(35, 3, 9)])], [{ date: "2026-10-04", kg: 92 }], "2026-11-02");
    const { container } = render(<TractionBetSection bet={progress} />);
    const text = container.textContent ?? "";
    expect(text).toContain("1 cran plus assisté que la référence (28 kg)");
    expect(text).toContain("35 kg d'aide");
    expect(text).toContain("Référence S5 (01/11) : 28 ≥4/4/4");
    expect(text).toContain("Charge effective indicative ≈ 57 kg");
    expect(text).toContain("Référence V6 face au réel (S1–S26)");
    expect(text).toContain("Réel : 35 kg · 4 / 3 / 3 (réf ≥ 5 / 5 / 5)");
    expect(text).not.toMatch(/semaines? d'avance|semaines? de retard|En retard de|En avance de/);
    expect(container.querySelector(".bet__status--orange")).not.toBeNull();
    expect(container.querySelectorAll(".bet__row")).toHaveLength(26);
  });

  it("phase essai libre et garde-fou affichés", () => {
    const dates = ["2026-10-04", "2026-11-01", "2026-12-06", "2027-01-10", "2027-02-21"];
    const free = v6Progress([35, 28, 21, 14, 7].map((kg, index) => muscuA(dates[index]!, five(kg))), [], "2027-02-22");
    expect(render(<TractionBetSection bet={free} />).container.textContent).toContain("Phase essai libre : 0 kg d'abord, séries à 7 kg");
    cleanup();
    const guarded = v6Progress(
      [muscuA("2026-10-04", [set(35, 4), set(35, 4), set(35, 4)]), muscuA("2026-10-11", [set(35, 4), set(35, 4), set(35, 3)]), muscuA("2026-10-18", [set(35, 4), set(35, 3), set(35, 3)])],
      [{ date: "2026-10-03", kg: 92 }, { date: "2026-10-10", kg: 91 }, { date: "2026-10-17", kg: 90 }],
      "2026-10-19",
    );
    expect(render(<TractionBetSection bet={guarded} />).container.querySelector(".bet__alert")?.textContent).toContain("réévaluer le rythme du déficit");
  });
});
