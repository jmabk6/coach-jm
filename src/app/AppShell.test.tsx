// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

/* La reprise de séance lit la base : sans objet ici. */
vi.mock("../features/workout/ResumeWatcher", () => ({ ResumeWatcher: () => null }));

const { AppShell } = await import("./AppShell");

function open(entry: string) {
  const router = createMemoryRouter([{ path: "*", element: <AppShell /> }], { initialEntries: [entry] });
  render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("AppShell (lot B)", () => {
  it("affiche les cinq onglets dans l'ordre et allume le bon", () => {
    open("/seances/abc");

    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((link) => link.textContent)).toEqual(["Accueil", "Planning", "Objectifs", "Séances", "Plus"]);
    expect(links.find((link) => link.getAttribute("aria-current") === "page")?.textContent).toBe("Séances");
  });

  it.each(["/seance-en-cours", "/seance-en-cours?add=x", "/seance-en-cours/exercice-rapide"])(
    "pas de barre en séance, plein écran : %s",
    (entry) => {
      open(entry);
      expect(screen.queryByRole("navigation", { name: "Navigation principale" })).toBeNull();
      expect(document.querySelector(".app-shell--no-tabbar")).not.toBeNull();
    },
  );

  it("pas de barre en mode sélection (non-régression)", () => {
    open("/exercises?mode=select");
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).toBeNull();
  });

  it("barre présente sur un récapitulatif, sans onglet allumé", () => {
    open("/workouts/w1?returnTo=%2F");
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(nav.querySelector("[aria-current='page']")).toBeNull();
  });
});
