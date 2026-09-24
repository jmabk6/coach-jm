// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession, TestResult } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { testProtocolId, testProtocolVersionId } from "../tests/testProtocolsV1";
import { GoalsScreen } from "./GoalsScreen";

/**
 * Lot H.3 — M4 : les 7 objectifs, leurs états (Jambes sans mesure, Tronc
 * sans résultat, Traction à 0 kg « Palier atteint »), leurs badges.
 */

const T = "2026-09-23T08:00:00.000Z";

function result(key: string, date: string, measures: TestResult["measures"]): TestResult {
  return {
    id: `r-${key}-${date}`, protocolId: testProtocolId(key), versionId: testProtocolVersionId(key, 1), date, origin: "manual",
    status: "complete", measures, createdAt: T, updatedAt: T,
  };
}

function renderScreen() {
  render(
    <MemoryRouter>
      <GoalsScreen />
    </MemoryRouter>,
  );
}

const row = (key: string) => document.querySelector(`[data-goal="${key}"]`) as HTMLElement;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T10:00:00"));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await db.delete();
});

describe("M4 — liste des objectifs", () => {
  it("les 7 objectifs dans l'ordre, bandeau de la semaine de tests, aucun résultat : « À mesurer »", async () => {
    renderScreen();
    expect(await screen.findByText("Traction")).toBeDefined();
    const titles = Array.from(document.querySelectorAll(".goal-row__title")).map((node) => node.textContent);
    expect(titles).toEqual(["Traction", "Haut du corps", "Jambes", "Cardio", "Tronc", "Souplesse", "Poids"]);
    expect(Array.from(document.querySelectorAll(".goal-row__number")).map((node) => node.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);

    expect(screen.getByText("Semaine de tests dans 4 jours")).toBeDefined();
    expect(screen.getByText(/Du 27 septembre au 3 octobre 2026/)).toBeDefined();

    /* Tronc sans résultat. */
    expect(within(row("core")).getByText("À mesurer")).toBeDefined();
    expect(within(row("core")).getByText("Objectif : à définir")).toBeDefined();
    /* Jambes sans mesure (avant 2 tests). */
    expect(within(row("legs")).getByText("Indicateur à choisir après 2 tests")).toBeDefined();
    /* Traction : le segment courant et sa cible, jamais inventée. */
    expect(within(row("traction")).getByText("Assistance minimale → 0 kg")).toBeDefined();
    expect(within(row("traction")).getByText("Objectif : 0 kg")).toBeDefined();
    expect(within(row("weight")).getByText("Objectif : 75 kg")).toBeDefined();
  });

  it("badges : date du prochain test par la place des tests, pesée du jour", async () => {
    renderScreen();
    await screen.findByText("Traction");
    expect(within(row("traction")).getByText("Test le 27 sept.")).toBeDefined();
    expect(within(row("upper_body")).getByText("Test le 28 sept.")).toBeDefined();
    expect(within(row("core")).getByText("Test le 28 sept.")).toBeDefined();
    expect(within(row("cardio")).getByText("Test le 30 sept.")).toBeDefined();
    expect(within(row("legs")).getByText("Test le 1er oct.")).toBeDefined();
    expect(within(row("weight")).getByText("Pesée du jour")).toBeDefined();
  });

  it("pesée faite : « Pesée demain » ; test manqué : « À replanifier »", async () => {
    await db.weightEntries.add({ id: "w1", date: "2026-09-23", kg: 80, createdAt: T, updatedAt: T } as never);
    const missed: PlannedSession = {
      id: "p-cardio", date: "2026-09-16", sessionTemplateId: "v1-cardio-a", status: "skipped", source: "weekly_program", createdAt: T, updatedAt: T,
      tests: [{ protocolId: testProtocolId("cardio"), placement: "replace_block" }],
    };
    await db.plannedSessions.put(missed);
    renderScreen();
    await screen.findByText("Traction");
    expect(within(row("weight")).getByText("Pesée demain")).toBeDefined();
    expect(within(row("cardio")).getByText("À replanifier")).toBeDefined();
  });

  it("Traction à 0 kg : « Palier atteint », jamais « objectif atteint » ; barre pleine", async () => {
    await db.testResults.put(result("traction", "2026-09-20", [{ key: "assistance_min_kg", value: 0, unit: "kg" }]));
    renderScreen();
    await screen.findByText("Traction");
    const traction = row("traction");
    expect(within(traction).getByText("· Palier atteint", { exact: false })).toBeDefined();
    expect(traction.textContent).not.toMatch(/objectif atteint/i);
    expect(within(traction).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("Tronc avec un résultat sans cible : la valeur avec son unité, statut sans pourcentage", async () => {
    await db.testResults.put(result("tronc", "2026-09-20", [{ key: "planche_duree_s", value: 75, unit: "s" }]));
    renderScreen();
    await screen.findByText("Traction");
    expect(within(row("core")).getByText("75 s")).toBeDefined();
    expect(row("core").textContent).not.toMatch(/%/);
  });
});
