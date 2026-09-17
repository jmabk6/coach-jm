// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OverviewPane } from "./OverviewPane";
import { buildEstablishedDataset } from "./fixtures/establishedDataset";
import { buildOverview, type Overview } from "./overview";
import { resolvePeriod } from "./period";
import { formatDurationTotal } from "./progressionFormat";

afterEach(cleanup);

function renderPane(overview: Overview) {
  return render(
    <MemoryRouter>
      <OverviewPane overview={overview} />
    </MemoryRouter>,
  );
}

const dataset = buildEstablishedDataset("2026-09-10");
const period = resolvePeriod("12w", dataset.today);

describe("Vue générale — rendu (mockup 24, §16–17)", () => {
  it("état établi : les six blocs, les dénominateurs, les variations avec leur base, sans RPE ni BPM", () => {
    const overview = buildOverview(dataset, period, dataset.today, { coverageStart: dataset.coverageStart });
    renderPane(overview);

    expect(screen.getByText("Taux de réalisation du programme")).toBeTruthy();
    expect(screen.getByText("86 %")).toBeTruthy();
    expect(screen.getByText("31 / 36")).toBeTruthy();
    expect(screen.getByText("Fréquence d'entraînement")).toBeTruthy();
    expect(screen.getByText("3,3")).toBeTruthy();
    expect(screen.getByText("Renforcement")).toBeTruthy();
    expect(screen.getByText("volume total")).toBeTruthy();
    expect(screen.getByText("séances contenant du renforcement")).toBeTruthy();
    expect(screen.getByText("séances contenant du cardio")).toBeTruthy();

    /* Variations calculées : +16 % de volume, 0 % de séries ; chacune porte sa base. */
    const variations = screen.getAllByText("vs 12 sem. précédentes");
    expect(variations.length).toBe(5);
    expect(screen.getByText("+16 %")).toBeTruthy();
    expect(screen.getAllByText("0 %").length).toBeGreaterThanOrEqual(1);

    /* Répartitions : deux axes, totaux explicites. */
    expect(screen.getByText("Par catégorie de séance")).toBeTruthy();
    expect(screen.getByText("Sans catégorie")).toBeTruthy();
    expect(screen.getByText("(planifiées + libres)")).toBeTruthy();
    expect(screen.getByText("Séries réalisées par zone musculaire")).toBeTruthy();
    expect(screen.getByText("Jambes")).toBeTruthy();

    /* Dernières séances et Voir tout. */
    expect(screen.getByText("Voir tout ›").getAttribute("href")).toBe("/historique");
    expect(screen.getByText("25 min · 12,5 km")).toBeTruthy();

    /* Jamais de RPE ni de BPM en Vue générale. */
    expect(screen.queryByText(/RPE/)).toBeNull();
    expect(screen.queryByText(/bpm/i)).toBeNull();
    expect(screen.queryByText("Musculation", { selector: "h2" })).toBeNull();
  });

  it("sans couverture de la période précédente : mêmes valeurs, aucune variation, aucun tiret", () => {
    const overview = buildOverview(dataset, period, dataset.today);
    renderPane(overview);

    expect(screen.getByText("86 %")).toBeTruthy();
    expect(screen.queryByText(/vs 12 sem/)).toBeNull();
    expect(screen.queryByText(/^[+−]\d+ %$/)).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("états sans données : phrases sobres, jamais un 0 % de taux par défaut", () => {
    const empty = buildOverview(
      { workouts: [], plannedSessions: [], templates: dataset.templates, exercises: dataset.exercises },
      period,
      dataset.today,
    );
    renderPane(empty);

    expect(screen.getByText("Aucune séance planifiée attendue sur la période.")).toBeTruthy();
    expect(screen.getAllByText("Aucune séance réalisée sur la période.").length).toBe(2);
    expect(screen.getByText("Aucune séance sur la période.")).toBeTruthy();
    expect(screen.getByText("Aucune série réalisée sur la période.")).toBeTruthy();
    expect(screen.queryByText("0 %")).toBeNull();
    /* Les agrégats à zéro restent des valeurs vraies. */
    const strength = screen.getByText("Renforcement").closest("section")!;
    expect(within(strength).getByText("0 kg")).toBeTruthy();
  });

  it("sous 14 jours : le nombre de séances, pas de rythme hebdomadaire", () => {
    const short = { ...resolvePeriod("4w", dataset.today), days: 10, start: "2026-09-01" };
    const overview = buildOverview(dataset, short, dataset.today);
    renderPane(overview);

    expect(screen.queryByText("séances / semaine")).toBeNull();
    expect(screen.getByText("Fréquence d'entraînement").closest("section")!.textContent).toMatch(/séances réalisées/);
  });

  it("formate les durées totales en minutes puis en heures", () => {
    expect(formatDurationTotal(45 * 60)).toBe("45 min");
    expect(formatDurationTotal(60 * 60)).toBe("1 h");
    expect(formatDurationTotal(612 * 60)).toBe("10 h 12");
  });
});
