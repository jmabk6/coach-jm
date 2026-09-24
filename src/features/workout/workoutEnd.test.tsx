// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { Goal, PerformedExerciseBlock, PlannedSession, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { endWorkout } from "./finishWorkout";
import { WorkoutEndScreen } from "./WorkoutEndScreen";
import { WorkoutRecapScreen } from "./WorkoutRecapScreen";

/**
 * Lot E.4 — fin de séance M10 : vue 1 (terminée, tonnage, records,
 * objectifs travaillés), vue 2 (liste → pages dédiées), vue 3 (prochaine
 * séance, ressenti, notes, Enregistrer) ; séance enregistrée en lecture.
 */

const T = "2026-09-27T16:05:00.000Z";
const END = "2026-09-27T17:07:00.000Z";

const series = (id: string, kg: number, reps: number) => ({
  id, position: 0, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, completedAt: T,
});

function block(id: string, exerciseId: string, rows: ReturnType<typeof series>[], position = 0): PerformedExerciseBlock {
  return {
    id, kind: "exercise", position, addedDuringWorkout: false, exerciseId, status: "performed",
    snapshotInstructions: { shape: "reps", sets: rows.length, reps: { min: 6, max: 12 }, restBetweenSetsSec: 90 },
    series: rows.map((row, index) => ({ ...row, position: index })),
  };
}

function session(id: string, date: string, blocks: PerformedExerciseBlock[], extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id, source: "free", kind: "training", status: "completed", date, startedAt: `${date}T16:05:00.000Z`, lastActionAt: `${date}T17:00:00.000Z`,
    completedAt: `${date}T17:00:00.000Z`, activeDurationSec: 2880, blocks, createdAt: `${date}T16:05:00.000Z`, updatedAt: `${date}T17:00:00.000Z`, ...extra,
  };
}

const previous = session("w0", "2026-09-20", [block("p-presse", "presse-cuisses", [series("a", 120, 12)])]);

const running = session(
  "w1",
  "2026-09-27",
  [
    block("b-traction", "traction-assistee", [series("t1", 52, 7), series("t2", 52, 6)]),
    block("b-presse", "presse-cuisses", [series("s1", 130, 12), series("s2", 130, 10)], 1),
  ],
  { source: "planned", plannedSessionId: "p1", sessionTemplateId: "v1-muscu-a", status: "in_progress", startedAt: T, activeDurationSec: 0 },
);
delete running.completedAt;

const plannedToday: PlannedSession = {
  id: "p1", date: "2026-09-27", sessionTemplateId: "v1-muscu-a", status: "in_progress", workoutId: "w1", source: "weekly_program", createdAt: T, updatedAt: T,
};
const plannedTomorrow: PlannedSession = {
  id: "p2", date: "2026-09-28", sessionTemplateId: "v1-cardio-b", status: "upcoming", source: "weekly_program", createdAt: T, updatedAt: T,
};

const jambes = {
  id: "goal-legs", key: "legs", position: 2, title: "Jambes", icon: "footprints", segments: [], currentSegmentId: "s",
  linkedExercises: [{ exerciseId: "presse-cuisses" }], secondaryIndicators: [], adviceKey: "legs", createdAt: T, updatedAt: T,
} as Goal;

