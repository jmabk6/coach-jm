import { describe, expect, it } from "vitest";
import type { PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { betProgress } from "../goals/tractionBet";
import { betBannerFor } from "./betBanner";

/** Bandeau du pari traction dans la séance (03/10/2026). */

const block = (reduced = false): PerformedExerciseBlock => ({
  id: "t", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "not_performed",
  ...(reduced ? { reducedPrescription: true as const } : {}),
  snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 }, series: [],
});

function done(date: string, sets: Array<[number, number, number]>): WorkoutSession {
  return {
    id: `w-${date}`, source: "planned", kind: "training", status: "completed", date, sessionTemplateId: "v1-muscu-a",
    startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
    blocks: [{ ...block(), status: "performed", series: sets.map(([kg, reps, rpe], index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, rpe })) }],
  } as WorkoutSession;
}

const today = (templateId: string) => ({ id: "now", date: "2026-10-04", sessionTemplateId: templateId, blocks: [] }) as unknown as WorkoutSession;
const progress = betProgress([done("2026-10-02", [[42, 8, 8], [42, 8, 9], [42, 6, 9]])], [], "2026-10-04");

describe("bandeau du pari traction", () => {
  it("Muscu A : palier, dernière séance, objectif du jour, validation, suite ; séries préremplies", () => {
    const banner = betBannerFor(today("v2-muscu-a"), block(), progress)!;
    expect(banner.title).toBe("Palier actuel — 42 kg d'aide");
    expect(banner.status).toEqual({ label: "Conforme à la trajectoire", tone: "on_track" });
    expect(banner.lines).toEqual([
      { label: "Dernière séance", value: "8 / 8 / 6 — RPE 8 / 9 / 9" },
      { label: "Cette séance", value: "8 / 8 / 7 minimum" },
      { label: "Validation", value: "8 / 8 / 8, dernière série à RPE 9 au plus" },
      { label: "Ensuite", value: "35 kg, avec une série d'introduction (35 × 6)" },
    ]);
    expect(banner.sets).toEqual([{ assistKg: 42, reps: 8 }, { assistKg: 42, reps: 8 }, { assistKg: 42, reps: 7 }]);
  });

  it("jour de test : 2 séries et le palier à attaquer ; Muscu B : 2 × 10 un palier au-dessus ; autre exercice : rien", () => {
    const test = betBannerFor(today("v2-muscu-a"), block(true), progress)!;
    expect(test.title).toBe("Jour de test — 42 kg d'aide");
    expect(test.sets).toHaveLength(2);
    expect(test.note).toBe("Au test : commencez à 42 kg, puis 35 kg ; inutile de descendre plus bas.");

    const light = betBannerFor(today("v2-muscu-b"), block(), progress)!;
    expect(light.title).toBe("Rappel léger — 49 kg d'aide");
    expect(light.sets).toEqual([{ assistKg: 49, reps: 10 }, { assistKg: 49, reps: 10 }]);

    expect(betBannerFor(today("v2-muscu-a"), { ...block(), exerciseId: "rowing-poulie-basse" }, progress)).toBeUndefined();
    expect(betBannerFor(today("v2-cardio-a"), block(), progress)).toBeUndefined();
  });
});
