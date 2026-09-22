// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Exercise, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { db } from "../../db/database";
import { FrameSection } from "./FrameSection";

const T = "2026-09-22T10:00:00.000Z";

const presse: Exercise = {
  id: "presse",
  name: "Presse à cuisses",
  category: "Musculation",
  zone: "Jambes",
  movement: "Squat",
  equipment: "Machine",
  location: "Salle",
  mode: "series",
  measurementType: "load_reps",
  status: "active",
  createdAt: T,
  updatedAt: T,
};

function pastWorkout(): WorkoutSession {
  const block: PerformedExerciseBlock = {
    id: "b",
    kind: "exercise",
    position: 0,
    addedDuringWorkout: false,
    exerciseId: "presse",
    status: "performed",
    snapshotInstructions: { shape: "reps", sets: 2, reps: { min: 10, max: 12 }, restBetweenSetsSec: 90 },
    series: [
      { id: "s1", position: 0, status: "completed", load: { kind: "total", kg: 120 }, reps: 15 },
      { id: "s2", position: 1, status: "completed", load: { kind: "total", kg: 120 }, reps: 15 },
    ],
  };
  return {
    id: "import-2026-09-16",
    source: "free",
    status: "completed",
    date: "2026-09-16",
    startedAt: "2026-09-16T16:00:00.000Z",
    lastActionAt: "2026-09-16T16:40:00.000Z",
    completedAt: "2026-09-16T16:40:00.000Z",
    activeDurationSec: 2400,
    blocks: [block],
    createdAt: "2026-09-16T16:00:00.000Z",
    updatedAt: "2026-09-16T16:40:00.000Z",
  };
}

