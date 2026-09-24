// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PlusScreen } from "../features/plus/PlusScreen";
import { TodayScreen } from "../features/today/TodayScreen";
import { ProgramScreen } from "../features/program/ProgramScreen";

/**
 * Lot B.4 : noms d'écran (Accueil, Planning), écran Objectifs provisoire
 * sans aucune donnée, Plus sans « Séances » (devenu un onglet) et avec
 * « Statistiques » (ancien Progression, provisoire).
 */
function inRouter(node: React.ReactNode, entry = "/") {
  return render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("noms d'écran et écrans provisoires (lot B.4)", () => {
  it("l'écran d'accueil s'appelle Accueil", async () => {
    inRouter(<TodayScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: "Accueil" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "Aujourd'hui" })).toBeNull();
  });

  it("l'écran du programme s'appelle Planning", async () => {
    inRouter(<ProgramScreen />, "/planning");
    expect(await screen.findByRole("heading", { level: 1, name: "Planning" })).toBeTruthy();
  });

  it("Plus : Statistiques mène à l'ancien Progression, Séances n'y est plus", () => {
    inRouter(<PlusScreen />, "/plus");
    const stats = screen.getByText("Statistiques").closest("a");
    expect(stats?.getAttribute("href")).toBe("/progression");
    expect(screen.queryByText("Séances")).toBeNull();
    expect(screen.getByText("Exercices").closest("a")?.getAttribute("href")).toBe("/exercises");
  });
});
