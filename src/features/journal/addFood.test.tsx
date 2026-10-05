// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { addFoodEntry, saveFood } from "../../db/repositories/nutritionRepository";
import type { Food } from "../../domain";
import { AddFoodScreen } from "./AddFoodScreen";
import { JournalScreen } from "./JournalScreen";
import { NewFoodScreen } from "./NewFoodScreen";

/**
 * Ajouter au repas (phase 3A.3) : le « + » d'un repas ouvre l'écran
 * Ajouter — recherche, Nouvel aliment, Estimation, Favoris, Récents,
 * Autres aliments ; toucher un aliment ouvre la quantité ; un nouvel
 * aliment s'enregistre et s'ajoute en une fois.
 */

process.env.TZ = "Europe/Paris";

const T = "2026-10-05T06:00:00.000Z";

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderApp(entry = "/journal") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/journal" element={<JournalScreen />} />
        <Route path="/journal/ajouter" element={<AddFoodScreen />} />
        <Route path="/journal/nouvel-aliment" element={<NewFoodScreen />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId("url").textContent;
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return { id, name, unit: "g", referenceQuantity: 100, nutrients: { kcal: 100, proteinG: 10 }, status: "active", createdAt: T, updatedAt: T, ...extra };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T12:00:00"));
  db.close();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("parcours réel : Thon tomate", () => {
  it("Déjeuner + → Nouvel aliment → Thon tomate pour 1 boîte → Enregistrer et ajouter → Journal ; puis deuxième ajout en deux touchers", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter au déjeuner" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Ajouter au déjeuner" })).toBeTruthy();
    expect(url()).toBe("/journal/ajouter?date=2026-10-05&repas=lunch");

    fireEvent.click(screen.getByRole("link", { name: "+ Nouvel aliment" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Nouvel aliment" })).toBeTruthy();
    type("Nom", "Thon tomate");
    fireEvent.change(screen.getByLabelText("Unité"), { target: { value: "boite" } });
    /* Unité comptée : valeurs pour 1 boîte d'office. */
    expect((screen.getByLabelText("Valeurs pour") as HTMLInputElement).value).toBe("1");
    type("Calories en kcal", "176");
    type("Protéines en g (facultatif)", "25");
    type("Quantité habituelle (facultatif)", "1");
    expect((screen.getByLabelText("Quantité à ajouter") as HTMLInputElement).value).toBe("1");
    expect(screen.getByText(/= 176 kcal · 25,0 g protéines/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et ajouter au déjeuner" }));

    await waitFor(() => expect(url()).toBe("/journal?date=2026-10-05"));
    const lunch = await screen.findByRole("region", { name: "Déjeuner" });
    await waitFor(() => expect(within(lunch).getByRole("button", { name: /Thon tomate/ })).toBeTruthy());
    expect(within(lunch).getByRole("button", { name: /Thon tomate/ }).textContent).toContain("1 boîte");
    expect(await db.foods.count()).toBe(1);

    /* Deuxième ajout : + Déjeuner → Thon tomate (Récents) → quantité déjà à 1 → Ajouter. */
    fireEvent.click(within(lunch).getByRole("button", { name: "Ajouter au déjeuner" }));
    const recents = await screen.findByRole("region", { name: "Récents" });
    fireEvent.click(within(recents).getByRole("button", { name: /Thon tomate/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Référence : 176 kcal pour 1 boîte")).toBeTruthy();
    expect((within(sheet).getByLabelText("Quantité à ajouter") as HTMLInputElement).value).toBe("1");
    fireEvent.click(within(sheet).getByRole("button", { name: /^Ajouter au déjeuner/ }));

    await waitFor(() => expect(url()).toBe("/journal?date=2026-10-05"));
    await waitFor(async () => expect(await db.foodLogEntries.count()).toBe(2));
    const rows = await db.foodLogEntries.toArray();
    expect(rows.every((row) => row.slot === "lunch" && row.unitLabel === "boîte" && row.nutrients.kcal === 176)).toBe(true);
  });

  it("quantité à ajouter : suit la quantité habituelle, puis plus du tout une fois modifiée à la main ; « Enregistrer sans ajouter »", async () => {
    renderApp("/journal/nouvel-aliment?date=2026-10-04&repas=breakfast");
    await screen.findByRole("heading", { level: 1, name: "Nouvel aliment" });
    type("Nom", "Fromage blanc");
    expect((screen.getByLabelText("Valeurs pour") as HTMLInputElement).value).toBe("100");
    type("Calories en kcal", "46");
    expect((screen.getByLabelText("Quantité à ajouter") as HTMLInputElement).value).toBe("100");
    type("Quantité habituelle (facultatif)", "250");
    expect((screen.getByLabelText("Quantité à ajouter") as HTMLInputElement).value).toBe("250");
    type("Quantité à ajouter", "150");
    type("Quantité habituelle (facultatif)", "200");
    expect((screen.getByLabelText("Quantité à ajouter") as HTMLInputElement).value).toBe("150");

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer sans ajouter" }));
    await waitFor(() => expect(url()).toBe("/journal/ajouter?date=2026-10-04&repas=breakfast"));
    expect(await db.foods.count()).toBe(1);
    expect(await db.foodLogEntries.count()).toBe(0);
  });

  it("refus : message, rien d'écrit", async () => {
    renderApp("/journal/nouvel-aliment?date=2026-10-05&repas=lunch");
    await screen.findByRole("heading", { level: 1, name: "Nouvel aliment" });
    type("Nom", "Barre");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et ajouter au déjeuner" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Calories : obligatoires.");
    expect(await db.foods.count()).toBe(0);
  });
});

describe("écran Ajouter", () => {
  it("Favoris, Récents (repas d'abord, sans doublon), Autres aliments ; recherche sans accents, favoris d'abord", async () => {
    await saveFood(food("f-pain", "Pain de mie", { favorite: true }));
    await saveFood(food("f-pates", "Pâtes complètes"));
    await saveFood(food("f-past", "Pastèque"));
    await saveFood(food("f-dinde", "Dinde"));
    await saveFood(food("f-old", "Pâte à tartiner", { status: "archived" }));
    await addFoodEntry({ date: "2026-10-04", slot: "lunch", foodId: "f-pain", quantity: 50, now: T }, () => "a");
    await addFoodEntry({ date: "2026-10-04", slot: "dinner", foodId: "f-past", quantity: 200, now: "2026-10-04T19:00:00.000Z" }, () => "b");
    await addFoodEntry({ date: "2026-10-04", slot: "lunch", foodId: "f-dinde", quantity: 120, now: T }, () => "c");
    renderApp("/journal/ajouter?date=2026-10-05&repas=lunch");

    const names = (label: string) => within(screen.getByRole("region", { name: label })).getAllByRole("button").map((button) => button.textContent?.split(/\d/)[0]?.trim());
    await screen.findByRole("region", { name: "Favoris" });
    expect(names("Favoris")).toEqual(["Pain de mie"]);
    expect(names("Récents")).toEqual(["Dinde", "Pastèque"]);
    expect(names("Autres aliments")).toEqual(["Pâtes complètes"]);
    expect(screen.queryByText("Pâte à tartiner")).toBeNull();

    type("Rechercher un aliment", "PA");
    const results = await screen.findByRole("region", { name: "Résultats" });
    expect(within(results).getAllByRole("button").map((button) => button.textContent?.split(/\d/)[0]?.trim())).toEqual(["Pain de mie", "Pastèque", "Pâtes complètes"]);
    expect(screen.queryByRole("region", { name: "Favoris" })).toBeNull();

    type("Rechercher un aliment", "quinoa");
    expect(await screen.findByText("Aucun aliment trouvé.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+ Nouvel aliment" }).getAttribute("href")).toBe("/journal/nouvel-aliment?date=2026-10-05&repas=lunch&nom=quinoa");
  });

  it("quantité : ½, habituelle, ×2 ; valeurs en direct", async () => {
    await saveFood(food("f-fb", "Fromage blanc", { nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 }, defaultQuantity: 250 }));
    renderApp("/journal/ajouter?date=2026-10-05&repas=breakfast");
    fireEvent.click(await within(await screen.findByRole("region", { name: "Autres aliments" })).findByRole("button", { name: /Fromage blanc/ }));
    const sheet = screen.getByRole("dialog");
    const quantity = within(sheet).getByLabelText("Quantité à ajouter") as HTMLInputElement;
    expect(quantity.value).toBe("250");
    expect(within(sheet).getByText("115 kcal · 20,0 g protéines")).toBeTruthy();
    expect(within(sheet).getByText("9,8 g glucides · 0,3 g lipides")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "×2" }));
    expect(quantity.value).toBe("500");
    fireEvent.click(within(sheet).getByRole("button", { name: "½" }));
    expect(quantity.value).toBe("125");
    fireEvent.click(within(sheet).getByRole("button", { name: "Habituelle" }));
    expect(quantity.value).toBe("250");
  });

  it("+ Estimation : le formulaire de la 3A.2, ligne du repas, retour au Journal", async () => {
    renderApp("/journal/ajouter?date=2026-10-05&repas=dinner");
    fireEvent.click(await screen.findByRole("button", { name: "+ Estimation" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Estimation · Dîner" })).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText("Calories en kcal"), { target: { value: "700" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Enregistrer/ }));
    await waitFor(() => expect(url()).toBe("/journal?date=2026-10-05"));
    expect(await db.foodLogEntries.toArray()).toEqual([expect.objectContaining({ slot: "dinner", estimated: true, nutrients: { kcal: 700 } })]);
  });
});
