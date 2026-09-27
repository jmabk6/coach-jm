// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { MoveSheet } from "./MoveSheet";
import { moveWithChoice } from "./plannedSessionActions";
import { planDrop } from "./planningDrop";
import { ProgramScreen } from "./ProgramScreen";

/**
 * Glisser-déposer du Planning Semaine (27/09/2026) : jour libre →
 * déplacement direct ; jour occupé au même créneau → feuille Déplacer,
 * jour choisi, Échanger / Faire les deux / Remplacer ; séance faite ou en
 * cours : pas de poignée ; une routine reste le soir.
 */

const T = "2026-09-01T08:00:00.000Z";

const planned = (id: string, date: string, sessionTemplateId: string, extra: Partial<PlannedSession> = {}): PlannedSession => ({
  id, date, sessionTemplateId, status: "upcoming", source: "weekly_program", createdAt: T, updatedAt: T, ...extra,
});

const SESSIONS = [
  planned("p-sun", "2026-09-20", "v1-muscu-a", { status: "done" }),
  planned("p-tue", "2026-09-22", "v1-muscu-b"),
  planned("p-wed-live", "2026-09-23", "v1-cardio-a", { status: "in_progress" }),
  planned("p-thu", "2026-09-24", "v1-muscu-c"),
  planned("p-thu-evening", "2026-09-24", "v1-routine-b", { slot: "evening" }),
  planned("p-fri-evening", "2026-09-25", "v1-routine-a", { slot: "evening" }),
];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 22, 10, 0, 0));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await db.plannedSessions.clear();
  await db.plannedSessions.bulkPut(SESSIONS);
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await db.delete();
});

const byId = (id: string) => SESSIONS.find((session) => session.id === id)!;
const on = (date: string) => SESSIONS.filter((session) => session.date === date);

describe("planDrop", () => {
  it("jour libre : déplacement direct ; seule la routine du soir prise : pas de conflit pour une séance du jour", () => {
    expect(planDrop(byId("p-tue"), "2026-09-26", on("2026-09-26"))).toEqual({ kind: "move" });
    expect(planDrop(byId("p-tue"), "2026-09-25", on("2026-09-25"))).toEqual({ kind: "move" });
  });

  it("jour occupé au même créneau : conflit avec la séance du jour, ou avec la routine du soir", () => {
    expect(planDrop(byId("p-tue"), "2026-09-24", on("2026-09-24"))).toEqual({ kind: "conflict", target: byId("p-thu") });
    expect(planDrop(byId("p-fri-evening"), "2026-09-24", on("2026-09-24"))).toEqual({ kind: "conflict", target: byId("p-thu-evening") });
    expect(planDrop(byId("p-fri-evening"), "2026-09-22", on("2026-09-22"))).toEqual({ kind: "move" });
  });

  it("même jour, séance faite ou en cours : rien", () => {
    expect(planDrop(byId("p-tue"), "2026-09-22", on("2026-09-22"))).toEqual({ kind: "none" });
    expect(planDrop(byId("p-sun"), "2026-09-26", [])).toEqual({ kind: "none" });
    expect(planDrop(byId("p-wed-live"), "2026-09-26", [])).toEqual({ kind: "none" });
  });

  it("une routine glissée sur un jour libre reste le soir", async () => {
    expect(planDrop(byId("p-fri-evening"), "2026-09-26", [])).toEqual({ kind: "move" });
    await moveWithChoice("p-fri-evening", "2026-09-26");
    expect(await db.plannedSessions.get("p-fri-evening")).toMatchObject({ date: "2026-09-26", slot: "evening" });
  });
});

describe("Planning Semaine — poignées", () => {
  it("une poignée ⋮⋮ par séance à venir et par routine ; aucune sur une séance faite ou en cours", async () => {
    render(
      <MemoryRouter initialEntries={["/planning?date=2026-09-22"]}>
        <ProgramScreen />
      </MemoryRouter>,
    );
    await screen.findByText("Jambes padel");

    const handles = screen.getAllByRole("button", { name: /^Déplacer / }).map((button) => button.getAttribute("aria-label"));
    expect(handles).toEqual([
      "Déplacer Muscu B — Pecs / épaules",
      "Déplacer Muscu C — Jambes padel",
      "Déplacer Routine B — Côtés et dos",
      "Déplacer Routine A — Avant du tronc et hanches",
    ]);
    expect(screen.queryByRole("button", { name: /^Déplacer Muscu A/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Déplacer Cardio A/ })).toBeNull();
  });
});

describe("feuille Déplacer ouverte par un dépôt sur un jour occupé", () => {
  it("le jour est déjà choisi ; Échanger, Faire les deux, Remplacer ; Échanger échange les deux dates", async () => {
    const templateById = new Map((await db.sessionTemplates.toArray()).map((template) => [template.id, template]));
    const onConfirm = vi.fn();
    render(<MoveSheet session={byId("p-tue")} templateById={templateById} today="2026-09-22" initialDate="2026-09-24" onConfirm={onConfirm} onDismiss={() => undefined} />);

    const conflict = await screen.findByRole("group", { name: "Ce jour a déjà une séance" });
    expect(within(conflict).getByText(/Muscu C — Jambes padel/)).toBeDefined();
    for (const label of ["Échanger", "Faire les deux", "Remplacer"]) {
      expect((within(conflict).getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(false);
    }
    fireEvent.click(within(conflict).getByRole("button", { name: "Échanger" }));
    fireEvent.click(screen.getByRole("button", { name: /^Échanger avec Muscu C/ }));
    expect(onConfirm).toHaveBeenCalledWith("2026-09-24", "swap");

    await moveWithChoice("p-tue", "2026-09-24", "swap");
    await waitFor(async () => {
      expect((await db.plannedSessions.get("p-tue"))?.date).toBe("2026-09-24");
      expect((await db.plannedSessions.get("p-thu"))?.date).toBe("2026-09-22");
    });
  });
});
