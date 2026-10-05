// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { archiveFood, getMealTemplates, saveFood, saveMealTemplate } from "../../db/repositories/nutritionRepository";
import type { Food } from "../../domain";
import { AddFoodScreen } from "../journal/AddFoodScreen";
import { MealTemplateEditScreen } from "./MealTemplateEditScreen";
import { MealTemplatesScreen } from "./MealTemplatesScreen";

/**
 * Plus › Repas favoris (phase 3A.4b) : liste compacte (kcal actuelles,
 * signal des problèmes), création et modification sur le même écran,
 * ajout d'aliments depuis la bibliothèque (un aliment une seule fois),
 * correction d'une unité modifiée, archivage avec « Annuler », réactivation.
 */

const T = "2026-10-05T06:00:00.000Z";

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderApp(entry = "/plus/repas-favoris") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/plus/repas-favoris" element={<MealTemplatesScreen />} />
        <Route path="/plus/repas-favoris/nouveau" element={<MealTemplateEditScreen />} />
        <Route path="/plus/repas-favoris/:id" element={<MealTemplateEditScreen />} />
        <Route path="/journal/ajouter" element={<AddFoodScreen />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId("url").textContent;

const THON: Food = {
  id: "f-thon", name: "Thon tomate (leader price)", unit: "g", referenceQuantity: 100,
  nutrients: { kcal: 111, proteinG: 14 }, status: "active", createdAt: T, updatedAt: T,
};
const TOAST: Food = { ...THON, id: "f-toast", name: "Toasts multi-céréales", nutrients: { kcal: 385, proteinG: 15 }, defaultQuantity: 40 };
const YAOURT: Food = { ...THON, id: "f-yaourt", name: "Yaourt", nutrients: { kcal: 60, proteinG: 4 }, favorite: true };

async function seed() {
  for (const food of [THON, TOAST, YAOURT]) await saveFood(food);
  await saveMealTemplate({
    id: "m-thon", name: "Déjeuner thon", defaultSlot: "lunch", position: 0, status: "active", createdAt: T, updatedAt: T,
    items: [{ id: "i1", foodId: "f-thon", quantity: 320 }, { id: "i2", foodId: "f-toast", quantity: 40 }],
  });
  await saveMealTemplate({
    id: "m-collation", name: "Collation", position: 1, status: "active", createdAt: T, updatedAt: T,
    items: [{ id: "c1", foodId: "f-yaourt", quantity: 125 }],
  });
}

const row = (name: string) => screen.getByRole("listitem", { name });

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("liste", () => {
  it("nom, repas habituel, nombre d'aliments, kcal actuelles ; pas de protéines ; problème : signal et pas de kcal", async () => {
    await seed();
    await archiveFood("f-yaourt", T);
    renderApp();
    await waitFor(() => expect(row("Déjeuner thon").textContent).toContain("Déjeuner · 2 aliments · 509 kcal"));
    expect(row("Déjeuner thon").textContent).not.toMatch(/protéines|g P/);
    expect(row("Collation").textContent).toContain("1 aliment");
    expect(row("Collation").textContent).toContain("⚠ 1 aliment à corriger");
    expect(row("Collation").textContent).not.toContain("kcal");
    expect(within(row("Déjeuner thon")).getByRole("button", { name: "Déplacer Déjeuner thon" })).toBeTruthy();
  });

  it("aucun repas favori : message d'accueil", async () => {
    renderApp();
    expect(await screen.findByText(/Aucun repas favori/)).toBeTruthy();
  });

  it("archiver (⋯) : immédiat, « Repas favori archivé · Annuler » réactive ; archivés repliés, réactivation en fin de liste ; jamais proposé dans le Journal", async () => {
    await seed();
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Actions : Déjeuner thon" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Archiver/ }));
    /* La ligne de confirmation (dnd-kit a aussi sa propre zone d'annonces « status »). */
    const status = (await screen.findByText("Repas favori archivé")).closest(".template-notice") as HTMLElement;
    expect(status.getAttribute("role")).toBe("status");
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Déjeuner thon" })).toBeNull());

    fireEvent.click(within(status).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.getByRole("listitem", { name: "Déjeuner thon" })).toBeTruthy());
    /* « Annuler » défait l'archivage : le repas favori retrouve sa place. */
    expect((await getMealTemplates()).map((item) => item.id)).toEqual(["m-thon", "m-collation"]);

    /* Réactiver depuis les archivés : en fin de liste. */
    fireEvent.click(screen.getByRole("button", { name: "Actions : Déjeuner thon" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Archiver/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Repas favoris archivés (1)" }));
    const archived = screen.getByRole("list", { name: "Repas favoris archivés" });
    fireEvent.click(within(archived).getByRole("button", { name: "Réactiver : Déjeuner thon" }));
    await waitFor(async () => expect((await getMealTemplates()).map((item) => item.id)).toEqual(["m-collation", "m-thon"]));

    await db.mealTemplates.update("m-collation", { status: "archived" });
    cleanup();
    renderApp("/journal/ajouter?date=2026-10-05&repas=snack");
    await screen.findByRole("heading", { level: 1, name: "Ajouter à la collation" });
    expect(screen.queryByRole("button", { name: /^Collation/ })).toBeNull();
  });
});

describe("création et modification", () => {
  it("créer à la main : nom, repas habituel, aliments ajoutés par la recherche (déjà présent non ajoutable), quantités, total en direct", async () => {
    for (const food of [THON, TOAST, YAOURT]) await saveFood(food);
    renderApp();
    fireEvent.click(await screen.findByRole("link", { name: "+ Nouveau repas favori" }));
    await screen.findByRole("heading", { level: 1, name: "Nouveau repas favori" });
    fireEvent.change(screen.getByLabelText("Nom du repas favori"), { target: { value: "Déjeuner thon" } });
    fireEvent.change(screen.getByLabelText("Repas habituel"), { target: { value: "lunch" } });
    expect(Array.from((screen.getByLabelText("Repas habituel") as HTMLSelectElement).options).map((option) => option.textContent)).toEqual(["Aucun", "Petit-déjeuner", "Déjeuner", "Collation", "Dîner"]);

    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un aliment" }));
    let picker = screen.getByRole("dialog");
    fireEvent.change(within(picker).getByLabelText("Rechercher un aliment"), { target: { value: "thon" } });
    fireEvent.click(within(picker).getByRole("button", { name: /Thon tomate/ }));
    expect((screen.getByLabelText("Quantité : Thon tomate (leader price)") as HTMLInputElement).value).toBe("100");
    fireEvent.change(screen.getByLabelText("Quantité : Thon tomate (leader price)"), { target: { value: "320" } });

    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter un aliment" }));
    picker = screen.getByRole("dialog");
    const already = within(picker).getByRole("button", { name: /Thon tomate/ }) as HTMLButtonElement;
    expect(already.disabled).toBe(true);
    expect(already.textContent).toContain("Déjà dans ce repas");
    fireEvent.click(within(picker).getByRole("button", { name: /Toasts/ }));
    /* Quantité habituelle de l'aliment proposée. */
    expect((screen.getByLabelText("Quantité : Toasts multi-céréales") as HTMLInputElement).value).toBe("40");
    expect(screen.getByText("= 509 kcal · 50,8 g protéines")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(url()).toBe("/plus/repas-favoris"));
    const [saved] = await getMealTemplates();
    expect(saved).toMatchObject({ name: "Déjeuner thon", defaultSlot: "lunch", status: "active" });
    expect(saved!.items.map((item) => [item.foodId, item.quantity, item.unit])).toEqual([["f-thon", 320, "g"], ["f-toast", 40, "g"]]);
    expect(JSON.stringify(saved)).not.toMatch(/kcal/);
  });

  it("modifier : nom, repas habituel, quantité, retrait d'un aliment ; nom vide refusé", async () => {
    await seed();
    renderApp("/plus/repas-favoris/m-thon");
    await screen.findByRole("heading", { level: 1, name: "Déjeuner thon" });
    fireEvent.change(screen.getByLabelText("Nom du repas favori"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Nom du repas : obligatoire.");

    fireEvent.change(screen.getByLabelText("Nom du repas favori"), { target: { value: "Midi thon" } });
    fireEvent.change(screen.getByLabelText("Repas habituel"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Quantité : Thon tomate (leader price)"), { target: { value: "160" } });
    fireEvent.click(screen.getByRole("button", { name: "Retirer : Toasts multi-céréales" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(url()).toBe("/plus/repas-favoris"));
    const saved = (await getMealTemplates()).find((item) => item.id === "m-thon")!;
    expect(saved.name).toBe("Midi thon");
    expect(saved).not.toHaveProperty("defaultSlot");
    expect(saved.items.map((item) => [item.id, item.quantity])).toEqual([["i1", 160]]);
  });

  it("unité modifiée : signalée, quantité vidée avec l'ancienne affichée ; refus tant que non corrigée ; corrigée : nouvelle unité mémorisée", async () => {
    await seed();
    await saveFood({ ...THON, unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1 });
    renderApp("/plus/repas-favoris/m-thon");
    await screen.findByRole("heading", { level: 1, name: "Déjeuner thon" });
    expect(screen.getByText(/Unité modifiée — l'aliment est maintenant en boîte/)).toBeTruthy();
    expect(screen.getByText("avant : 320 g")).toBeTruthy();
    const quantity = screen.getByLabelText("Quantité : Thon tomate (leader price)") as HTMLInputElement;
    expect(quantity.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Corrige ou retire : Thon tomate (leader price)");

    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(url()).toBe("/plus/repas-favoris"));
    expect((await getMealTemplates()).find((item) => item.id === "m-thon")!.items[0]).toMatchObject({ quantity: 2, unit: "piece", unitLabel: "boîte" });
  });

  it("repas favori archivé : lecture seule, avec « Réactiver »", async () => {
    await seed();
    await db.mealTemplates.update("m-thon", { status: "archived" });
    renderApp("/plus/repas-favoris/m-thon");
    await screen.findByRole("heading", { level: 1, name: "Déjeuner thon" });
    expect(screen.getByText(/Repas favori archivé/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    expect((screen.getByLabelText("Nom du repas favori") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Réactiver" }));
    await waitFor(() => expect(url()).toBe("/plus/repas-favoris"));
    expect((await getMealTemplates()).map((item) => item.id)).toContain("m-thon");
  });
});
