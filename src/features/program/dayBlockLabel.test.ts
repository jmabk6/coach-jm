import { describe, expect, it } from "vitest";
import type { Exercise } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { dayBlockLabel } from "./dayBlockLabel";
import { PROGRAM_V1_TEMPLATES } from "./programV1";

/**
 * Lot F.3 bis — libellés des blocs dans la fiche d'un jour (M3) :
 * « Échauffement », la consigne ou la note courte, jamais le nom de
 * l'exercice répété.
 */

const exerciseById = new Map<string, Exercise>(exerciseCatalog.map((exercise) => [exercise.id, exercise]));

function labels(templateId: string): string[] {
  const template = PROGRAM_V1_TEMPLATES.find((item) => item.id === templateId)!;
  return [...template.blocks]
    .sort((a, b) => a.position - b.position)
    .filter((block) => block.kind !== "note")
    .map((block, index) => dayBlockLabel(block, exerciseById, index));
}

describe("fiche d'un jour : libellé des blocs", () => {
  it("Cardio A : un seul bloc de tapis, ses trois paliers résumés (décision du 24/09/2026)", () => {
    expect(labels("v1-cardio-a")).toEqual(["Tapis de course · 3 paliers · 45 min · 4,5 à 5 km/h · 0 à 8 %"]);
  });

  it("Muscu A : l'échauffement, puis chaque exercice avec sa consigne, sans le repos", () => {
    expect(labels("v1-muscu-a")).toEqual([
      "Échauffement",
      "Traction assistée · 3 séries · 6–8 reps",
      "Squat barre · 3 séries · 8–10 reps",
      "Rowing poulie basse assis · 3 séries · 8–12 reps",
      "Chest press machine · 3 séries · 8–12 reps",
      "Leg curl assis · 3 séries · 10–12 reps",
      "Élévations latérales haltères · 2 séries · 12–15 reps",
    ]);
  });

  it("Cardio B : une note longue ne sert pas de libellé ; plusieurs paliers résumés", () => {
    expect(labels("v1-cardio-b")).toEqual(["Vélo · 18 paliers · 39 min"]);
  });
});
