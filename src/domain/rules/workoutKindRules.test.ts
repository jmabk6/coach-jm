import { describe, expect, it } from "vitest";
import { sessionCategories } from "../../features/sessions/sessionCategories";
import { categoryClassName } from "../../features/sessions/sessionCategoryClass";
import { buildImportedWorkouts } from "../../features/history/importedWorkouts";
import { isAssessmentCategory, isMobilityAssessment, kindForCategory, workoutKindOf } from "./workoutKindRules";

describe("nature d'une séance (kind)", () => {
  it("dérive kind de la catégorie du modèle : seul « Bilan de mobilité » donne un bilan", () => {
    expect(kindForCategory("Musculation")).toBe("training");
    expect(kindForCategory("Cardio")).toBe("training");
    expect(kindForCategory("Mobilité")).toBe("training");
    expect(kindForCategory("Bilan de mobilité")).toBe("mobility_assessment");
    expect(isAssessmentCategory("Bilan de mobilité")).toBe(true);
    expect(isAssessmentCategory("Mobilité")).toBe(false);
    expect(isAssessmentCategory(undefined)).toBe(false);
  });

  it("kind absent = entraînement : les séances antérieures au lot 2 ne changent pas de nature", () => {
    for (const workout of buildImportedWorkouts()) {
      expect("kind" in workout).toBe(false);
      expect(workoutKindOf(workout)).toBe("training");
      expect(isMobilityAssessment(workout)).toBe(false);
    }
    expect(workoutKindOf({ kind: "training" })).toBe("training");
    expect(workoutKindOf({ kind: "mobility_assessment" })).toBe("mobility_assessment");
    expect(isMobilityAssessment({ kind: "mobility_assessment" })).toBe(true);
  });

  it("chaque catégorie affichable a une classe CSS et un slug sans espace ni accent", () => {
    expect(sessionCategories).toEqual(["Musculation", "Cardio", "Mobilité", "Bilan de mobilité"]);
    for (const category of sessionCategories) {
      const className = categoryClassName("session-card__icon", category);
      expect(className).toMatch(/^session-card__icon--[a-z]+$/);
    }
    expect(categoryClassName("session-card__icon", "Bilan de mobilité")).toBe("session-card__icon--bilan");
    expect(categoryClassName("session-form__category", "Mobilité")).toBe("session-form__category--mobilite");
  });
});
