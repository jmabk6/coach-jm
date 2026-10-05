// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, PerformedSeries, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * Option B (programme du 05/10/2026), à l'écran de séance : le rowing de
 * volume de Muscu B affiche et propose la charge du dernier rowing de
 * Muscu B, jamais celle du rowing lourd de Muscu A — et inversement.
 */

const serie = (kg: number, reps: number, index: number): PerformedSeries => ({
  id: `s${index}`, position: index, status: "completed", role: "travail", load: { kind: "total", kg }, reps, rpe: 8, completedAt: "2026-10-11T09:30:00.000Z",
});

function rowing(sourceBlockId: string, kg: number, reps: number, extra: Partial<PerformedExerciseBlock> = {}): PerformedExerciseBlock {
  return {
    id: `workout-block-${sourceBlockId}`, sourceBlockId, kind: "exercise", position: 2, addedDuringWorkout: false, exerciseId: "rowing-poulie-basse", status: "performed",
    snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 6, max: 15 }, restBetweenSetsSec: 120 },
    series: [serie(kg, reps, 0), serie(kg, reps, 1)], ...extra,
  };
}

function done(id: string, date: string, sessionTemplateId: string, block: PerformedExerciseBlock): WorkoutSession {
  return {
    id, source: "planned", kind: "training", status: "completed", date, sessionTemplateId, blocks: [block],
    startedAt: `${date}T09:00:00.000Z`, completedAt: `${date}T10:00:00.000Z`, lastActionAt: `${date}T10:00:00.000Z`, activeDurationSec: 3600, createdAt: "x", updatedAt: "x",
  } as WorkoutSession;
}

async function lastTimeOfRowing(templateId: string): Promise<string> {
  const template = (await db.sessionTemplates.get(templateId))!;
  await startFreeWorkout("2026-10-20", "2026-10-20T08:00:00.000Z", template);
  render(
    <MemoryRouter initialEntries={["/seance-en-cours"]}>
      <Routes>
        <Route path="/seance-en-cours" element={<WorkoutScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findAllByText("Rowing poulie basse assis", {}, { timeout: 4000 });
  const item = [...document.querySelectorAll<HTMLElement>("li[data-block-id]")].find((entry) => entry.textContent?.includes("Rowing poulie basse assis"))!;
  fireEvent.click(within(item).getAllByRole("button")[0]!);
  const label = await within(item).findByText("Dernière fois");
  return label.parentElement!.querySelector("dd")!.textContent ?? "";
}

describe("écran de séance — référence propre du rowing", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
    /* Dimanche 11/10 : rowing lourd 60 kg ; mardi 13/10 (plus récent) : rowing de volume 45 kg. */
    await db.workouts.bulkPut([
      done("w-a", "2026-10-11", "v2-muscu-a", rowing("v2-muscu-a-rowing", 60, 8)),
      done("w-b", "2026-10-13", "v2-muscu-b", rowing("v2-muscu-b-rowing", 45, 15, { outsideFrame: true, ownReference: true, reducedPrescription: true })),
    ]);
  });

  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 50));
    db.close();
    await db.delete();
  });

  it("Muscu B : « Dernière fois » = le rowing de volume (45 kg), pas le lourd du dimanche", async () => {
    const text = await lastTimeOfRowing("v2-muscu-b");
    expect(text).toContain("45 kg");
    expect(text).not.toContain("60 kg");
  }, 20000);

  it("Muscu A : « Dernière fois » = le rowing lourd (60 kg), pas le volume du mardi, pourtant plus récent", async () => {
    const text = await lastTimeOfRowing("v2-muscu-a");
    expect(text).toContain("60 kg");
    expect(text).not.toContain("45 kg");
  }, 20000);
});
