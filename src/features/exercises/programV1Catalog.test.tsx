// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { Exercise } from "../../domain";
import { checkClassification } from "../../domain/rules/exerciseRules";
import { WRITE_METHODS, writePrototypeOf } from "../backup/testDatabase";
import { canonicalStringify } from "../backup/canonicalJson";
import { sessionCategories } from "../sessions/sessionCategories";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import { SeriesForm } from "../workout/SeriesForm";
import { exerciseCatalog } from "./exerciseCatalog";

vi.stubEnv("BASE_URL", "/coach-jm/");
const { seedExerciseCatalog } = await import("./seedExerciseCatalog");

/**
 * Lot D.4 — catégorie « Routine » et les 7 exercices du programme V1
 * (conception V2 § 2.5) ; seed 1 étendu : ajouts seulement, rejoué sans
 * écriture.
 */

const PROGRAM_V1 = {
  "traction-negative": { category: "Musculation", zone: "Dos", movement: "Tirage", equipment: "Poids du corps", measurementType: "reps_duration" },
  "suspension-omoplates": { category: "Musculation", zone: "Dos", movement: "Tirage", equipment: "Poids du corps", measurementType: "duration" },
  "montee-banc": { category: "Musculation", zone: "Jambes", movement: "Squat", equipment: "Poids du corps", measurementType: "reps_per_side" },
  "chaise-60": { category: "Musculation", zone: "Jambes", movement: "Squat", equipment: "Poids du corps", measurementType: "duration" },
  "marche-laterale-elastique": { category: "Musculation", zone: "Jambes", movement: "Isolation", equipment: "Élastique", measurementType: "reps_per_side" },
  "mollets-debout": { category: "Musculation", zone: "Jambes", movement: "Isolation", equipment: "Machine", measurementType: "load_reps" },
  "sprint-velo": { category: "Cardio", equipment: "Vélo", measurementType: "duration_power" },
} as const;

const newIds = Object.keys(PROGRAM_V1);
const byId = new Map<string, Exercise>(exerciseCatalog.map((exercise) => [exercise.id, exercise]));

afterEach(cleanup);
afterAll(() => vi.unstubAllEnvs());

describe("catalogue : les 7 exercices du programme V1", () => {
  it("classification et mesure conformes à la conception, classification valide, sans média", () => {
    for (const [id, expected] of Object.entries(PROGRAM_V1)) {
      const exercise = byId.get(id);
      expect(exercise, id).toMatchObject({ ...expected, mode: "series", status: "active" });
      expect(checkClassification(exercise!), id).toEqual([]);
      expect(exercise?.media, id).toBeUndefined();
    }
    expect(byId.get("marche-laterale-elastique")?.measurementLabels).toEqual({ value: "pas" });
    /* Aucun groupe « Mollets » : mollets debout reste sans groupe. */
    expect(byId.get("mollets-debout")?.progressionGroup).toBeUndefined();
    expect(byId.get("traction-negative")).toMatchObject({ progressionGroup: "Dos", movementFamily: "tirage_vertical" });
  });

  it("« Tirage bras tendus » est le pullover poulie existant : pas de doublon", () => {
    expect(exerciseCatalog.filter((exercise) => /bras tendus/i.test(exercise.name)).map((exercise) => exercise.id)).toEqual(["pullover-poulie"]);
  });
});

describe("catégorie « Routine »", () => {
  it("proposée dans les listes, avec sa classe et son icône", () => {
    expect(sessionCategories).toContain("Routine");
    expect(categoryClassName("session-card__icon", "Routine")).toBe("session-card__icon--routine");
  });

  it("saisie par côté de la marche latérale : l'unité est « pas »", () => {
    render(<SeriesForm layout="reps_per_side" initial={{}} sideRepsUnit="pas" submitLabel="Valider" onSubmit={() => undefined} />);
    expect(screen.getAllByText("pas")).toHaveLength(2);
  });
});

describe("seed 1 étendu, sur une base qui a déjà les 48 exercices d'origine", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("ajoute les 7 nouveaux sans toucher aux 48 autres ; second passage sans écriture", async () => {
    const original = exerciseCatalog.filter((exercise) => !newIds.includes(exercise.id));
    await db.exercises.bulkAdd(original);
    const before = canonicalStringify(await db.exercises.orderBy("id").toArray());

    await seedExerciseCatalog();

    const after = await db.exercises.orderBy("id").toArray();
    expect(after).toHaveLength(exerciseCatalog.length);
    expect(canonicalStringify(after.filter((exercise) => !newIds.includes(exercise.id)))).toBe(before);
    expect(after.filter((exercise) => newIds.includes(exercise.id)).map((exercise) => exercise.id).sort()).toEqual([...newIds].sort());

    const spies = WRITE_METHODS.map((method) => vi.spyOn(writePrototypeOf(db), method));
    await seedExerciseCatalog();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("un libellé de mesure absent est complété ; présent, il n'est jamais écrasé", async () => {
    const withoutLabel = { ...byId.get("marche-laterale-elastique")! };
    delete withoutLabel.measurementLabels;
    await db.exercises.put(withoutLabel);
    await seedExerciseCatalog();
    expect((await db.exercises.get("marche-laterale-elastique"))?.measurementLabels).toEqual({ value: "pas" });

    await db.exercises.put({ ...withoutLabel, measurementLabels: { value: "pas chassés" } });
    await seedExerciseCatalog();
    expect((await db.exercises.get("marche-laterale-elastique"))?.measurementLabels).toEqual({ value: "pas chassés" });
  });
});
