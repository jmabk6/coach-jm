// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { addExerciseBlocks } from "../workout/engine/workoutEngine";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { SettingsScreen } from "./SettingsScreen";

/**
 * Lot L.2 — Réglages : thème, son du minuteur, repos de la séance libre
 * (90 s par défaut) qui remplace la constante codée ; pas de Vibration.
 */

const T = "2026-09-25T10:00:00.000Z";
const squat = exerciseCatalog.find((exercise) => exercise.id === "squat")!;

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

describe("repos de la séance libre", () => {
  it("défaut 90 s ; la valeur choisie sert à l'ajout d'un exercice en séance libre, jamais en séance planifiée", async () => {
    expect((await db.settings.get("preferences"))?.value).toMatchObject({ freeWorkoutRestSec: 90 });

    const free = await startFreeWorkout("2026-09-25", T);
    const added = addExerciseBlocks(free, [squat], T, undefined, undefined, 45);
    expect((added.blocks[0] as PerformedExerciseBlock).snapshotInstructions).toMatchObject({ restBetweenSetsSec: 45, sets: 1 });

    const planned = { ...free, source: "planned" as const };
    const addedPlanned = addExerciseBlocks(planned, [squat], T, undefined, undefined, 45);
    expect((addedPlanned.blocks[0] as PerformedExerciseBlock).snapshotInstructions).toMatchObject({ restBetweenSetsSec: 90 });
  });
});

describe("écran Réglages", () => {
  it("thème, son du minuteur et repos enregistrés aussitôt ; pas de réglage Vibration", async () => {
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("radio", { name: "Sombre" }));
    fireEvent.click(screen.getByRole("switch", { name: /Son du minuteur/ }));
    fireEvent.change(screen.getByLabelText("Repos par défaut (séance libre)"), { target: { value: "60" } });

    await waitFor(async () =>
      expect((await db.settings.get("preferences"))?.value).toEqual({ theme: "dark", timerSound: false, freeWorkoutRestSec: 60 }),
    );
    expect(screen.queryByText(/Vibration/)).toBeNull();
  });
});
