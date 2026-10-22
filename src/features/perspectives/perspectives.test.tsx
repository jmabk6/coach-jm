// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { DayTarget, InstallMarkers, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { GoalsScreen } from "../goals/GoalsScreen";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { activateBlock } from "../workout/engine/workoutEngine";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { WorkoutScreen } from "../workout/WorkoutScreen";
import { loadPerspectives } from "./loadPerspectives";
import { PerspectiveDetailScreen } from "./PerspectiveDetailScreen";
import { forecastText } from "./perspectiveText";
import { PerspectivesScreen } from "./PerspectivesScreen";
import { seedPerspectiveTracks20261022 } from "./seedPerspectives20261022";

/**
 * Perspectives au 31 mars (lot P3, 22/10/2026) : l'entrée dans Objectifs,
 * la sélection A/B/C, le détail semaine par semaine (initial, présenté,
 * actualisé, réel, statut), les prévisions provisoires, et le retour à la
 * séance en cours sans perdre la saisie ni le chrono.
 */

const T = "2026-10-21T17:00:00.000Z";

function chest(date: string, kg: number, reps: number[], rpe: number[], dayTarget?: DayTarget): WorkoutSession {
  return {
    id: `w-${date}`, source: "planned", sessionTemplateId: "v2-muscu-b", status: "completed", date, startedAt: `${date}T17:00:00.000Z`,
    completedAt: `${date}T18:00:00.000Z`, lastActionAt: T, activeDurationSec: 3600, createdAt: T, updatedAt: T,
    blocks: [
      {
        id: "workout-block-v2-muscu-b-chest-press", sourceBlockId: "v2-muscu-b-chest-press", kind: "exercise", position: 2, addedDuringWorkout: false,
        exerciseId: "chest-press", status: "performed", snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 },
        ...(dayTarget ? { dayTarget } : {}),
        series: reps.map((value, index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps: value, rpe: rpe[index]!, completedAt: T })),
      } as PerformedExerciseBlock,
    ],
  } as WorkoutSession;
}

