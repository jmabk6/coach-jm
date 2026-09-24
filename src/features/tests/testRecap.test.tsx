// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { endAndConfirm } from "../workout/endAndConfirmForTests";
import { applyWorkoutAction } from "../workout/engine/persistWorkout";
import { addTestTrial, finishBlock } from "../workout/engine/workoutEngine";
import { startWorkout } from "../workout/startWorkout";
import { WorkoutBlockDetailScreen } from "../workout/WorkoutBlockDetailScreen";
import { WorkoutRecapScreen } from "../workout/WorkoutRecapScreen";

/**
 * Lot G.5 — une séance enregistrée avec un test : le bilan annonce un
 * « Nouveau repère » (jamais un record), la ligne porte le nom du test, et
 * le détail relit le résultat, en lecture seule (D27).
 */

const WORKOUT = "workout-weekly-2026-10-25";
const TEST = "workout-block-test-protocol-traction";

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await generateProgramWeek("2026-10-25", "2026-09-24T10:00:00.000Z");
  await startWorkout("weekly-2026-10-25", "2026-10-25T09:00:00.000Z");
  for (const [value, outcome] of [[40, "success"], [38, "success"], [36, "failure"]] as const) {
    await applyWorkoutAction(WORKOUT, (current, at) => addTestTrial(current, TEST, { value, outcome }, at));
  }
  await applyWorkoutAction(WORKOUT, (current, at) => finishBlock(current, TEST, at));
  await endAndConfirm(WORKOUT, "2026-10-25T10:30:00.000Z");
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workouts/:workoutId" element={<WorkoutRecapScreen />} />
        <Route path="/workouts/:workoutId/blocks/:blockId" element={<WorkoutBlockDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("séance enregistrée avec un test", () => {
  it("vue 1 : « Nouveau repère » avec l'assistance minimale", async () => {
    renderAt(`/workouts/${WORKOUT}`);
    const card = (await screen.findByText("Traction assistée (test)")).closest("li")!;
    expect(within(card).getByText("38 kg d'assistance")).toBeTruthy();
    expect(within(card).getByText("Nouveau repère")).toBeTruthy();
    expect(screen.queryByText(/record/i, { selector: ".end-records__meta" })).toBeNull();
  });

  it("vue 2 : la ligne porte le nom du test", async () => {
    renderAt(`/workouts/${WORKOUT}?vue=2`);
    expect(await screen.findByText("Test traction assistée")).toBeTruthy();
  });

  it("détail : le résultat enregistré, en lecture seule", async () => {
    renderAt(`/workouts/${WORKOUT}/blocks/${TEST}`);
    const result = await screen.findByRole("region", { name: "Résultat" });
    expect(await within(result).findByText("38 kg")).toBeTruthy();
    expect(within(result).getByRole("heading").textContent).toBe("Résultat");
    expect(screen.getAllByText("Réussi")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Réussi" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirer l'essai/ })).toBeNull();
  });
});
