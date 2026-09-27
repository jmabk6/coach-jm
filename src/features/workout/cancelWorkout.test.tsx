// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { getInProgressWorkout } from "../../db/repositories/workoutRepository";
import type { PlannedSession, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { cancelWorkout, isUntouchedWorkout } from "./deleteWorkout";
import { skipBlock } from "./engine/workoutEngine";
import { endWorkout } from "./finishWorkout";
import { startFreeWorkout } from "./startFreeWorkout";
import { startWorkout } from "./startWorkout";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * « Annuler cette séance » (demande du 27/09/2026) : démarrée par erreur,
 * rien de noté → la séance disparaît, l'instance redevient « À venir »,
 * tests compris. Dès qu'une donnée est notée : refus.
 */

const PLANNED: PlannedSession = {
  id: "weekly-2026-09-27", date: "2026-09-27", sessionTemplateId: "v1-muscu-a", status: "upcoming", source: "weekly_program",
  sourceWeekday: "sunday", sourceDate: "2026-09-27",
  tests: [{ protocolId: "protocol-traction", placement: "after_warmup" }],
  createdAt: "x", updatedAt: "x",
};

const START = "2026-09-27T00:40:00.000Z";

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await db.plannedSessions.put(PLANNED);
});

afterEach(async () => {
  cleanup();
  /* L'écran de séance écrit sa présence en tâche de fond : on la laisse finir. */
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

/** Une première série marquée faite, sans passer par l'écran. */
function withOneSeries(workout: WorkoutSession): WorkoutSession {
  let done = false;
  return {
    ...workout,
    blocks: workout.blocks.map((block) => {
      if (done || block.kind !== "exercise" || !block.series?.length) return block;
      done = true;
      const [first, ...rest] = block.series;
      return { ...block, series: [{ ...first!, status: "completed" as const, reps: 10, completedAt: START }, ...rest] };
    }),
  };
}

describe("cancelWorkout", () => {
  it("rien de noté : la séance disparaît, l'instance redevient « À venir » avec ses tests, rien d'autre ne bouge", async () => {
    const before = { frames: await db.strengthFrameVersions.toArray(), results: await db.testResults.toArray() };
    const started = await startWorkout(PLANNED.id, START);
    expect((await db.plannedSessions.get(PLANNED.id))?.status).toBe("in_progress");
    expect(isUntouchedWorkout(started)).toBe(true);

    await cancelWorkout(started.id, "2026-09-27T00:45:00.000Z");

    expect(await db.workouts.get(started.id)).toBeUndefined();
    expect(await getInProgressWorkout()).toBeUndefined();
    const planned = (await db.plannedSessions.get(PLANNED.id))!;
    expect(planned).toMatchObject({ status: "upcoming", tests: PLANNED.tests });
    expect(planned).not.toHaveProperty("workoutId");
    expect(await db.strengthFrameVersions.toArray()).toEqual(before.frames);
    expect(await db.testResults.toArray()).toEqual(before.results);

    /* Elle se redémarre normalement. */
    const again = await startWorkout(PLANNED.id, "2026-09-27T08:00:00.000Z");
    expect(again.plannedSessionId).toBe(PLANNED.id);
  });

  it("un exercice sauté n'est pas une donnée : annulation permise ; une série notée : refus, rien n'est supprimé", async () => {
    const started = await startWorkout(PLANNED.id, START);
    const first = started.blocks.find((block) => block.kind === "exercise")!;
    const skipped = skipBlock(started, first.id, START);
    expect(isUntouchedWorkout(skipped)).toBe(true);

    const touched = withOneSeries(started);
    expect(isUntouchedWorkout(touched)).toBe(false);
    await db.workouts.put(touched);
    await expect(cancelWorkout(started.id)).rejects.toThrow("Des données sont déjà notées : terminez la séance, puis supprimez-la si besoin");
    expect(await db.workouts.get(started.id)).toBeDefined();
    expect((await db.plannedSessions.get(PLANNED.id))?.status).toBe("in_progress");
  });

  it("séance libre annulée : disparaît ; séance enregistrée : refus", async () => {
    const free = await startFreeWorkout("2026-09-27", START);
    await cancelWorkout(free.id);
    expect(await db.workouts.get(free.id)).toBeUndefined();

    const other = await startFreeWorkout("2026-09-27", START);
    await endWorkout(other.id, "2026-09-27T01:00:00.000Z");
    await db.workouts.update(other.id, { status: "completed", completedAt: "2026-09-27T01:00:00.000Z" });
    await expect(cancelWorkout(other.id)).rejects.toThrow(/ne s'annule pas/);
  });
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderLive() {
  render(
    <MemoryRouter initialEntries={["/seance-en-cours"]}>
      <Routes>
        <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("écran de séance — menu ⋯", () => {
  it("rien de noté : « Annuler cette séance », confirmation, retour à l'Accueil ; la séance prévue redevient À venir", async () => {
    await startWorkout(PLANNED.id, START);
    renderLive();

    fireEvent.click(await screen.findByRole("button", { name: "Actions de la séance" }));
    fireEvent.click(screen.getByRole("button", { name: /^Annuler cette séance/ }));
    expect(screen.getByText(/la séance prévue redevient « À venir », tests compris/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /^Annuler la séance/ }));

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"));
    expect(await getInProgressWorkout()).toBeUndefined();
    expect((await db.plannedSessions.get(PLANNED.id))?.status).toBe("upcoming");
  });

  it("une série notée : l'action n'est pas proposée", async () => {
    const started = await startWorkout(PLANNED.id, START);
    await db.workouts.put(withOneSeries(started));
    renderLive();

    fireEvent.click(await screen.findByRole("button", { name: "Actions de la séance" }));
    expect(screen.getByRole("button", { name: /^Mettre en pause/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Annuler cette séance/ })).toBeNull();
  });
});
