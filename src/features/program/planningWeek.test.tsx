// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { ProgramScreen } from "./ProgramScreen";

/**
 * Lot F.1 — Planning Semaine (M2, D23) : statuts Faite, Sautée, Non
 * réalisée, Aujourd'hui, À venir ; un jour sans séance affiche « Repos » ;
 * la routine du soir apparaît sous le créneau Soir.
 */

const T = "2026-09-01T08:00:00.000Z";

const planned = (id: string, date: string, sessionTemplateId: string, extra: Partial<PlannedSession> = {}): PlannedSession => ({
  id, date, sessionTemplateId, status: "upcoming", source: "weekly_program", createdAt: T, updatedAt: T, ...extra,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 24, 10, 0, 0));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await db.plannedSessions.clear();
  await db.plannedSessions.bulkPut([
    planned("p-sun", "2026-09-20", "v1-muscu-a", { status: "done" }),
    planned("p-mon", "2026-09-21", "v1-cardio-b", { status: "skipped" }),
    planned("p-tue", "2026-09-22", "v1-muscu-b"),
    planned("p-thu", "2026-09-24", "v1-muscu-c"),
    planned("p-fri-evening", "2026-09-25", "v1-routine-a", { slot: "evening" }),
    planned("p-sat", "2026-09-26", "v1-cardio-c"),
  ]);
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await db.delete();
});

const ORDER = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** Les 7 lignes du dimanche au samedi (lot B.5). */
function day(weekday: string): HTMLElement {
  return Array.from(document.querySelectorAll<HTMLElement>("li.program-day"))[ORDER.indexOf(weekday)]!;
}

describe("Planning Semaine", () => {
  it("un statut par jour, Repos les jours vides, la routine sous le créneau Soir", async () => {
    render(
      <MemoryRouter initialEntries={["/planning?date=2026-09-24"]}>
        <ProgramScreen />
      </MemoryRouter>,
    );
    await screen.findByText("Muscu C — Jambes padel");

    const badge = (weekday: string) => day(weekday).querySelector(".program-badge")?.textContent;
    expect(badge("Dim")).toBe("Faite");
    expect(badge("Lun")).toBe("Sautée");
    expect(badge("Mar")).toBe("Non réalisée");
    expect(badge("Jeu")).toBe("Aujourd'hui");
    expect(badge("Sam")).toBe("À venir");

    expect(within(day("Mer")).getByText("Repos")).toBeTruthy();

    const friday = day("Ven");
    expect(within(friday).getByText("Repos")).toBeTruthy();
    expect(within(friday).getByText("Soir")).toBeTruthy();
    expect(within(friday).getByText("Routine A — à définir")).toBeTruthy();
    expect(within(day("Sam")).queryByText("Soir")).toBeNull();
  });
});
