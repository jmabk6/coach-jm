// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession, TestResult, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { testProtocolId, testProtocolVersionId } from "../tests/testProtocolsV1";
import { GoalCards } from "./GoalCards";

/**
 * Lot J.2 — « Mes 7 objectifs » sur l'Accueil : valeur de test ou moyenne
 * de pesées, « À mesurer » et la date du test, « Test à replanifier ».
 * Invariant : une séance d'entraînement n'est jamais un résultat de test.
 */

const T = "2026-09-23T08:00:00.000Z";
const TODAY = "2026-09-23";

function tractionWorkout(id: string, date: string): WorkoutSession {
  return {
    id, source: "free", kind: "training", status: "completed", date, startedAt: `${date}T08:00:00.000Z`, completedAt: `${date}T09:00:00.000Z`,
    lastActionAt: `${date}T09:00:00.000Z`, activeDurationSec: 3600, createdAt: T, updatedAt: T,
    blocks: [{
      id: `${id}-b`, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "traction-assistee", status: "performed",
      snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 },
      series: [0, 1, 2].map((index) => ({ id: `${id}-s${index}`, position: index, status: "completed" as const, load: { kind: "total" as const, kg: 49 }, reps: 8, completedAt: T })),
    }],
  };
}

function renderCards() {
  render(
    <MemoryRouter>
      <GoalCards today={TODAY} />
    </MemoryRouter>,
  );
}

const card = (key: string) => document.querySelector(`[data-goal="${key}"]`) as HTMLElement;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
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

describe("Accueil — Mes 7 objectifs", () => {
  it("7 cartes, « À mesurer » et la date du prochain test, lien vers l'objectif", async () => {
    renderCards();
    expect(await screen.findByText("Mes 7 objectifs")).toBeDefined();
    expect(document.querySelectorAll(".goal-card-home")).toHaveLength(7);
    expect(within(card("traction")).getByText("À mesurer")).toBeDefined();
    expect(within(card("traction")).getByText("Test dim. 27 sept.")).toBeDefined();
    expect(within(card("cardio")).getByText("Test mer. 30 sept.")).toBeDefined();
    expect(within(card("legs")).getByText("Indicateur à choisir après 2 tests")).toBeDefined();
    expect(within(card("weight")).getByText("Pesée du jour")).toBeDefined();
    expect(card("traction").getAttribute("href")).toBe("/objectifs/traction");
  });

  it("invariant : des séances de traction assistée sans résultat de test laissent « À mesurer »", async () => {
    await db.workouts.bulkPut([tractionWorkout("w1", "2026-09-15"), tractionWorkout("w2", "2026-09-20")]);
    renderCards();
    await screen.findByText("Mes 7 objectifs");
    expect(within(card("traction")).getByText("À mesurer")).toBeDefined();
    expect(card("traction").textContent).not.toMatch(/49/);
  });

  it("résultat de test : sa valeur ; 0 kg : « Palier atteint »", async () => {
    const result: TestResult = {
      id: "r", protocolId: testProtocolId("traction"), versionId: testProtocolVersionId("traction", 1), date: "2026-09-20", origin: "manual",
      status: "complete", measures: [{ key: "assistance_min_kg", value: 0, unit: "kg" }], createdAt: T, updatedAt: T,
    };
    await db.testResults.put(result);
    renderCards();
    await screen.findByText("Mes 7 objectifs");
    expect(within(card("traction")).getByText("Palier atteint")).toBeDefined();
  });

  it("test manqué : « Test à replanifier » ; pesées de la semaine : moyenne provisoire", async () => {
    const missed: PlannedSession = {
      id: "p", date: "2026-09-16", sessionTemplateId: "v1-cardio-a", status: "skipped", source: "weekly_program", createdAt: T, updatedAt: T,
      tests: [{ protocolId: testProtocolId("cardio"), placement: "replace_block" }],
    };
    await db.plannedSessions.put(missed);
    await db.weightEntries.bulkPut([
      { id: "w1", date: "2026-09-21", kg: 80, createdAt: T, updatedAt: T },
      { id: "w2", date: "2026-09-22", kg: 79, createdAt: T, updatedAt: T },
    ] as never);
    renderCards();
    await screen.findByText("Mes 7 objectifs");
    expect(within(card("cardio")).getByText("Test à replanifier")).toBeDefined();
    expect(within(card("weight")).getByText("79,5 kg · moyenne provisoire")).toBeDefined();
  });
});
