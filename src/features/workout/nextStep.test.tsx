// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * Cardio en séance (06/10/2026) : le palier en cours annonce le suivant
 * (« Ensuite : Palier 2 · 5 min · 5,5 km/h · … ») — ses réglages se lisent
 * sans faire défiler ni valider trop tôt ; le dernier dit qu'il est le
 * dernier.
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

function renderWorkout() {
  render(
    <MemoryRouter initialEntries={["/seance-en-cours"]}>
      <Routes>
        <Route path="/seance-en-cours" element={<WorkoutScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const activeStep = () => document.querySelector<HTMLElement>(".wseries__row--active")!;

describe("palier cardio en cours : le suivant est annoncé", () => {
  it("Cardio A : palier 1 → « Ensuite : Palier 2 » avec ses réglages ; après validation, palier 2 → palier 3 ; le dernier : « Dernier palier »", async () => {
    await startFreeWorkout("2026-10-07", "2026-10-07T08:00:00.000Z", (await db.sessionTemplates.get("v2-cardio-a"))!);
    renderWorkout();

    const first = await screen.findByText(/^Ensuite : Palier 2 · 5 min · 5,5 km\/h/, {}, { timeout: 4000 });
    expect(activeStep().contains(first)).toBe(true);
    /* L'annonce est en tête du palier, avant le formulaire de saisie. */
    expect(first.compareDocumentPosition(activeStep().querySelector(".wseries__form")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Valider le palier 1" }));
    expect(await screen.findByText(/^Ensuite : Palier 3 · 5 min · 5,5 km\/h/)).toBeTruthy();

    for (let index = 2; index <= 7; index += 1) {
      fireEvent.click(await screen.findByRole("button", { name: `Valider le palier ${index}` }));
    }
    await screen.findByRole("button", { name: "Valider le palier 8" });
    expect(activeStep().textContent).toContain("Dernier palier");
    expect(activeStep().textContent).not.toContain("Ensuite :");
  }, 30000);
});
