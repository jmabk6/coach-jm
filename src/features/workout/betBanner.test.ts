import { describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { v6State } from "../goals/tractionV6";
import { betBannerFor, plannedSeriesFor } from "./betBanner";

/** Bandeau du pari traction V6 dans la séance (04/10/2026). */

const block = (reduced = false, series: Array<[number, number, number?]> = []): PerformedExerciseBlock => ({
  id: "t", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "not_performed",
  ...(reduced ? { reducedPrescription: true as const } : {}),
  snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 },
  series: series.map(([kg, reps, rpe], index) => ({
    id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, ...(rpe !== undefined ? { rpe } : {}),
  })),
});

function done(date: string, sets: Array<[number, number, number]>): WorkoutSession {
  return {
    id: `w-${date}`, source: "planned", kind: "training", status: "completed", date, sessionTemplateId: "v2-muscu-a",
    startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
    blocks: [{ ...block(), status: "performed", series: sets.map(([kg, reps, rpe], index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, rpe })) }],
  } as WorkoutSession;
}

const on = (date: string, templateId: string) => ({ id: "now", date, sessionTemplateId: templateId, blocks: [] }) as unknown as WorkoutSession;
const start = v6State([done("2026-10-02", [[42, 8, 8], [42, 8, 9], [42, 6, 10]])], "2026-10-04");

