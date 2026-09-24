// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, SessionTemplate, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { applyWorkoutAction } from "./engine/persistWorkout";
import { correctDuration, discardBlock, validateSeries, validateStep } from "./engine/workoutEngine";
import { durationRuleOf } from "./engine/workoutTime";
import { confirmWorkout, endWorkout } from "./finishWorkout";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutEndScreen } from "./WorkoutEndScreen";

/**
 * Règle de durée (décision du 24/09/2026) : une séance terminée
 * entièrement cardio dure la somme de ses paliers validés ; toute séance
 * se corrige entre Terminer et Enregistrer. Cas réel : la Cardio A du
 * 24/09, 45 min de paliers dans « début », « principal » et « retour »
 * validés à vide, terminée à 16:22 — 2 h 47 à l'horloge.
 */

const START = "2026-09-24T13:35:00.000Z";
const END = "2026-09-24T16:22:00.000Z";

function oldCardioA(base: SessionTemplate): SessionTemplate {
  const block = (id: string, position: number, durationSec: number) => ({
    id, kind: "exercise" as const, position, exerciseId: "tapis",
    instructions: { shape: "steps" as const, steps: [{ id: `${id}-p1`, position: 0, durationSec, speedKmh: 5, inclinePercent: 0 }] },
  });
  return { ...base, blocks: [block("debut", 0, 300), block("principal", 1, 2100), block("retour", 2, 300)] } as SessionTemplate;
}

const exerciseBlocks = (workout: WorkoutSession) =>
  workout.blocks.filter((block): block is PerformedExerciseBlock => block.kind === "exercise");

/** Le 24/09 : « début » porté à 45 min, « principal » et « retour » validés à vide à 13:43. */
async function session2409(): Promise<WorkoutSession> {
  const base = (await db.sessionTemplates.get("v1-cardio-a"))!;
  let workout = await startFreeWorkout("2026-09-24", START, oldCardioA(base));
  const [debut, principal, retour] = exerciseBlocks(workout);
  workout = validateStep(workout, debut!.id, debut!.cardioSteps![0]!.id, { settings: { durationSec: 2700, speedKmh: 5, inclinePercent: 0 } }, "2026-09-24T13:41:00.000Z");
  workout = validateStep(workout, principal!.id, principal!.cardioSteps![0]!.id, {}, "2026-09-24T13:43:00.000Z");
  workout = validateStep(workout, retour!.id, retour!.cardioSteps![0]!.id, {}, "2026-09-24T13:43:30.000Z");
  await db.workouts.put(workout);
  return endWorkout(workout.id, END);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

describe("séance entièrement cardio : somme des paliers validés", () => {
  it("le 24/09 : 85 min de paliers à la clôture, 45 min après « Retirer ce bloc » sur principal et retour", async () => {
    const ended = await session2409();
    expect(durationRuleOf(ended)).toBe("cardio_steps");
    expect(ended.activeDurationSec).toBe(2700 + 2100 + 300);

    const [, principal, retour] = exerciseBlocks(ended);
    await applyWorkoutAction(ended.id, (current, at) => discardBlock(current, principal!.id, at), "2026-09-25T08:00:00.000Z");
    const after = await applyWorkoutAction(ended.id, (current, at) => discardBlock(current, retour!.id, at), "2026-09-25T08:01:00.000Z");
    expect(after.activeDurationSec).toBe(2700);

    await confirmWorkout(ended.id, {}, "2026-09-25T08:02:00.000Z");
    expect((await db.workouts.get(ended.id))!.activeDurationSec).toBe(2700);
  });

  it("pendant la séance, l'horloge fait foi ; une série de musculation ramène à l'horloge", async () => {
    const base = (await db.sessionTemplates.get("v1-cardio-a"))!;
    let workout = await startFreeWorkout("2026-09-24", START, oldCardioA(base));
    const debut = exerciseBlocks(workout)[0]!;
    workout = validateStep(workout, debut.id, debut.cardioSteps![0]!.id, {}, "2026-09-24T13:41:00.000Z");
    expect(durationRuleOf(workout)).toBe("clock");

    const muscu = (await db.sessionTemplates.get("v1-muscu-a"))!;
    await db.workouts.delete(workout.id);
    let mixed = await startFreeWorkout("2026-09-27", "2026-09-27T09:00:00.000Z", muscu);
    const cardio = exerciseBlocks(mixed).find((block) => block.cardioSteps?.length)!;
    const strength = exerciseBlocks(mixed).find((block) => block.series?.length)!;
    mixed = validateStep(mixed, cardio.id, cardio.cardioSteps![0]!.id, {}, "2026-09-27T09:10:00.000Z");
    mixed = validateSeries(mixed, strength.id, strength.series![0]!.id, { load: { kind: "total", kg: 40 }, reps: 10 }, "2026-09-27T09:20:00.000Z");
    await db.workouts.put(mixed);
    const ended = await endWorkout(mixed.id, "2026-09-27T10:00:00.000Z");
    expect(durationRuleOf(ended)).toBe("clock");
    expect(ended.activeDurationSec).toBe(3600);
  });
});

describe("durée corrigée entre Terminer et Enregistrer", () => {
  it("prime sur le calcul, revient au calcul, refusée pendant la séance et après l'enregistrement", async () => {
    const ended = await session2409();
    const corrected = correctDuration(ended, 2400, "2026-09-25T08:00:00.000Z");
    expect(corrected.activeDurationSec).toBe(2400);
    expect(durationRuleOf(corrected)).toBe("corrected");
    expect(correctDuration(corrected, undefined, "2026-09-25T08:01:00.000Z").activeDurationSec).toBe(5100);
    expect(() => correctDuration(ended, 0, "2026-09-25T08:01:00.000Z")).toThrow(/invalide/);

    const running = { ...ended } as WorkoutSession;
    delete running.endedAt;
    expect(() => correctDuration(running, 2400, "2026-09-25T08:01:00.000Z")).toThrow(/terminée/);

    await confirmWorkout(ended.id, {}, "2026-09-25T08:02:00.000Z");
    const saved = (await db.workouts.get(ended.id))!;
    expect(() => correctDuration(saved, 2400, "2026-09-25T08:03:00.000Z")).toThrow(/enregistrée/);
  });

  it("écran de fin : « Corriger la durée » en minutes, l'amplitude 2 h 47 n'est plus affichée", async () => {
    await session2409();
    render(
      <MemoryRouter initialEntries={["/seance-en-cours/fin"]}>
        <Routes>
          <Route path="/seance-en-cours/fin" element={<WorkoutEndScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("(somme des paliers validés)")).toBeDefined();
    expect(screen.queryByText(/2 h 47/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Corriger la durée" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Minutes"), { target: { value: "45" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /Enregistrer la durée/ }));

    expect(await screen.findByText("(corrigée)")).toBeDefined();
    await waitFor(async () => {
      const saved = await db.workouts.where("date").equals("2026-09-24").first();
      expect(saved!.activeDurationSec).toBe(2700);
    });
  });
});
