// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { addEstimatedExtra, addFoodEntry, saveFood } from "../../db/repositories/nutritionRepository";
import type { Food } from "../../domain";
import { calculateNutrients } from "../../domain/rules/nutritionRules";
import { JournalScreen } from "./JournalScreen";

/**
 * Journal (phase 3A.2) : le jour (jamais dans le futur, gardé dans
 * l'adresse), le résumé (jamais 0 kcal pour une journée non renseignée,
 * macros partielles signalées), les cinq repas, l'estimation, la quantité,
 * la suppression, la journée complète.
 */

process.env.TZ = "Europe/Paris";

const T = "2026-10-05T06:00:00.000Z";
let counter = 0;
const nextId = () => `id-${(counter += 1)}`;

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderJournal(entry = "/journal") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/journal" element={<><JournalScreen /><Probe /></>} />
        <Route path="/journal/ajouter" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId("url").textContent;
const meal = (label: string) => screen.getByRole("region", { name: label });
const mealTotal = (section: HTMLElement) => section.querySelector(".journal-meal__total")?.textContent;
const summary = () => screen.getByRole("region", { name: "Résumé de la journée" });
const tile = (kind: "kcal" | "protein") => summary().querySelector(`.journal-summary__tile--${kind}`) as HTMLElement;

const FROMAGE: Food = {
  id: "f-fb", name: "Fromage blanc 0 %", unit: "g", referenceQuantity: 100, nutrients: { kcal: 46, proteinG: 8, carbsG: 3.9, fatG: 0.1 },
  status: "active", createdAt: T, updatedAt: T,
};

