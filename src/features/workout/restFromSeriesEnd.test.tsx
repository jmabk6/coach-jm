// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { Exercise, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * Écran de séance (15/10/2026) : « Série terminée · Démarrer le repos »,
 * saisie pendant le repos, « Enregistrer » sans remise à zéro, un seul
 * chrono placé sous la série terminée et au-dessus de la suivante,
 * « Démarrer la série suivante » qui mesure le repos, saisie retrouvée
 * après un rechargement, dernière série.
 */

const T0 = new Date(Date.now() - 60_000).toISOString();

async function exercises(): Promise<Exercise[]> {
  const all = (await db.exercises.toArray()) as Exercise[];
  return all.filter((exercise) => exercise.measurementType === "load_reps" && exercise.status === "active").slice(0, 2);
}

function block(id: string, exerciseId: string, position: number, sets: number): PerformedExerciseBlock {
  return {
    id, kind: "exercise", position, addedDuringWorkout: false, exerciseId, status: position === 0 ? "not_performed" : "not_performed",
    snapshotInstructions: { shape: "reps", sets, reps: { min: 8, max: 10 }, restBetweenSetsSec: 120 },
    series: Array.from({ length: sets }, (_, index) => ({
      id: `${id}-s${index + 1}`, position: index, status: position === 0 && index === 0 ? ("active" as const) : ("upcoming" as const),
    })),
  };
}

async function seedWorkout(sets = 3): Promise<WorkoutSession> {
  const [first, second] = await exercises();
  const workout: WorkoutSession = {
    id: "w-repos", source: "free", status: "in_progress", date: T0.slice(0, 10), startedAt: T0, lastActionAt: T0, lastSeenAt: new Date().toISOString(),
    activeDurationSec: 0, blocks: [block("a", first!.id, 0, sets), block("b", second!.id, 1, 2)], currentBlockId: "a", currentEntryId: "a-s1",
    createdAt: T0, updatedAt: T0,
  };
  await db.workouts.put(workout);
  return workout;
}

const stored = async () => (await db.workouts.get("w-repos")) as WorkoutSession;
const seriesOf = (w: WorkoutSession, blockId: string, index: number) => (w.blocks.find((item) => item.id === blockId) as PerformedExerciseBlock).series![index]!;

