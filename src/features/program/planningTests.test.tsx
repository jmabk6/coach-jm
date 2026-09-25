// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { generateProgramWeek } from "./generateProgramWeek";
import { ProgramScreen } from "./ProgramScreen";

/**
 * Lot G.7 — Planning Semaine (M2) : bandeau « Semaine de tests », tests
 * indiqués sous leur séance, badge « À replanifier » (D26) et action
 * Replanifier.
 */

async function setup(today: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(today);
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await generateProgramWeek("2026-10-25", "2026-09-24T10:00:00.000Z");
}

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await db.delete();
});

function renderWeek(date: string) {
  return render(
    <MemoryRouter initialEntries={[`/planning?date=${date}`]}>
      <ProgramScreen />
    </MemoryRouter>,
  );
}

const row = (name: string) => screen.getByRole("button", { name: `Actions pour ${name}` }).closest(".program-row") as HTMLElement;

describe("semaine de tests du 25/10", () => {
  beforeEach(async () => {
    await setup(new Date(2026, 9, 30, 10, 0, 0));
    await db.plannedSessions.update("weekly-2026-10-29", { status: "skipped" });
  });

  it("bandeau, tests sous leur séance ; séance sautée : son test est à replanifier", async () => {
    renderWeek("2026-10-30");
    expect(await screen.findByText("Semaine de tests")).toBeTruthy();

    const muscuC = row("Muscu C — Jambes padel");
    expect(within(muscuC).getByText(/Test jambes/)).toBeTruthy();
    expect(within(muscuC).getByText("À replanifier")).toBeTruthy();
    /* Muscu A du 25/10, passée sans être faite : son test traction aussi. */
    expect(within(row("Muscu A — Traction force / dos")).getByText("À replanifier")).toBeTruthy();
    /* Samedi 31/10, à venir : pas de test. */
    expect(within(row("Cardio C — Endurance longue")).queryByText(/Test /)).toBeNull();
  });

  it("Replanifier : le test part sur une séance à venir, le badge disparaît", async () => {
    renderWeek("2026-10-30");
    fireEvent.click(await screen.findByRole("button", { name: "Actions pour Muscu C — Jambes padel" }));
    fireEvent.click(screen.getByRole("button", { name: /Replanifier le test jambes/ }));

    const sheet = await screen.findByRole("dialog");
    /* Lot K.2 : le samedi a aussi sa routine du soir ; le test va sur le Cardio C. */
    const target = await within(sheet).findByRole("radio", { name: /^sam\. 31 oct\..*Cardio C/ });
    fireEvent.click(target);
    fireEvent.click(within(sheet).getByRole("button", { name: /Replanifier sur sam\. 31 oct\. — Cardio C/ }));

    await waitFor(async () =>
      expect((await db.plannedSessions.get("weekly-2026-10-31"))?.tests).toEqual([{ protocolId: "protocol-jambes", placement: "after_warmup" }]),
    );
    expect((await db.plannedSessions.get("weekly-2026-10-29"))?.tests?.[0]?.rescheduledToPlannedSessionId).toBe("weekly-2026-10-31");
    await waitFor(() => expect(within(row("Muscu C — Jambes padel")).queryByText("À replanifier")).toBeNull());
    expect(within(row("Cardio C — Endurance longue")).getByText(/Test jambes/)).toBeTruthy();
  });
});

describe("semaine ordinaire", () => {
  it("« Semaine de tests dans N jours », qui ouvre cette semaine", async () => {
    await setup(new Date(2026, 9, 5, 10, 0, 0));
    renderWeek("2026-10-05");

    const banner = await screen.findByRole("button", { name: /Semaine de tests dans 20 jours/ });
    expect(banner.textContent).toContain("Du 25 au 31 octobre 2026");
    fireEvent.click(banner);
    expect(await screen.findByText("Semaine de tests")).toBeTruthy();
  });
});
