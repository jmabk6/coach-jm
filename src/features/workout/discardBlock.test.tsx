// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, SessionTemplate, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { applyWorkoutAction } from "./engine/persistWorkout";
import { discardBlock, validateStep } from "./engine/workoutEngine";
import { confirmWorkout, endWorkout } from "./finishWorkout";
import { startFreeWorkout } from "./startFreeWorkout";
import { WorkoutBlockDetailScreen } from "./WorkoutBlockDetailScreen";

/**
 * « Retirer ce bloc » (décision du 24/09/2026) : un bloc non utilisé sort
 * de la séance, même avec des paliers validés par erreur — pendant la
 * séance, et entre Terminer et Enregistrer. Cas réel : la Cardio A du
 * 24/09, ancien modèle en trois blocs, dont « principal » et « retour »
 * ont été validés à vide.
 */

const START = "2026-09-24T13:35:00.000Z";

/** L'ancien Cardio A, en trois blocs (celui de la séance du 24/09). */
function oldCardioA(base: SessionTemplate): SessionTemplate {
  const block = (id: string, position: number, durationSec: number, speedKmh: number, inclinePercent: number) => ({
    id, kind: "exercise" as const, position, exerciseId: "tapis",
    instructions: { shape: "steps" as const, steps: [{ id: `${id}-p1`, position: 0, durationSec, speedKmh, inclinePercent }] },
  });
  return {
    ...base,
    blocks: [block("debut", 0, 300, 4.5, 0), block("principal", 1, 2100, 5, 7), block("retour", 2, 300, 4.5, 0)],
  } as SessionTemplate;
}

function Where() {
  return <p>{useLocation().pathname}</p>;
}

const exerciseBlocks = (workout: WorkoutSession) =>
  workout.blocks.filter((block): block is PerformedExerciseBlock => block.kind === "exercise");

async function startOld(): Promise<WorkoutSession> {
  const base = (await db.sessionTemplates.get("v1-cardio-a"))!;
  return startFreeWorkout("2026-09-24", START, oldCardioA(base));
}

/** Valide chaque palier de chaque bloc, comme le 24/09. */
function validateAll(workout: WorkoutSession, at: string): WorkoutSession {
  let next = workout;
  for (const block of exerciseBlocks(workout)) {
    for (const step of block.cardioSteps ?? []) next = validateStep(next, block.id, step.id, {}, at);
  }
  return next;
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

describe("discardBlock (moteur)", () => {
  it("pendant la séance : le bloc est supprimé, les autres renumérotés, le suivant devient courant", async () => {
    const started = await startOld();
    const [debut, principal] = exerciseBlocks(started);
    let workout = validateStep(started, debut!.id, debut!.cardioSteps![0]!.id, {}, "2026-09-24T13:41:00.000Z");
    workout = validateStep(workout, principal!.id, principal!.cardioSteps![0]!.id, {}, "2026-09-24T13:43:00.000Z");

    const next = discardBlock(workout, principal!.id, "2026-09-24T13:44:00.000Z");
    const remaining = exerciseBlocks(next);
    expect(remaining.map((block) => block.sourceBlockId)).toEqual(["debut", "retour"]);
    expect(next.blocks.map((block) => block.position)).toEqual([0, 1]);
    /* Le bloc déjà fait n'est pas touché. */
    expect(remaining[0]).toEqual(exerciseBlocks(workout)[0]);
    expect(next.currentBlockId).toBe(remaining[1]!.id);
    /* Le repos ouvert après la validation par erreur disparaît avec le bloc. */
    expect(next.activeRest?.afterBlockId).not.toBe(principal!.id);
  });

  it("en attente d'enregistrement : les blocs disparaissent, séance toujours en attente", async () => {
    const started = await startOld();
    await db.workouts.put(validateAll(started, "2026-09-24T13:43:00.000Z"));
    await endWorkout(started.id, "2026-09-24T16:22:00.000Z");

    const [, principal, retour] = exerciseBlocks((await db.workouts.get(started.id))!);
    await applyWorkoutAction(started.id, (current, at) => discardBlock(current, principal!.id, at), "2026-09-25T08:00:00.000Z");
    const after = await applyWorkoutAction(started.id, (current, at) => discardBlock(current, retour!.id, at), "2026-09-25T08:01:00.000Z");

    const blocks = exerciseBlocks(after);
    expect(blocks.map((block) => [block.sourceBlockId, block.status])).toEqual([["debut", "performed"]]);
    expect(after.status).toBe("in_progress");
    expect(after.endedAt).toBe("2026-09-24T16:22:00.000Z");
  });

  it("après « Enregistrer », plus rien ne se retire", async () => {
    const started = await startOld();
    await db.workouts.put(validateAll(started, "2026-09-24T13:43:00.000Z"));
    await endWorkout(started.id, "2026-09-24T16:22:00.000Z");
    await confirmWorkout(started.id, {}, "2026-09-24T16:23:00.000Z");
    const saved = (await db.workouts.get(started.id))!;
    expect(() => discardBlock(saved, exerciseBlocks(saved)[1]!.id, "2026-09-24T16:24:00.000Z")).toThrow(/enregistrée/);
  });
});

describe("récapitulatif en attente : bouton « Retirer ce bloc »", () => {
  it("supprime le bloc après confirmation et revient au récapitulatif ; absent d'une séance enregistrée", async () => {
    const started = await startOld();
    await db.workouts.put(validateAll(started, "2026-09-24T13:43:00.000Z"));
    await endWorkout(started.id, "2026-09-24T16:22:00.000Z");
    const principal = exerciseBlocks(started)[1]!;

    const view = render(
      <MemoryRouter initialEntries={[`/workouts/${started.id}/blocks/${principal.id}`]}>
        <Routes>
          <Route path="/workouts/:workoutId/blocks/:blockId" element={<WorkoutBlockDetailScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Retirer ce bloc" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /Retirer ce bloc/ }));

    await waitFor(async () => {
      const ids = exerciseBlocks((await db.workouts.get(started.id))!).map((block) => block.id);
      expect(ids).not.toContain(principal.id);
    });
    expect(await screen.findByText("/seance-en-cours/fin")).toBeDefined();

    view.unmount();
    await confirmWorkout(started.id, {}, "2026-09-25T08:05:00.000Z");
    const retour = exerciseBlocks(started)[2]!;
    render(
      <MemoryRouter initialEntries={[`/workouts/${started.id}/blocks/${retour.id}`]}>
        <Routes>
          <Route path="/workouts/:workoutId/blocks/:blockId" element={<WorkoutBlockDetailScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Réalisé")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retirer ce bloc" })).toBeNull();
  });
});
