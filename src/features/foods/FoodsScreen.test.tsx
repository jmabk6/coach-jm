// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { addFoodEntry, getFood, saveFood } from "../../db/repositories/nutritionRepository";
import type { Food } from "../../domain";
import { AddFoodScreen } from "../journal/AddFoodScreen";
import { FoodEditScreen } from "./FoodEditScreen";
import { FoodsScreen } from "./FoodsScreen";

/**
 * Plus › Aliments (phase 3A.3) : la bibliothèque — recherche, favori,
 * modification (jamais rétroactive sur le journal), archivage et
 * réactivation, création sans ajout au repas.
 */

const T = "2026-10-05T06:00:00.000Z";

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return { id, name, unit: "g", referenceQuantity: 100, nutrients: { kcal: 100, proteinG: 10 }, status: "active", createdAt: T, updatedAt: T, ...extra };
}

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderApp(entry = "/plus/aliments") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/plus/aliments" element={<FoodsScreen />} />
        <Route path="/plus/aliments/nouveau" element={<FoodEditScreen />} />
        <Route path="/plus/aliments/:id" element={<FoodEditScreen />} />
        <Route path="/journal/ajouter" element={<AddFoodScreen />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId("url").textContent;
const list = () => screen.getByRole("list", { name: "Aliments" });
const rowNames = () => within(list()).getAllByRole("listitem").map((item) => within(item).getByRole("link").textContent?.split(/\d/)[0]?.trim());

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("Plus › Aliments", () => {
  it("liste des actifs par nom, recherche sans accents, favori en un toucher ; archivés à part, réactivables", async () => {
    await saveFood(food("f-e", "Épinards"));
    await saveFood(food("f-b", "Bresaola"));
    await saveFood(food("f-t", "Thon tomate", { unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1, nutrients: { kcal: 176 } }));
    await saveFood(food("f-old", "Ancienne barre", { status: "archived" }));
    renderApp();

    await waitFor(() => expect(rowNames()).toEqual(["Bresaola", "Épinards", "Thon tomate"]));
    expect(within(list()).getAllByRole("listitem")[2]!.textContent).toContain("176 kcal pour 1 boîte");
    fireEvent.change(screen.getByLabelText("Rechercher un aliment"), { target: { value: "epi" } });
    expect(rowNames()).toEqual(["Épinards"]);
    fireEvent.change(screen.getByLabelText("Rechercher un aliment"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Mettre en favori : Bresaola" }));
    await waitFor(async () => expect((await getFood("f-b"))?.favorite).toBe(true));
    expect(await screen.findByRole("button", { name: "Retirer des favoris : Bresaola" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Aliments archivés (1)" }));
    const archived = screen.getByRole("list", { name: "Aliments archivés" });
    fireEvent.click(within(archived).getByRole("button", { name: "Réactiver : Ancienne barre" }));
    await waitFor(() => expect(rowNames()).toEqual(["Ancienne barre", "Bresaola", "Épinards", "Thon tomate"]));
  });

  it("modifier un aliment : formulaire prérempli sans ajout au repas ; les anciennes lignes du journal ne bougent pas", async () => {
    await saveFood(food("f-t", "Thon tomate", { unit: "piece", unitLabel: "boîte", unitLabelPlural: "boîtes", referenceQuantity: 1, nutrients: { kcal: 176, proteinG: 25 } }));
    const entry = await addFoodEntry({ date: "2026-10-05", slot: "lunch", foodId: "f-t", quantity: 1, now: T }, () => "e1");
    const before = (await db.foodLogEntries.get(entry.id))!;
    renderApp("/plus/aliments/f-t");

    await screen.findByRole("heading", { level: 1, name: "Modifier l'aliment" });
    expect((screen.getByLabelText("Nom") as HTMLInputElement).value).toBe("Thon tomate");
    expect((screen.getByLabelText("Unité") as HTMLSelectElement).value).toBe("boite");
    expect(screen.queryByLabelText("Quantité à ajouter")).toBeNull();
    fireEvent.change(screen.getByLabelText("Calories en kcal"), { target: { value: "190" } });
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Thon à la tomate" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(url()).toBe("/plus/aliments"));
    expect(await getFood("f-t")).toMatchObject({ name: "Thon à la tomate", nutrients: { kcal: 190, proteinG: 25 } });
    expect(await db.foodLogEntries.get(entry.id)).toEqual(before);
  });

  it("archiver : hors de la liste et de l'écran Ajouter, l'historique reste", async () => {
    await saveFood(food("f-b", "Bresaola"));
    await addFoodEntry({ date: "2026-10-05", slot: "lunch", foodId: "f-b", quantity: 50, now: T }, () => "e1");
    renderApp("/plus/aliments/f-b");
    fireEvent.click(await screen.findByRole("button", { name: "Archiver" }));
    await waitFor(() => expect(url()).toBe("/plus/aliments"));
    expect(screen.queryByRole("list", { name: "Aliments" })).toBeNull();
    expect(await db.foodLogEntries.count()).toBe(1);
    cleanup();

    renderApp("/journal/ajouter?date=2026-10-05&repas=lunch");
    await screen.findByRole("heading", { level: 1, name: "Ajouter au déjeuner" });
    expect(screen.queryByText("Bresaola")).toBeNull();
  });

  it("créer depuis Plus : même formulaire, sans la partie « ajouter au repas »", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("link", { name: "+ Nouvel aliment" }));
    await screen.findByRole("heading", { level: 1, name: "Nouvel aliment" });
    expect(screen.queryByLabelText("Quantité à ajouter")).toBeNull();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Barre protéinée" } });
    fireEvent.change(screen.getByLabelText("Unité"), { target: { value: "barre" } });
    fireEvent.change(screen.getByLabelText("Calories en kcal"), { target: { value: "198" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Favori" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(url()).toBe("/plus/aliments"));
    expect(await db.foods.toArray()).toEqual([expect.objectContaining({ name: "Barre protéinée", unit: "piece", unitLabel: "barre", unitLabelPlural: "barres", referenceQuantity: 1, favorite: true })]);
  });
});
