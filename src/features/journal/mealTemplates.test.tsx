// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { addEstimatedExtra, addFoodEntry, archiveFood, getMealTemplates, saveFood, saveMealTemplate } from "../../db/repositories/nutritionRepository";
import type { Food } from "../../domain";
import { AddFoodScreen } from "./AddFoodScreen";
import { JournalScreen } from "./JournalScreen";

/**
 * Repas favoris (phase 3A.4a) dans le Journal : section en tête de
 * l'écran Ajouter, feuille compacte (tout coché, quantités pour cette fois),
 * éléments archivés ou d'unité modifiée bloqués ; « ••• › Enregistrer comme
 * repas favori » depuis un repas consommé.
 */

process.env.TZ = "Europe/Paris";

const T = "2026-10-05T06:00:00.000Z";
let counter = 0;
const nextId = () => `id-${(counter += 1)}`;

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
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId("url").textContent;

const THON: Food = {
  id: "f-thon", name: "Thon tomate (leader price)", unit: "g", referenceQuantity: 100,
  nutrients: { kcal: 111, proteinG: 14, carbsG: 3, fatG: 4.6 }, status: "active", createdAt: T, updatedAt: T,
};
const TOAST: Food = { ...THON, id: "f-toast", name: "Toasts multi-céréales", nutrients: { kcal: 385, proteinG: 15 } };

async function seedTemplate(extra: Record<string, unknown> = {}) {
  await saveFood(THON);
  await saveFood(TOAST);
  await saveMealTemplate({
    id: "m-thon", name: "Déjeuner thon", defaultSlot: "lunch", position: 0, status: "active", createdAt: T, updatedAt: T,
    items: [{ id: "i1", foodId: "f-thon", quantity: 320 }, { id: "i2", foodId: "f-toast", quantity: 40 }],
    ...extra,
  });
}

