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
  it("visible sans mesure RENPHO : « Objectif Poids », 80 kg, plus d'échéance fixe, « Modifier l'objectif »", async () => {
    renderApp();
    const section = await header();
    expect(within(section).getByText("80 kg")).toBeTruthy();
    /* 15/10/2026 : plus d'échéance fixe ; l'estimation demande une pesée RENPHO. */
    expect(within(section).queryByText(/31 mars 2027/)).toBeNull();
    expect(within(section).getByRole("button", { name: "Modifier l'objectif" })).toBeTruthy();
    /* Pas encore de mesure RENPHO : ni avance ni retard, ni échéance ; des explications (15/10/2026). */
    expect((screen.getByText("Trajectoire").closest(".goal-card") as HTMLElement).querySelector(".goal-card__value")?.textContent).toBe("—");
    expect((screen.getByText("Échéance estimée").closest(".goal-card") as HTMLElement).textContent).toContain("Pas encore de pesée RENPHO");
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
    /* 15/10/2026 : l'échéance est estimée, plus saisie pour le Poids. */
    expect(within(sheet).queryByLabelText("Échéance")).toBeNull();
    expect(sheet.textContent ?? "").not.toMatch(/cible/i);

    fireEvent.change(within(sheet).getByLabelText("Objectif en kg"), { target: { value: "82" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Enregistrer/ }));
    await waitFor(async () => expect(within(await header()).getByText("82 kg")).toBeTruthy());
    /* L'échéance enregistrée n'est pas effacée, seulement plus utilisée pour le Poids. */
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

describe("objectif Poids : historique des pesées (06/10/2026)", () => {
  it("le tableau jour par jour suit la courbe ; il n'apparaît pas dans un autre objectif", async () => {
    renderApp();
    const table = await screen.findByRole("table", { name: "Historique des pesées" }, { timeout: 4000 });
    expect([...table.querySelectorAll("tbody tr")].map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent))).toEqual([["5/10", "91,2", "—", "—", "—"]]);
    cleanup();
    renderApp("/objectifs/traction");
    await screen.findAllByRole("heading", { level: 2 }, { timeout: 4000 });
    expect(screen.queryByRole("table", { name: "Historique des pesées" })).toBeNull();
  }, 20000);
});

describe("objectif Poids : haut de l'écran (15/10/2026, −0,5 kg par semaine)", () => {
  const measure = (date: string, kg: number) => ({
    id: `m-${date}`, date, takenAt: `${date}T05:00:00.000Z`, device: "renpho", source: "manual" as const, weightReference: true, weightKg: kg, createdAt: T, updatedAt: T,
  });
  /* Tes pesées RENPHO du 5 au 15/10/2026 (sauvegarde du 15/10 à 11:19). */
  const days: Array<[string, number]> = [
    ["2026-10-05", 91.15], ["2026-10-06", 90.3], ["2026-10-07", 89.25], ["2026-10-08", 88.65], ["2026-10-09", 88.45], ["2026-10-10", 88],
    ["2026-10-11", 88.15], ["2026-10-12", 88.15], ["2026-10-13", 88], ["2026-10-14", 87.85], ["2026-10-15", 87.75],
  ];

  it("Poids actuel 87,75 kg ; 2,7 kg d'avance, poids prévu 90,4 kg ; échéance estimée 12 avril 2027 à −0,5 kg/semaine (objectif enregistré 75) ; moyennes sous la courbe ; nouveau texte de pesée", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    const goal = (await db.goals.where("key").equals("weight").first())!;
    /* Objectif 75 et départ enregistré (ce que fait le seed 40 sur ta base). */
    await db.goals.put({ ...goal, segments: goal.segments.map((segment) => ({ ...segment, target: 75, start: { date: "2026-10-05", value: 91.15 } })) });
    await db.weightEntries.clear();
    await db.bodyMeasurements.bulkAdd(days.map(([date, kg]) => measure(date, kg)));
    await db.weightEntries.bulkAdd(days.map(([date, kg]) => ({ id: `w-${date}`, date, kg, bodyMeasurementId: `m-${date}`, createdAt: T, updatedAt: T })));
    renderApp();

    const card = (title: string) => screen.getByText(title).closest(".goal-card") as HTMLElement;
    const texts = (title: string) =>
      [...card(title).querySelectorAll(".goal-card__value, .goal-card__sub, .goal-card__highlight, .goal-card__foot")].map((node) => node.textContent?.replace(/\u00a0/g, " "));
    const tone = (title: string, selector: string) => card(title).querySelector(selector)?.className;
    await screen.findByText("Poids actuel", {}, { timeout: 4000 });
    /* La maquette : valeur, sous-ligne, trait, ligne forte (verte = favorable), petite ligne. */
    await waitFor(() => expect(texts("Poids actuel")).toEqual(["87,75 kg", "15 octobre 2026", "−3,4 kg", "Depuis le 5 oct."]));
    expect(texts("Trajectoire")).toEqual(["2,7 kg", "d'avance", "Prévu : 90,4 kg", "Au 15 octobre"]);
    expect(texts("Échéance estimée")).toEqual(["12 avril 2027", "Rythme : −0,5 kg/sem.", "5 sem. et 3 j d'avance", "Départ : 20 mai 2027"]);
    expect(tone("Poids actuel", ".goal-card__highlight")).toContain("goal-card__tone--good");
    expect(tone("Trajectoire", ".goal-card__value")).toContain("goal-card__tone--good");
    expect(tone("Échéance estimée", ".goal-card__highlight")).toContain("goal-card__tone--good");
    expect(card("Échéance estimée").querySelectorAll("hr")).toHaveLength(1);
    expect(screen.queryByText(/du parcours/)).toBeNull();
    expect(within(await header()).getByText("estimé au 12 avril 2027 à −0,5 kg/semaine")).toBeTruthy();
    expect(screen.queryByText(/31 mars 2027/)).toBeNull();

    const weeks = document.querySelector<HTMLElement>('dl[aria-label="Moyennes de la semaine"]')!;
    expect(weeks.textContent).toContain("87,98 kg · 5 pesées");
    expect(weeks.textContent).toContain("89,3 kg · 6 pesées");
    expect(screen.getByText(/aide à suivre la tendance/)).toBeTruthy();
    expect(screen.queryByText(/jamais la pesée du jour/)).toBeNull();
  }, 20000);
});
