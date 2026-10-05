import { describe, expect, it } from "vitest";
import type { Food, FoodLogEntry, MealTemplate } from "../models";
import {
  editFormOf,
  moveId,
  parseTemplateForm,
  pickerFoods,
  searchTemplates,
  templateHealth,
  templateFromMeal,
  templateItemState,
  templateLines,
  templateSections,
  TEMPLATE_DEFAULT_SLOTS,
} from "./mealTemplateRules";
import { calculateNutrients, entryFromFood, estimatedExtraEntry } from "./nutritionRules";

/**
 * Repas favoris (phase 3A.4a) — règles pures : état de chaque élément
 * (prêt, archivé, unité modifiée), valeurs actuelles jamais stockées,
 * sections de l'écran Ajouter, création depuis un repas réellement
 * consommé (quantités totales, estimations et cas douteux exclus et cités).
 */

const T = "2026-10-05T07:00:00.000Z";

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return { id, name, unit: "g", referenceQuantity: 100, nutrients: { kcal: 111, proteinG: 14 }, status: "active", createdAt: T, updatedAt: T, ...extra };
}

const THON = food("f-thon", "Thon tomate (leader price)");
const TOAST = food("f-toast", "Toasts multi-céréales", { nutrients: { kcal: 385, proteinG: 15 } });

function template(id: string, name: string, extra: Partial<MealTemplate> = {}): MealTemplate {
  return {
    id, name, position: 0, status: "active", createdAt: T, updatedAt: T,
    items: [{ id: `${id}-1`, foodId: "f-thon", quantity: 320, unit: "g" }, { id: `${id}-2`, foodId: "f-toast", quantity: 40, unit: "g" }],
    ...extra,
  };
}

function line(f: Food, id: string, minute: number, quantity: number, slot: FoodLogEntry["slot"] = "lunch"): FoodLogEntry {
  return entryFromFood(f, { id, date: "2026-10-05", slot, quantity, now: `2026-10-05T11:${String(minute).padStart(2, "0")}:00.000Z` });
}

