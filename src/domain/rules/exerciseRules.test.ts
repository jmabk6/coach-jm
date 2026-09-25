import { describe, expect, it } from "vitest";
import type { Exercise } from "../models";
import { exerciseCatalog } from "../../features/exercises/exerciseCatalog";
import {
  allowedProgressionGroups,
  checkClassification,
  classificationErrors,
  classificationWarnings,
  formatClassification,
  isClassificationValid,
  MOVEMENT_FAMILIES,
  PROGRESSION_GROUPS_BY_ZONE,
} from "./exerciseRules";

describe("règles de classification (v1.5, § 2.1)", () => {
  it("table zone → groupes de progression, fermée", () => {
    expect(PROGRESSION_GROUPS_BY_ZONE).toEqual({
      Jambes: ["Quadriceps", "Ischio-jambiers", "Fessiers"],
      Dos: ["Dos"],
      Pecs: ["Pectoraux"],
      Épaules: ["Épaules"],
      Bras: ["Bras"],
      Core: ["Abdominaux"],
    });
    expect(allowedProgressionGroups(undefined)).toEqual([]);
    expect(MOVEMENT_FAMILIES).toHaveLength(4);
  });

  it("un groupe hors de la zone, ou sans zone, est une erreur ; vide est valide", () => {
    expect(classificationErrors({ category: "Musculation", zone: "Dos", movement: "Tirage", progressionGroup: "Quadriceps" })).toEqual([
      "Le groupe « Quadriceps » n'appartient pas à la zone Dos (attendu : Dos).",
    ]);
    expect(classificationErrors({ category: "Cardio", progressionGroup: "Dos" })[0]).toMatch(/suppose une zone musculaire/);
    expect(classificationErrors({ category: "Mobilité", movementFamily: "tirage_vertical" })[0]).toMatch(/ne concerne que la musculation/);
    expect(isClassificationValid({ category: "Musculation", zone: "Jambes", movement: "Squat" })).toBe(true);
    expect(isClassificationValid({ category: "Musculation", zone: "Jambes", movement: "Charnière", progressionGroup: "Fessiers" })).toBe(true);
  });

  it("une famille inhabituelle pour le mouvement donne un avertissement, jamais une erreur", () => {
    const pullWithPush = { category: "Musculation" as const, zone: "Dos" as const, movement: "Tirage" as const, movementFamily: "poussee_verticale" as const };
    expect(classificationErrors(pullWithPush)).toEqual([]);
    expect(classificationWarnings(pullWithPush)).toEqual(["Famille « Poussée verticale » inhabituelle pour un mouvement Tirage : à vérifier."]);
    expect(classificationWarnings({ category: "Musculation", zone: "Pecs", movement: "Poussée", movementFamily: "tirage_horizontal" })).toHaveLength(1);
    expect(classificationWarnings({ category: "Musculation", zone: "Bras", movement: "Isolation", movementFamily: "poussee_verticale" })[0]).toMatch(/n'en ont normalement pas/);
    /* Cohérents : rien. */
    expect(checkClassification({ category: "Musculation", zone: "Dos", movement: "Tirage", progressionGroup: "Dos", movementFamily: "tirage_vertical" })).toEqual([]);
    expect(checkClassification({ category: "Musculation", zone: "Bras", movement: "Poussée", progressionGroup: "Bras", movementFamily: "poussee_verticale" })).toEqual([]);
  });

  it("formate « groupe · famille » seulement quand renseigné", () => {
    expect(formatClassification({ progressionGroup: "Quadriceps", movementFamily: "poussee_verticale" })).toBe("Quadriceps · Poussée verticale");
    expect(formatClassification({ progressionGroup: "Dos" })).toBe("Dos");
    expect(formatClassification({ movementFamily: "tirage_horizontal" })).toBe("Tirage horizontal");
    expect(formatClassification({})).toBeUndefined();
  });
});

describe("catalogue officiel — classification validée le 20/09/2026", () => {
  const catalog = exerciseCatalog as readonly Exercise[];

  it("les 39 exercices de musculation (30 + 6 du lot D + 3 du lot K.0) ont un groupe cohérent avec leur zone ; les 21 autres n'ont ni groupe ni famille", () => {
    const strength = catalog.filter((e) => e.category === "Musculation");
    const others = catalog.filter((e) => e.category !== "Musculation");
    expect(strength).toHaveLength(39);
    expect(others).toHaveLength(21);
    /* Lot D : mollets debout n'a pas de groupe — la table n'en prévoit aucun pour les mollets. */
    const withoutGroup = ["mollets-debout"];
    for (const exercise of strength) {
      if (withoutGroup.includes(exercise.id)) expect(exercise.progressionGroup, exercise.id).toBeUndefined();
      else expect(exercise.progressionGroup, exercise.id).toBeDefined();
      expect(checkClassification(exercise), exercise.id).toEqual([]);
    }
    for (const exercise of others) {
      expect(exercise.progressionGroup, exercise.id).toBeUndefined();
      expect(exercise.movementFamily, exercise.id).toBeUndefined();
    }
  });

  it("instantané du tableau approuvé : Jambes par exercice, familles attribuées, aucune ailleurs", () => {
    const byId = new Map(catalog.map((e) => [e.id, e]));
    const g = (id: string) => byId.get(id)?.progressionGroup;
    const f = (id: string) => byId.get(id)?.movementFamily;

    expect([g("squat"), g("presse-cuisses")]).toEqual(["Quadriceps", "Quadriceps"]);
    expect([g("leg-curl-assis"), g("souleve-terre-roumain")]).toEqual(["Ischio-jambiers", "Ischio-jambiers"]);
    expect(g("hip-thrust")).toBe("Fessiers");
    /* Lot D. */
    expect([g("montee-banc"), g("chaise-60"), g("marche-laterale-elastique")]).toEqual(["Quadriceps", "Quadriceps", "Fessiers"]);
    for (const id of ["planche", "planche-laterale", "dead-bug", "pallof-press", "crunch-poulie"]) expect(g(id), id).toBe("Abdominaux");

    const families = Object.fromEntries(catalog.filter((e) => e.movementFamily).map((e) => [e.id, e.movementFamily]));
    expect(families).toEqual({
      "tirage-vertical": "tirage_vertical",
      "traction-assistee": "tirage_vertical",
      "traction-negative": "tirage_vertical",
      "suspension-omoplates": "tirage_vertical",
      "rowing-poulie-basse": "tirage_horizontal",
      "rowing-haltere-unilateral": "tirage_horizontal",
      "face-pull": "tirage_horizontal",
      "chest-press": "poussee_horizontale",
      "developpe-couche-barre": "poussee_horizontale",
      "developpe-incline-halteres": "poussee_horizontale",
      pompes: "poussee_horizontale",
      "developpe-epaules-machine": "poussee_verticale",
      "developpe-militaire-halteres": "poussee_verticale",
      "dips-assistes": "poussee_verticale",
    });
    /* Décisions explicites : pullover sans famille ; squats, charnières, isolations, gainages sans famille. */
    expect(f("pullover-poulie")).toBeUndefined();
    for (const id of ["squat", "presse-cuisses", "hip-thrust", "souleve-terre-roumain", "leg-curl-assis", "ecarte-poulie", "elevations-laterales-halteres", "curl-halteres", "planche"]) {
      expect(f(id), id).toBeUndefined();
    }
    /* Aucun avertissement mouvement / famille sur le catalogue. */
    expect(catalog.flatMap((e) => classificationWarnings(e))).toEqual([]);
  });
});
