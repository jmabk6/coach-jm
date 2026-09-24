// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { fixExercisePowerUnit } from "../../db/repositories/exerciseRepository";
import type { Exercise, PerformedSeries, WorkoutSession } from "../../domain";
import { canJoinGroup, defaultInstructionsFor, formatMeasurementType } from "../../domain/rules/blockInstructionRules";
import { effectivePowerUnit, slowestRepSec } from "../../domain/rules/powerRules";
import { isMetricCompatible } from "../../domain/rules/workoutRules";
import {
  buildExercisePerformanceHistory,
  buildExercisePerformanceSummary,
  getCompatiblePerformanceMetrics,
} from "../exercises/exercisePerformance";
import type { SeriesValues } from "./engine/workoutEngine";
import { pickBestSeries } from "./workoutBlockDetail";
import { SeriesForm } from "./SeriesForm";
import { seriesFieldLayout } from "./workoutDisplay";
import { formatSeriesLine } from "./workoutRecap";

/**
 * Lot D.1 — mesures `reps_duration` (traction négative, D25) et
 * `duration_power` (sprints vélo, D17) : saisie, affichage, métriques,
 * unité fixée à la première saisie.
 */

const NOW = "2026-09-24T10:00:00.000Z";

const tractionNegative = {
  id: "traction-negative",
  name: "Traction négative",
  category: "Musculation",
  zone: "Dos",
  movement: "Tirage",
  equipment: "Poids du corps",
  location: "Salle",
  mode: "series",
  measurementType: "reps_duration",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
} satisfies Exercise;

const sprintVelo = {
  id: "sprint-velo",
  name: "Sprints vélo",
  category: "Cardio",
  equipment: "Vélo",
  location: "Salle",
  mode: "series",
  measurementType: "duration_power",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
} satisfies Exercise;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function series(values: Partial<PerformedSeries>, position = 0): PerformedSeries {
  return { id: `s${position}`, position, status: "completed", ...values };
}

function workout(id: string, date: string, exerciseId: string, items: PerformedSeries[]): WorkoutSession {
  return {
    id,
    date,
    startedAt: `${date}T10:00:00.000Z`,
    status: "completed",
    blocks: [{ id: `${id}-b`, kind: "exercise", position: 0, exerciseId, status: "performed", series: items }],
  } as unknown as WorkoutSession;
}

describe("modèle et règles", () => {
  it("les deux mesures se saisissent en séries, hors groupes, avec leurs consignes par défaut", () => {
    expect(seriesFieldLayout(tractionNegative)).toBe("reps_duration");
    expect(seriesFieldLayout(sprintVelo)).toBe("duration_power");
    expect(canJoinGroup(tractionNegative)).toBe(false);
    expect(canJoinGroup(sprintVelo)).toBe(false);
    expect(defaultInstructionsFor(sprintVelo, () => "x")).toEqual({ shape: "duration", sets: 6, durationSec: 12, restBetweenSetsSec: 48 });
    expect(defaultInstructionsFor(tractionNegative, () => "x")).toMatchObject({ shape: "reps", reps: { min: 3, max: 5 } });
    expect(formatMeasurementType(sprintVelo)).toBe("Durée + puissance ou distance");
    expect(isMetricCompatible("reps_duration", "reps")).toBe(true);
    expect(isMetricCompatible("duration_power", "max_duration")).toBe(false);
  });

  it("la plus lente des répétitions, en ignorant les valeurs vides ou nulles", () => {
    expect(slowestRepSec([6, 5.5, 4])).toBe(6);
    expect(slowestRepSec([0])).toBeUndefined();
    expect(slowestRepSec(undefined)).toBeUndefined();
  });

  it("unité en vigueur : celle de l'exercice, sinon celle d'un résultat déjà saisi, sinon aucune", () => {
    expect(effectivePowerUnit(sprintVelo, [])).toBeUndefined();
    expect(effectivePowerUnit(sprintVelo, [series({ durationSec: 12 }), series({ result: { unit: "meters", value: 200 } })])).toBe("meters");
    expect(effectivePowerUnit({ ...sprintVelo, powerUnit: "watts" }, [series({ result: { unit: "meters", value: 200 } })])).toBe("watts");
    expect(effectivePowerUnit(tractionNegative, [series({ result: { unit: "meters", value: 200 } })])).toBeUndefined();
  });
});

