// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ProgramScreen } from "./ProgramScreen";

/**
 * Lot B.5 : la grille Mois commence le dimanche. En-tête et dates viennent
 * de la même source (`weekdays`) ; septembre 2026 s'ouvre sur le dimanche
 * 30 août.
 */
afterEach(cleanup);

describe("grille Mois du Planning (dimanche → samedi)", () => {
  it("première colonne Dim, première case le dimanche 30 août pour septembre 2026", async () => {
    render(
      <MemoryRouter initialEntries={["/planning?view=mois&month=2026-09-01&date=2026-09-15"]}>
        <ProgramScreen />
      </MemoryRouter>,
    );

    const grid = await screen.findByRole("grid", { name: /septembre 2026/i });
    const headers = Array.from(grid.querySelectorAll("[role='columnheader']")).map((cell) => cell.textContent);
    expect(headers).toEqual(["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]);

    const days = Array.from(grid.querySelectorAll(".program-month__day"));
    expect(days[0]?.getAttribute("aria-label")).toMatch(/^dimanche 30 août 2026/i);
    expect(days.length % 7).toBe(0);
    expect(days.at(-1)?.getAttribute("aria-label")).toMatch(/^samedi 3 octobre 2026/i);
  });
});
