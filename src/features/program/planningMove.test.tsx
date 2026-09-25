// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { ProgramScreen } from "./ProgramScreen";

/**
 * Lot F.2 — feuille « Déplacer la séance » (M2) : les jours qui viennent
 * avec leur contenu ; en conflit, Échanger / Faire les deux / Remplacer ;
 * le bouton du bas reprend le choix fait.
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

async function openMove() {
  render(
    <MemoryRouter initialEntries={["/planning?date=2026-09-24"]}>
      <ProgramScreen />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Actions pour Muscu B — Pecs / épaules" }));
  fireEvent.click(screen.getByRole("button", { name: /Déplacer à un autre jour/ }));
  const sheet = await screen.findByRole("dialog");
  await waitFor(() => expect(day(sheet, "sam. 26 sept.").textContent).toContain("Cardio C"));
  return sheet;
}

function day(sheet: HTMLElement, label: string): HTMLElement {
  return within(sheet).getByRole("radio", { name: new RegExp(`^${label}`) });
}

describe("Déplacer la séance", () => {
  it("vers un jour occupé : trois choix ; Échanger échange les deux dates", async () => {
    const sheet = await openMove();

    expect(day(sheet, "ven. 25 sept.").textContent).toContain("Routine A — Avant du tronc et hanches (soir)");
    fireEvent.click(day(sheet, "sam. 26 sept."));

    expect(within(sheet).getByText(/Ce jour a déjà une séance : Cardio C/)).toBeTruthy();
    const confirm = within(sheet).getByRole("button", { name: /Choisissez que faire/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(within(sheet).getByRole("button", { name: "Échanger" }));
    fireEvent.click(within(sheet).getByRole("button", { name: /Échanger avec Cardio C — Endurance longue/ }));

    await waitFor(async () => expect((await db.plannedSessions.get("p-tue"))?.date).toBe("2026-09-26"));
    expect((await db.plannedSessions.get("p-sat"))?.date).toBe("2026-09-22");
  });

  it("vers un jour dont seule la routine du soir est prise : pas de conflit", async () => {
    const sheet = await openMove();
    fireEvent.click(day(sheet, "ven. 25 sept."));

    expect(within(sheet).queryByText(/Ce jour a déjà une séance/)).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: /Déplacer sur ven. 25 sept./ }));
    await waitFor(async () => expect((await db.plannedSessions.get("p-tue"))?.date).toBe("2026-09-25"));
  });

  it("cible en cours : seul « Faire les deux » est proposé", async () => {
    await db.plannedSessions.update("p-thu", { status: "in_progress" });
    const sheet = await openMove();
    fireEvent.click(day(sheet, "jeu. 24 sept."));

    expect((within(sheet).getByRole("button", { name: "Échanger" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(sheet).getByRole("button", { name: "Remplacer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Faire les deux" }));
    fireEvent.click(within(sheet).getByRole("button", { name: /Faire les deux le jeu. 24 sept./ }));

    await waitFor(async () => expect((await db.plannedSessions.get("p-tue"))?.date).toBe("2026-09-24"));
    expect((await db.plannedSessions.get("p-thu"))?.status).toBe("in_progress");
  });

  it("Sauter cette séance, depuis la feuille", async () => {
    const sheet = await openMove();
    fireEvent.click(within(sheet).getByRole("button", { name: /Sauter cette séance/ }));
    await waitFor(async () => expect((await db.plannedSessions.get("p-tue"))?.status).toBe("skipped"));
  });
});