function field(label: string | RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

describe("FrameSection — fiche exercice", () => {
  it("hors musculation : rien ; mesure sans cadre possible : une phrase", async () => {
    const mobility = { ...presse, category: "Mobilité", measurementType: "duration" } as unknown as Exercise;
    const { container, rerender } = render(<FrameSection exercise={mobility} completedWorkouts={[]} />);
    expect(container.textContent).toBe("");

    rerender(<FrameSection exercise={{ ...presse, measurementType: "reps_per_side" }} completedWorkouts={[]} />);
    expect(await screen.findByText(/Pas de cadre possible/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Créer un cadre/ })).toBeNull();
  });

  it("création : charge de départ proposée d'après la dernière séance, confirmée → objectif ; deux cartes, aucun jalon", async () => {
    render(<FrameSection exercise={presse} completedWorkouts={[pastWorkout()]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Créer un cadre de progression" }));

    expect(screen.getByText(/Proposée d'après votre dernière séance \(120 kg\)/)).toBeTruthy();
    expect(field(/^Charge de départ/).value).toBe("120");
    fireEvent.change(field(/^Charge de départ/), { target: { value: "125" } });
    fireEvent.change(field("Poids de la barre (kg, facultatif)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le cadre" }));

    expect(await screen.findByText(/V1 · Charge croissante/)).toBeTruthy();
    expect(screen.getByText("3 × 10–12 · RPE ≤ 8 · repos 1 min 30 s · +2,5 kg · barre 20 kg")).toBeTruthy();
    expect(screen.getByText(/Modifiable librement/)).toBeTruthy();
    expect(screen.getByText("Aucun jalon validé")).toBeTruthy();
    expect(screen.getByText("Charge en cours").nextElementSibling?.textContent).toBe("120 kg");
    expect(screen.getByText(/Objectif :/).textContent).toMatch(/125 kg — charge de départ confirmée le 22\/09\/2026|125 kg — charge de départ confirmée le/);

    const version = (await db.strengthFrameVersions.toArray())[0]!;
    expect(version).toMatchObject({ workSets: 3, repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 90, barWeightKg: 20, currentTarget: { value: 125, unit: "kg" } });
    expect(await db.strengthMilestones.count()).toBe(0);
  });

  it("saisie incohérente : message, rien n'est écrit", async () => {
    render(<FrameSection exercise={presse} completedWorkouts={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Créer un cadre de progression" }));
    expect(screen.getByText(/Aucune séance passée/)).toBeTruthy();

    fireEvent.change(field("Reps max"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le cadre" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "La plage de répétitions doit être cohérente (min ≤ max)");
    expect(await db.strengthFrames.count()).toBe(0);
  });

  it("hausse proposée après un jalon : accepter pose un objectif daté ; rester n'écrit rien", async () => {
    const framed = pastWorkout();
    framed.id = "w1";
    framed.kind = "training";
    framed.date = "2026-09-23";
    framed.startedAt = "2026-09-23T16:00:00.000Z";
    (framed.blocks[0] as PerformedExerciseBlock).frameVersionId = "f1-v1";
    await db.strengthFrames.put({ id: "f1", exerciseId: "presse", activeVersionId: "f1-v1", createdAt: T, updatedAt: T });
    await db.strengthFrameVersions.put({
      id: "f1-v1",
      frameId: "f1",
      number: 1,
      status: "active",
      progressionType: "charge_croissante",
      workSets: 2,
      repRange: { min: 10, max: 12 },
      rpeTarget: 8,
      restSec: 90,
      increment: { unit: "kg", value: 5 },
      firstOfficialWorkoutId: "w1",
      frozenAt: "2026-09-23T16:40:00.000Z",
      createdAt: T,
      updatedAt: T,
    });
    await db.strengthMilestones.put({ id: "m1", frameVersionId: "f1-v1", workoutId: "w1", date: "2026-09-23", value: 120, unit: "kg", createdAt: "2026-09-23T16:40:00.000Z" });

    const { unmount } = render(<FrameSection exercise={presse} completedWorkouts={[framed]} />);

    const encart = await screen.findByRole("complementary", { name: "Hausse proposée" });
    expect(encart.textContent).toMatch(/Palier 120 kg validé le 23\/09\/2026/);
    expect(encart.textContent).toMatch(/Cran suivant : 125 kg, en repartant du bas de la plage \(10 répétitions\)/);
    expect(screen.queryByRole("complementary", { name: "Stagnation à examiner" })).toBeNull();

    /* Rester : rien en base, l'encart disparaît pour cette session du navigateur. */
    fireEvent.click(within(encart).getByRole("button", { name: "Rester à 120 kg" }));
    expect(screen.queryByRole("complementary", { name: "Hausse proposée" })).toBeNull();
    expect(await db.strengthFrameVersions.get("f1-v1")).not.toHaveProperty("currentTarget");
    unmount();
    sessionStorage.clear();

    /* Accepter : l'objectif en cours, daté, rattaché au jalon. */
    render(<FrameSection exercise={presse} completedWorkouts={[framed]} />);
    const again = await screen.findByRole("complementary", { name: "Hausse proposée" });
    fireEvent.click(within(again).getByRole("button", { name: "Accepter le nouveau palier" }));

    expect(await screen.findByText(/Objectif 125 kg enregistré/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Hausse proposée" })).toBeNull());
    expect(screen.getByText(/Objectif :/).textContent).toMatch(/125 kg — hausse acceptée le/);
    expect((await db.strengthFrameVersions.get("f1-v1"))?.currentTarget).toMatchObject({ value: 125, unit: "kg", fromMilestoneId: "m1" });
    expect(await db.strengthMilestones.count()).toBe(1);
  });

  it("stagnation : trois séances à la même charge sans progrès, listées avec leurs totaux, aucune écriture", async () => {
    const sessions = ["2026-09-20", "2026-09-24", "2026-09-28"].map((date, index) => {
      const w = pastWorkout();
      w.id = `w${index}`;
      w.kind = "training";
      w.date = date;
      w.startedAt = `${date}T16:00:00.000Z`;
      const block = w.blocks[0] as PerformedExerciseBlock;
      block.frameVersionId = "f1-v1";
      block.series = [
        { id: `${w.id}-a`, position: 0, status: "completed", role: "travail", load: { kind: "total", kg: 120 }, reps: 11 - index, rpe: 9 },
        { id: `${w.id}-b`, position: 1, status: "completed", role: "travail", load: { kind: "total", kg: 120 }, reps: 10, rpe: 9 },
      ];
      return w;
    });
    await db.strengthFrames.put({ id: "f1", exerciseId: "presse", activeVersionId: "f1-v1", createdAt: T, updatedAt: T });
    await db.strengthFrameVersions.put({
      id: "f1-v1",
      frameId: "f1",
      number: 1,
      status: "active",
      progressionType: "charge_croissante",
      workSets: 2,
      repRange: { min: 10, max: 12 },
      rpeTarget: 8,
      restSec: 90,
      increment: { unit: "kg", value: 5 },
      firstOfficialWorkoutId: "w0",
      frozenAt: T,
      createdAt: T,
      updatedAt: T,
    });
    const before = await db.strengthFrameVersions.get("f1-v1");

    render(<FrameSection exercise={presse} completedWorkouts={sessions} />);

    const encart = await screen.findByRole("complementary", { name: "Stagnation à examiner" });
    expect(within(encart).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "20/09/2026 — total 21 reps",
      "24/09/2026 — total 20 reps",
      "28/09/2026 — total 19 reps",
    ]);
    expect(encart.textContent).toMatch(/revenir au cran précédent, poursuivre, vérifier le repos/);
    expect(screen.queryByRole("complementary", { name: "Hausse proposée" })).toBeNull();
    expect(await db.strengthFrameVersions.get("f1-v1")).toEqual(before);
  });

  it("figée : modifier un paramètre crée la V2 ; archiver puis nouvelle version ; historique et jalon affichés", async () => {
    await db.strengthFrames.put({ id: "f1", exerciseId: "presse", activeVersionId: "f1-v1", createdAt: T, updatedAt: T });
    await db.strengthFrameVersions.put({
      id: "f1-v1",
      frameId: "f1",
      number: 1,
      status: "active",
      progressionType: "charge_croissante",
      workSets: 3,
      repRange: { min: 10, max: 12 },
      rpeTarget: 8,
      restSec: 90,
      increment: { unit: "kg", value: 2.5 },
      firstOfficialWorkoutId: "w1",
      frozenAt: "2026-09-23T10:00:00.000Z",
      createdAt: T,
      updatedAt: T,
    });
    await db.strengthMilestones.put({ id: "m1", frameVersionId: "f1-v1", workoutId: "w1", date: "2026-09-23", value: 120, unit: "kg", createdAt: "2026-09-23T10:00:00.000Z" });

    render(<FrameSection exercise={presse} completedWorkouts={[]} />);

    expect(await screen.findByText(/Figée depuis le 23\/09\/2026 : modifier un paramètre créera la version 2/)).toBeTruthy();
    expect(screen.getByText("Dernier jalon validé").nextElementSibling?.textContent).toBe("120 kg");

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(field("Séries de travail"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText(/V2 · Charge croissante/)).toBeTruthy();
    expect(screen.getByText(/Version 2 créée ; la version 1 est archivée/)).toBeTruthy();
    expect(screen.getByText("Aucun jalon validé")).toBeTruthy();
    const history = screen.getByRole("list", { name: "Versions du cadre" });
    expect(within(history).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "V2 · 4 × 10–12 · RPE ≤ 8active",
      expect.stringMatching(/^V1 · 3 × 10–12 · RPE ≤ 8archivée le .* · remplacée$/),
    ]);
    expect(await db.strengthMilestones.count()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Archiver" }));
    fireEvent.click(await screen.findByRole("button", { name: /Changement de matériel/ }));

    expect(await screen.findByText(/Archivée le .* — Changement de matériel/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Nouvelle version" }));
    fireEvent.change(field("Incrément (kg, total)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer la version" }));

    expect(await screen.findByText(/V3 · Charge croissante/)).toBeTruthy();
    await waitFor(async () => expect(await db.strengthFrames.get("f1")).toMatchObject({ activeVersionId: "f1-v3" }));
    expect(await db.strengthFrameVersions.count()).toBe(3);
  });
});
