// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { TestProtocolsScreen } from "../tests/TestProtocolsScreen";
import { testProtocolId } from "../tests/testProtocolsV1";
import { AboutScreen } from "./AboutScreen";
import { PlusScreen } from "./PlusScreen";
import { RoutinesScreen } from "./RoutinesScreen";

/**
 * Lot L.5 — Plus : entrées dans l'ordre de la maquette ; Routines du soir ;
 * À propos (version, date de build) ; Protocoles avec leur version et les
 * tests à replanifier.
 */

const T = "2026-09-25T08:00:00.000Z";

function inRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T10:00:00"));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

describe("Plus", () => {
  it("profil, exercices, routines, protocoles ; puis réglages, sauvegarde, à propos", () => {
    inRouter(<PlusScreen />);
    const titles = Array.from(document.querySelectorAll(".plus-list__title")).map((node) => node.textContent);
    expect(titles).toEqual(["Mon profil", "Exercices", "Routines du soir", "Protocoles de tests", "Réglages", "Sauvegarde", "À propos"]);
    expect(screen.queryByText(/Vibration/)).toBeNull();
  });

  it("Routines du soir : les trois routines, qui s'ouvrent dans Séances", async () => {
    inRouter(<RoutinesScreen />);
    const link = await screen.findByRole("link", { name: /Routine A — Avant du tronc et hanches/ });
    expect(link.getAttribute("href")).toBe("/seances/v1-routine-a");
    expect(within(link).getByText("5 exercices · ~12 min")).toBeDefined();
    expect(screen.getByRole("link", { name: /Routine C — Abdos et épaules/ })).toBeDefined();
  });

  it("À propos : version et date de build", () => {
    inRouter(<AboutScreen version="1.2.3" buildTime="2026-10-01T08:30:00.000Z" />);
    expect(screen.getByText("1.2.3")).toBeDefined();
    expect(screen.getByText(/^1er octobre 2026 à \d{2}:30$/)).toBeDefined();
  });

  it("Protocoles : version de chaque test ; un test manqué est à replanifier", async () => {
    const missed: PlannedSession = {
      id: "p", date: "2026-09-16", sessionTemplateId: "v1-cardio-a", status: "skipped", source: "weekly_program", createdAt: T, updatedAt: T,
      tests: [{ protocolId: testProtocolId("cardio"), placement: "replace_block" }],
    };
    await db.plannedSessions.put(missed);
    inRouter(<TestProtocolsScreen />);
    const reschedule = await screen.findByRole("region", { name: "Tests à replanifier" });
    expect(within(reschedule).getByText(/Cardio · prévu mer\. 16 sept\./)).toBeDefined();
    expect(within(reschedule).getByRole("link").getAttribute("href")).toBe("/planning?date=2026-09-16");
    expect(screen.getAllByText("Version 1").length).toBeGreaterThan(0);
  });
});