beforeEach(async () => {
  counter = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00"));
  db.close();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("jour affiché", () => {
  it("s'ouvre sur aujourd'hui : titre, « Aujourd'hui », jour suivant impossible ; cinq repas dans l'ordre", async () => {
    renderJournal();
    expect(await screen.findByRole("heading", { level: 1, name: "Lundi 5 octobre" })).toBeTruthy();
    expect(screen.getByText("Aujourd'hui")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aujourd'hui" })).toBeNull();
    expect((screen.getByRole("button", { name: "Jour suivant" }) as HTMLButtonElement).disabled).toBe(true);
    const sections = await screen.findAllByRole("region", { name: /^(Petit-déjeuner|Déjeuner|Collation|Dîner|Extras)$/ });
    expect(sections.map((section) => section.getAttribute("aria-label"))).toEqual(["Petit-déjeuner", "Déjeuner", "Collation", "Dîner", "Extras"]);
  });

  it("jour précédent, suivant, bouton Aujourd'hui : l'adresse suit", async () => {
    renderJournal();
    await screen.findByRole("heading", { level: 1, name: "Lundi 5 octobre" });
    fireEvent.click(screen.getByRole("button", { name: "Jour précédent" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Dimanche 4 octobre" })).toBeTruthy();
    expect(url()).toBe("/journal?date=2026-10-04");
    fireEvent.click(screen.getByRole("button", { name: "Jour précédent" }));
    expect(url()).toBe("/journal?date=2026-10-03");
    fireEvent.click(screen.getByRole("button", { name: "Jour suivant" }));
    expect(url()).toBe("/journal?date=2026-10-04");
    fireEvent.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Lundi 5 octobre" })).toBeTruthy();
    expect(url()).toBe("/journal?date=2026-10-05");
  });

  it("rechargement : la date de l'adresse est gardée ; future ou illisible : retour à aujourd'hui, adresse corrigée", async () => {
    renderJournal("/journal?date=2026-10-01");
    expect(await screen.findByRole("heading", { level: 1, name: "Jeudi 1er octobre" })).toBeTruthy();
    cleanup();
    renderJournal("/journal?date=2026-10-01");
    expect(await screen.findByRole("heading", { level: 1, name: "Jeudi 1er octobre" })).toBeTruthy();
    cleanup();

    renderJournal("/journal?date=2026-12-25");
    expect(await screen.findByRole("heading", { level: 1, name: "Lundi 5 octobre" })).toBeTruthy();
    await waitFor(() => expect(url()).toBe("/journal?date=2026-10-05"));
    cleanup();
    renderJournal("/journal?date=n-importe-quoi");
    await waitFor(() => expect(url()).toBe("/journal?date=2026-10-05"));
  });
});

describe("résumé et lignes", () => {
  it("journée non renseignée : « — », jamais 0 kcal ; « complète » impossible", async () => {
    renderJournal();
    await waitFor(() => expect(within(summary()).getByText("Journée non renseignée")).toBeTruthy());
    /* Deux tuiles, Calories et Protéines, chacune « — » : aucun faux zéro. */
    expect(within(tile("kcal")).getByText("—")).toBeTruthy();
    expect(within(tile("kcal")).getByText("Calories")).toBeTruthy();
    expect(within(tile("protein")).getByText("—")).toBeTruthy();
    expect(within(tile("protein")).getByText("Protéines")).toBeTruthy();
    expect(within(summary()).queryByText(/Glucides/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b0 kcal/);
    const complete = screen.getByRole("checkbox", { name: "Journée alimentaire complète" }) as HTMLInputElement;
    expect(complete.disabled).toBe(true);
    expect(complete.checked).toBe(false);
  });

  it("journée en cours : totaux connus, macros partielles « ≥ » (jamais comptées comme 0), lignes avec quantité, kcal, protéines, « ≈ estimé » ; repas en bandeaux", async () => {
    await saveFood(FROMAGE);
    await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-fb", quantity: 250, now: T }, nextId);
    await addEstimatedExtra({ date: "2026-10-05", name: "Chocolat", nutrients: { kcal: 320 }, now: T }, nextId);
    renderJournal();

    /* Deux tuiles de même importance : Calories, Protéines ; le reste en dessous, discret. */
    await waitFor(() => expect(within(tile("kcal")).getByText("435 kcal")).toBeTruthy());
    expect(within(tile("protein")).getByText("≥ 20,0 g")).toBeTruthy();
    expect(within(summary()).getByText("Glucides ≥ 9,8 g · Lipides ≥ 0,3 g")).toBeTruthy();
    expect(within(summary()).getByText("Journée en cours · non comptée · 1 estimée")).toBeTruthy();
    /* La ligne d'explication du « ≥ » a disparu : le symbole suffit. */
    expect(within(summary()).queryByText(/au moins une ligne/)).toBeNull();

    const breakfast = meal("Petit-déjeuner");
    /* Bandeau du repas : total à droite, kcal en ambre et protéines en bleu (deux morceaux distincts). */
    expect(mealTotal(breakfast)).toBe("115 kcal · 20,0 g P");
    expect(breakfast.querySelector(".journal-meal__head .journal-meal__kcal")?.textContent).toBe("115 kcal");
    expect(breakfast.querySelector(".journal-meal__head .journal-meal__protein")?.textContent).toBe("20,0 g P");
    /* Repas vide : son bandeau seul, sans total ni ligne. */
    const lunchHead = meal("Déjeuner");
    expect(lunchHead.querySelector(".journal-meal__total")).toBeNull();
    expect(within(lunchHead).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Ajouter au déjeuner"]);
    const line = within(breakfast).getByRole("button", { name: /Fromage blanc 0 %/ });
    expect(line.textContent).toContain("250 g");
    expect(line.textContent).toContain("115 kcal");
    expect(line.textContent).toContain("20,0 g P");

    const extra = within(meal("Extras")).getByRole("button", { name: /Chocolat/ });
    expect(extra.textContent).toContain("≈ estimé");
    expect(extra.textContent).toContain("320 kcal");
    expect(extra.textContent).not.toContain(" g P");
  });

  it("le + d'un repas ouvre l'écran Ajouter de ce repas et de ce jour (phase 3A.3) ; une estimation y reste une ligne du repas, marquée estimée", async () => {
    await addEstimatedExtra({ date: "2026-10-04", slot: "lunch", name: "Restaurant", nutrients: { kcal: 650, proteinG: 35 }, now: T }, nextId);
    renderJournal("/journal?date=2026-10-04");
    const lunch = await screen.findByRole("region", { name: "Déjeuner" });
    await waitFor(() => expect(within(lunch).getByRole("button", { name: /Restaurant/ }).textContent).toContain("≈ estimé"));
    fireEvent.click(within(lunch).getByRole("button", { name: "Ajouter au déjeuner" }));
    await waitFor(() => expect(url()).toBe("/journal/ajouter?date=2026-10-04&repas=lunch"));
  });

  it("modifier la quantité : recalcul depuis la base ; supprimer : confirmation d'abord", async () => {
    await saveFood(FROMAGE);
    const entry = await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-fb", quantity: 250, now: T }, nextId);
    await addFoodEntry({ date: "2026-10-05", slot: "dinner", foodId: "f-fb", quantity: 100, now: T }, nextId);
    renderJournal();

    fireEvent.click(await within(await screen.findByRole("region", { name: "Petit-déjeuner" })).findByRole("button", { name: /Fromage blanc 0 %/ }));
    let sheet = screen.getByRole("dialog");
    const quantity = within(sheet).getByLabelText("Quantité en g") as HTMLInputElement;
    expect(quantity.value).toBe("250");
    fireEvent.change(quantity, { target: { value: "300" } });
    expect(within(sheet).getByText(/138 kcal/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: /^Enregistrer/ }));
    await waitFor(() => expect(mealTotal(meal("Petit-déjeuner"))).toBe("138 kcal · 24,0 g P"));
    expect((await db.foodLogEntries.get(entry.id))!.nutrients).toEqual(calculateNutrients(entry.basis, 300));

    fireEvent.click(within(meal("Petit-déjeuner")).getByRole("button", { name: /Fromage blanc 0 %/ }));
    sheet = screen.getByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /^Supprimer la ligne/ }));
    const confirm = screen.getByRole("dialog");
    expect(within(confirm).getByRole("heading", { name: "Supprimer cette ligne ?" })).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "Annuler" }));
    expect(await db.foodLogEntries.count()).toBe(2);

    fireEvent.click(within(meal("Petit-déjeuner")).getByRole("button", { name: /Fromage blanc 0 %/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Supprimer la ligne/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Supprimer\s*La ligne disparaît/ }));
    await waitFor(() => expect(within(meal("Petit-déjeuner")).queryByRole("button", { name: /Fromage blanc/ })).toBeNull());
    expect(await db.foodLogEntries.get(entry.id)).toBeUndefined();
  });

  it("journée complète : cochée puis gardée après une modification ; décochable ; la dernière ligne supprimée la remet non renseignée", async () => {
    await saveFood(FROMAGE);
    await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-fb", quantity: 250, now: T }, nextId);
    renderJournal();
    const box = (await screen.findByRole("checkbox", { name: "Journée alimentaire complète" })) as HTMLInputElement;
    await waitFor(() => expect(box.disabled).toBe(false));
    fireEvent.click(box);
    await waitFor(() => expect(within(summary()).getByText(/Journée complète/)).toBeTruthy());
    expect(box.checked).toBe(true);

    /* Une correction ne défait pas la déclaration. */
    fireEvent.click(within(meal("Petit-déjeuner")).getByRole("button", { name: /Fromage blanc/ }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Quantité en g"), { target: { value: "200" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Enregistrer/ }));
    await waitFor(() => expect(within(summary()).getByText("92 kcal")).toBeTruthy());
    expect(within(summary()).getByText(/Journée complète/)).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Journée alimentaire complète" }));
    await waitFor(() => expect(within(summary()).getByText(/Journée en cours · non comptée/)).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: "Journée alimentaire complète" }));
    await waitFor(() => expect(within(summary()).getByText(/Journée complète/)).toBeTruthy());

    fireEvent.click(within(meal("Petit-déjeuner")).getByRole("button", { name: /Fromage blanc/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Supprimer la ligne/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Supprimer\s*La ligne disparaît/ }));
    await waitFor(() => expect(within(summary()).getByText("Journée non renseignée")).toBeTruthy());
    const after = screen.getByRole("checkbox", { name: "Journée alimentaire complète" }) as HTMLInputElement;
    expect([after.checked, after.disabled]).toEqual([false, true]);
    expect(await db.nutritionDays.count()).toBe(0);
  });
});

describe("lignes regroupées (affichage seulement)", () => {
  it("2 × 250 g au petit-déjeuner : une ligne 500 g ; le dîner reste à part ; totaux du jour inchangés ; la base garde 2 lignes", async () => {
    await saveFood(FROMAGE);
    await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-fb", quantity: 250, now: "2026-10-05T06:00:00.000Z" }, nextId);
    await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-fb", quantity: 250, now: "2026-10-05T06:05:00.000Z" }, nextId);
    await addFoodEntry({ date: "2026-10-05", slot: "dinner", foodId: "f-fb", quantity: 100, now: "2026-10-05T18:00:00.000Z" }, nextId);
    renderJournal();

    const breakfast = await screen.findByRole("region", { name: "Petit-déjeuner" });
    await waitFor(() => expect(within(breakfast).getAllByRole("button", { name: /Fromage blanc/ })).toHaveLength(1));
    const group = within(breakfast).getByRole("button", { name: /Fromage blanc/ });
    expect(group.textContent).toContain("500 g");
    expect(group.textContent).toContain("230 kcal");
    expect(group.textContent).toContain("40,0 g P");
    expect(mealTotal(breakfast)).toBe("230 kcal · 40,0 g P");
    expect(within(meal("Dîner")).getAllByRole("button", { name: /Fromage blanc/ })).toHaveLength(1);
    expect(within(tile("kcal")).getByText("276 kcal")).toBeTruthy();
    expect(await db.foodLogEntries.count()).toBe(3);
  });

  it("toucher le groupe : la quantité totale, « Regroupe 2 saisies » ; 500 → 300 g : la plus récente porte la baisse ; supprimer : « 2 saisies seront supprimées »", async () => {
    await saveFood(FROMAGE);
    const first = await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-fb", quantity: 250, now: "2026-10-05T06:00:00.000Z" }, nextId);
    const second = await addFoodEntry({ date: "2026-10-05", slot: "breakfast", foodId: "f-fb", quantity: 250, now: "2026-10-05T06:05:00.000Z" }, nextId);
    renderJournal();

    fireEvent.click(await within(await screen.findByRole("region", { name: "Petit-déjeuner" })).findByRole("button", { name: /Fromage blanc/ }));
    let sheet = screen.getByRole("dialog");
    expect((within(sheet).getByLabelText("Quantité en g") as HTMLInputElement).value).toBe("500");
    expect(within(sheet).getByText("Regroupe 2 saisies")).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText("Quantité en g"), { target: { value: "300" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Enregistrer/ }));
    await waitFor(async () => expect((await db.foodLogEntries.get(second.id))?.quantity).toBe(50));
    expect(await db.foodLogEntries.get(first.id)).toEqual(first);
    await waitFor(() => expect(within(meal("Petit-déjeuner")).getByRole("button", { name: /Fromage blanc/ }).textContent).toContain("300 g"));

    fireEvent.click(within(meal("Petit-déjeuner")).getByRole("button", { name: /Fromage blanc/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Supprimer la ligne/ }));
    sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("2 saisies seront supprimées")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: /^Supprimer\s*La ligne disparaît/ }));
    await waitFor(() => expect(within(summary()).getByText("Journée non renseignée")).toBeTruthy());
    expect(await db.foodLogEntries.count()).toBe(0);
  });
});