describe("SeriesForm", () => {
  it("reps_duration : une rangée de N champs s'affiche après les répétitions ; aucun n'est obligatoire", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(<SeriesForm layout="reps_duration" initial={{}} submitLabel="Valider" onSubmit={onSubmit} />);

    expect(screen.queryByText("Durée de chaque répétition (optionnel)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "3" } });
    expect(screen.getAllByLabelText(/Durée de la répétition \d, en secondes/)).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ reps: 3 });

    fireEvent.change(screen.getByLabelText("Durée de la répétition 1, en secondes"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Durée de la répétition 2, en secondes"), { target: { value: "5,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ reps: 3, repDurationsSec: [6, 5.5], durationSec: 6 });
  });

  it("reps_duration en modification : les durées enregistrées sont reprises", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(<SeriesForm layout="reps_duration" initial={{ reps: 2, repDurationsSec: [7, 6] }} submitLabel="Enregistrer" onSubmit={onSubmit} />);

    expect((screen.getByLabelText("Durée de la répétition 2, en secondes") as HTMLInputElement).value).toBe("6");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ reps: 2, repDurationsSec: [7, 6], durationSec: 7 });
  });

  it("duration_power sans unité fixée : watts ou mètres au choix ; résistance facultative", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(<SeriesForm layout="duration_power" initial={{ durationSec: 12 }} submitLabel="Valider" onSubmit={onSubmit} />);

    const submit = screen.getByRole("button", { name: "Valider" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Mètres" }));
    fireEvent.change(screen.getByLabelText("Résultat"), { target: { value: "210" } });
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenLastCalledWith({ durationSec: 12, result: { unit: "meters", value: 210 } });

    fireEvent.change(screen.getByLabelText("Résistance (optionnel)"), { target: { value: "8" } });
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenLastCalledWith({ durationSec: 12, result: { unit: "meters", value: 210 }, resistance: 8 });
  });

  it("duration_power avec unité fixée : plus de choix, l'unité est imposée", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(
      <SeriesForm
        layout="duration_power"
        initial={{ durationSec: 12, result: { unit: "meters", value: 1 } }}
        powerUnit="watts"
        submitLabel="Valider"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole("button", { name: "Mètres" })).toBeNull();
    expect(screen.getByText("Unité fixée : watts")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Résultat"), { target: { value: "650" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ durationSec: 12, result: { unit: "watts", value: 650 } });
  });
});

describe("affichage et métriques", () => {
  it("ligne de série : durées par répétition, résultat et résistance", () => {
    expect(formatSeriesLine(series({ reps: 3, repDurationsSec: [6, 5, 4], durationSec: 6 }))).toBe("3 reps · 6-5-4 s par rép.");
    expect(formatSeriesLine(series({ reps: 3 }))).toBe("3 reps");
    expect(formatSeriesLine(series({ durationSec: 12, result: { unit: "watts", value: 650 }, resistance: 8 }))).toBe("12 s · 650 W · résistance 8");
    expect(formatSeriesLine(series({ durationSec: 12, result: { unit: "meters", value: 210 } }))).toBe("12 s · 210 m");
  });

  it("meilleure série d'un effort en puissance : le meilleur résultat", () => {
    const best = pickBestSeries([
      series({ durationSec: 12, result: { unit: "watts", value: 600 } }, 0),
      series({ durationSec: 12, result: { unit: "watts", value: 680 } }, 1),
      series({ durationSec: 12, result: { unit: "watts", value: 640 } }, 2),
    ]);
    expect(best?.result?.value).toBe(680);
  });

  it("traction négative : répétitions et durée max (la descente la plus lente)", () => {
    expect(getCompatiblePerformanceMetrics(tractionNegative)).toEqual(["reps", "durationMax"]);
    const history = buildExercisePerformanceHistory(tractionNegative, [
      workout("w1", "2026-09-20", "traction-negative", [series({ reps: 3, repDurationsSec: [6, 5, 4], durationSec: 6 })]),
    ]);
    expect(history[0]).toMatchObject({ repsMax: 3, durationMaxSec: 6 });
  });

  it("puissance : comparée seulement à même unité et même durée que le jour le plus récent", () => {
    expect(getCompatiblePerformanceMetrics(sprintVelo)).toEqual(["powerMax"]);
    const history = buildExercisePerformanceHistory(sprintVelo, [
      workout("w1", "2026-09-01", "sprint-velo", [series({ durationSec: 12, result: { unit: "watts", value: 600 } })]),
      workout("w2", "2026-09-08", "sprint-velo", [series({ durationSec: 20, result: { unit: "watts", value: 900 } })]),
      workout("w3", "2026-09-15", "sprint-velo", [
        series({ durationSec: 12, result: { unit: "watts", value: 640 } }, 0),
        series({ durationSec: 12, result: { unit: "watts", value: 660 } }, 1),
      ]),
    ]);

    expect(history[0]).toMatchObject({ workoutId: "w3", powerMax: 660, powerDurationSec: 12, powerUnit: "watts" });
    const summary = buildExercisePerformanceSummary(history, "powerMax");
    /* Le 20 s (900 W) n'entre pas : 600 → 660, meilleur 660. */
    expect(summary).toMatchObject({ latestValue: 660, firstValue: 600, bestValue: 660 });
    expect(summary?.progressionPercent).toBeCloseTo(10);
  });
});

describe("unité fixée à la première saisie (D17)", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("pose l'unité une fois, ne la remplace jamais, ne touche pas updatedAt", async () => {
    await db.exercises.bulkAdd([sprintVelo, tractionNegative]);

    expect(await fixExercisePowerUnit("sprint-velo", "meters")).toBe("meters");
    expect(await fixExercisePowerUnit("sprint-velo", "watts")).toBe("meters");
    const stored = await db.exercises.get("sprint-velo");
    expect(stored?.powerUnit).toBe("meters");
    expect(stored?.updatedAt).toBe(NOW);

    expect(await fixExercisePowerUnit("traction-negative", "watts")).toBeUndefined();
    expect((await db.exercises.get("traction-negative"))?.powerUnit).toBeUndefined();
    expect(await fixExercisePowerUnit("absent", "watts")).toBeUndefined();
  });
});
