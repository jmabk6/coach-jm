import { describe, expect, it } from "vitest";
import { exerciseCatalog } from "./exerciseCatalog";

describe("exerciseCatalog", () => {
  it("contient les 42 exercices officiels", () => {
    expect(exerciseCatalog).toHaveLength(42);
  });

  it("utilise uniquement des identifiants uniques", () => {
    const ids = exerciseCatalog.map(
      (exercise) => exercise.id,
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contient la répartition attendue par catégorie", () => {
    const counts = exerciseCatalog.reduce<
      Record<string, number>
    >((result, exercise) => {
      result[exercise.category] =
        (result[exercise.category] ?? 0) + 1;

      return result;
    }, {});

    expect(counts).toEqual({
      Musculation: 27,
      Cardio: 4,
      Mobilité: 8,
      "Test mobilité": 3,
    });
  });

  it("conserve les identifiants historiques utiles", () => {
    const ids = exerciseCatalog.map(
      (exercise) => exercise.id,
    );

    expect(ids).toContain("squat");
    expect(ids).toContain("tirage-vertical");
    expect(ids).toContain("planche");
    expect(ids).toContain("tapis");
  });

  it("utilise les équipements cardio dédiés", () => {
    const cardio = exerciseCatalog.filter(
      (exercise) => exercise.category === "Cardio",
    );

    expect(
      cardio.map((exercise) => exercise.equipment),
    ).toEqual([
      "Tapis",
      "Vélo",
      "Vélo elliptique",
      "Rameur",
    ]);
  });

  it("définit les libellés des tests de mobilité", () => {
    const doigtsSol = exerciseCatalog.find(
      (exercise) => exercise.id === "test-doigts-sol",
    );

    const apley = exerciseCatalog.find(
      (exercise) => exercise.id === "test-apley",
    );

    const papillon = exerciseCatalog.find(
      (exercise) => exercise.id === "test-papillon",
    );

    expect(doigtsSol?.measurementLabels).toEqual({
      value: "Distance doigts-sol",
    });

    expect(apley?.measurementLabels).toEqual({
      left: "Bras gauche en haut",
      right: "Bras droit en haut",
    });

    expect(papillon?.measurementLabels).toEqual({
      left: "Genou gauche",
      right: "Genou droit",
    });
  });
});