import { describe, expect, it } from "vitest";
import { sessionCategories } from "./sessionCategories";
import { categoryClassName } from "./sessionCategoryClass";

describe("catégories d'un modèle", () => {
  it("chaque catégorie affichable a une classe CSS et un slug sans espace ni accent ; plus de « Bilan de mobilité » (lot N, D2)", () => {
    expect(sessionCategories).toEqual(["Musculation", "Cardio", "Mobilité", "Routine"]);
    for (const category of sessionCategories) {
      const className = categoryClassName("session-card__icon", category);
      expect(className).toMatch(/^session-card__icon--[a-z]+$/);
    }
    expect(categoryClassName("session-form__category", "Mobilité")).toBe("session-form__category--mobilite");
  });
});
