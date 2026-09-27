// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, PerformedSeries } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { proposeSeriesValues } from "./engine/workoutBlocks";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * Objectif de validation visible (demande du 27/09/2026) : un exercice
 * cadré annonce en tête « Pour valider : 3 × 12 · RPE ≤ 8 · à 40 kg », et
 * les répétitions proposées sont le haut de la fourchette, pas celles de
 * la dernière fois.
 */

const block = (frameVersionId?: string): PerformedExerciseBlock => ({
  id: "b", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "rowing-poulie-basse", status: "not_performed",
  ...(frameVersionId ? { frameVersionId } : {}),
  snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 },
  series: [],
});
const done = (reps: number): PerformedSeries => ({ id: "s", position: 0, status: "completed", role: "travail", load: { kind: "total", kg: 40 }, reps, rpe: 8 });

describe("répétitions proposées", () => {
  it("cadré : le haut de la fourchette, la charge de la dernière fois ; même après une série à 10 dans la séance", () => {
    expect(proposeSeriesValues(block("v1"), done(10))).toEqual({ load: { kind: "total", kg: 40 }, reps: 12 });
    expect(proposeSeriesValues({ ...block("v1"), series: [done(10)] })).toEqual({ load: { kind: "total", kg: 40 }, reps: 12 });
  });

  it("sans cadre : inchangé, les répétitions de la dernière fois", () => {
    expect(proposeSeriesValues(block(), done(10))).toEqual({ load: { kind: "total", kg: 40 }, reps: 10 });
  });
});

describe("écran de séance — « Pour valider »", () => {
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

  it("Muscu A : le rowing annonce ce qu'il faut tenir pour valider, avec sa charge", async () => {
    const template = (await db.sessionTemplates.get("v1-muscu-a"))!;
    await startFreeWorkout("2026-09-27", "2026-09-27T08:00:00.000Z", template);
    render(
      <MemoryRouter initialEntries={["/seance-en-cours"]}>
        <Routes>
          <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("Rowing poulie basse assis", {}, { timeout: 4000 });
    const rowing = [...document.querySelectorAll<HTMLElement>("li[data-block-id]")].find((item) => item.textContent?.includes("Rowing poulie basse assis"))!;
    fireEvent.click(within(rowing).getAllByRole("button")[0]!);
    const goal = await within(rowing).findByText(/Pour valider :/);
    expect(goal.closest(".wblock__goal")?.textContent).toBe("Pour valider : 3 × 12 · RPE ≤ 8 · à 40 kg");
  }, 20000);
});
