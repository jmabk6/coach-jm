// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { getSetting } from "../../db/repositories/settingsRepository";
import { canonicalStringify } from "../backup/canonicalJson";
import { BodyTargetsScreen } from "../body/BodyTargetsScreen";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { GoalDetailScreen } from "./GoalDetailScreen";
import { goalId } from "./goalsV1";

/**
 * Objectifs › Poids (correctif d'interface du 05/10/2026) : l'objectif
 * Poids (80 kg au 31/03/2027) se lit en clair, même sans moyenne de la
 * semaine, et se modifie par « Modifier l'objectif » — jamais « cible ».
 * Le mot « cible » ne désigne que la cible de composition, indépendante.
 */

process.env.TZ = "Europe/Paris";

const T = "2026-10-05T06:00:00.000Z";

function renderApp(path = "/objectifs/weight") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/objectifs/:key" element={<GoalDetailScreen />} />
        <Route path="/objectifs/weight/cible" element={<BodyTargetsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function header(): Promise<HTMLElement> {
  return (await screen.findByRole("heading", { name: "Objectif Poids" })).closest("section") as HTMLElement;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00"));
  db.close();
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  /* Une seule pesée : pas encore de moyenne de la semaine, ni statut ni courbe. */
  await db.weightEntries.add({ id: "w1", date: "2026-10-05", kg: 91.15, createdAt: T, updatedAt: T });
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("objectif Poids, en clair", () => {
  it("visible sans moyenne de la semaine : « Objectif Poids », 80 kg, au 31 mars 2027, « Modifier l'objectif »", async () => {
    renderApp();
    const section = await header();
    expect(within(section).getByText("80 kg")).toBeTruthy();
    expect(within(section).getByText("au 31 mars 2027")).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Modifier l'objectif" })).toBeTruthy();
    /* Pas encore de statut : la première moyenne de la semaine manque. */
    expect((screen.getByText("Statut").closest(".goal-card") as HTMLElement).querySelector(".goal-card__value")?.textContent).toBe("—");
    /* L'ancien libellé ambigu a disparu de la page Poids ; « cible » reste au bloc de composition. */
    expect(screen.queryByRole("button", { name: "Modifier la cible et l'échéance" })).toBeNull();
    expect(within(section).queryByText(/cible/i)).toBeNull();
    /* Le bloc de l'objectif vient avant la composition corporelle. */
    const composition = (await screen.findByRole("heading", { name: "Composition corporelle" })).closest("section")!;
    expect(section.compareDocumentPosition(composition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("la feuille parle d'objectif, jamais de cible ; modifier l'objectif ne touche pas la cible de composition", async () => {
    const targetsBefore = await getSetting("bodyCompositionTargets");
    renderApp();
    fireEvent.click(within(await header()).getByRole("button", { name: "Modifier l'objectif" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Modifier l'objectif Poids" })).toBeTruthy();
    expect((within(sheet).getByLabelText("Objectif en kg") as HTMLInputElement).value).toBe("80");
    expect((within(sheet).getByLabelText("Échéance") as HTMLInputElement).value).toBe("2027-03-31");
    expect(sheet.textContent ?? "").not.toMatch(/cible/i);

    fireEvent.change(within(sheet).getByLabelText("Objectif en kg"), { target: { value: "82" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Enregistrer/ }));
    await waitFor(async () => expect(within(await header()).getByText("82 kg")).toBeTruthy());
    expect((await db.goals.get(goalId("weight")))!.segments[0]).toMatchObject({ target: 82, dueDate: "2027-03-31" });
    expect(await getSetting("bodyCompositionTargets")).toEqual(targetsBefore);
    const composition = (await screen.findByRole("heading", { name: "Composition corporelle" })).closest("section")!;
    expect(within(composition as HTMLElement).getByText("78–80 kg")).toBeTruthy();
  });

  it("modifier la cible de composition ne touche pas l'objectif Poids", async () => {
    const goalBefore = canonicalStringify(await db.goals.get(goalId("weight")));
    renderApp("/objectifs/weight/cible");
    await screen.findByRole("heading", { name: "Cible de composition" });
    fireEvent.change(screen.getByLabelText("Poids minimum en kg"), { target: { value: "76" } });
    fireEvent.change(screen.getByLabelText("Poids maximum en kg"), { target: { value: "78" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la cible" }));
    const section = await header();
    expect(within(section).getByText("80 kg")).toBeTruthy();
    expect(canonicalStringify(await db.goals.get(goalId("weight")))).toBe(goalBefore);
  });

  it("les autres objectifs gardent leur bouton", async () => {
    renderApp("/objectifs/traction");
    expect(await screen.findByRole("button", { name: "Modifier la cible et l'échéance" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Objectif Poids" })).toBeNull();
  });
});
