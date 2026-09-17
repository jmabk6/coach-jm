import { describe, expect, it } from "vitest";
import type { PerformedBlock, WorkoutSession } from "../../../domain";
import {
  absenceSec,
  calculateActiveDurationSec,
  getRestCountdown,
  shouldShowResumeSheet,
  summarizeRests,
} from "./workoutTime";

const startedAt = "2026-09-17T10:00:00.000Z";

function workout(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "w",
    source: "free",
    status: "in_progress",
    date: "2026-09-17",
    startedAt,
    lastActionAt: startedAt,
    activeDurationSec: 0,
    blocks: [],
    createdAt: startedAt,
    updatedAt: startedAt,
    ...overrides,
  };
}

describe("durée active", () => {
  it("vaut l'amplitude quand il n'y a aucune pause, absence ou non", () => {
    expect(calculateActiveDurationSec(workout(), "2026-09-17T10:42:00.000Z")).toBe(
      42 * 60,
    );
  });

  it("retire les pauses fermées et la pause ouverte jusqu'à maintenant", () => {
    const paused = workout({
      pauses: [
        { id: "p1", startedAt: "2026-09-17T10:10:00.000Z", endedAt: "2026-09-17T10:15:00.000Z" },
        { id: "p2", startedAt: "2026-09-17T10:30:00.000Z" },
      ],
    });

    expect(calculateActiveDurationSec(paused, "2026-09-17T10:42:00.000Z")).toBe(
      42 * 60 - 5 * 60 - 12 * 60,
    );
  });

  it("s'arrête à la clôture pour une séance terminée", () => {
    const done = workout({
      status: "completed",
      completedAt: "2026-09-17T10:40:00.000Z",
      pauses: [
        { id: "p1", startedAt: "2026-09-17T10:10:00.000Z", endedAt: "2026-09-17T10:15:00.000Z" },
      ],
    });

    expect(calculateActiveDurationSec(done, "2026-09-17T18:00:00.000Z")).toBe(35 * 60);
  });
});

describe("absence et feuille de reprise", () => {
  it("mesure l'absence depuis la dernière présence enregistrée", () => {
    const seen = workout({ lastSeenAt: "2026-09-17T10:20:00.000Z" });

    expect(absenceSec(seen, "2026-09-17T10:20:45.000Z")).toBe(45);
    expect(shouldShowResumeSheet(seen, "2026-09-17T10:20:45.000Z")).toBe(false);
    expect(shouldShowResumeSheet(seen, "2026-09-17T10:21:00.000Z")).toBe(true);
  });

  it("ne superpose jamais la feuille à une séance en pause", () => {
    const paused = workout({
      lastSeenAt: "2026-09-17T10:20:00.000Z",
      pauses: [{ id: "p1", startedAt: "2026-09-17T10:19:00.000Z" }],
    });

    expect(shouldShowResumeSheet(paused, "2026-09-17T12:00:00.000Z")).toBe(false);
  });

  it("ne s'affiche pas pour une séance terminée", () => {
    const done = workout({
      status: "completed",
      completedAt: "2026-09-17T10:40:00.000Z",
      lastSeenAt: "2026-09-17T10:40:00.000Z",
    });

    expect(shouldShowResumeSheet(done, "2026-09-17T12:00:00.000Z")).toBe(false);
  });
});

describe("compte à rebours du repos", () => {
  const rest = {
    id: "r",
    kind: "between_sets" as const,
    startedAt: "2026-09-17T10:12:00.000Z",
    targetEndAt: "2026-09-17T10:13:30.000Z",
    plannedDurationSec: 90,
    afterBlockId: "b",
    afterEntryId: "s1",
  };

  it("recalcule le restant depuis l'heure de fin cible", () => {
    expect(getRestCountdown(rest, "2026-09-17T10:12:48.000Z")).toEqual({
      phase: "running",
      remainingSec: 42,
      elapsedSec: 48,
    });
  });

  it("affiche le dépassement, jamais un négatif", () => {
    expect(getRestCountdown(rest, "2026-09-17T10:14:07.000Z")).toEqual({
      phase: "done",
      overrunSec: 37,
      elapsedSec: 127,
    });
  });
});

describe("repos moyen", () => {
  const blocks: PerformedBlock[] = [
    {
      id: "b1",
      kind: "exercise",
      position: 0,
      addedDuringWorkout: false,
      exerciseId: "squat",
      status: "performed",
      snapshotInstructions: {
        shape: "reps",
        sets: 3,
        reps: { min: 8, max: 10 },
        restBetweenSetsSec: 90,
      },
      series: [
        { id: "s1", position: 0, status: "completed", reps: 10, actualRestAfterSec: 100, restComparable: true },
        { id: "s2", position: 1, status: "completed", reps: 10, actualRestAfterSec: 400, restComparable: false },
        { id: "s3", position: 2, status: "completed", reps: 9, actualRestAfterSec: 80, restComparable: true },
      ],
    },
    {
      id: "g1",
      kind: "group",
      position: 1,
      addedDuringWorkout: false,
      status: "performed",
      plannedRounds: 2,
      plannedRestBetweenRoundsSec: 60,
      children: [],
      rounds: [
        { id: "r1", roundNumber: 1, status: "completed", children: [], actualRestAfterSec: 60, restComparable: true },
        { id: "r2", roundNumber: 2, status: "completed", children: [], actualRestAfterSec: 3000, restComparable: false },
      ],
    },
  ];

  it("ne moyenne que les repos comparables et garde le total comme dénominateur", () => {
    expect(summarizeRests(blocks)).toEqual({
      averageSec: 80,
      comparableCount: 3,
      totalCount: 5,
      plannedAverageSec: 80,
    });
  });

  it("n'invente pas de moyenne sans repos comparable", () => {
    const none = summarizeRests([
      {
        ...(blocks[0] as Extract<PerformedBlock, { kind: "exercise" }>),
        series: [
          { id: "s1", position: 0, status: "completed", reps: 10, actualRestAfterSec: 400, restComparable: false },
        ],
      },
    ]);

    expect(none).toEqual({ comparableCount: 0, totalCount: 1 });
  });
});
