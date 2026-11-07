// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { BackDayEntry } from "../../domain";
import { backWeekSummary, formatBackWeek, upsertBackDay } from "../../domain/rules/backLogRules";
import { BackDayCard } from "./BackDayCard";

/** « Dos du jour » (programme V5, 07/11/2026). */

const NOW = "2026-11-08T07:00:00.000Z";
const stored = async () => ((await db.settings.get("backLog"))?.value as BackDayEntry[] | undefined) ?? [];

describe("règles du relevé « Dos du jour »", () => {
  it("un relevé par jour : créé, complété, un champ effacé", () => {
    let entries = upsertBackDay([], "2026-11-08", { morningPain: 5 }, NOW);
    entries = upsertBackDay(entries, "2026-11-08", { walk: "2to5" }, NOW);
    expect(entries).toEqual([{ date: "2026-11-08", morningPain: 5, walk: "2to5", updatedAt: NOW }]);
    entries = upsertBackDay(entries, "2026-11-08", { morningPain: undefined }, NOW);
    expect(entries).toEqual([{ date: "2026-11-08", walk: "2to5", updatedAt: NOW }]);
  });

  it("résumé de la semaine (dimanche → samedi) : moyenne au réveil, décharges, jours notés", () => {
    const entries: BackDayEntry[] = [
      { date: "2026-11-07", morningPain: 9, updatedAt: NOW },
      { date: "2026-11-08", morningPain: 5, discharge: true, updatedAt: NOW },
      { date: "2026-11-09", morningPain: 4, discharge: false, sitting: "painful", updatedAt: NOW },
      { date: "2026-11-10", updatedAt: NOW },
    ];
    const summary = backWeekSummary(entries, "2026-11-08");
    expect(summary).toEqual({ weekStart: "2026-11-08", days: 2, morningPainAvg: 4.5, discharges: 1, painfulSitting: 1 });
    expect(formatBackWeek(summary)).toBe("réveil 4,5/10 en moyenne · 1 décharge · 2 jours notés");
    expect(formatBackWeek(backWeekSummary([], "2026-11-08"))).toBeUndefined();
  });
});

describe("carte « Dos du jour » sur l'Accueil", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await db.delete();
  });

  it("remplie en quatre appuis, enregistrée à chaque appui, puis résumée ; « Modifier » rouvre", async () => {
    render(<BackDayCard today="2026-11-08" />);
    const card = await screen.findByRole("region", { name: "Dos du jour" });

    fireEvent.click(within(card).getByRole("button", { name: "4" }));
    await waitFor(async () => expect((await stored())[0]?.morningPain).toBe(4));
    fireEvent.click(within(card).getByRole("button", { name: "2 à 5 min" }));
    fireEvent.click(within(card).getByRole("button", { name: "Non" }));
    fireEvent.click(within(card).getByRole("button", { name: "Douloureuse" }));

    expect(await within(card).findByText("Réveil 4/10 · marche normale 2 à 5 min · pas de décharge · assis douloureux")).toBeTruthy();
    expect(within(card).getByText(/Cette semaine : réveil 4\/10 en moyenne · 0 décharge · 1 jour noté/)).toBeTruthy();
    await waitFor(async () => expect(await stored()).toMatchObject([{ date: "2026-11-08", morningPain: 4, walk: "2to5", discharge: false, sitting: "painful" }]));

    fireEvent.click(within(card).getByRole("button", { name: "Modifier" }));
    expect(within(card).getByRole("button", { name: "4" }).getAttribute("aria-pressed")).toBe("true");
    /* Second appui sur le choix actif : effacé. */
    fireEvent.click(within(card).getByRole("button", { name: "4" }));
    await waitFor(async () => expect((await stored())[0]?.morningPain).toBeUndefined());
  });

  it("le relevé d'un autre jour ne préremplit pas celui d'aujourd'hui", async () => {
    await db.settings.put({ key: "backLog", value: [{ date: "2026-11-07", morningPain: 7, walk: "gt5", discharge: true, sitting: "ok", updatedAt: NOW }] });
    render(<BackDayCard today="2026-11-08" />);
    const card = await screen.findByRole("region", { name: "Dos du jour" });
    expect(within(card).getByRole("button", { name: "7" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(card).getByText(/semaine d'avant : réveil 7\/10 en moyenne · 1 décharge · 1 jour noté/)).toBeTruthy();
  });
});
