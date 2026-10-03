import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../domain";
import { betSessions, formatBetSets, type BetSet } from "./tractionBet";

/**
 * Lecture des séances de force du pari traction : Muscu A faite, traction
 * à prescription complète ; les règles sont dans `tractionV6`.
 */

const set = (assistKg: number, reps: number, rpe?: number): BetSet => ({ assistKg, reps, ...(rpe !== undefined ? { rpe } : {}) });

function workout(date: string, sets: BetSet[], extra: { templateId?: string; reduced?: boolean; status?: string; warmup?: boolean } = {}): WorkoutSession {
  return {
    id: `w-${date}-${extra.templateId ?? "a"}`, source: "planned", kind: "training", status: extra.status ?? "completed", date, sessionTemplateId: extra.templateId ?? "v2-muscu-a",
    startedAt: "x", lastActionAt: "x", activeDurationSec: 1, createdAt: "x", updatedAt: "x",
    blocks: [{
      id: "b", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "performed",
      ...(extra.reduced ? { reducedPrescription: true as const } : {}),
      snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 1, max: 5 }, restBetweenSetsSec: 180 },
      series: [
        ...(extra.warmup ? [{ id: "e", position: -1, status: "completed" as const, role: "echauffement" as const, load: { kind: "total" as const, kg: 56 }, reps: 5 }] : []),
        ...sets.map((item, index) => ({
          id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const,
          load: { kind: "total" as const, kg: item.assistKg }, reps: item.reps, ...(item.rpe !== undefined ? { rpe: item.rpe } : {}),
        })),
      ],
    }],
  } as WorkoutSession;
}

describe("séances de force du pari", () => {
  it("Muscu A V1 et V2 faites, dans l'ordre des dates ; échauffement ignoré", () => {
    const sessions = betSessions([
      workout("2026-10-04", [set(35, 4, 9), set(35, 3)], { warmup: true }),
      workout("2026-10-02", [set(42, 8)], { templateId: "v1-muscu-a" }),
    ]);
    expect(sessions.map((session) => session.date)).toEqual(["2026-10-02", "2026-10-04"]);
    expect(sessions[1]!.sets).toEqual([set(35, 4, 9), set(35, 3)]);
  });

  it("exclues : jour de test (prescription réduite), Muscu B, séance non terminée", () => {
    expect(betSessions([
      workout("2026-10-25", [set(35, 5), set(35, 5)], { reduced: true }),
      workout("2026-10-06", [set(42, 8)], { templateId: "v2-muscu-b" }),
      workout("2026-10-11", [set(35, 5)], { status: "in_progress" }),
    ])).toEqual([]);
  });

  it("formatage : aide × reps, traction stricte à 0 kg", () => {
    expect(formatBetSets([set(35, 2), set(42, 5)])).toBe("35 × 2 · 42 × 5");
    expect(formatBetSets([set(0, 1), set(7, 5)])).toBe("traction stricte × 1 · 7 × 5");
  });
});
