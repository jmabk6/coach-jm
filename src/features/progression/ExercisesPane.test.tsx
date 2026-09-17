// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Exercise } from "../../domain";
import { ExercisesPane, type TrendFilter } from "./ExercisesPane";
import { buildEstablishedDataset } from "./fixtures/establishedDataset";
import { resolvePeriod } from "./period";
import { formatMetricValue } from "./progressionFormat";
import type { TrendMetric } from "./trends";

afterEach(cleanup);

const dataset = buildEstablishedDataset("2026-09-10");
const period = resolvePeriod("12w", dataset.today);

function FicheProbe() {
  const location = useLocation();
  return <p data-testid="probe">{`${location.pathname} ← ${(location.state as { from?: string } | null)?.from ?? ""}`}</p>;
}

function renderPane(
  overrides: Partial<{ exercises: Exercise[]; metric: TrendMetric; filter: TrendFilter; workouts: typeof dataset.workouts }> = {},
) {
  const onMetricChange = vi.fn();
  const onFilterChange = vi.fn();
  const returnTo = "/progression?tab=exercices&metric=reps";
  const utils = render(
    <MemoryRouter initialEntries={["/progression"]}>
      <Routes>
        <Route
          path="/progression"
          element={
            <ExercisesPane
              exercises={overrides.exercises ?? dataset.exercises}
              workouts={overrides.workouts ?? dataset.workouts}
              period={period}
              metric={overrides.metric ?? "chargeMax"}
              filter={overrides.filter ?? "all"}
              onMetricChange={onMetricChange}
              onFilterChange={onFilterChange}
              returnTo={returnTo}
            />
          }
        />
        <Route path="/exercises/:id" element={<FicheProbe />} />
      </Routes>
    </MemoryRouter>,
  );

  return { ...utils, onMetricChange, onFilterChange, returnTo };
}

describe("Onglet Exercices — rendu (mockup 25, §16–17)", () => {
  it("état établi : sélecteur, en-tête avec dénominateur, compteurs, filtres, lignes classées avec pourcentage et mini-graphique", () => {
    renderPane();

    expect(screen.getByRole("group", { name: "Métrique" }).querySelectorAll("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Charge max" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/4 exercices éligibles sur 4 compatibles réalisés/)).toBeTruthy();
    expect(screen.getByText(/en baisse · .* stables? · .* en progression/)).toBeTruthy();

    const filters = screen.getByRole("group", { name: "Filtre de tendance" });
    expect(within(filters).getByText("Toutes").parentElement!.textContent).toContain("4");

    const rows = screen.getAllByRole("link").filter((link) => link.className.includes("trend-row"));
    expect(rows.length).toBe(4);
    /* Chaque ligne : dernière valeur, pourcentage sur la période, N réalisations, un graphique. */
    for (const row of rows) {
      expect(row.textContent).toMatch(/sur la période/);
      expect(row.textContent).toMatch(/\d+ réalisations/);
      expect(row.querySelector("svg.trend-sparkline")).toBeTruthy();
    }
    const squat = rows.find((row) => row.textContent!.includes("Squat barre"))!;
    expect(squat.textContent).toContain("52,5 kg");
    expect(squat.textContent).toContain("+12 %");
    /* Un point par réalisation, à sa date : 10 lundis. */
    expect(squat.querySelectorAll("circle")).toHaveLength(10);
    /* Pas de section « sans tendance » : tous éligibles. */
    expect(screen.queryByText(/sans tendance pour le moment/)).toBeNull();
  });

  it("filtre par statut et masque la section sans tendance hors de « Toutes »", () => {
    const { onFilterChange } = renderPane({ metric: "reps" });

    fireEvent.click(screen.getByRole("button", { name: /En progression/ }));
    expect(onFilterChange).toHaveBeenCalledWith("up");

    cleanup();
    renderPane({ metric: "reps", filter: "stable" });
    const rows = screen.getAllByRole("link").filter((link) => link.className.includes("trend-row"));
    for (const row of rows) expect(row.textContent).toMatch(/0 %|[+−][123] %/);
    expect(screen.queryByText(/sans tendance/)).toBeNull();
  });

  it("changer de métrique passe par le parent, et la compatibilité est stricte : Durée max ne montre que la planche", () => {
    const { onMetricChange } = renderPane();
    fireEvent.click(screen.getByRole("button", { name: "Durée max" }));
    expect(onMetricChange).toHaveBeenCalledWith("durationMax");

    cleanup();
    renderPane({ metric: "durationMax" });
    expect(screen.getByText(/1 exercice éligible sur 1 compatible réalisé/)).toBeTruthy();
    const rows = screen.getAllByRole("link").filter((link) => link.className.includes("trend-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("Planche");
    expect(screen.queryByText("Squat barre")).toBeNull();
  });

  it("état de démarrage : en-tête, encart, liste dépliée sans pourcentage, sans filtres ni graphiques", () => {
    /* Deux réalisations seulement dans la période : rien d'éligible. */
    const workouts = dataset.workouts.filter((w) => w.date >= "2026-09-03");
    renderPane({ workouts });

    expect(screen.getByText(/0 exercice éligible sur 4 compatibles réalisés/)).toBeTruthy();
    expect(screen.getByText(/Une tendance s'affiche à partir de 3 réalisations comparables/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Filtre de tendance" })).toBeNull();
    expect(document.querySelector("svg.trend-sparkline")).toBeNull();
    /* Aucun pourcentage pour un exercice non éligible. */
    expect(document.querySelector(".trend-row__percent")).toBeNull();
    expect(screen.getAllByText(/réalisations? sur 3/).length).toBe(4);
    expect(screen.getByText(/4 exercices sans tendance pour le moment/)).toBeTruthy();
  });

  it("aucun exercice compatible réalisé : titre, une phrase, rien d'autre", () => {
    renderPane({ metric: "durationMax", workouts: dataset.workouts.filter((w) => !w.id.startsWith("fx-w-a-") && !w.id.startsWith("fx-w-s-")) });

    expect(screen.getByText(/Aucun exercice compatible avec cette métrique/)).toBeTruthy();
    expect(screen.queryByText(/éligible/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Filtre de tendance" })).toBeNull();
  });

  it("un exercice supprimé de la bibliothèque disparaît de l'écran sans rien casser ; un exercice archivé reste", () => {
    const withoutSquat = dataset.exercises.filter((exercise) => exercise.id !== "fx-squat");
    renderPane({ exercises: withoutSquat });
    expect(screen.queryByText("Squat barre")).toBeNull();
    expect(screen.getByText(/3 exercices éligibles sur 3 compatibles réalisés/)).toBeTruthy();

    cleanup();
    const archived = dataset.exercises.map((exercise) =>
      exercise.id === "fx-squat" ? { ...exercise, status: "archived" as const } : exercise,
    );
    renderPane({ exercises: archived });
    expect(screen.getByText("Squat barre")).toBeTruthy();
  });

  it("une ligne ouvre la fiche en lui passant d'où l'on vient", () => {
    const { returnTo } = renderPane();
    fireEvent.click(screen.getByText("Squat barre"));

    expect(screen.getByTestId("probe").textContent).toBe(`/exercises/fx-squat ← ${returnTo}`);
  });

  it("formate les valeurs avec leur unité", () => {
    expect(formatMetricValue("chargeMax", 47.5)).toBe("47,5 kg");
    expect(formatMetricValue("volume", 1410)).toBe("1 410 kg");
    expect(formatMetricValue("reps", 12)).toBe("12 reps");
    expect(formatMetricValue("durationMax", 80)).toBe("1 min 20 s");
  });
});
