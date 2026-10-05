import { describe, expect, it } from "vitest";
import type { Food } from "../models";
import {
  addScreenSections,
  defaultReferenceQuantity,
  emptyFoodForm,
  foodFormOf,
  normalizeSearch,
  parseFoodForm,
  searchFoods,
  suggestedQuantity,
  UNIT_CHOICES,
  unitText,
} from "./foodLibraryRules";
import { formatQuantity } from "./journalRules";
import { entryFromFood } from "./nutritionRules";

/**
 * Bibliothèque d'aliments (phase 3A.3) — règles pures : recherche (sans
 * accents ni casse, favoris d'abord), sections de l'écran Ajouter (un
 * aliment une seule fois), unités (nature technique + libellé, pluriel
 * facultatif, aucune grammaire automatique), formulaire d'aliment.
 */

const T = "2026-10-05T07:00:00.000Z";

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return { id, name, unit: "g", referenceQuantity: 100, nutrients: { kcal: 100 }, status: "active", createdAt: T, updatedAt: T, ...extra };
}

const THON = food("thon", "Thon tomate", { unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1, nutrients: { kcal: 176, proteinG: 25 }, defaultQuantity: 1 });

describe("recherche", () => {
  it("sans accents ni casse ; favoris d'abord puis ordre alphabétique ; archivés exclus", () => {
    expect(normalizeSearch("  Crème BRÛLÉE ")).toBe("creme brulee");
    const foods = [
      food("a", "Épinards"), food("b", "Pâtes complètes"), food("c", "Pain de mie", { favorite: true }),
      food("d", "Pastèque"), food("e", "Pâte à tartiner", { status: "archived" }),
    ];
    expect(searchFoods(foods, "pa").map((item) => item.name)).toEqual(["Pain de mie", "Pastèque", "Pâtes complètes"]);
    expect(searchFoods(foods, "EPINA").map((item) => item.name)).toEqual(["Épinards"]);
    expect(searchFoods(foods, "complete").map((item) => item.name)).toEqual(["Pâtes complètes"]);
    expect(searchFoods(foods, "zzz")).toEqual([]);
  });
});

