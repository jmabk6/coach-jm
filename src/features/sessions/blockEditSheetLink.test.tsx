// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { ExerciseDetailScreen } from "../exercises/ExerciseDetailScreen";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { BlockEditScreen } from "./BlockEditScreen";

/**
 * Demande du 26/09/2026 : depuis un modèle de séance, « Modifier
 * l'exercice » mène à la fiche de l'exercice ; le retour de la fiche
 * ramène au modèle, sous le libellé « ← Retour ».
 */

describe("Modifier l'exercice → Voir la fiche", () => {
  beforeEach(async () => {
    /* La démonstration animée lit prefers-reduced-motion. */
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

  it("ouvre la fiche, puis « ← Retour » ramène à l'exercice du modèle", async () => {
    render(
      <MemoryRouter initialEntries={["/seances/v1-muscu-a/blocks/v1-muscu-a-squat"]}>
        <Routes>
          <Route path="/seances/:sessionId/blocks/:blockId" element={<BlockEditScreen />} />
          <Route path="/exercises/:exerciseId" element={<ExerciseDetailScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Voir la fiche/ }, { timeout: 4000 }));

    expect(await screen.findByRole("heading", { level: 1, name: "Squat barre" }, { timeout: 4000 })).toBeDefined();
    const back = document.querySelector(".exercise-detail__back") as HTMLButtonElement;
    expect(back.textContent).toBe("← Retour");
    fireEvent.click(back);

    expect(await screen.findByRole("heading", { name: "Modifier l'exercice" }, { timeout: 4000 })).toBeDefined();
  }, 20000);
});
