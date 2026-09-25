// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { HOLD_PROGRESSION } from "../program/programV1";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * Lot K : la consigne d'un bloc (« +5 s de maintien par semaine… ») se lit
 * pendant la séance, sur la carte dépliée de l'exercice.
 */

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

describe("consigne du bloc en séance", () => {
  it("Routine A : la planche affiche la consigne de progression", async () => {
    const routine = (await db.sessionTemplates.get("v1-routine-a"))!;
    await startFreeWorkout("2026-09-27", "2026-09-27T19:00:00.000Z", routine);
    render(
      <MemoryRouter initialEntries={["/seance-en-cours"]}>
        <Routes>
          <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(HOLD_PROGRESSION)).toBeDefined();
  });
});
