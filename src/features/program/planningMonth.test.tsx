// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { ProgramScreen } from "./ProgramScreen";

/**
 * Lot F.3 — Planning Mois (M3) : passé = séances réalisées, futur =
 * planifiées, aujourd'hui les deux ; fiche d'un jour ; résumé du mois ;
 * accès à l'historique.
 */

const T = "2026-09-01T08:00:00.000Z";

const planned = (id: string, date: string, sessionTemplateId: string, extra: Partial<PlannedSession> = {}): PlannedSession => ({
  id, date, sessionTemplateId, status: "upcoming", source: "weekly_program", createdAt: T, updatedAt: T, ...extra,
});

const done = (id: string, date: string, extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id, source: "free", kind: "training", status: "completed", date, startedAt: `${date}T08:00:00.000Z`, completedAt: `${date}T09:00:00.000Z`,
  lastActionAt: `${date}T09:00:00.000Z`, activeDurationSec: 3000, createdAt: T, updatedAt: T,
  blocks: [{
    id: `${id}-b`, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "presse-cuisses", status: "performed",
    snapshotInstructions: { shape: "reps", sets: 1, reps: { min: 10, max: 10 }, restBetweenSetsSec: 60 },
  }],
  ...extra,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 24, 10, 0, 0));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await db.plannedSessions.clear();
  await db.workouts.clear();
  await db.plannedSessions.bulkPut([
    planned("p-sun", "2026-09-20", "v1-muscu-a", { status: "done", workoutId: "w-sun" }),
    planned("p-tue", "2026-09-22", "v1-muscu-b"),
    planned("p-thu", "2026-09-24", "v1-muscu-c"),
    planned("p-sat", "2026-09-26", "v1-cardio-c"),
  ]);
  await db.workouts.bulkPut([
    done("w-sun", "2026-09-20", { source: "planned", plannedSessionId: "p-sun", sessionTemplateId: "v1-muscu-a" }),
    done("w-free", "2026-09-10"),
  ]);
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await db.delete();
});

function renderMonth(date: string) {
  return render(
    <MemoryRouter initialEntries={[`/planning?view=mois&date=${date}`]}>
      <ProgramScreen />
    </MemoryRouter>,
  );
}

const cell = (label: RegExp) => screen.getByRole("gridcell", { name: label });

describe("Planning Mois", () => {
  it("passé : les séances réalisées seulement ; aujourd'hui et le futur : les planifiées", async () => {
    renderMonth("2026-09-24");
    await screen.findByRole("grid", { name: /septembre 2026/i });

    expect(cell(/^dimanche 20 septembre 2026, 1 séance$/i)).toBeTruthy();
    expect(cell(/^jeudi 10 septembre 2026, 1 séance$/i)).toBeTruthy();
    /* Pastille : icône de la catégorie, statut dans sa forme (F.3 bis). */
    expect(cell(/^dimanche 20 septembre 2026/i).querySelector(".program-chip")?.className).toMatch(
      /program-chip--done program-chip--musculation/,
    );
    expect(cell(/^jeudi 24 septembre 2026/i).querySelector(".program-chip")?.className).toMatch(/program-chip--today/);
    expect(cell(/^samedi 26 septembre 2026/i).querySelector(".program-chip")?.className).toMatch(
      /program-chip--upcoming program-chip--cardio/,
    );
    expect(cell(/^samedi 26 septembre 2026/i).querySelector(".program-chip svg")).toBeTruthy();
    /* Mardi 22 : planifiée, non réalisée — le passé ne la montre pas. */
    expect(cell(/^mardi 22 septembre 2026$/i)).toBeTruthy();
    expect(cell(/^jeudi 24 septembre 2026, 1 séance$/i)).toBeTruthy();
    expect(cell(/^samedi 26 septembre 2026, 1 séance$/i)).toBeTruthy();
  });

  it("fiche d'un jour à venir : blocs avec durée estimée et « Voir le détail »", async () => {
    renderMonth("2026-09-26");
    const detail = await screen.findByRole("link", { name: /Voir le détail de cette séance/ });
    expect(detail.getAttribute("href")).toBe("/seances/v1-cardio-c");

    const blocks = screen.getByRole("list", { name: "Blocs de la séance" });
    expect(within(blocks).getAllByRole("listitem")).toHaveLength(1);
    expect(blocks.querySelector(".program-day-card__name")?.textContent).toBe("Tapis de course · 3 paliers · 55 min · 4,5 à 5 km/h · 0 à 8 %");
    expect(within(blocks).getByText(/≈ \d+ min/)).toBeTruthy();
  });

  it("fiche d'un jour passé : le récapitulatif de la séance faite", async () => {
    renderMonth("2026-09-20");
    const recap = await screen.findByRole("link", { name: /Voir le récapitulatif/ });
    expect(recap.getAttribute("href")).toMatch(/^\/workouts\/w-sun\?returnTo=/);
  });

  it("résumé du mois et accès à l'historique", async () => {
    renderMonth("2026-09-24");
    const summary = await screen.findByRole("region", { name: "Résumé du mois" });

    expect(within(summary).getByText("Résumé de septembre 2026")).toBeTruthy();
    /* 2 séances comptées (20/09 et 10/09) ; 23 jours écoulés, 2 actifs. */
    expect(within(summary).getByText("séances réalisées").previousSibling?.textContent).toBe("2");
    expect(within(summary).getByText("jours sans séance").previousSibling?.textContent).toBe("21");
    const lines = within(summary).getByRole("list", { name: "Types de séances" });
    expect(lines.textContent).toBe("Musculation 2Cardio 0Routine 0");
    expect(within(summary).getByRole("link", { name: /Voir l'historique/ }).getAttribute("href")).toBe("/historique");
  });
});
