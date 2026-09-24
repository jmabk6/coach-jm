import { describe, expect, it } from "vitest";
import type { Exercise, MeasurementType } from "../../domain";
import { exerciseCatalog } from "./exerciseCatalog";
import { updateExercise } from "./updateExercise";

/**
 * Modifier un exercice ne perd pas ce que le formulaire ne montre pas :
 * sens de la charge (`loadSemantics`), libellés de mesure hors cm,
 * unité fixée d'un effort en puissance.
 */

const byId = (id: string) => exerciseCatalog.find((exercise) => exercise.id === id) as Exercise;

/** Édition « à l'identique » : les champs du formulaire tels que l'écran les charge, nom modifié. */
function edit(current: Exercise, changes: { name?: string; measurementType?: MeasurementType } = {}): Exercise {
  return updateExercise(
    current,
    changes.name ?? current.name,
    current.category,
    current.zone ?? "Dos",
    current.movement ?? "Tirage",
    current.equipment ?? "Machine",
    current.location,
    changes.measurementType ?? current.measurementType,
    "steps",
    current.media?.photoUrl ?? "",
    current.media?.videoUrl ?? "",
    current.technique ?? "",
    current.description ?? "",
    (current.muscles ?? []).join(", "),
    current.advice ?? "",
    current.pinnedAlternativeExerciseIds ?? [],
    current.measurementLabels?.value ?? "",
    current.measurementLabels?.left ?? "",
    current.measurementLabels?.right ?? "",
    current.progressionGroup,
    current.movementFamily,
  );
}

describe("updateExercise — champs conservés", () => {
  it("traction assistée renommée : reste une assistance", () => {
    const updated = edit(byId("traction-assistee"), { name: "Traction assistée (machine 2)" });
    expect(updated.name).toBe("Traction assistée (machine 2)");
    expect(updated.loadSemantics).toBe("assistance");
  });

  it("exercice créé par l'utilisateur, en assistance : conservée à chaque modification", () => {
    const mine: Exercise = { ...byId("dips-assistes"), id: "dips-perso", name: "Dips perso", loadSemantics: "assistance" };
    expect(edit(edit(mine, { name: "Dips perso 2" })).loadSemantics).toBe("assistance");
  });

  it("la mesure n'est plus une charge : le sens de la charge disparaît avec elle", () => {
    expect(edit(byId("traction-assistee"), { measurementType: "reps" }).loadSemantics).toBeUndefined();
  });

  it("marche latérale : le libellé « pas » survit à une modification ; il tombe si la mesure change", () => {
    expect(edit(byId("marche-laterale-elastique")).measurementLabels).toEqual({ value: "pas" });
    expect(edit(byId("marche-laterale-elastique"), { measurementType: "reps" }).measurementLabels).toBeUndefined();
  });

  it("sprints vélo : l'unité fixée reste fixée", () => {
    expect(edit({ ...byId("sprint-velo"), powerUnit: "meters" }).powerUnit).toBe("meters");
  });

  it("tests de mobilité : les libellés en cm suivent toujours le formulaire", () => {
    const apley = byId("test-apley");
    expect(edit(apley).measurementLabels).toEqual(apley.measurementLabels);
  });
});
