import { describe, expect, it } from "vitest";
import { exerciseCatalog } from "./exerciseCatalog";

describe("exerciseCatalog", () => {
  it("contient les 60 exercices officiels : les 48 d'origine, les 7 du programme V1 (lot D) et les 5 des routines du soir (lot K.0)", () => {
    expect(exerciseCatalog).toHaveLength(60);
    const routines = ["bird-dog", "crunch-inverse", "hollow-body-genoux", "etirement-epaule-main-dos", "papillon-assis"];
    expect(exerciseCatalog.filter((exercise) => routines.includes(exercise.id))).toHaveLength(5);
    const programV1 = ["traction-negative", "suspension-omoplates", "montee-banc", "chaise-60", "marche-laterale-elastique", "mollets-debout", "sprint-velo"];
    expect(exerciseCatalog.filter((exercise) => programV1.includes(exercise.id))).toHaveLength(7);
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
      Musculation: 39,
      Cardio: 6,
      Mobilité: 12,
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
      /* Sprints vélo (lot D). */
      "Vélo",
      "Vélo elliptique",
      "Rameur",
      "Poids du corps",
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