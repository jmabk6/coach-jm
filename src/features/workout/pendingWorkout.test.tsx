// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, PlannedSession, WorkoutSession } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { deleteWorkout } from "./deleteWorkout";
import { endWorkout } from "./finishWorkout";
import { ResumeWatcher } from "./ResumeWatcher";
import { WorkoutBlockDetailScreen } from "./WorkoutBlockDetailScreen";

/**
 * Lot E.2 — séance terminée, pas encore enregistrée : au lancement, le
 * récapitulatif en attente s'ouvre ; les séries se corrigent encore ; la
 * séance se supprime (N6), l'instance planifiée redevient à venir.
 */

const T = "2026-09-27T09:00:00.000Z";
const END = "2026-09-27T10:00:00.000Z";

const presse: PerformedExerciseBlock = {
  id: "b-presse", kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "presse-cuisses", status: "not_performed",
  snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
  series: [
    { id: "s1", position: 0, status: "completed", role: "travail", load: { kind: "total", kg: 130 }, reps: 12, completedAt: T },
    { id: "s2", position: 1, status: "completed", role: "travail", load: { kind: "total", kg: 130 }, reps: 12, completedAt: T },
  ],
};

const planned: PlannedSession = {
  id: "p1", date: "2026-09-27", sessionTemplateId: "v1-muscu-b", status: "in_progress", workoutId: "w1", source: "weekly_program", createdAt: T, updatedAt: T,
};

const running: WorkoutSession = {
  id: "w1", source: "planned", plannedSessionId: "p1", sessionTemplateId: "v1-muscu-b", kind: "training", status: "in_progress",
  date: "2026-09-27", startedAt: T, lastActionAt: T, activeDurationSec: 0, blocks: [presse], currentBlockId: "b-presse", createdAt: T, updatedAt: T,
};

function WhereAmI() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.exercises.bulkAdd(exerciseCatalog);
  await db.plannedSessions.put(planned);
  await db.workouts.put(running);
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

describe("au lancement", () => {
  it("une séance terminée non enregistrée ouvre son récapitulatif en attente", async () => {
    await endWorkout("w1", END);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ResumeWatcher />
        <Routes>
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/seance-en-cours/fin"));
  });

  it("dans le détail d'une de ses briques (pour corriger), on n'est pas renvoyé", async () => {
    await endWorkout("w1", END);
    render(
      <MemoryRouter initialEntries={["/workouts/w1/blocks/b-presse"]}>
        <ResumeWatcher />
        <Routes>
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </MemoryRouter>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("where").textContent).toBe("/workouts/w1/blocks/b-presse");
  });
});

describe("corrections en attente", () => {
  function renderDetail() {
    return render(
      <MemoryRouter initialEntries={["/workouts/w1/blocks/b-presse"]}>
        <Routes>
          <Route path="/workouts/:workoutId/blocks/:blockId" element={<WorkoutBlockDetailScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("une série se corrige tant que la séance n'est pas enregistrée", async () => {
    await endWorkout("w1", END);
    renderDetail();

    fireEvent.click((await screen.findAllByRole("button", { name: "Corriger" }))[1]!);
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }));

    await waitFor(async () =>
      expect(((await db.workouts.get("w1"))!.blocks[0] as PerformedExerciseBlock).series?.[1]?.reps).toBe(11),
    );
    expect((await db.workouts.get("w1"))?.endedAt).toBe(END);
  });

  it("séance enregistrée : aucune correction proposée", async () => {
    await db.workouts.put({ ...running, status: "completed", completedAt: END, endedAt: END });
    renderDetail();

    expect((await screen.findAllByText("130 kg × 12")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Corriger" })).toBeNull();
  });
});

describe("suppression d'une séance en attente (N6)", () => {
  it("la séance disparaît et l'instance planifiée redevient à venir", async () => {
    await endWorkout("w1", END);
    const result = await deleteWorkout("w1", END);

    expect(result.deletedId).toBe("w1");
    expect(await db.workouts.get("w1")).toBeUndefined();
    const reset = await db.plannedSessions.get("p1");
    expect(reset?.status).toBe("upcoming");
    expect(reset?.workoutId).toBeUndefined();
  });

  it("une séance vraiment en cours (non terminée) ne se supprime pas", async () => {
    await expect(deleteWorkout("w1", END)).rejects.toThrow(/terminez-la/);
    expect(await db.workouts.get("w1")).toBeDefined();
  });
});
