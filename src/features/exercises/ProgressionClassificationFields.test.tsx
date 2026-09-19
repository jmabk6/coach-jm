// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { buildExercise } from "./buildExercise";
import { ExerciseCreateScreen } from "./ExerciseCreateScreen";
import { ExerciseDetailScreen } from "./ExerciseDetailScreen";
import { ProgressionClassificationFields } from "./ProgressionClassificationFields";

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

function select(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("champs de classification de progression", () => {
  it("propose les groupes de la zone, les quatre familles, et un avertissement non bloquant", () => {
    let group: string | undefined;
    let family: string | undefined;
    const { rerender } = render(
      <ProgressionClassificationFields
        zone="Jambes"
        movement="Tirage"
        progressionGroup={undefined}
        movementFamily={undefined}
        onProgressionGroupChange={(v) => (group = v)}
        onMovementFamilyChange={(v) => (family = v)}
      />,
    );

    const groupSelect = screen.getByLabelText("Groupe de progression") as HTMLSelectElement;
    expect([...groupSelect.options].map((o) => o.textContent)).toEqual(["Aucun", "Quadriceps", "Ischio-jambiers", "Fessiers"]);
    const familySelect = screen.getByLabelText("Famille de mouvement") as HTMLSelectElement;
    expect([...familySelect.options].map((o) => o.textContent)).toEqual(["Aucune", "Tirage horizontal", "Tirage vertical", "Poussée horizontale", "Poussée verticale"]);
    expect(screen.queryByRole("status")).toBeNull();

    select("Groupe de progression", "Fessiers");
    select("Famille de mouvement", "poussee_verticale");
    expect(group).toBe("Fessiers");
    expect(family).toBe("poussee_verticale");

    rerender(
      <ProgressionClassificationFields
        zone="Jambes"
        movement="Tirage"
        progressionGroup="Fessiers"
        movementFamily="poussee_verticale"
        onProgressionGroupChange={() => undefined}
        onMovementFamilyChange={() => undefined}
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/Famille « Poussée verticale » inhabituelle pour un mouvement Tirage/);
  });
});

describe("création d'un exercice avec classification", () => {
  it("enregistre groupe et famille ; changer de zone vide un groupe devenu invalide", async () => {
    await db.delete();
    await db.open();
    render(
      <MemoryRouter initialEntries={["/exercises/new"]}>
        <Routes>
          <Route path="/exercises/new" element={<ExerciseCreateScreen />} />
          <Route path="/exercises/:exerciseId" element={<ExerciseDetailScreen />} />
          <Route path="/exercises" element={<p>liste</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Nom/), { target: { value: "Fentes bulgares" } });
    select("Zone", "Jambes");
    select("Mouvement", "Squat");
    select("Groupe de progression", "Fessiers");
    expect((screen.getByLabelText("Groupe de progression") as HTMLSelectElement).value).toBe("Fessiers");

    /* Zone → Dos : « Fessiers » n'y appartient pas, le groupe est vidé. */
    select("Zone", "Dos");
    expect((screen.getByLabelText("Groupe de progression") as HTMLSelectElement).value).toBe("");
    select("Groupe de progression", "Dos");
    select("Mouvement", "Tirage");
    select("Famille de mouvement", "tirage_horizontal");

    fireEvent.click(screen.getByRole("button", { name: /Créer l'exercice|Enregistrer|Créer/ }));

    await waitFor(async () => expect(await db.exercises.count()).toBe(1));
    const saved = (await db.exercises.toArray())[0]!;
    expect(saved).toMatchObject({ name: "Fentes bulgares", zone: "Dos", movement: "Tirage", progressionGroup: "Dos", movementFamily: "tirage_horizontal" });

    /* La fiche affiche « Groupe · Famille ». */
    expect(await screen.findByText("Dos · Tirage horizontal")).toBeTruthy();
  });

  it("buildExercise refuse une combinaison zone / groupe invalide et ignore la classification hors musculation", () => {
    expect(() =>
      buildExercise("x", "X", "Musculation", "Dos", "Tirage", "Poulie", "Salle", "load_reps", "steps", { progressionGroup: "Quadriceps" }),
    ).toThrow(/n'appartient pas à la zone Dos/);
    const cardio = buildExercise("y", "Y", "Cardio", "Jambes", "Squat", "Tapis", "Salle", "duration_speed_incline", "steps", { progressionGroup: "Quadriceps" });
    expect("progressionGroup" in cardio).toBe(false);
    const plain = buildExercise("z", "Z", "Musculation", "Jambes", "Squat", "Barre", "Salle", "load_reps", "steps");
    expect("progressionGroup" in plain).toBe(false);
    expect("movementFamily" in plain).toBe(false);
  });
});