describe("éléments d'un repas favori", () => {
  it("prêt ; aliment archivé ; unité modifiée (nature ou libellé) ; aliment disparu", () => {
    const item = { id: "i", foodId: "f-thon", quantity: 320, unit: "g" as const };
    expect(templateItemState(item, THON)).toBe("ready");
    expect(templateItemState(item, { ...THON, status: "archived" })).toBe("archived");
    expect(templateItemState(item, { ...THON, unit: "piece", unitLabel: "boîte", referenceQuantity: 1 })).toBe("unit_changed");
    const boxed = { id: "b", foodId: "f-thon", quantity: 1, unit: "piece" as const, unitLabel: "boîte" };
    expect(templateItemState(boxed, { ...THON, unit: "piece", unitLabel: "conserve" })).toBe("unit_changed");
    expect(templateItemState(boxed, { ...THON, unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes" })).toBe("ready");
    expect(templateItemState(item, undefined)).toBe("missing");
  });

  it("valeurs actuelles des aliments, jamais stockées : modifier un aliment change l'affichage du favori", () => {
    const foods = new Map([[THON.id, THON], [TOAST.id, TOAST]]);
    const view = templateLines(template("m", "Déjeuner thon"), foods);
    expect(view.lines.map((entry) => [entry.food?.name, entry.state, entry.nutrients?.kcal])).toEqual([
      ["Thon tomate (leader price)", "ready", calculateNutrients(THON, 320).kcal],
      ["Toasts multi-céréales", "ready", calculateNutrients(TOAST, 40).kcal],
    ]);
    expect(view.totals.kcal).toBe(calculateNutrients(THON, 320).kcal + calculateNutrients(TOAST, 40).kcal);
    const lighter = new Map([[THON.id, { ...THON, nutrients: { kcal: 100, proteinG: 14 } }], [TOAST.id, TOAST]]);
    expect(templateLines(template("m", "Déjeuner thon"), lighter).lines[0]!.nutrients!.kcal).toBe(320);
    const archived = new Map([[THON.id, { ...THON, status: "archived" as const }], [TOAST.id, TOAST]]);
    const partial = templateLines(template("m", "Déjeuner thon"), archived);
    expect([partial.lines[0]!.state, partial.lines[0]!.nutrients]).toEqual(["archived", undefined]);
    expect(partial.totals.kcal).toBe(calculateNutrients(TOAST, 40).kcal);
    expect(partial.readyCount).toBe(1);
  });
});

describe("écran Ajouter", () => {
  it("repas habituel : aucun, petit-déjeuner, déjeuner, collation, dîner — pas Extras", () => {
    expect(TEMPLATE_DEFAULT_SLOTS).toEqual(["breakfast", "lunch", "snack", "dinner"]);
  });

  it("ceux de ce repas d'abord, puis sans repas habituel (dans leur ordre), les autres repliés ; archivés jamais", () => {
    const templates = [
      template("a", "Pdj", { defaultSlot: "breakfast", position: 0 }),
      template("b", "Thon", { defaultSlot: "lunch", position: 3 }),
      template("c", "Libre", { position: 1 }),
      template("d", "Poulet", { defaultSlot: "lunch", position: 2 }),
      template("e", "Ancien", { defaultSlot: "lunch", position: 4, status: "archived" }),
    ];
    const sections = templateSections(templates, "lunch");
    expect(sections.primary.map((item) => item.id)).toEqual(["d", "b", "c"]);
    expect(sections.others.map((item) => item.id)).toEqual(["a"]);
    expect(searchTemplates(templates, "THO").map((item) => item.id)).toEqual(["b"]);
    expect(searchTemplates(templates, "anc")).toEqual([]);
  });
});

describe("créer depuis un repas consommé", () => {
  const foods = (...extra: Food[]) => new Map([THON, TOAST, ...extra].map((item) => [item.id, item]));

  it("quantités totales affichées (lignes regroupées), ordre du repas ; estimation exclue et citée", () => {
    const entries = [
      line(THON, "t1", 1, 160), line(TOAST, "s1", 2, 20), line(THON, "t2", 3, 160), line(TOAST, "s2", 4, 20),
      estimatedExtraEntry({ id: "x", date: "2026-10-05", slot: "lunch", name: "Restaurant", nutrients: { kcal: 650 }, now: "2026-10-05T11:05:00.000Z" }),
    ];
    expect(templateFromMeal(entries, foods())).toEqual({
      items: [{ foodId: "f-thon", quantity: 320 }, { foodId: "f-toast", quantity: 40 }],
      skipped: [{ name: "Restaurant", reason: "estimation" }],
    });
  });

  it("même aliment, deux bases (aliment modifié entre-temps) : une seule quantité additionnée", () => {
    const before = line(THON, "t1", 1, 160);
    const after = line({ ...THON, nutrients: { kcal: 120, proteinG: 15 } }, "t2", 2, 100);
    expect(templateFromMeal([before, after], foods()).items).toEqual([{ foodId: "f-thon", quantity: 260 }]);
  });

  it("ligne d'une ancienne unité ou d'un aliment archivé : exclue et citée ; que des estimations : rien à reprendre", () => {
    const boxedNow = { ...THON, unit: "piece" as const, unitLabel: "boîte", referenceQuantity: 1 };
    const old = line(THON, "t1", 1, 160);
    const fresh = line(boxedNow, "t2", 2, 1);
    expect(templateFromMeal([old, fresh], foods(boxedNow))).toEqual({
      items: [{ foodId: "f-thon", quantity: 1 }],
      skipped: [{ name: "Thon tomate (leader price)", reason: "unit_changed" }],
    });
    expect(templateFromMeal([line(TOAST, "s", 1, 40)], foods({ ...TOAST, status: "archived" }))).toEqual({
      items: [],
      skipped: [{ name: "Toasts multi-céréales", reason: "archived" }],
    });
    const onlyEstimate = [estimatedExtraEntry({ id: "x", date: "2026-10-05", slot: "lunch", nutrients: { kcal: 650 }, now: T })];
    expect(templateFromMeal(onlyEstimate, foods()).items).toEqual([]);
  });
});

describe("Plus › Repas favoris (phase 3A.4b)", () => {
  const library = (...extra: Food[]) => new Map([THON, TOAST, ...extra].map((item) => [item.id, item]));

  it("ligne de la liste : kcal actuelles si tout est prêt ; sinon « n à corriger » et pas de kcal", () => {
    expect(templateHealth(template("m", "Déjeuner thon"), library())).toEqual({ problems: 0, kcal: calculateNutrients(THON, 320).kcal + calculateNutrients(TOAST, 40).kcal });
    expect(templateHealth(template("m", "Déjeuner thon"), library({ ...TOAST, status: "archived" }))).toEqual({ problems: 1 });
  });

  it("formulaire : quantités préremplies ; élément d'unité modifiée vidé avec l'ancienne quantité affichée", () => {
    const boxed = { ...THON, unit: "piece" as const, unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1 };
    const form = editFormOf(template("m", "Déjeuner thon", { defaultSlot: "lunch" }), library(boxed));
    expect(form).toMatchObject({ name: "Déjeuner thon", defaultSlot: "lunch" });
    expect(form.items.map((item) => [item.foodId, item.quantity, item.state, item.previous])).toEqual([
      ["f-thon", "", "unit_changed", "320 g"],
      ["f-toast", "40", "ready", undefined],
    ]);
  });

  it("lecture du formulaire : nom, au moins un aliment, quantités, unité à corriger, un aliment une seule fois", () => {
    const boxed = { ...THON, unit: "piece" as const, unitLabel: "boîte", referenceQuantity: 1 };
    const form = editFormOf(template("m", "Déjeuner thon"), library(boxed));
    expect(parseTemplateForm(form, library(boxed))).toEqual({ ok: false, message: "Corrige ou retire : Thon tomate (leader price)" });
    form.items[0]!.quantity = "2";
    expect(parseTemplateForm(form, library(boxed))).toEqual({
      ok: true,
      name: "Déjeuner thon",
      items: [{ id: "m-1", foodId: "f-thon", quantity: 2, resetUnit: true }, { id: "m-2", foodId: "f-toast", quantity: 40 }],
    });
    expect(parseTemplateForm({ ...form, name: " " }, library(boxed))).toEqual({ ok: false, message: "Nom du repas : obligatoire." });
    expect(parseTemplateForm({ ...form, items: [] }, library(boxed))).toEqual({ ok: false, message: "Repas favori : au moins un aliment." });
    expect(parseTemplateForm({ ...form, items: [form.items[1]!, { ...form.items[1]!, key: "autre" }] }, library(boxed))).toEqual({
      ok: false, message: "Un aliment ne peut figurer qu'une fois : Toasts multi-céréales",
    });
    expect(parseTemplateForm({ ...form, items: [{ ...form.items[1]!, quantity: "0" }] }, library(boxed))).toEqual({ ok: false, message: "Toasts multi-céréales : Quantité : supérieure à 0." });
  });

  it("ajouter un aliment : bibliothèque active, favoris d'abord, un aliment déjà présent signalé et non ajoutable", () => {
    const fav = food("f-fav", "Yaourt", { favorite: true });
    const old = food("f-old", "Ancien", { status: "archived" });
    const choices = pickerFoods([THON, TOAST, fav, old], new Set(["f-thon"]), "");
    expect(choices.map((choice) => [choice.food.name, choice.present])).toEqual([["Yaourt", false], ["Thon tomate (leader price)", true], ["Toasts multi-céréales", false]]);
    expect(pickerFoods([THON, TOAST], new Set(), "toast").map((choice) => choice.food.id)).toEqual(["f-toast"]);
  });

  it("réordonner : l'élément glissé prend la place de celui survolé", () => {
    expect(moveId(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveId(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
});
