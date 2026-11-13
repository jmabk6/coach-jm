// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_JAMBES_V2 } from "./testJambesV2";
import { TestTools } from "./TestTools";

/** Test jambes V2, lot 2 : commandes manuelles, une épreuve à la fois, jamais d'enchaînement automatique. */

const stage = (title: RegExp) => screen.getAllByRole("listitem").find((item) => title.test(item.textContent ?? ""))!;

describe("métronome et chronos de l'écran du test", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-24T09:30:00+01:00"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("cinq épreuves avec leur bouton ; récupération : démarrage manuel, 3:00 → 2:00, puis arrêt à 0:00 sans lancer l'épreuve suivante", () => {
    render(<TestTools settings={TEST_JAMBES_V2.settings} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(within(stage(/1\. Montées/)).getByRole("button").textContent).toContain("80/min et 2:00");

    const recup = stage(/Relève la FC/);
    fireEvent.click(within(recup).getByRole("button"));
    expect(within(stage(/Relève la FC/)).getByRole("button", { name: /Arrêter/ })).toBeTruthy();
    act(() => vi.advanceTimersByTime(60_000));
    expect(stage(/Relève la FC/).textContent).toContain("2:00");
    act(() => vi.advanceTimersByTime(121_000));
    expect(stage(/Relève la FC/).textContent).toContain("Arrêté à 0:00");
    /* Aucune épreuve ne tourne : pas d'enchaînement automatique. */
    expect(screen.queryByRole("button", { name: /Arrêter/ })).toBeNull();
  });

  it("une épreuve à la fois : démarrer les squats arrête les montées ; arrêt manuel garde le temps", () => {
    render(<TestTools settings={TEST_JAMBES_V2.settings} />);
    fireEvent.click(within(stage(/1\. Montées/)).getByRole("button"));
    act(() => vi.advanceTimersByTime(30_000));
    expect(stage(/1\. Montées/).textContent).toContain("1:30");
    fireEvent.click(within(stage(/2\. Squats/)).getByRole("button"));
    expect(screen.getAllByRole("button", { name: /Arrêter/ })).toHaveLength(1);
    act(() => vi.advanceTimersByTime(45_000));
    fireEvent.click(within(stage(/2\. Squats/)).getByRole("button", { name: /Arrêter/ }));
    expect(stage(/2\. Squats/).textContent).toContain("Arrêté à 0:45");
  });

  it("chaise : chrono qui monte, arrêt au plafond de 120 s", () => {
    render(<TestTools settings={TEST_JAMBES_V2.settings} />);
    fireEvent.click(within(stage(/3\. Chaise/)).getByRole("button"));
    act(() => vi.advanceTimersByTime(75_000));
    expect(stage(/3\. Chaise/).textContent).toContain("1:15");
    act(() => vi.advanceTimersByTime(60_000));
    expect(stage(/3\. Chaise/).textContent).toContain("Arrêté à 2:00");
  });

  it("protocole sans métronome : rien n'est affiché", () => {
    const { container } = render(<TestTools settings={{ sprintCount: 6 }} />);
    expect(container.textContent).toBe("");
  });
});