/** Tes trois Muscu B de chest press, puis la trajectoire initiale recalculée comme au 22/10 (départ). */
async function withChestHistory(): Promise<void> {
  await db.workouts.bulkPut([chest("2026-10-06", 45, [8, 8, 8], [8, 8, 8]), chest("2026-10-13", 50, [8, 8, 8], [8, 8, 9]), chest("2026-10-21", 55, [8, 8, 6], [8, 9, 9])]);
  await db.settings.delete("progressionTracks");
  const markers = { ...((await db.settings.get("install"))!.value as InstallMarkers) };
  delete markers.perspectiveTracks20261022;
  await db.settings.put({ key: "install", value: markers });
  await seedPerspectiveTracks20261022("2026-10-22T10:00:00.000Z");
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

describe("vue d'une piste", () => {
  it("chest press B : repère initial, référence détaillée, présenté, réel et actualisé distincts ; chaque série détaillée ; semaines à venir jamais jugées ; prévision provisoire ; limite du 31 mars", async () => {
    await withChestHistory();
    const presented: DayTarget = { computedAt: "2026-10-27T17:00:00.000Z", kind: "progress", rpeMax: 9, reason: "x", sets: [{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 7, stretch: true }] };
    await db.workouts.put(chest("2026-10-27", 55, [8, 8, 8], [8, 9, 9], presented));

    const view = (await loadPerspectives("2026-10-29", "2026-10-29T10:00:00.000Z")).find((item) => item.track.id === "v2-muscu-b-chest-press")!;
    expect(view.weeks[0]).toMatchObject({ week: "2026-10-19", actual: { date: "2026-10-21" } });
    /* Repère initial : une meilleure série (sens d'origine) ; référence détaillée datée : chaque série, dès la semaine suivante. */
    expect(view.weeks[0]!.initial).toMatchObject({ kg: 55, reps: 8 });
    expect(view.weeks[0]!.reference).toBeUndefined();
    expect(view.track.detailed).toMatchObject({ createdAt: "2026-10-22T10:00:00.000Z", basis: { date: "2026-10-21" } });
    expect(view.weeks.find((row) => row.week === "2026-10-26")!.reference).toMatchObject({ sets: [{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 7, stretch: true }] });
    expect(view.weeks.filter((row) => row.reference).every((row) => row.reference!.sets.length === 3)).toBe(true);
    const thisWeek = view.weeks.find((row) => row.week === "2026-10-26")!;
    expect(thisWeek.presented).toEqual(presented);
    expect(thisWeek.actual?.date).toBe("2026-10-27");
    expect(["ahead", "on_track", "consolidate"]).toContain(thisWeek.status);
    /* La semaine suivante porte l'objectif de la prochaine séance (règles sur le réel du 27/10), les autres l'objectif complet prévu. */
    const nextRow = view.weeks.find((row) => row.week === "2026-11-02")!;
    expect(nextRow).toMatchObject({ status: "upcoming", actualized: { next: true, repeat: false, sets: [{ kg: 60, reps: 6 }, { kg: 60, reps: 6 }, { kg: 60, reps: 6 }] } });
    expect(view.weeks.filter((row) => row.week > "2026-10-26").every((row) => row.status === "upcoming" && row.actual === undefined && "sets" in row.actualized! && row.actualized.sets.length === 3 && !row.actualized.next === (row.week !== "2026-11-02"))).toBe(true);
    expect(view.weeks.at(-1)!.week <= "2027-03-31").toBe(true);
    expect(view.forecast).toMatchObject({ provisional: true, weeksWithSession: 4 });
    expect(view.forecast!.probable).toHaveLength(3);
    expect(forecastText(view, {})).toContain("provisoire : historique encore insuffisant (4 semaines avec séance sur les 5 nécessaires).");
  });

  it("presse suspendue : ni objectif chiffré ni prévision ; exercice jamais fait : données insuffisantes, prévision à affiner ; traction : le palier du pari", async () => {
    const views = await loadPerspectives("2026-10-22", "2026-10-22T10:00:00.000Z");
    const presse = views.find((item) => item.track.id === "v2-muscu-b-presse")!;
    expect(presse).toMatchObject({ status: "suspended", next: { kind: "suspended", sets: [] } });
    expect(presse.forecast).toBeUndefined();
    const negatives = views.find((item) => item.track.exerciseId === "traction-negative")!;
    expect(negatives.status).toBe("insufficient");
    expect(forecastText(negatives, {})).toBe("Prévision à affiner : elle démarrera après la première séance.");
    const traction = views.find((item) => item.track.engine === "v6" && item.track.session === "A")!;
    expect(traction.v6!.text).toMatch(/^\d+ kg d’aide · 3 séries jusqu’à 5 · RPE ≤ 9$/);
    expect(traction.next).toBeUndefined();
  });

  it("situation : monter d'un cran ou y ajouter une série progresse ; le repli après une hausse ratée est à consolider", async () => {
    const block = (sets: [number, number, number][]) =>
      ({
        ...chest("2026-10-21", 0, [], []),
        blocks: [{ ...chest("2026-10-21", 0, [], []).blocks[0]!, sourceBlockId: "v2-muscu-c-face-pull", exerciseId: "face-pull-poulie", snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 12, max: 15 }, restBetweenSetsSec: 90 }, series: sets.map(([kg, reps, rpe], index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps, rpe, completedAt: T })) } as PerformedExerciseBlock],
        sessionTemplateId: "v2-muscu-c",
      }) as WorkoutSession;
    const statusAfter = async (sets: [number, number, number][]) => {
      await db.workouts.clear();
      await db.workouts.put(block(sets));
      return (await loadPerspectives("2026-10-22", "2026-10-22T10:00:00.000Z")).find((item) => item.track.id === "v2-muscu-c-face-pull")!;
    };
    const climb = await statusAfter([[15, 15, 8], [15, 15, 8], [15, 15, 8]]);
    expect(climb.next?.kind).toBe("transition");
    expect(climb.status).not.toBe("consolidate");
    const more = await statusAfter([[17.5, 12, 8], [15, 15, 8], [15, 15, 8]]);
    expect(more.next).toMatchObject({ kind: "transition", sets: [{ kg: 17.5 }, { kg: 17.5 }, { kg: 15 }] });
    expect(more.status).not.toBe("consolidate");
    const fallback = await statusAfter([[17.5, 12, 8], [17.5, 10, 8], [17.5, 9, 8]]);
    expect(fallback.next).toMatchObject({ kind: "transition", sets: [{ kg: 17.5 }, { kg: 15 }, { kg: 15 }] });
    expect(fallback.status).toBe("consolidate");
  });

  it("séance encore ouverte : l'exercice déjà noté est « Séance en cours », pas « À venir »", async () => {
    await withChestHistory();
    const open = { ...chest("2026-10-28", 55, [8, 8, 7], [8, 9, 9]), id: "w-ouverte", status: "in_progress" as const };
    delete (open as Partial<WorkoutSession>).completedAt;
    await db.workouts.put(open);
    const view = (await loadPerspectives("2026-10-28", "2026-10-28T19:00:00.000Z")).find((item) => item.track.id === "v2-muscu-b-chest-press")!;
    const row = view.weeks.find((item) => item.week === "2026-10-26")!;
    expect(row).toMatchObject({ status: "in_session", ongoing: [{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 7 }] });
    expect(row.actual).toBeUndefined();
    expect(row.actualized).toBeUndefined();
    const { statusLabel } = await import("./perspectiveText");
    expect(statusLabel(row.status)).toBe("Séance en cours");
  });

  it("historique insuffisant : « provisoire », même quand le rythme est encore nul ; le compte est celui des semaines avec séance", async () => {
    const flat = [{ kg: 7.5, reps: 12 }, { kg: 7.5, reps: 12 }, { kg: 7.5, reps: 12 }];
    const view = { track: {}, last: { date: "2026-10-15", sets: [] }, forecast: { provisional: true, weeksWithSession: 1, paceWeekly: 0, low: flat, high: flat, probable: flat } } as unknown as Parameters<typeof forecastText>[0];
    expect(forecastText(view, {})).toBe("31 mars : 7,5 kg · 12/12/12 — provisoire : historique encore insuffisant (1 semaine avec séance sur les 5 nécessaires).");
    /* Deux séances la même semaine : une seule semaine comptée. */
    await withChestHistory();
    await db.workouts.put({ ...chest("2026-10-22", 55, [8, 8, 7], [8, 9, 9]), id: "w-meme-semaine" });
    const chestB = (await loadPerspectives("2026-10-22", "2026-10-22T10:00:00.000Z")).find((item) => item.track.id === "v2-muscu-b-chest-press")!;
    expect(chestB.forecast).toMatchObject({ provisional: true, weeksWithSession: 3 });
  });
});