function WhereAmI() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderEnd() {
  return render(
    <MemoryRouter initialEntries={["/seance-en-cours/fin"]}>
      <Routes>
        <Route path="/seance-en-cours/fin" element={<WorkoutEndScreen />} />
        <Route path="*" element={<WhereAmI />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await db.plannedSessions.bulkPut([plannedToday, plannedTomorrow]);
  await db.workouts.bulkPut([previous, running]);
  await endWorkout("w1", END);
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

describe("vue 1 — terminée et records", () => {
  it("tonnage hors assistance, records, références posées ; objectifs masqués sans objectif", async () => {
    renderEnd();

    expect(await screen.findByText("Séance terminée !")).toBeDefined();
    expect(screen.getByText("2 exercices réalisés")).toBeDefined();
    expect(screen.getAllByText("Durée totale : 1 h 02 min").length).toBe(1);
    expect(screen.getByText("Tonnage total")).toBeDefined();
    expect(screen.getByText("(traction assistée non incluse)")).toBeDefined();

    expect(screen.getByText("Records de la séance")).toBeDefined();
    expect(screen.getByText("Presse à cuisses")).toBeDefined();
    expect(screen.getByText("130 kg × 12")).toBeDefined();
    expect(screen.getByText("(précédent : 120 kg × 12)")).toBeDefined();
    /* Traction assistée : première mesure, une référence, jamais un record. */
    expect(screen.getByText("Références posées : 1")).toBeDefined();

    expect(screen.queryByText("Objectifs travaillés")).toBeNull();
    expect(screen.queryByText("Volume total")).toBeNull();
  });

  it("un objectif lié à un exercice effectué apparaît dans « Objectifs travaillés »", async () => {
    await db.goals.put(jambes);
    renderEnd();

    expect(await screen.findByText("Objectifs travaillés")).toBeDefined();
    expect(screen.getByText("Jambes")).toBeDefined();
  });

  it("aucun record, aucune assistance : ni section records, ni mention « non incluse »", async () => {
    await db.workouts.put(session("w0", "2026-09-20", [block("p-presse", "presse-cuisses", [series("a", 140, 12)])]));
    const ended = (await db.workouts.get("w1"))!;
    await db.workouts.put({ ...ended, blocks: [ended.blocks[1]!] });
    renderEnd();

    expect(await screen.findByText("Séance terminée !")).toBeDefined();
    expect(screen.queryByText("Records de la séance")).toBeNull();
    expect(screen.queryByText(/non incluse/)).toBeNull();
    expect(screen.queryByText(/Références posées/)).toBeNull();
  });
});

describe("vue 2 — détail", () => {
  it("une ligne par brique, qui ouvre sa page dédiée", async () => {
    renderEnd();
    fireEvent.click(await screen.findByRole("button", { name: /Voir le détail de la séance/ }));

    expect(await screen.findByText("Détail de la séance")).toBeDefined();
    expect(screen.getByText("Tonnage total")).toBeDefined();
    const link = screen.getByText("Presse à cuisses").closest("a")!;
    expect(link.getAttribute("href")).toMatch(/^\/workouts\/w1\/blocks\/b-presse/);
  });
});

describe("vue 3 — prochaine séance, ressenti, notes, Enregistrer", () => {
  it("le ressenti et la note s'écrivent aussitôt ; Enregistrer confirme et revient à l'accueil", async () => {
    renderEnd();
    fireEvent.click(await screen.findByRole("button", { name: /Voir le détail de la séance/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Bilan et prochaine séance/ }));

    expect(await screen.findByText("Prochaine séance")).toBeDefined();
    expect(screen.getByText("Lundi 28 septembre 2026")).toBeDefined();
    expect(screen.getByText("Cardio B — Intervalles vélo")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Facile" }));
    await waitFor(async () => expect((await db.workouts.get("w1"))?.feeling).toBe(4));

    const note = screen.getByLabelText("Notes");
    fireEvent.change(note, { target: { value: "  Presse facile, monter  " } });
    fireEvent.blur(note);
    await waitFor(async () => expect((await db.workouts.get("w1"))?.note).toBe("Presse facile, monter"));
    expect((await db.workouts.get("w1"))?.status).toBe("in_progress");

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et revenir à l'accueil" }));

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"));
    const saved = (await db.workouts.get("w1"))!;
    expect(saved.status).toBe("completed");
    expect(saved.completedAt).toBe(END);
    expect(saved.feeling).toBe(4);
    expect(saved.note).toBe("Presse facile, monter");
    expect((await db.plannedSessions.get("p1"))?.status).toBe("done");
  });
});

describe("séance enregistrée : vues en lecture", () => {
  function renderSaved(search = "") {
    return render(
      <MemoryRouter initialEntries={[`/workouts/w1${search}`]}>
        <Routes>
          <Route path="/workouts/:workoutId" element={<WorkoutRecapScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(async () => {
    const ended = (await db.workouts.get("w1"))!;
    await db.workouts.put({ ...ended, status: "completed", completedAt: END, feeling: 2, note: "Dos raide" });
  });

  it("vue 1 : « Séance enregistrée », records recalculés", async () => {
    renderSaved();
    expect(await screen.findByText("Séance enregistrée")).toBeDefined();
    expect(screen.getByText("130 kg × 12")).toBeDefined();
  });

  it("vue 3 : ressenti et note affichés, rien ne se modifie, pas d'Enregistrer", async () => {
    renderSaved("?vue=3");

    expect(await screen.findByText("Dos raide")).toBeDefined();
    const chosen = screen.getByRole("button", { name: "Difficile" });
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
    expect((chosen as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Notes")).toBeNull();
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).toBeNull();
    expect(screen.queryByText("Prochaine séance")).toBeNull();
  });
});
