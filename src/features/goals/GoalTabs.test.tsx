// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { GOAL_ADVICE } from "./goalAdvice";
import { GoalDetailScreen } from "./GoalDetailScreen";
import { GOALS_V1 } from "./goalsV1";

/**
 * Lot H.5 — M6 Exercices (lettres lues sur les modèles V1) et M7 Conseils
 * (Traction validé ; objectifs 2 à 7 en premier jet, bandeau « en cours de
 * validation »).
 */

function renderTab(key: string, tab: "exercices" | "conseils") {
  render(
    <MemoryRouter initialEntries={[`/objectifs/${key}?onglet=${tab}`]}>
      <Routes>
        <Route path="/objectifs/:key" element={<GoalDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T10:00:00"));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

describe("M6 — Exercices", () => {
  it("Traction : les 6 exercices liés, lettre et prescription lues sur les modèles V1", async () => {
    renderTab("traction", "exercices");
    expect(await screen.findByText("Exercices pour progresser")).toBeDefined();
    expect(document.querySelectorAll(".goal-exercises li")).toHaveLength(6);

    const assisted = rowOf("Traction assistée");
    expect(within(assisted).getByText("A")).toBeDefined();
    expect(within(assisted).getByText("3 × 6–8 répétitions")).toBeDefined();
    expect(within(rowOf("Traction négative")).getByText("B")).toBeDefined();
    expect(within(rowOf("Tirage vertical à la poulie")).getByText("B")).toBeDefined();
    expect(within(rowOf("Suspension + activation des omoplates")).getByText("C")).toBeDefined();
    expect(within(rowOf("Suspension + activation des omoplates")).getByText("3 × 20–30 s")).toBeDefined();
  });

  it("exercice hors programme : pas de lettre ; supprimé : ligne inactive", async () => {
    await db.sessionTemplates.update("v1-muscu-c", { status: "archived" });
    await db.exercises.update("traction-negative", { status: "archived" });
    renderTab("traction", "exercices");
    await screen.findByText("Exercices pour progresser");

    const pullover = rowOf("Pullover poulie bras tendus");
    expect(pullover.querySelector(".goal-exercises__letter")).toBeNull();
    const negative = rowOf("Traction négative");
    expect(negative.querySelector(".goal-exercises__row--inactive")).not.toBeNull();
    expect(negative.querySelector("a")).toBeNull();
  });

  it("Tronc et Souplesse : exercices à définir avec les routines du soir", async () => {
    renderTab("core", "exercices");
    expect(await screen.findByText("Exercices à définir avec les routines du soir.")).toBeDefined();
  });
});

describe("M7 — Conseils", () => {
  it("Traction : validé, sans bandeau ; les trois séances et la règle de progression", async () => {
    renderTab("traction", "conseils");
    expect(await screen.findByText("Fréquence recommandée")).toBeDefined();
    expect(screen.queryByText("Conseils en cours de validation")).toBeNull();
    expect(screen.getByText("Séance A — Force")).toBeDefined();
    expect(screen.getByText(/passer un cran d'assistance en moins/)).toBeDefined();
  });

  it("objectifs 2 à 7 : premier jet, bandeau « Conseils en cours de validation »", async () => {
    for (const key of ["upper_body", "legs", "cardio", "core", "flexibility", "weight"]) {
      renderTab(key, "conseils");
      expect(await screen.findByText("Conseils en cours de validation")).toBeDefined();
      cleanup();
    }
  });

  it("chaque objectif du seed a ses conseils ; aucun conseil ne cite un exercice hors D10", () => {
    for (const goal of GOALS_V1) expect(GOAL_ADVICE[goal.adviceKey], goal.key).toBeDefined();
    const all = JSON.stringify(Object.values(GOAL_ADVICE));
    for (const outside of ["soulevé de terre", "burpee", "fente", "crunch", "dips"]) expect(all.toLowerCase()).not.toContain(outside);
  });
});