describe("écran Ajouter", () => {
  it("Favoris, puis Récents (au plus 8, sans les favoris), puis Autres aliments : chacun une seule fois", () => {
    const foods = Array.from({ length: 14 }, (_, index) => food(`f${index}`, `Aliment ${String.fromCharCode(65 + index)}`, index < 2 ? { favorite: true } : {}));
    const recents = ["f1", "f5", "f3", "f9", "f2", "f4", "f6", "f7", "f8", "f10", "f11"].map((id) => foods.find((item) => item.id === id)!);
    const sections = addScreenSections(foods, recents);
    expect(sections.favorites.map((item) => item.id)).toEqual(["f0", "f1"]);
    expect(sections.recents.map((item) => item.id)).toEqual(["f5", "f3", "f9", "f2", "f4", "f6", "f7", "f8"]);
    expect(sections.others.map((item) => item.id)).toEqual(["f10", "f11", "f12", "f13"]);
    const all = [...sections.favorites, ...sections.recents, ...sections.others].map((item) => item.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(14);
  });

  it("aliments archivés jamais proposés, même récents", () => {
    const archived = food("x", "Ancien", { status: "archived" });
    const sections = addScreenSections([archived, food("y", "Actif")], [archived]);
    expect([...sections.favorites, ...sections.recents, ...sections.others].map((item) => item.id)).toEqual(["y"]);
  });
});

describe("unités", () => {
  it("choix proposés : g, ml, pièce, boîte, barre, paquet, pot, tranche, autre ; nature technique + libellé", () => {
    expect(UNIT_CHOICES.map((choice) => choice.key)).toEqual(["g", "ml", "piece", "boite", "barre", "paquet", "pot", "tranche", "other"]);
    expect(UNIT_CHOICES.find((choice) => choice.key === "boite")).toMatchObject({ unit: "piece", label: "boîte", plural: "boîtes" });
    expect(defaultReferenceQuantity("g")).toBe(100);
    expect(defaultReferenceQuantity("ml")).toBe(100);
    expect(defaultReferenceQuantity("piece")).toBe(100 / 100);
  });

  it("affichage : g et ml tels quels ; libellé et pluriel enregistrés, jamais de pluriel inventé", () => {
    expect(formatQuantity(250, "g")).toBe("250 g");
    expect(formatQuantity(1, "piece", { unitLabel: "boîte", unitLabelPlural: "boîtes" })).toBe("1 boîte");
    expect(formatQuantity(2, "piece", { unitLabel: "boîte", unitLabelPlural: "boîtes" })).toBe("2 boîtes");
    expect(formatQuantity(1.5, "piece", { unitLabel: "barre", unitLabelPlural: "barres" })).toBe("1,5 barre");
    expect(formatQuantity(3, "piece", { unitLabel: "sachet" })).toBe("3 sachet");
    expect(formatQuantity(2, "piece")).toBe("2 pièces");
    expect(unitText(THON, 1)).toBe("boîte");
    expect(unitText(THON, 2)).toBe("boîtes");
    expect(unitText(food("fb", "Fromage blanc"), 250)).toBe("g");
  });

  it("la ligne du journal fige le libellé : renommer l'unité de l'aliment ne change rien", () => {
    const source = structuredClone(THON);
    const entry = entryFromFood(source, { id: "e", date: "2026-10-05", slot: "lunch", quantity: 2, now: T });
    expect(entry).toMatchObject({ unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", name: "Thon tomate" });
    const snapshot = structuredClone(entry);
    source.unitLabel = "conserve";
    source.unitLabelPlural = "conserves";
    source.unit = "g";
    source.name = "Thon à la tomate";
    expect(entry).toEqual(snapshot);
    const plain = entryFromFood(food("fb", "Fromage blanc"), { id: "p", date: "2026-10-05", slot: "lunch", quantity: 250, now: T });
    expect(plain).not.toHaveProperty("unitLabel");
  });
});

describe("formulaire d'aliment", () => {
  it("nouvel aliment : g par défaut, valeurs pour 100 ; une unité comptée : valeurs pour 1", () => {
    expect(emptyFoodForm("Thon")).toMatchObject({ name: "Thon", choice: "g", referenceQuantity: "100", kcal: "", favorite: false });
  });

  it("Thon tomate pour 1 boîte : piece + libellé + pluriel, macros inconnues absentes, quantité habituelle, favori", () => {
    const parsed = parseFoodForm({ ...emptyFoodForm(""), name: " Thon tomate ", choice: "boite", referenceQuantity: "1", kcal: "176", proteinG: "25", defaultQuantity: "1", favorite: true });
    expect(parsed).toEqual({
      ok: true,
      values: { name: "Thon tomate", unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1, nutrients: { kcal: 176, proteinG: 25 }, defaultQuantity: 1, favorite: true },
    });
    const yaourt = parseFoodForm({ ...emptyFoodForm(""), name: "Fromage blanc", kcal: "46", proteinG: "8", carbsG: "3,9", fatG: "0,1" });
    expect(yaourt).toEqual({ ok: true, values: { name: "Fromage blanc", unit: "g", referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 }, favorite: false } });
  });

  it("unité libre : singulier obligatoire, pluriel facultatif", () => {
    expect(parseFoodForm({ ...emptyFoodForm(""), name: "Thé", choice: "other", otherLabel: " sachet ", referenceQuantity: "1", kcal: "2" })).toMatchObject({
      ok: true, values: { unit: "piece", unitLabel: "sachet" },
    });
    expect(parseFoodForm({ ...emptyFoodForm(""), name: "Thé", choice: "other", otherLabel: "", referenceQuantity: "1", kcal: "2" })).toEqual({ ok: false, message: "Unité : préciser le nom." });
    expect(parseFoodForm({ ...emptyFoodForm(""), name: "Œuf", choice: "other", otherLabel: "œuf", otherPlural: "œufs", referenceQuantity: "1", kcal: "72" })).toMatchObject({
      ok: true, values: { unitLabel: "œuf", unitLabelPlural: "œufs" },
    });
    expect(parseFoodForm({ ...emptyFoodForm(""), name: "Œuf", choice: "piece", referenceQuantity: "1", kcal: "72" })).toMatchObject({ ok: true, values: { unit: "piece" } });
    expect((parseFoodForm({ ...emptyFoodForm(""), name: "Œuf", choice: "piece", referenceQuantity: "1", kcal: "72" }) as { values: object }).values).not.toHaveProperty("unitLabel");
  });

  it("refus en français : nom, calories, quantité de référence, quantité habituelle", () => {
    const base = { ...emptyFoodForm(""), name: "X", kcal: "100" };
    expect(parseFoodForm({ ...base, name: " " })).toEqual({ ok: false, message: "Nom de l'aliment : obligatoire." });
    expect(parseFoodForm({ ...base, kcal: "" })).toEqual({ ok: false, message: "Calories : obligatoires." });
    expect(parseFoodForm({ ...base, kcal: "abc" })).toEqual({ ok: false, message: "Calories : nombre illisible." });
    expect(parseFoodForm({ ...base, referenceQuantity: "0" })).toEqual({ ok: false, message: "Quantité de référence : supérieure à 0." });
    expect(parseFoodForm({ ...base, defaultQuantity: "0" })).toEqual({ ok: false, message: "Quantité habituelle : supérieure à 0." });
    expect(parseFoodForm({ ...base, proteinG: "-1" })).toEqual({ ok: false, message: "Protéines : nombre illisible." });
  });

  it("quantité à consommer proposée : l'habituelle si elle est valable, sinon la référence", () => {
    expect(suggestedQuantity({ referenceQuantity: "100", defaultQuantity: "" })).toBe("100");
    expect(suggestedQuantity({ referenceQuantity: "100", defaultQuantity: "150" })).toBe("150");
    expect(suggestedQuantity({ referenceQuantity: "1", defaultQuantity: "abc" })).toBe("1");
    expect(suggestedQuantity({ referenceQuantity: "", defaultQuantity: "" })).toBe("");
  });

  it("modifier un aliment : formulaire prérempli depuis l'aliment (unité reconnue, ou libre)", () => {
    expect(foodFormOf(THON)).toMatchObject({ name: "Thon tomate", choice: "boite", referenceQuantity: "1", kcal: "176", proteinG: "25", carbsG: "", defaultQuantity: "1", favorite: false });
    expect(foodFormOf(food("t", "Thé", { unit: "piece", unitLabel: "sachet", referenceQuantity: 1 }))).toMatchObject({ choice: "other", otherLabel: "sachet", otherPlural: "" });
    expect(foodFormOf(food("f", "Fromage", { favorite: true, nutrients: { kcal: 46, carbsG: 3.9 } }))).toMatchObject({ choice: "g", referenceQuantity: "100", carbsG: "3,9", favorite: true });
  });
});
