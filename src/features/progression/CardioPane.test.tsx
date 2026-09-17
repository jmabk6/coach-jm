// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { buildCardioExerciseReport } from "./cardio";
import { CardioDetailView } from "./CardioDetailView";
import { CardioPane } from "./CardioPane";
import { buildEstablishedDataset } from "./fixtures/establishedDataset";
import { resolvePeriod } from "./period";

afterEach(cleanup);

const dataset = buildEstablishedDataset("2026-09-10");
const p12 = resolvePeriod("12w", dataset.today);
const p4 = resolvePeriod("4w", dataset.today);
const returnTo = "/progression?tab=cardio&period=4w";

function renderPane(workouts = dataset.workouts, period = p12) {
  return render(
    <MemoryRouter>
      <CardioPane exercises={dataset.exercises} workouts={workouts} period={period} returnTo={returnTo} />
    </MemoryRouter>,
  );
}

function renderDetail(exerciseId: string, workouts = dataset.workouts, period = p12) {
  const exercise = dataset.exercises.find((item) => item.id === exerciseId)!;
  const report = buildCardioExerciseReport(exercise, workouts, period)!;
  return render(
    <MemoryRouter>
      <CardioDetailView report={report} period={period} backTo={returnTo} />
    </MemoryRouter>,
  );
}

describe("Onglet Cardio — liste (mockup 26)", () => {
  it("liste les exercices cardio avec réalisations, totaux, dernière réalisation, plages — jamais de vitesse moyenne pour un tapis", () => {
    renderPane();

    expect(screen.getByText("2 exercices cardio")).toBeTruthy();
    const cards = screen.getAllByRole("link").filter((link) => link.className.includes("cardio-card"));
    expect(cards.map((card) => card.textContent!.startsWith("Tapis") || card.textContent!.startsWith("Vélo"))).toEqual([true, true]);

    const tapis = cards[0]!;
    expect(tapis.textContent).toContain("10 réalisations");
    expect(tapis.textContent).toContain("1 h 40");
    expect(tapis.textContent).toContain("10 min · 2 paliers");
    expect(tapis.textContent).toContain("5 km/h");
    expect(tapis.textContent).toContain("0–5 %");
    expect(tapis.textContent).toContain("plage de réglages");
    expect(tapis.textContent).not.toMatch(/km\/h moyen|vitesse moyenne/);
    /* 2 paliers renseignés : couverture affichée, pas de moyenne. */
    expect(tapis.textContent).toContain("BPM sur 2 des 2 paliers · moyenne sous le seuil");
    expect(tapis.textContent).not.toMatch(/bpm moyen/);
    /* Aucune tendance au niveau de l'exercice en paliers. */
    expect(tapis.textContent).not.toMatch(/sur la période ·/);
    expect(tapis.getAttribute("href")).toBe(`/progression/cardio/fx-tapis?period=12w&returnTo=${encodeURIComponent(returnTo)}`);

    const velo = cards[1]!;
    expect(velo.textContent).toContain("12 réalisations");
    expect(velo.textContent).toContain("5 h");
    expect(velo.textContent).toContain("143,4 km");
    expect(velo.textContent).toContain("25 min · 12,5 km · 30 km/h");
    expect(velo.textContent).not.toMatch(/min\/km/);
    expect(velo.textContent).toContain("+10 % sur la période · 12 réalisations comparables");
    expect(velo.querySelector(".cardio-card__trend--up")).toBeTruthy();
    /* Une comparaison existe : pas d'encart de démarrage. */
    expect(screen.queryByText(/Le BPM est analysé uniquement/)).toBeNull();
  });

  it("état de démarrage : un seul encart explicatif, les exercices sans tendance avec leur compte sur 3", () => {
    const recent = dataset.workouts.filter((w) => w.date >= "2026-08-31");
    renderPane(recent);

    expect(screen.getByText(/Le BPM est analysé uniquement sur des paliers comparables/)).toBeTruthy();
    expect(screen.getByText(/2 réalisations comparables sur 3/)).toBeTruthy();
    expect(screen.queryByText(/sur la période ·/)).toBeNull();
  });

  it("aucun exercice cardio réalisé : titre, une phrase", () => {
    renderPane(dataset.workouts.filter((w) => w.id.startsWith("fx-w-b-")));

    expect(screen.getByText("Aucun exercice cardio réalisé sur la période.")).toBeTruthy();
    expect(screen.queryByText(/exercice cardio$/)).toBeNull();
  });

  it("suit la période : sur 4 semaines les comptes changent et la tendance vélo disparaît sous le seuil", () => {
    renderPane(dataset.workouts, p4);
    const cards = screen.getAllByRole("link").filter((link) => link.className.includes("cardio-card"));

    expect(cards[0]!.textContent).toContain("3 réalisations");
    expect(cards[1]!.textContent).toContain("4 réalisations");
    expect(cards[1]!.textContent).toMatch(/\+\d+ % sur la période · 4 réalisations comparables/);
    expect(cards[0]!.getAttribute("href")).toContain("period=4w");
  });
});

