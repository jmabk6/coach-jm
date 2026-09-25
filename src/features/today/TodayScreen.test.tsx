// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { generateProgramWeek } from "../program/generateProgramWeek";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { endWorkout } from "../workout/finishWorkout";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { TodayScreen } from "./TodayScreen";

/**
 * Lot J.1 — Accueil (M1) : séance du jour et son test, « Ce soir » (routine,
 * contenu à définir, tests du lundi), repos, séance en attente, bandeau de
 * la semaine de tests.
 */

async function renderOn(day: string) {
  vi.setSystemTime(new Date(`${day}T10:00:00`));
  render(
    <MemoryRouter>
      <TodayScreen />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1, name: "Accueil" });
  await screen.findByText(/Semaine de tests/);
}

const evening = () => screen.getByRole("link", { name: /^Ce soir/ });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T10:00:00"));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await generateProgramWeek("2026-09-27", "2026-09-24T08:00:00.000Z");
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

describe("Accueil — bloc Aujourd'hui", () => {
  it("dimanche 27/09 : Muscu A et son test traction ; ce soir, la routine A ; bandeau « Semaine de tests »", async () => {
    await renderOn("2026-09-27");
    expect(await screen.findByText("Muscu A — Traction force / dos")).toBeDefined();
    expect(screen.getByText("Test traction assistée")).toBeDefined();
    expect(within(evening()).getByText("Routine A — Avant du tronc et hanches")).toBeDefined();
    expect(within(evening()).getByText("Avant du tronc et hanches")).toBeDefined();
    expect(screen.getByText("Semaine de tests")).toBeDefined();
    /* Une journée prévue : pas de carte Repos, pas de « Choisir une séance ». */
    expect(screen.queryByText("Jour de repos")).toBeNull();
  });

  it("lundi 28/09 : ce soir, la Souplesse et le Tronc à la place de la routine", async () => {
    await renderOn("2026-09-28");
    expect(await screen.findByText("Cardio B — Intervalles vélo")).toBeDefined();
    expect(within(evening()).getByText("Test souplesse · Test tronc")).toBeDefined();
  });

  it("vendredi 02/10 : repos le jour, routine le soir ; une séance supplémentaire reste possible", async () => {
    await renderOn("2026-10-02");
    expect(await screen.findByText("Jour de repos")).toBeDefined();
    expect(evening()).toBeDefined();
    expect(screen.getByRole("button", { name: /Choisir une séance/ })).toBeDefined();
  });

  it("routine encore vide : « Routine A — contenu à définir »", async () => {
    await db.sessionTemplates.update("v1-routine-a", { name: "Routine A — à définir", blocks: [] });
    await renderOn("2026-09-27");
    expect(await within(await screen.findByRole("link", { name: /^Ce soir/ })).findByText("Routine A — contenu à définir")).toBeDefined();
  });

  it("séance d'un autre jour en attente : « Terminer l'enregistrement »", async () => {
    const cardio = (await db.sessionTemplates.get("v1-cardio-a"))!;
    const workout = await startFreeWorkout("2026-09-24", "2026-09-24T13:00:00.000Z", cardio);
    await endWorkout(workout.id, "2026-09-24T14:00:00.000Z");
    await renderOn("2026-09-27");
    expect(await screen.findByRole("link", { name: "Terminer l'enregistrement" })).toBeDefined();
  });
});
