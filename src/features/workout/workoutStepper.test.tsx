// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedBlock } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { startFreeWorkout } from "./startFreeWorkout";
import { calculatePerformedNumbering } from "./workoutDisplay";
import { WorkoutScreen } from "./WorkoutScreen";
import { workoutSteps } from "./workoutSteps";

/**
 * Lot M.3 — frise des étapes (0 = test) et tableau des séries (M9) :
 * « Assistance (kg) » pour une assistance, « Charge (kg) » sinon.
 */

const exercise = (id: string, position: number, exerciseId: string, status: "performed" | "skipped" | "not_performed"): PerformedBlock => ({
  id, kind: "exercise", position, addedDuringWorkout: false, exerciseId, status,
  snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 90 },
});

describe("étapes de la frise", () => {
  it("la brique test est l'étape 0, les exercices partent de 1 ; faite, courante, sautée, à venir", () => {
    const blocks: PerformedBlock[] = [
      { id: "t", kind: "test", position: 0, addedDuringWorkout: false, status: "performed", protocolId: "p", protocolVersionId: "v" },
      exercise("a", 1, "traction-assistee", "not_performed"),
      exercise("b", 2, "squat", "skipped"),
      { id: "n", kind: "note", position: 3, addedDuringWorkout: false, text: "x" },
      exercise("c", 4, "rowing-poulie-basse", "not_performed"),
    ];
    const names = new Map([
      ["traction-assistee", { name: "Traction assistée" }],
      ["squat", { name: "Squat barre" }],
      ["rowing-poulie-basse", { name: "Rowing" }],
    ]) as never;
    const steps = workoutSteps(blocks, calculatePerformedNumbering(blocks), "a", names);
    expect(steps.map((step) => [step.number, step.label, step.state])).toEqual([
      [0, "Test", "done"],
      [1, "Traction assistée", "current"],
      [2, "Squat barre", "skipped"],
      [3, "Rowing", "upcoming"],
    ]);
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

  it("la frise liste les étapes ; un appui ouvre l'étape ; le tableau titre Assistance ou Charge", async () => {
    const template = (await db.sessionTemplates.get("v1-muscu-a"))!;
    await startFreeWorkout("2026-09-27", "2026-09-27T08:00:00.000Z", template);
    render(
      <MemoryRouter initialEntries={["/seance-en-cours"]}>
        <Routes>
          <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    const stepper = await screen.findByRole("navigation", { name: "Étapes de la séance" }, { timeout: 4000 });
    const steps = within(stepper).getAllByRole("button");
    expect(steps.map((step) => step.getAttribute("aria-label"))).toEqual([
      "Étape 1 : Tapis de course",
      "Étape 2 : Traction assistée",
      "Étape 3 : Squat barre",
      "Étape 4 : Rowing poulie basse assis",
      "Étape 5 : Chest press machine",
      "Étape 6 : Leg curl assis",
      "Étape 7 : Élévations latérales haltères",
    ]);

    fireEvent.click(within(stepper).getByRole("button", { name: "Étape 2 : Traction assistée" }));
    await waitFor(() => expect(within(stepper).getByRole("button", { name: "Étape 2 : Traction assistée" }).getAttribute("aria-current")).toBe("step"), {
      timeout: 4000,
    });
    expect(await screen.findByText("Assistance (kg)", {}, { timeout: 4000 })).toBeDefined();

    fireEvent.click(within(stepper).getByRole("button", { name: "Étape 3 : Squat barre" }));
    expect(await screen.findByText("Charge (kg)", {}, { timeout: 4000 })).toBeDefined();
  }, 20000);
});
