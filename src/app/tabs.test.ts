import { describe, expect, it } from "vitest";
import { activeTabFor, isTabBarHidden, TABS } from "./tabs";

describe("barre d'onglets (lot B)", () => {
  it("cinq onglets, dans l'ordre de la conception", () => {
    expect(TABS.map((tab) => [tab.label, tab.to])).toEqual([
      ["Accueil", "/"],
      ["Planning", "/planning"],
      ["Objectifs", "/objectifs"],
      ["Séances", "/seances"],
      ["Plus", "/plus"],
    ]);
  });

  it.each([
    ["/", "home"],
    ["/aujourdhui/apercu/p1", "home"],
    ["/planning", "planning"],
    ["/planning/programmation", "planning"],
    ["/objectifs", "goals"],
    ["/seances", "sessions"],
    ["/seances/abc/blocks/b1", "sessions"],
    ["/plus", "plus"],
    ["/exercises", "plus"],
    ["/exercises/tirage-vertical", "plus"],
    ["/workouts/w1", undefined],
    ["/workouts/w1/blocks/b1", undefined],
  ])("%s allume %s", (pathname, expected) => {
    expect(activeTabFor(pathname)).toBe(expected);
  });

  it("barre masquée en séance (plein écran) et en sélection, visible ailleurs", () => {
    expect(isTabBarHidden("/seance-en-cours", "")).toBe(true);
    expect(isTabBarHidden("/seance-en-cours", "?add=x")).toBe(true);
    expect(isTabBarHidden("/seance-en-cours/exercice-rapide", "")).toBe(true);
    expect(isTabBarHidden("/exercises", "?mode=select&returnTo=%2Fseance-en-cours")).toBe(true);
    expect(isTabBarHidden("/seances/abc", "?select=1")).toBe(true);

    expect(isTabBarHidden("/exercises", "")).toBe(false);
    expect(isTabBarHidden("/seances/abc", "")).toBe(false);
    expect(isTabBarHidden("/workouts/w1", "?returnTo=%2F")).toBe(false);
    expect(isTabBarHidden("/", "")).toBe(false);
  });
});