function renderLive() {
  return render(
    <MemoryRouter initialEntries={["/seance-en-cours"]}>
      <Routes>
        <Route path="/seance-en-cours" element={<WorkoutScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Le chrono et ses voisins dans la liste des séries. */
function restSlot() {
  const slots = document.querySelectorAll(".wseries__rest-slot");
  expect(slots).toHaveLength(1);
  return slots[0] as HTMLElement;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

describe("repos depuis la fin de série, à l'écran", () => {
  it("série terminée → chrono sous la saisie et au-dessus de la série 2 ; enregistrement sans remise à zéro ; un seul chrono ; « Démarrer la série suivante » mesure le repos", async () => {
    await seedWorkout();
    renderLive();

    fireEvent.click(await screen.findByRole("button", { name: /Série terminée/ }));
    const save = await screen.findByRole("button", { name: "Enregistrer la série 1" });
    const restBefore = (await stored()).activeRest!;
    expect(restBefore).toMatchObject({ fromSeriesEnd: true, plannedDurationSec: 120, afterEntryId: "a-s1" });
    expect(seriesOf(await stored(), "a", 0).endedAt).toBe(restBefore.startedAt);

    /* Préremplissage : la cible du programme (10 répétitions) ; le ressenti jamais. */
    expect((screen.getByLabelText("Reps") as HTMLInputElement).value).toBe("10");
    /* Le chrono : juste sous la série en saisie, juste au-dessus de la série 2. */
    const slot = restSlot();
    expect(slot.previousElementSibling?.contains(save)).toBe(true);
    expect(slot.nextElementSibling?.textContent).toMatch(/À venir/);
    expect(within(slot).getByRole("button", { name: "Démarrer la série suivante" })).toBeDefined();
    expect(document.querySelector(".rest-bar")).toBeNull();
    expect(slot.querySelector(".rest-card__next-line")).toBeNull();

    fireEvent.click(save);
    await waitFor(async () => expect(seriesOf(await stored(), "a", 0).status).toBe("completed"));
    const after = await stored();
    /* Même repos, même départ : le chrono continue. */
    expect(after.activeRest).toEqual(restBefore);
    expect(seriesOf(after, "a", 0).completedAt! >= seriesOf(after, "a", 0).endedAt!).toBe(true);
    /* Toujours un seul chrono, toujours sous la série 1 et au-dessus de la série 2, qui attend son « Série terminée ». */
    await waitFor(() => expect(restSlot().nextElementSibling?.querySelector(".wseries__end")).not.toBeNull());

    fireEvent.click(within(restSlot()).getByRole("button", { name: "Démarrer la série suivante" }));
    await waitFor(async () => expect((await stored()).activeRest).toBeUndefined());
    const measured = await stored();
    expect(seriesOf(measured, "a", 0).actualRestAfterSec).toBeGreaterThanOrEqual(0);
    expect(seriesOf(measured, "a", 1).startedAt).toBeDefined();
    expect(document.querySelectorAll(".wseries__rest-slot")).toHaveLength(0);
    expect(screen.getByText(/^Repos réel/)).toBeDefined();
  });

  it("double appui sur « Série terminée » : un seul repos", async () => {
    await seedWorkout();
    renderLive();
    const button = await screen.findByRole("button", { name: /Série terminée/ });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Enregistrer la série 1" });
    const first = (await stored()).activeRest!;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await stored()).activeRest).toEqual(first);
    expect(document.querySelectorAll(".wseries__rest-slot")).toHaveLength(1);
  });

  it("saisie non enregistrée retrouvée après un rechargement, chrono recalculé depuis la fin de série", async () => {
    await seedWorkout();
    const first = renderLive();
    fireEvent.click(await screen.findByRole("button", { name: /Série terminée/ }));
    await screen.findByRole("button", { name: "Enregistrer la série 1" });
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "7" } });
    const rest = (await stored()).activeRest!;
    first.unmount();

    renderLive();
    await screen.findByRole("button", { name: "Enregistrer la série 1" });
    expect((screen.getByLabelText("Reps") as HTMLInputElement).value).toBe("7");
    expect((await stored()).activeRest).toEqual(rest);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la série 1" }));
    await waitFor(async () => expect(seriesOf(await stored(), "a", 0).reps).toBe(7));
    expect(Object.keys(localStorage).filter((key) => key.startsWith("coach-jm:series-draft:"))).toEqual([]);
  });

  it("dernière série : repos prévu conservé ; après « Enregistrer », le chrono passe au-dessus de la série 1 de l'exercice suivant, avec « Ensuite »", async () => {
    await seedWorkout(1);
    renderLive();
    fireEvent.click(await screen.findByRole("button", { name: /Série terminée/ }));
    const save = await screen.findByRole("button", { name: "Enregistrer la série 1" });
    expect((await stored()).activeRest).toMatchObject({ plannedDurationSec: 120 });
    /* « Ensuite » annonce l'exercice suivant, jamais la série encore en saisie. */
    const [, second] = await exercises();
    expect(restSlot().querySelector(".rest-card__next-line")?.textContent).toContain(second!.name);
    fireEvent.click(save);
    await waitFor(async () => expect((await stored()).currentBlockId).toBe("b"));
    await waitFor(() => expect(restSlot().nextElementSibling?.querySelector(".wseries__end")).not.toBeNull());
    /* Déjà au-dessus de la série suivante : pas de « Ensuite » en double. */
    expect(restSlot().querySelector(".rest-card__next-line")).toBeNull();
    /* Dans la carte du second exercice, au-dessus de sa première série. */
    const cards = [...document.querySelectorAll<HTMLElement>(".wblock")];
    expect(cards.findIndex((card) => card.contains(restSlot()))).toBe(1);
    expect(restSlot().parentElement?.querySelector(".wseries__row:not(.wseries__head)")).toBe(restSlot().nextElementSibling);
    expect((await stored()).activeRest).toMatchObject({ afterBlockId: "a", afterEntryId: "a-s1" });
  });
});
