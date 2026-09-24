// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { seedSettingsDefaults } from "../seed/seedSettingsDefaults";
import { seedTestProtocols } from "./seedTestProtocols";
import { TestProtocolsScreen } from "./TestProtocolsScreen";

/**
 * Lot G.6 — Plus > Protocoles de tests : la liste des tests, la saisie
 * d'un test passé à la date choisie, la suppression d'un résultat saisi.
 */

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 4, 9, 0, 0));
  await db.delete();
  await db.open();
  await seedSettingsDefaults(new Date());
  await db.transaction("rw", db.exercises, () => seedExerciseCatalog());
  await seedTestProtocols(new Date().toISOString());
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  db.close();
  await db.delete();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/plus/protocoles"]}>
      <Routes>
        <Route path="/plus/protocoles" element={<TestProtocolsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const card = (name: string) => screen.getByText(name, { selector: ".tests-screen__name" }).closest("li")!;

describe("Protocoles de tests", () => {
  it("les 7 tests ; la traction stricte en pause ne se saisit pas", async () => {
    renderScreen();
    await screen.findByText("Tronc", { selector: ".tests-screen__name" });
    expect(document.querySelectorAll(".tests-screen__protocol")).toHaveLength(7);
    expect(within(card("Traction stricte")).getByText("En pause")).toBeTruthy();
    expect(within(card("Traction stricte")).queryByRole("button", { name: /Saisir un test passé/ })).toBeNull();
    expect(within(card("Tronc")).getByText("Aucun résultat")).toBeTruthy();
  });

  it("saisir la planche du lundi 28/09, puis la supprimer", async () => {
    renderScreen();
    await screen.findByText("Tronc", { selector: ".tests-screen__name" });
    fireEvent.click(within(card("Tronc")).getByRole("button", { name: /Saisir un test passé/ }));

    const date = (await screen.findByLabelText("Date du test")) as HTMLInputElement;
    expect(date.max).toBe("2026-10-04");
    fireEvent.change(date, { target: { value: "2026-09-28" } });
    const planche = await screen.findByLabelText("Planche");
    fireEvent.change(planche, { target: { value: "70" } });
    fireEvent.blur(planche);
    fireEvent.click(await screen.findByRole("button", { name: "Enregistrer le test du lundi 28 septembre 2026" }));

    expect(await screen.findByText("Tronc du lundi 28 septembre 2026 enregistré.")).toBeTruthy();
    /* La liste se relit après l'enregistrement : on attend la ligne à jour. */
    expect(await within(card("Tronc")).findByText(/^Dernier : lundi 28 septembre 2026 · Planche 70 s$/)).toBeTruthy();
    expect(await db.testResults.toArray()).toMatchObject([{ protocolId: "protocol-tronc", date: "2026-09-28", origin: "manual", status: "complete" }]);

    fireEvent.click(within(card("Tronc")).getByRole("button", { name: "Supprimer le résultat du lundi 28 septembre 2026" }));
    fireEvent.click(await screen.findByRole("button", { name: /Supprimer définitivement/ }));
    await waitFor(() => expect(within(card("Tronc")).getByText("Aucun résultat")).toBeTruthy());
    expect(await db.testResults.count()).toBe(0);
  });
});
