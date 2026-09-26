// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { Goal, WeightEntry } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { GoalDetailScreen } from "./GoalDetailScreen";
import { goalProgressFrom } from "./goalProgress";

/**
 * Objectif Poids — composition corporelle (26/09/2026) : deux indicateurs
 * secondaires, moyenne du mois dès 4 relevés, courbe mois par mois,
 * tendance, « estimation de la balance » ; hors de tout statut.
 */

const T = "2026-09-26T08:00:00.000Z";

function entry(date: string, kg: number, fatPct?: number, muscleKg?: number): WeightEntry {
  return { id: `w-${date}`, date, kg, ...(fatPct !== undefined ? { fatPct } : {}), ...(muscleKg !== undefined ? { muscleKg } : {}), createdAt: T, updatedAt: T };
}

const ENTRIES = [
  entry("2026-08-03", 83, 20, 61),
  entry("2026-08-10", 82.8, 20.4, 61),
  entry("2026-08-17", 82.5, 19.8, 61.2),
  entry("2026-08-24", 82.3, 20.2, 61.4),
  entry("2026-09-20", 81.9, 19.6, 61.6),
  entry("2026-09-21", 81.6, 19.4, 61.8),
  entry("2026-09-22", 81.5, 19.5),
  entry("2026-09-23", 81.4, 19.1),
  entry("2026-09-24", 81.2),
];

function renderGoal(key: string) {
  render(
    <MemoryRouter initialEntries={[`/objectifs/${key}`]}>
      <Routes>
        <Route path="/objectifs/:key" element={<GoalDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00"));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("objectif Poids — composition corporelle", () => {
  it("masse grasse : moyenne de septembre (4 relevés), tendance, courbe ; masse musculaire : pas assez de relevés, août rappelé", async () => {
    await db.weightEntries.bulkAdd(ENTRIES);
    renderGoal("weight");

    const section = (await screen.findByRole("heading", { name: "Composition corporelle" })).closest("section") as HTMLElement;
    const fat = section.querySelector('[data-composition="fatPct"]') as HTMLElement;
    const muscle = section.querySelector('[data-composition="muscleKg"]') as HTMLElement;

    expect(within(fat).getByText("19,4 %")).toBeDefined(); // (19,6 + 19,4 + 19,5 + 19,1) / 4
    expect(within(fat).getByText("Moyenne de septembre 2026 · 4 relevés")).toBeDefined();
    expect(within(fat).getByText(/en baisse par rapport à août/)).toBeDefined();
    expect(within(fat).getByRole("img").getAttribute("aria-label")).toBe("Masse grasse, moyennes mensuelles : août 20,1 %, sept. 19,4 %");
    expect(within(fat).getByText("Estimation de la balance")).toBeDefined();

    expect(within(muscle).getByText("Pas assez de relevés")).toBeDefined();
    expect(within(muscle).getByText("septembre 2026 : 2 sur 4 minimum")).toBeDefined();
    expect(within(muscle).getByText("Août 2026 : 61,2 kg")).toBeDefined();
    expect(within(muscle).queryByText(/par rapport à/)).toBeNull();
    expect(within(muscle).getByText("Estimation de la balance")).toBeDefined();
  });

  it("aucun relevé : les deux cartes « pas assez de relevés », sans courbe ; les autres objectifs n'ont pas la section", async () => {
    await db.weightEntries.add(entry("2026-09-24", 81.2));
    renderGoal("weight");
    await screen.findByRole("heading", { name: "Composition corporelle" });
    expect(screen.getAllByText("Pas assez de relevés")).toHaveLength(2);
    expect(screen.getAllByText("septembre 2026 : 0 sur 4 minimum")).toHaveLength(2);
    expect(document.querySelectorAll(".composition-card__curve")).toHaveLength(0);
    cleanup();

    renderGoal("traction");
    await screen.findByText("Évolution", { exact: false });
    expect(screen.queryByRole("heading", { name: "Composition corporelle" })).toBeNull();
  });

  it("le statut de l'objectif Poids ne dépend pas de la composition", async () => {
    const goal = (await db.goals.where("key").equals("weight").first()) as Goal;
    const bare = ENTRIES.map((item) => entry(item.date, item.kg));
    const withComposition = goalProgressFrom(goal, [], ENTRIES, "2026-09-26");
    const without = goalProgressFrom(goal, [], bare, "2026-09-26");
    expect(JSON.stringify(withComposition)).toBe(JSON.stringify(without));

    await db.weightEntries.bulkAdd(ENTRIES);
    renderGoal("weight");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Composition corporelle" })).toBeDefined());
    const status = screen.getByText("Statut").closest(".goal-card") as HTMLElement;
    const withText = status.textContent;
    cleanup();

    await db.weightEntries.clear();
    await db.weightEntries.bulkAdd(bare);
    renderGoal("weight");
    await screen.findByRole("heading", { name: "Composition corporelle" });
    expect((screen.getByText("Statut").closest(".goal-card") as HTMLElement).textContent).toBe(withText);
  });
});
