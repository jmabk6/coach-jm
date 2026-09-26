// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { ExerciseDetailScreen } from "./ExerciseDetailScreen";

/** Refonte de la fiche (26/09/2026) : trois onglets, Progression par défaut, menu ⋯. */

describe("fiche exercice — onglets et menu", () => {
  beforeEach(async () => {
    window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
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

  it("Progression par défaut ; Comment faire ; Alternatives ; ⋯ > Réglages de progression", async () => {
    render(
      <MemoryRouter initialEntries={["/exercises/pullover-poulie"]}>
        <Routes>
          <Route path="/exercises/:exerciseId" element={<ExerciseDetailScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    const progression = await screen.findByRole("tab", { name: "Progression" }, { timeout: 4000 });
    expect(progression.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Prochaine séance")).toBeDefined();
    expect(screen.getByText("Charge à trouver")).toBeDefined();
    expect(screen.getByText("Pas encore de séance")).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "Comment faire" }));
    expect(await screen.findByText("Technique")).toBeDefined();
    expect(screen.queryByText("Prochaine séance")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Alternatives" }));
    expect(screen.queryByText("Technique")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Réglages de progression" }));
    expect(await screen.findByText("Cadre de progression", {}, { timeout: 4000 })).toBeDefined();
    expect(screen.getByRole("button", { name: "← Fiche" })).toBeDefined();
  }, 20000);
});
