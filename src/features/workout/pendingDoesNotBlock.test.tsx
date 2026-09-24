// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { getInProgressWorkout, getPendingWorkout } from "../../db/repositories/workoutRepository";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { endWorkout } from "./finishWorkout";
import { ResumeWatcher } from "./ResumeWatcher";
import { startFreeWorkout } from "./startFreeWorkout";
import { startWorkout } from "./startWorkout";

/**
 * Une séance terminée mais pas encore enregistrée (D20) n'empêche jamais
 * d'en démarrer une autre : la Cardio A du 24/09 en attente ne bloque pas
 * Muscu A le dimanche 27/09.
 */

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  const cardio = (await db.sessionTemplates.get("v1-cardio-a"))!;
  const pending = await startFreeWorkout("2026-09-24", "2026-09-24T13:35:00.000Z", cardio);
  await endWorkout(pending.id, "2026-09-24T16:22:00.000Z");
  await db.plannedSessions.put({
    id: "weekly-2026-09-27", date: "2026-09-27", sessionTemplateId: "v1-muscu-a", status: "upcoming", source: "weekly_program",
    sourceWeekday: "sunday", sourceDate: "2026-09-27", createdAt: "x", updatedAt: "x",
  });
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

function WhereAmI() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

describe("séance en attente d'enregistrement", () => {
  it("Muscu A démarre ; la séance en cours et la séance en attente se distinguent", async () => {
    expect(await getInProgressWorkout()).toBeUndefined();
    const pending = (await getPendingWorkout())!;
    expect(pending.date).toBe("2026-09-24");

    const muscu = await startWorkout("weekly-2026-09-27", "2026-09-27T09:00:00.000Z");
    expect((await getInProgressWorkout())?.id).toBe(muscu.id);
    expect((await getPendingWorkout())?.id).toBe(pending.id);

    /* Une seule séance en cours à la fois : la suivante reste refusée. */
    await expect(startFreeWorkout("2026-09-27", "2026-09-27T09:05:00.000Z")).rejects.toThrow(/déjà en cours/);
  });

  it("au lancement, la séance en cours passe avant le récapitulatif en attente", async () => {
    await startWorkout("weekly-2026-09-27", "2026-09-27T09:00:00.000Z");
    render(
      <MemoryRouter initialEntries={["/seance-en-cours"]}>
        <ResumeWatcher />
        <Routes>
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("where").textContent).toBe("/seance-en-cours");
  });

  it("sans séance en cours, le récapitulatif en attente s'ouvre toujours", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ResumeWatcher />
        <Routes>
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("/seance-en-cours/fin")).toBeTruthy();
  });
});
