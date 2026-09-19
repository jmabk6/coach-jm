// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { SessionTemplate, WorkoutSession } from "../../domain";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { HistoryScreen } from "./HistoryScreen";

const now = "2026-09-18T10:00:00.000Z";

const bilanTemplate: SessionTemplate = {
  id: "tpl-bilan",
  name: "Bilan du mois",
  category: "Bilan de mobilité",
  status: "active",
  position: 0,
  blocks: [],
  createdAt: now,
  updatedAt: now,
};

function session(id: string, date: string, extra: Partial<WorkoutSession>): WorkoutSession {
  const [imported] = buildImportedWorkouts();
  return { ...imported!, id, date, startedAt: `${date}T16:00:00.000Z`, completedAt: `${date}T16:30:00.000Z`, lastActionAt: `${date}T16:30:00.000Z`, ...extra };
}

describe("Historique — trois libellés (v1.5, § 3)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.sessionTemplates.add(bilanTemplate);
    await db.workouts.bulkAdd([
      /* Séance d'entraînement comptée (kind absent). */
      session("w-training", "2026-09-14", {}),
      /* Séance terminée sans réalisation. */
      session("w-empty", "2026-09-15", { blocks: [] }),
      /* Bilan depuis un modèle « Bilan de mobilité ». */
      session("w-bilan", "2026-09-16", { kind: "mobility_assessment", sessionTemplateId: "tpl-bilan" }),
      /* Bilan libre sans modèle, sans mesure. */
      session("w-bilan-libre", "2026-09-17", { kind: "mobility_assessment", blocks: [] }),
      /* Entraînement rattaché à un modèle « Bilan » : kind prime, pas la catégorie. */
      session("w-training-tpl-bilan", "2026-09-13", { kind: "training", sessionTemplateId: "tpl-bilan" }),
    ]);
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await db.delete();
  });

  it("distingue séance comptée, séance vide « hors statistiques » et « Bilan de mobilité », et fait primer kind sur la catégorie du modèle", async () => {
    render(
      <MemoryRouter>
        <HistoryScreen />
      </MemoryRouter>,
    );

    await screen.findByText(/5 séances/);
    const links = screen.getAllByRole("link");
    const byId = (id: string) => links.find((link) => link.getAttribute("href")?.includes(`/workouts/${id}?`))!;

    expect(byId("w-training").textContent).not.toMatch(/hors statistiques|Bilan de mobilité/);
    expect(byId("w-empty").textContent).toContain("Aucune réalisation · hors statistiques");

    const bilan = byId("w-bilan");
    expect(bilan.textContent).toContain("Bilan du mois");
    expect(bilan.textContent).toContain("Bilan de mobilité");
    expect(bilan.textContent).not.toContain("hors statistiques");
    expect(bilan.querySelector(".session-card__icon--bilan")).toBeTruthy();
    expect(bilan.closest("li")?.className).not.toContain("history__item--empty");

    const libre = byId("w-bilan-libre");
    expect(libre.textContent).toContain("Séance libre");
    expect(libre.textContent).toContain("Bilan de mobilité · aucune mesure");
    expect(libre.querySelector(".session-card__icon--bilan")).toBeTruthy();

    const trainingOnBilanTemplate = byId("w-training-tpl-bilan");
    expect(trainingOnBilanTemplate.textContent).not.toContain("Bilan de mobilité");
    expect(trainingOnBilanTemplate.querySelector(".session-card__icon--bilan")).toBeTruthy();
  });
});