beforeEach(async () => {
  counter = 0;
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

describe("ajouter un repas favori", () => {
  it("Déjeuner + → Déjeuner thon → Ajouter au déjeuner : 3 touchers, deux lignes avec la provenance, retour au Journal", async () => {
    await seedTemplate();
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter au déjeuner" }));
    const section = await screen.findByRole("region", { name: "Repas favoris" });
    /* La section des repas favoris vient avant les aliments. */
    const regions = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
    expect(regions.indexOf("Repas favoris")).toBeLessThan(regions.indexOf("Autres aliments"));
    expect(within(section).getByRole("button", { name: /Déjeuner thon/ }).textContent).toContain("2 aliments");

    fireEvent.click(within(section).getByRole("button", { name: /Déjeuner thon/ }));
    const sheet = screen.getByRole("dialog");
    expect((within(sheet).getByRole("checkbox", { name: "Ajouter : Thon tomate (leader price)" }) as HTMLInputElement).checked).toBe(true);
    expect((within(sheet).getByLabelText("Quantité : Thon tomate (leader price)") as HTMLInputElement).value).toBe("320");
    expect((within(sheet).getByLabelText("Quantité : Toasts multi-céréales") as HTMLInputElement).value).toBe("40");
    fireEvent.click(within(sheet).getByRole("button", { name: /^Ajouter au déjeuner/ }));

    await waitFor(() => expect(url()).toBe("/journal?date=2026-10-05"));
    const rows = await db.foodLogEntries.toArray();
    expect(rows.map((row) => [row.foodId, row.quantity, row.slot, row.mealTemplateId]).sort()).toEqual([
      ["f-thon", 320, "lunch", "m-thon"],
      ["f-toast", 40, "lunch", "m-thon"],
    ]);
  });

  it("quantité modifiée et aliment décoché pour cette fois : le repas favori ne change pas", async () => {
    await seedTemplate();
    const before = await getMealTemplates();
    renderApp("/journal/ajouter?date=2026-10-05&repas=lunch");
    fireEvent.click(within(await screen.findByRole("region", { name: "Repas favoris" })).getByRole("button", { name: /Déjeuner thon/ }));
    const sheet = screen.getByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Quantité : Thon tomate (leader price)"), { target: { value: "160" } });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Ajouter : Toasts multi-céréales" }));
    expect(within(sheet).getByText(/= 178 kcal/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: /^Ajouter au déjeuner/ }));
    await waitFor(() => expect(url()).toBe("/journal?date=2026-10-05"));
    expect((await db.foodLogEntries.toArray()).map((row) => [row.foodId, row.quantity])).toEqual([["f-thon", 160]]);
    expect(await getMealTemplates()).toEqual(before);
  });

  it("aliment archivé : grisé, décoché, impossible à cocher ; unité modifiée : bloquée avec « Unité modifiée — corriger le repas favori » ; plus rien d'ajoutable : bouton désactivé", async () => {
    await seedTemplate();
    await archiveFood("f-toast", T);
    await saveFood({ ...THON, unit: "piece", unitLabel: "boîte", referenceQuantity: 1 });
    renderApp("/journal/ajouter?date=2026-10-05&repas=lunch");
    fireEvent.click(within(await screen.findByRole("region", { name: "Repas favoris" })).getByRole("button", { name: /Déjeuner thon/ }));
    const sheet = screen.getByRole("dialog");
    const toast = within(sheet).getByRole("checkbox", { name: "Ajouter : Toasts multi-céréales" }) as HTMLInputElement;
    expect([toast.checked, toast.disabled]).toEqual([false, true]);
    expect(within(sheet).getByText("Archivé — non ajouté")).toBeTruthy();
    const thon = within(sheet).getByRole("checkbox", { name: "Ajouter : Thon tomate (leader price)" }) as HTMLInputElement;
    expect([thon.checked, thon.disabled]).toEqual([false, true]);
    expect(within(sheet).getByText("Unité modifiée — corriger le repas favori")).toBeTruthy();
    expect((within(sheet).getByLabelText("Quantité : Thon tomate (leader price)") as HTMLInputElement).disabled).toBe(true);
    expect((within(sheet).getByRole("button", { name: /^Ajouter au déjeuner/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(await db.foodLogEntries.count()).toBe(0);
  });

  it("la recherche trouve aussi les repas favoris, en tête", async () => {
    await seedTemplate();
    renderApp("/journal/ajouter?date=2026-10-05&repas=dinner");
    fireEvent.change(await screen.findByLabelText("Rechercher un aliment ou un repas"), { target: { value: "dejeuner" } });
    const found = await screen.findByRole("region", { name: "Repas favoris" });
    expect(within(found).getByRole("button", { name: /Déjeuner thon/ })).toBeTruthy();
  });
});

describe("enregistrer un repas consommé comme repas favori", () => {
  it("••• du Déjeuner : quantités totales (thons regroupés), estimation citée et non reprise ; nom obligatoire ; repas habituel sans Extras", async () => {
    await saveFood(THON);
    await saveFood(TOAST);
    await addFoodEntry({ date: "2026-10-05", slot: "lunch", foodId: "f-thon", quantity: 160, now: "2026-10-05T11:00:00.000Z" }, nextId);
    await addFoodEntry({ date: "2026-10-05", slot: "lunch", foodId: "f-thon", quantity: 160, now: "2026-10-05T11:01:00.000Z" }, nextId);
    await addFoodEntry({ date: "2026-10-05", slot: "lunch", foodId: "f-toast", quantity: 40, now: "2026-10-05T11:02:00.000Z" }, nextId);
    await addEstimatedExtra({ date: "2026-10-05", slot: "lunch", name: "Dessert", nutrients: { kcal: 250 }, now: "2026-10-05T11:03:00.000Z" }, nextId);
    renderApp();

    const lunch = await screen.findByRole("region", { name: "Déjeuner" });
    fireEvent.click(await within(lunch).findByRole("button", { name: "Actions : Déjeuner" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Enregistrer comme repas favori/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Thon tomate (leader price) · 320 g")).toBeTruthy();
    expect(within(sheet).getByText("Toasts multi-céréales · 40 g")).toBeTruthy();
    expect(within(sheet).getByText("Non repris : Dessert (estimation)")).toBeTruthy();
    const slot = within(sheet).getByLabelText("Repas habituel") as HTMLSelectElement;
    expect(slot.value).toBe("lunch");
    expect(Array.from(slot.options).map((option) => option.textContent)).toEqual(["Aucun", "Petit-déjeuner", "Déjeuner", "Collation", "Dîner"]);

    fireEvent.click(within(sheet).getByRole("button", { name: /^Enregistrer le repas favori/ }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe("Nom du repas : obligatoire.");
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Nom du repas favori"), { target: { value: "Déjeuner thon" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Enregistrer le repas favori/ }));

    await waitFor(async () => expect(await getMealTemplates()).toHaveLength(1));
    const [saved] = await getMealTemplates();
    expect(saved).toMatchObject({ name: "Déjeuner thon", defaultSlot: "lunch", status: "active" });
    expect(saved!.items.map((item) => [item.foodId, item.quantity, item.unit])).toEqual([["f-thon", 320, "g"], ["f-toast", 40, "g"]]);
    expect(await screen.findByText("Repas favori « Déjeuner thon » enregistré.")).toBeTruthy();
    expect(await db.foodLogEntries.count()).toBe(4);
  });

  it("••• absent d'un repas vide ou fait seulement d'estimations", async () => {
    await addEstimatedExtra({ date: "2026-10-05", slot: "dinner", name: "Restaurant", nutrients: { kcal: 700 }, now: T }, nextId);
    renderApp();
    const dinner = await screen.findByRole("region", { name: "Dîner" });
    await waitFor(() => expect(within(dinner).getByRole("button", { name: /Restaurant/ })).toBeTruthy());
    expect(within(dinner).queryByRole("button", { name: "Actions : Dîner" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Déjeuner" })).queryByRole("button", { name: "Actions : Déjeuner" })).toBeNull();
  });
});