describe("à l'écran", () => {
  function renderAt(entry: string) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/objectifs" element={<GoalsScreen />} />
          <Route path="/objectifs/perspectives" element={<PerspectivesScreen />} />
          <Route path="/objectifs/perspectives/:trackId" element={<PerspectiveDetailScreen />} />
          <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("Objectifs › Perspectives au 31 mars › Muscu B › détail semaine par semaine", async () => {
    await withChestHistory();
    renderAt("/objectifs");
    fireEvent.click(await screen.findByRole("link", { name: /Perspectives au 31 mars/ }, { timeout: 5000 }));
    expect(await screen.findByRole("heading", { name: "Perspectives au 31 mars" }, { timeout: 5000 })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Muscu B" }));
    const card = (await screen.findByText("Chest press machine", {}, { timeout: 5000 })).closest("a")!;
    expect(within(card).getByText(/Dernière : 55 kg · 8\/8\/6 · RPE 8\/9\/9/)).toBeDefined();
    expect(within(card).getByText(/provisoire/)).toBeDefined();
    fireEvent.click(card);
    expect(await screen.findByText("Semaine par semaine", {}, { timeout: 5000 })).toBeDefined();
    expect(screen.getAllByText(/^Repère initial \(meilleure série\) :/).length).toBeGreaterThan(20);
    expect(screen.getAllByText(/^Référence détaillée : 55 kg · 8\/8\/6–7$/).length).toBeGreaterThan(0);
    const planned = [...document.querySelectorAll(".perspective-week__planned")].map((line) => line.textContent ?? "");
    expect(planned.length).toBeGreaterThan(20);
    expect(planned.every((line) => /: \d+ kg · \d+(–\d+)?\/\d+(–\d+)?\/\d+(–\d+)?/.test(line))).toBe(true);
    expect(screen.getByRole("link", { name: "‹ Perspectives" }).getAttribute("href")).toBe("/objectifs/perspectives?seance=B");
  }, 20000);

  it("depuis la séance : « Voir ma perspective », puis « Retour à la séance » — saisie et chrono intacts", async () => {
    await withChestHistory();
    const template = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const started = await startFreeWorkout("2026-10-27", new Date().toISOString(), template);
    await db.workouts.put(activateBlock(started, "workout-block-v2-muscu-b-chest-press", new Date().toISOString()));
    renderAt("/seance-en-cours");

    /* Séries à venir : l'objectif figé de chacune, pas la fourchette du programme. */
    expect(await screen.findByLabelText("Série 2 : 55 kg, 8 répétitions, RPE —", {}, { timeout: 5000 })).toBeDefined();
    expect(screen.getByLabelText("Série 3 : 55 kg, 6–7 répétitions, RPE —")).toBeDefined();
    fireEvent.click(await screen.findByRole("button", { name: /Série terminée/ }, { timeout: 5000 }));
    await screen.findByRole("button", { name: "Enregistrer la série 1" }, { timeout: 5000 });
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "7" } });
    const rest = (await db.workouts.get(started.id))!.activeRest!;

    fireEvent.click(screen.getByRole("link", { name: "Voir ma perspective ›" }));
    const back = await screen.findByRole("link", { name: "‹ Retour à la séance" }, { timeout: 5000 });
    expect(await screen.findByRole("heading", { name: "Chest press machine" }, { timeout: 5000 })).toBeDefined();
    fireEvent.click(back);

    await screen.findByRole("button", { name: "Enregistrer la série 1" }, { timeout: 5000 });
    expect((screen.getByLabelText("Reps") as HTMLInputElement).value).toBe("7");
    await waitFor(async () => expect((await db.workouts.get(started.id))!.activeRest).toEqual(rest), { timeout: 5000 });
    expect(document.querySelectorAll(".wseries__rest-slot")).toHaveLength(1);
  }, 20000);
});
