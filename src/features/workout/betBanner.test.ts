import { describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { v6State } from "../goals/tractionV6";
import { betBannerFor } from "./betBanner";

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
      { label: "Cette séance", value: "3 séries à 35 kg, jusqu'à 5 reps propres — RPE 9 max, repos 3 min" },
      { label: "Repli", value: "série 1 à 2 reps ou moins, ou RPE 10 → séries 2 et 3 à 42 kg ; le palier reste 35 kg" },
      { label: "Validation", value: "5 / 5 / 5 à 35 kg → A passe à 28 kg" },
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

  it("statut : toujours 35 kg en S5 → orange, en S9 → rouge ; validé tôt → en avance", () => {
    expect(betBannerFor(on("2026-11-01", "v2-muscu-a"), block(), start)!.status).toEqual({ label: "1 cran plus assisté que la référence (28 kg)", tone: "watch" });
    expect(betBannerFor(on("2026-11-29", "v2-muscu-a"), block(), start)!.status).toEqual({ label: "2 crans plus assisté que la référence (21 kg)", tone: "late" });
    const fast = v6State([done("2026-10-04", [[35, 5, 9], [35, 5, 9], [35, 5, 9]])], "2026-10-11");
    const banner = betBannerFor(on("2026-10-11", "v2-muscu-a"), block(), fast)!;
    expect(banner.title).toBe("Palier A — 28 kg d'aide");
    expect(banner.status).toEqual({ label: "En avance sur la référence", tone: "on_track" });
    expect(banner.lines[0]).toEqual({ label: "Dernière séance", value: "5 / 5 / 5 — RPE 9 / 9 / 9" });
  });

  it("Muscu B : A + 7 kg, 3 × 8-10 préremplies à 8 ; semaine test : 2 × 8 ; phase essai libre : 14 kg", () => {
    const light = betBannerFor(on("2026-10-06", "v2-muscu-b"), block(), start)!;
    expect(light.title).toBe("Traction légère — 42 kg d'aide (A + 7 kg)");
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

  it("jour de test : 2 séries au palier A, le test ne valide pas ; autre exercice ou séance : rien", () => {
    const test = betBannerFor(on("2026-10-25", "v2-muscu-a"), block(true), start)!;
    expect(test.title).toBe("Jour de test — palier A 35 kg d'aide");
    expect(test.sets).toEqual([{ assistKg: 35, reps: 5 }, { assistKg: 35, reps: 5 }]);
    expect(test.note).toBe("Le test mesure ; il ne valide jamais le palier A.");

    expect(betBannerFor(on("2026-10-04", "v2-muscu-a"), { ...block(), exerciseId: "rowing-poulie-basse" }, start)).toBeUndefined();
    expect(betBannerFor(on("2026-10-04", "v2-cardio-a"), block(), start)).toBeUndefined();
  });
});