describe("Détail d'un exercice cardio", () => {
  it("tapis : période, dernière réalisation, paliers comparables avec réglages, occurrences, BPM renseignés et tendance", () => {
    renderDetail("fx-tapis");

    expect(screen.getByText("‹ Cardio").getAttribute("href")).toBe(returnTo);
    expect(screen.getByText(/^Paliers · /)).toBeTruthy();
    expect(screen.getByText("Sur la période")).toBeTruthy();
    expect(screen.getByText("10 réalisations")).toBeTruthy();
    expect(screen.getByText("1 h 40")).toBeTruthy();
    expect(screen.getByText("10 min · 2 paliers")).toBeTruthy();
    expect(screen.getByText("Voir le récapitulatif ›").getAttribute("href")).toContain("/workouts/fx-w-a-25");

    const section = screen.getByText("Paliers comparables").closest("section")!;
    expect(within(section).getByText("2 groupes")).toBeTruthy();
    expect(within(section).getByText("5 min · 5 km/h · 0 %")).toBeTruthy();
    expect(within(section).getByText("5 min · 5 km/h · 5 %")).toBeTruthy();
    expect(within(section).getByText("10 occurrences · 10 avec BPM · −9 % · amélioration")).toBeTruthy();
    expect(within(section).getByText(/10 occurrences · 10 avec BPM · 0 %$/)).toBeTruthy();
    expect(section.querySelectorAll("svg.trend-sparkline")).toHaveLength(2);
    expect(section.querySelector(".cardio-card__trend--up")).toBeTruthy();
    expect(section.querySelector(".cardio-card__trend--stable")).toBeTruthy();
  });

  it("paliers adaptés et réglages voisins : chaque groupe est identifié par ses réglages exécutés ; sous 3 BPM, pas de pourcentage", () => {
    /* Sur 4 semaines : 3 lundis → 3 occurrences par groupe, tous renseignés → tendance possible. */
    renderDetail("fx-tapis", dataset.workouts, p4);
    const section = screen.getByText("Paliers comparables").closest("section")!;
    expect(within(section).getAllByText(/3 occurrences · 3 avec BPM/).length).toBe(2);

    cleanup();
    /* Un seul lundi sans BPM parmi trois : 2 renseignés sur 3 → compte, pas de pourcentage. */
    const stripped = dataset.workouts.map((w) =>
      w.id === "fx-w-a-24"
        ? { ...w, blocks: w.blocks.map((b) => (b.kind === "exercise" && b.cardioSteps ? { ...b, cardioSteps: b.cardioSteps.map((step) => { const copy = { ...step }; delete copy.bpm; return copy; }) } : b)) }
        : w,
    );
    renderDetail("fx-tapis", stripped, p4);
    const again = screen.getByText("Paliers comparables").closest("section")!;
    expect(within(again).getAllByText("3 occurrences · 2 avec BPM sur 3").length).toBe(2);
    expect(again.querySelector("svg.trend-sparkline")).toBeNull();
    for (const meta of again.querySelectorAll(".cardio-group__meta")) expect(meta.textContent).not.toMatch(/%/);
    expect(within(again).getByText(/Aucune tendance de BPM pour le moment/)).toBeTruthy();
  });

  it("vélo : tendance à durée comparable avec médiane et graphique ; sans sortie complète, une phrase", () => {
    renderDetail("fx-velo");

    expect(screen.getByText(/^Durée \+ distance · /)).toBeTruthy();
    expect(screen.getByText(/±10 % de la médiane \(25 min\), vitesse suivie/)).toBeTruthy();
    expect(screen.getByText("+10 % sur la période · 12 réalisations comparables")).toBeTruthy();
    expect(document.querySelector("svg.trend-sparkline circle")).toBeTruthy();
    expect(screen.queryByText(/min\/km/)).toBeNull();

    cleanup();
    const distanceOnly = dataset.workouts.map((w) =>
      w.id.startsWith("fx-w-c-")
        ? { ...w, blocks: w.blocks.map((b) => (b.kind === "exercise" && b.simpleMeasurement ? { ...b, simpleMeasurement: { distanceKm: b.simpleMeasurement.distanceKm ?? 0 } } : b)) }
        : w,
    );
    renderDetail("fx-velo", distanceOnly);
    expect(screen.getByText("Aucune réalisation complète (durée et distance) sur la période.")).toBeTruthy();
    expect(screen.queryByText(/km\/h/)).toBeNull();
    expect(screen.queryByText(/h \d\d|min total/)).toBeNull();
  });

  it("une suppression retire les occurrences et peut faire tomber une tendance", () => {
    const fewer = dataset.workouts.filter((w) => !["fx-w-a-24", "fx-w-a-25"].includes(w.id));
    renderDetail("fx-tapis", fewer, p4);
    const section = screen.getByText("Paliers comparables").closest("section")!;

    expect(within(section).getAllByText("1 occurrence · 1 avec BPM sur 3").length).toBe(2);
    expect(screen.getByText("1 réalisation")).toBeTruthy();
  });
});
