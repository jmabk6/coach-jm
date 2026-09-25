// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, StrengthFrameVersion, StrengthMilestone, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { programFrameIds } from "../strength/seedProgramFrames";
import { frameInsightsFor } from "../strength/useFrameInsights";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * Lot M.1 — « Augmentation proposée » et « Stagnation à examiner » en
 * séance, mêmes règles que la fiche : aucune hausse sans incrément
 * (traction), pas de double inversion en assistance.
 */

const T = "2026-09-20T10:00:00.000Z";

function version(overrides: Partial<StrengthFrameVersion> = {}): StrengthFrameVersion {
  return {
    id: "v1", frameId: "f1", number: 1, status: "active", progressionType: "assistance_decroissante", workSets: 3,
    repRange: { min: 6, max: 8 }, rpeTarget: 8, restSec: 150, createdAt: T, updatedAt: T, ...overrides,
  };
}

function done(id: string, date: string, frameVersionId: string, exerciseId: string, kg: number, reps: number): WorkoutSession {
  const block: PerformedExerciseBlock = {
    id: `${id}-b`, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId, frameVersionId, status: "performed",
    snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 },
    series: [0, 1, 2].map((index) => ({ id: `${id}-s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, rpe: 8 })),
  };
  return {
    id, source: "free", kind: "training", status: "completed", date, startedAt: `${date}T08:00:00.000Z`, completedAt: `${date}T09:00:00.000Z`,
    lastActionAt: `${date}T09:00:00.000Z`, activeDurationSec: 3600, blocks: [block], createdAt: T, updatedAt: T,
  };
}

const milestone = (frameVersionId: string, value: number): StrengthMilestone => ({
  id: "m1", frameVersionId, workoutId: "w1", date: "2026-09-20", value, unit: "kg", createdAt: T,
});

describe("règles des encarts", () => {
  it("assistance sans incrément : aucune hausse ; avec incrément : le cran suivant est une assistance plus basse, une seule fois inversée", () => {
    const workouts = [done("w1", "2026-09-20", "v1", "traction-assistee", 52, 8)];
    expect(frameInsightsFor([version()], [milestone("v1", 52)], workouts).get("v1")?.raise).toBeUndefined();

    const withIncrement = version({ increment: { unit: "kg", value: 2.5 } });
    const raise = frameInsightsFor([withIncrement], [milestone("v1", 52)], workouts).get("v1")!.raise!;
    expect(raise.value).toBe(49.5);
    expect(raise.value).toBeLessThan(raise.milestone.value);
  });

  it("trois séances à la même charge sans progrès : stagnation", () => {
    const workouts = [
      done("a", "2026-09-10", "v1", "traction-assistee", 52, 7),
      done("b", "2026-09-13", "v1", "traction-assistee", 52, 7),
      done("c", "2026-09-17", "v1", "traction-assistee", 52, 6),
    ];
    expect(frameInsightsFor([version()], [], workouts).get("v1")?.stagnation?.load).toBe(52);
  });
});

describe("écran de séance", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
  });

  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 50));
    db.close();
    await db.delete();
  });

  async function openMuscuA() {
    const template = (await db.sessionTemplates.get("v1-muscu-a"))!;
    await startFreeWorkout("2026-09-27", "2026-09-27T08:00:00.000Z", template);
    render(
      <MemoryRouter initialEntries={["/seance-en-cours"]}>
        <Routes>
          <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByText(/Traction assistée/);
  }

  it("rowing validé à 40 kg : l'encart propose 42,5 kg ; Accepter pose l'objectif ; traction sans incrément : rien", async () => {
    const rowing = programFrameIds("rowing-poulie-basse").versionId;
    const traction = programFrameIds("traction-assistee").versionId;
    await db.workouts.bulkPut([done("w1", "2026-09-20", rowing, "rowing-poulie-basse", 40, 12), done("w2", "2026-09-20", traction, "traction-assistee", 52, 8)]);
    await db.strengthMilestones.bulkPut([
      { ...milestone(rowing, 40), id: "m-rowing" },
      { ...milestone(traction, 52), id: "m-traction", workoutId: "w2" },
    ]);
    await openMuscuA();

    /* L'encart suit la carte dépliée : on ouvre le rowing. */
    fireEvent.click(screen.getAllByRole("button", { name: /Rowing poulie basse/ })[0]!);
    const inset = await screen.findByRole("complementary", { name: "Hausse proposée" }, { timeout: 4000 });
    expect(within(inset).getByText("42,5 kg")).toBeDefined();
    expect(screen.getAllByRole("complementary", { name: "Hausse proposée" })).toHaveLength(1);

    fireEvent.click(within(inset).getByRole("button", { name: "Accepter le nouveau palier" }));
    await waitFor(async () => expect((await db.strengthFrameVersions.get(rowing))?.currentTarget).toMatchObject({ value: 42.5, fromMilestoneId: "m-rowing" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Hausse proposée" })).toBeNull());
  });
});
