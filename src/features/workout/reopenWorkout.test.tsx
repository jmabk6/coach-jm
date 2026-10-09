// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { confirmWorkout, endWorkout } from "./finishWorkout";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutEndScreen } from "./WorkoutEndScreen";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * « Reprendre la séance » (10/10/2026) : sur l'écran de fin, une séance
 * terminée par erreur et pas encore enregistrée revient à l'écran de
 * séance, là où elle en était.
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

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        <Route path="/seance-en-cours/fin" element={<WorkoutEndScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("écran de fin : reprendre la séance", () => {
  it("terminée par erreur : « Reprendre la séance » ramène à la séance en cours, chrono relancé, rien d'enregistré", async () => {
    const started = await startFreeWorkout("2026-10-10", "2026-10-10T08:00:00.000Z", (await db.sessionTemplates.get("v2-muscu-c"))!);
    await endWorkout(started.id, "2026-10-10T08:30:00.000Z");
    renderAt("/seance-en-cours/fin");

    fireEvent.click(await screen.findByRole("button", { name: "Reprendre la séance" }, { timeout: 4000 }));

    expect(await screen.findByRole("button", { name: "Terminer la séance" }, { timeout: 4000 })).toBeTruthy();
    const reopened = (await db.workouts.get(started.id))!;
    expect(reopened.status).toBe("in_progress");
    expect(reopened.endedAt).toBeUndefined();
    expect(reopened.resumeState).toBeUndefined();
    expect(reopened.blocks.some((block) => block.kind === "exercise" && block.series?.some((series) => series.status === "upcoming"))).toBe(true);
  }, 30000);

  it("séance enregistrée : plus de « Reprendre la séance »", async () => {
    const started = await startFreeWorkout("2026-10-10", "2026-10-10T08:00:00.000Z", (await db.sessionTemplates.get("v2-muscu-c"))!);
    await endWorkout(started.id, "2026-10-10T08:30:00.000Z");
    await confirmWorkout(started.id, {}, "2026-10-10T08:31:00.000Z");
    expect((await db.workouts.get(started.id))!.resumeState).toBeUndefined();
    renderAt("/seance-en-cours/fin");
    expect(await screen.findByText("Aucune séance en attente d'enregistrement.", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reprendre la séance" })).toBeNull();
  }, 30000);
});