describe("bandeau du pari traction V6", () => {
  it("Muscu A : palier A réel 35 kg, 3 × jusqu'à 5, repli affiché, validation ; séries préremplies à 35 × 5", () => {
    const banner = betBannerFor(on("2026-10-04", "v2-muscu-a"), block(), start)!;
    expect(banner.title).toBe("Palier A — 35 kg d'aide");
    expect(banner.status).toEqual({ label: "Conforme à la référence", tone: "on_track" });
    expect(banner.lines).toEqual([
      { label: "Dernière séance", value: "—" },
      { label: "Échauffement", value: "56 × 6 · 49 × 4 · 42 × 2, repos 1 min — à noter en « Échauffement » : hors calcul du palier" },
      { label: "Cette séance", value: "3 séries à 35 kg, jusqu'à 5 reps propres — RPE 9 max, repos 3 min" },
      { label: "Repli", value: "série 1 à 2 reps ou moins, ou RPE 10 → séries 2 et 3 à 42 kg ; le palier reste 35 kg" },
      { label: "Validation", value: "5 / 5 / 5 à 35 kg → A passe à 28 kg, Muscu B à 42 kg" },
    ]);
    expect(banner.note).toBeUndefined();
    expect(banner.sets).toEqual([{ assistKg: 35, reps: 5 }, { assistKg: 35, reps: 5 }, { assistKg: 35, reps: 5 }]);
  });

  it("repli saisi en série 1 (2 reps, ou RPE 10) : séries 2 et 3 basculent à 42 kg, le palier reste 35 ; 3 reps RPE 9 : pas de repli", () => {
    for (const first of [[35, 2, 9], [35, 4, 10]] as Array<[number, number, number]>) {
      const banner = betBannerFor(on("2026-10-04", "v2-muscu-a"), block(false, [first]), start)!;
      expect(banner.sets.map((set) => set.assistKg)).toEqual([35, 42, 42]);
      expect(banner.note).toBe("Repli déclenché : séries 2 et 3 à 42 kg. Le palier A reste 35 kg ; séance exclue des régressions.");
      expect(banner.title).toBe("Palier A — 35 kg d'aide");
    }
    expect(betBannerFor(on("2026-10-04", "v2-muscu-a"), block(false, [[35, 3, 9]]), start)!.sets.map((set) => set.assistKg)).toEqual([35, 35, 35]);
  });

  it("statut : toujours 35 kg en S2 → orange, en S7 → rouge ; 35 validé en S1 → conforme en S2, 28 validé tôt → en avance", () => {
    expect(betBannerFor(on("2026-10-11", "v2-muscu-a"), block(), start)!.status).toEqual({ label: "1 cran plus assisté que la référence (28 kg)", tone: "watch" });
    expect(betBannerFor(on("2026-11-15", "v2-muscu-a"), block(), start)!.status).toEqual({ label: "2 crans plus assisté que la référence (21 kg)", tone: "late" });
    const after35 = v6State([done("2026-10-04", [[35, 5, 9], [35, 5, 9], [35, 5, 9]])], "2026-10-11");
    const banner = betBannerFor(on("2026-10-11", "v2-muscu-a"), block(), after35)!;
    expect(banner.title).toBe("Palier A — 28 kg d'aide");
    expect(banner.status).toEqual({ label: "Conforme à la référence", tone: "on_track" });
    expect(banner.lines[0]).toEqual({ label: "Dernière séance", value: "5 / 5 / 5 — RPE 9 / 9 / 9" });
    expect(banner.lines[4]).toEqual({ label: "Validation", value: "5 / 5 / 5 à 28 kg → A passe à 21 kg, Muscu B à 35 kg" });
    const fast = v6State([done("2026-10-04", [[35, 5, 9], [35, 5, 9], [35, 5, 9]]), done("2026-10-11", [[28, 5, 9], [28, 5, 9], [28, 5, 9]])], "2026-10-18");
    expect(betBannerFor(on("2026-10-18", "v2-muscu-a"), block(), fast)!.status).toEqual({ label: "En avance sur la référence", tone: "on_track" });
    /* Le statut passé en 4e paramètre (palier du début de semaine) l'emporte sur l'état courant. */
    expect(betBannerFor(on("2026-10-06", "v2-muscu-a"), block(), after35, start)!.status).toEqual({ label: "Conforme à la référence", tone: "on_track" });
  });

  it("Muscu B : le palier de volume du dernier A validé (42 avant toute validation et après 35, 35 après 28), 3 × 8-10 préremplies à 8 ; semaine test : 2 × 8 ; phase essai libre : 14 kg", () => {
    const light = betBannerFor(on("2026-10-06", "v2-muscu-b"), block(), start)!;
    expect(light.title).toBe("Traction légère — 42 kg d'aide (volume, avant toute validation)");
    const after35 = v6State([done("2026-10-04", [[35, 5, 9], [35, 5, 9], [35, 5, 9]])], "2026-10-05");
    expect(betBannerFor(on("2026-10-06", "v2-muscu-b"), block(), after35)!.title).toBe("Traction légère — 42 kg d'aide (volume après 35 kg validé)");
    const after28 = v6State([done("2026-10-04", [[35, 5, 9], [35, 5, 9], [35, 5, 9]]), done("2026-10-11", [[28, 5, 9], [28, 5, 9], [28, 5, 9]])], "2026-10-12");
    expect(betBannerFor(on("2026-10-13", "v2-muscu-b"), block(), after28)!.sets.map((item) => item.assistKg)).toEqual([35, 35, 35]);
    expect(light.lines).toEqual([{ label: "Cette séance", value: "42 kg — 3 × 8-10, RPE 6-8, jamais à l'échec" }]);
    expect(light.sets).toEqual([{ assistKg: 42, reps: 8 }, { assistKg: 42, reps: 8 }, { assistKg: 42, reps: 8 }]);
    const test = betBannerFor(on("2026-10-27", "v2-muscu-b"), block(), start)!;
    expect(test.lines[0]!.value).toBe("42 kg — 2 × 8, RPE 6-8 (semaine test)");
    expect(test.sets).toHaveLength(2);

    const free = v6State(
      [35, 28, 21, 14, 7].map((kg, index) => done(["2026-10-04", "2026-11-01", "2026-12-06", "2027-01-10", "2027-02-21"][index]!, [[kg, 5, 9], [kg, 5, 9], [kg, 5, 9]])),
      "2027-02-22",
    );
    expect(betBannerFor(on("2027-02-23", "v2-muscu-b"), block(), free)!.title).toBe("Traction légère — 14 kg d'aide (phase essai libre)");
    const a = betBannerFor(on("2027-02-28", "v2-muscu-a"), block(), free)!;
    expect(a.title).toBe("Phase essai libre — 0 kg d'abord");
    expect(a.sets.map((set) => set.assistKg)).toEqual([0, 7, 7]);
  });

  it("L1 (02/11/2026) : l'échauffement du jour (A + 21, + 14, + 7) dans le bandeau ; ni au jour de test, ni en Muscu B", () => {
    const after35 = v6State([done("2026-10-04", [[35, 5, 9], [35, 5, 9], [35, 5, 9]]), done("2026-10-11", [[28, 5, 9], [28, 5, 9], [28, 5, 9]])], "2026-10-18");
    const banner = betBannerFor(on("2026-10-18", "v2-muscu-a"), block(), after35)!;
    expect(banner.title).toBe("Palier A — 21 kg d'aide");
    expect(banner.warmup).toEqual([{ assistKg: 42, reps: 6 }, { assistKg: 35, reps: 4 }, { assistKg: 28, reps: 2 }]);
    expect(banner.lines[1]).toEqual({ label: "Échauffement", value: "42 × 6 · 35 × 4 · 28 × 2, repos 1 min — à noter en « Échauffement » : hors calcul du palier" });
    expect(betBannerFor(on("2026-10-06", "v2-muscu-b"), block(), start)!.warmup).toBeUndefined();
  });

  it("L1 : le repli se lit sur la 1re série de TRAVAIL, même après 3 séries d'échauffement", () => {
    const warm: Array<[number, number, number?]> = [[56, 6], [49, 4], [42, 2]];
    const withWarmup = (work: Array<[number, number, number?]>) => {
      const built = block(false, [...warm, ...work]);
      return { ...built, series: built.series!.map((series, index) => (index < 3 ? { ...series, role: "echauffement" as const } : series)) };
    };
    const repli = betBannerFor(on("2026-10-04", "v2-muscu-a"), withWarmup([[35, 2, 9]]), start)!;
    expect(repli.note).toBe("Repli déclenché : séries 2 et 3 à 42 kg. Le palier A reste 35 kg ; séance exclue des régressions.");
    expect(repli.sets.map((set) => set.assistKg)).toEqual([35, 42, 42]);
    const fine = betBannerFor(on("2026-10-04", "v2-muscu-a"), withWarmup([[35, 4, 9]]), start)!;
    expect(fine.note).toBeUndefined();
    /* Échauffement seul : pas de repli (ses séries ne sont pas au palier et ne comptent pas). */
    expect(betBannerFor(on("2026-10-04", "v2-muscu-a"), withWarmup([]), start)!.note).toBeUndefined();
  });

  it("L1 : chaque série reçoit l'échauffement ou la série de travail qui lui revient, pas celle de sa position", () => {
    const banner = betBannerFor(on("2026-10-04", "v2-muscu-a"), block(), start)!;
    const pending = (position: number) => ({ id: `p${position}`, position, status: "upcoming" as const, role: "travail" as const });
    const noted = (position: number, kg: number, reps: number, role: "travail" | "echauffement") => ({ id: `d${position}`, position, status: "completed" as const, role, load: { kind: "total" as const, kg }, reps });

    /* Rien de noté : les 3 emplacements proposent l'échauffement. */
    expect(plannedSeriesFor([pending(0), pending(1), pending(2)], banner)).toEqual([
      { assistKg: 56, reps: 6, role: "echauffement" }, { assistKg: 49, reps: 4, role: "echauffement" }, { assistKg: 42, reps: 2, role: "echauffement" },
    ]);
    /* 3 échauffements notés, 3 séries ajoutées : le travail du palier, dans l'ordre. */
    expect(plannedSeriesFor([noted(0, 56, 6, "echauffement"), noted(1, 49, 4, "echauffement"), noted(2, 42, 2, "echauffement"), pending(3), pending(4), pending(5)], banner)).toEqual([
      undefined, undefined, undefined, { assistKg: 35, reps: 5, role: "travail" }, { assistKg: 35, reps: 5, role: "travail" }, { assistKg: 35, reps: 5, role: "travail" },
    ]);
    /* 1 échauffement puis du travail directement : la suite propose le travail, plus l'échauffement. */
    expect(plannedSeriesFor([noted(0, 56, 6, "echauffement"), noted(1, 35, 5, "travail"), pending(2)], banner)).toEqual([
      undefined, { assistKg: 35, reps: 5, role: "travail" }, { assistKg: 35, reps: 5, role: "travail" },
    ]);
    /* Sans échauffement : comme avant L1. */
    expect(plannedSeriesFor([noted(0, 35, 5, "travail"), pending(1), pending(2)], banner)).toEqual([
      { assistKg: 35, reps: 5, role: "travail" }, { assistKg: 35, reps: 5, role: "travail" }, { assistKg: 35, reps: 5, role: "travail" },
    ]);
    /* Muscu B (pas d'échauffement prévu) et hors pari : inchangé. */
    const light = betBannerFor(on("2026-10-06", "v2-muscu-b"), block(), start)!;
    expect(plannedSeriesFor([pending(0), pending(1), pending(2)], light)).toEqual(light.sets.map((set) => ({ ...set, role: "travail" })));
    expect(plannedSeriesFor([pending(0)], undefined)).toEqual([undefined]);
  });

  it("L1 : le pari ignore l'échauffement — même palier, mêmes événements avec ou sans échauffement noté", () => {
    const plain = done("2026-10-04", [[35, 5, 9], [35, 5, 9], [35, 5, 9]]);
    const warmed = structuredClone(plain);
    const traction = warmed.blocks[0] as PerformedExerciseBlock;
    traction.series = [
      ...[[56, 6], [49, 4], [42, 2]].map(([kg, reps], index) => ({ id: `w${index}`, position: index, status: "completed" as const, role: "echauffement" as const, load: { kind: "total" as const, kg: kg! }, reps: reps! })),
      ...traction.series!.map((series, index) => ({ ...series, id: `t${index}`, position: index + 3 })),
    ];
    const a = v6State([plain], "2026-10-11");
    const b = v6State([warmed], "2026-10-11");
    expect(b.aKg).toBe(a.aKg);
    expect(b.aKg).toBe(28);
    expect(b.events.map((event) => [event.kind, event.detail])).toEqual(a.events.map((event) => [event.kind, event.detail]));
  });

  it("ancien jour de test (prescription réduite) : pas de bandeau ; autre exercice ou séance : rien", () => {
    expect(betBannerFor(on("2026-10-25", "v2-muscu-a"), block(true), start)).toBeUndefined();
    expect(betBannerFor(on("2026-10-04", "v2-muscu-a"), { ...block(), exerciseId: "rowing-poulie-basse" }, start)).toBeUndefined();
    expect(betBannerFor(on("2026-10-04", "v2-cardio-a"), block(), start)).toBeUndefined();
  });
});
