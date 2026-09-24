// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RangeOrValue, SessionBlock, SessionStepInstruction, SessionTemplate } from "../models";
import { SecondsRangeInput } from "../../features/sessions/instructionFields";
import { StepsEditor } from "../../features/sessions/StepsEditor";
import { createWorkoutSnapshot } from "../../features/workout/createWorkoutSnapshot";
import { proposeSeriesValues } from "../../features/workout/engine/workoutBlocks";
import {
  formatDurationRange,
  formatExerciseInstructionsRow,
  formatGroupChildInstructionsRow,
  formatStepPrescription,
  formatValueRange,
} from "./blockInstructionRules";
import { highOf, lowOf, midOf, sumRanges, widenToRange } from "./rangeRules";
import { calculateSessionDuration } from "./workoutRules";

/**
 * Lot D.2 — consignes en plage (D16, conception V2 § 3.4.1) : une vraie
 * plage quand la prescription en est une ; le réalisé reste une valeur,
 * préremplie au bas de la plage ; les consignes anciennes (nombres) se
 * lisent à l'identique.
 */

afterEach(cleanup);

const warmup: SessionStepInstruction = { id: "p1", position: 0, durationSec: { min: 480, max: 600 }, speedKmh: 5, inclinePercent: 0 };
const principal: SessionStepInstruction = { id: "p2", position: 1, durationSec: 2100, speedKmh: 5, inclinePercent: { min: 6, max: 8 } };

describe("valeurs et plages", () => {
  it("bas, haut, milieu, somme ; un nombre reste un nombre", () => {
    const range: RangeOrValue = { min: 6, max: 8 };
    expect([lowOf(range), highOf(range), midOf(range)]).toEqual([6, 8, 7]);
    expect([lowOf(5), highOf(5), midOf(5)]).toEqual([5, 5, 5]);
    expect(sumRanges([{ min: 480, max: 600 }, 2100])).toEqual({ min: 2580, max: 2700 });
    expect(widenToRange(20, 10)).toEqual({ min: 20, max: 30 });
  });

  it("mise en forme : durées et valeurs, plage ou non", () => {
    expect(formatDurationRange(45)).toBe("45 s");
    expect(formatDurationRange({ min: 20, max: 30 })).toBe("20–30 s");
    expect(formatDurationRange({ min: 480, max: 600 })).toBe("8–10 min");
    expect(formatDurationRange({ min: 45, max: 90 })).toBe("45 s à 1 min 30");
    expect(formatDurationRange({ min: 60, max: 60 })).toBe("1 min");
    expect(formatValueRange({ min: 6, max: 8 }, "%")).toBe("6–8 %");
    expect(formatValueRange(4.5, "km/h")).toBe("4,5 km/h");
  });

  it("consigne d'un palier : « pente 6–8 % », RPE ; rien pour un palier à valeurs uniques", () => {
    expect(formatStepPrescription(principal)).toBe("35 min · 5 km/h · pente 6–8 %");
    expect(formatStepPrescription(warmup)).toBe("8–10 min · 5 km/h · pente 0 %");
    expect(formatStepPrescription({ id: "b", position: 0, durationSec: 60, speedKmh: 20, inclinePercent: 0, targetRpe: { min: 7, max: 8 } })).toBe(
      "1 min · 20 km/h · pente 0 % · RPE 7–8",
    );
    expect(formatStepPrescription({ id: "c", position: 0, durationSec: 300, speedKmh: 4.5, inclinePercent: 0 })).toBeUndefined();
  });

  it("rangées de consignes : plages lues, consignes anciennes inchangées", () => {
    expect(formatExerciseInstructionsRow({ shape: "steps", steps: [warmup, principal] })).toBe("2 paliers · 43–45 min · 5 km/h · 0 à 8 %");
    expect(formatExerciseInstructionsRow({ shape: "duration", sets: 3, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 60 })).toBe(
      "3 séries · 20–30 s · repos 1 min",
    );
    expect(formatExerciseInstructionsRow({ shape: "duration", sets: 3, durationSec: 45, restBetweenSetsSec: 60 })).toBe("3 séries · 45 s · repos 1 min");
    expect(formatGroupChildInstructionsRow({ shape: "duration", durationSec: { min: 30, max: 45 } })).toBe("30–45 s");
    expect(
      formatExerciseInstructionsRow({ shape: "steps", steps: [{ id: "x", position: 0, durationSec: 600, speedKmh: 5, inclinePercent: 0 }] }),
    ).toBe("1 palier · 10 min · 5 km/h · 0 %");
  });

  it("durée estimée : au milieu des plages", () => {
    const blocks = [
      { id: "b1", kind: "exercise", position: 0, exerciseId: "tapis", instructions: { shape: "steps", steps: [warmup, principal] } },
    ] as SessionBlock[];
    expect(calculateSessionDuration(blocks)).toBe(540 + 2100);
  });
});

describe("réalisé : une valeur, au bas de la plage", () => {
  it("le palier réalisé part du bas de chaque plage ; la consigne reste dans le snapshot", () => {
    const template = {
      id: "t",
      name: "Cardio A",
      category: "Cardio",
      status: "active",
      position: 0,
      createdAt: "x",
      updatedAt: "x",
      blocks: [{ id: "b1", kind: "exercise", position: 0, exerciseId: "tapis", instructions: { shape: "steps", steps: [warmup, principal] } }],
    } as unknown as SessionTemplate;

    const [block] = createWorkoutSnapshot(template);
    expect(block?.kind === "exercise" ? block.cardioSteps?.map((step) => step.settings) : undefined).toEqual([
      { durationSec: 480, speedKmh: 5, inclinePercent: 0 },
      { durationSec: 2100, speedKmh: 5, inclinePercent: 6 },
    ]);
    expect(block?.kind === "exercise" ? block.snapshotInstructions : undefined).toEqual({ shape: "steps", steps: [warmup, principal] });
  });

  it("durée en plage : proposée au bas de la plage", () => {
    const proposed = proposeSeriesValues({
      id: "b",
      kind: "exercise",
      position: 0,
      addedDuringWorkout: false,
      exerciseId: "suspension-omoplates",
      status: "not_performed",
      snapshotInstructions: { shape: "duration", sets: 3, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 60 },
      series: [],
    });
    expect(proposed).toEqual({ durationSec: 20 });
  });
});

describe("édition", () => {
  it("durée : le champ habituel, « Plage » ajoute la borne haute, un second appui revient à une valeur", () => {
    const onChange = vi.fn<(value: RangeOrValue) => void>();
    const { rerender } = render(<SecondsRangeInput label="Durée cible par série" value={20} onChange={onChange} />);

    expect(screen.queryByLabelText("Durée cible par série, maximum")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Durée cible par série en plage" }));
    expect(onChange).toHaveBeenLastCalledWith({ min: 20, max: 30 });

    rerender(<SecondsRangeInput label="Durée cible par série" value={{ min: 20, max: 30 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Durée cible par série, maximum"), { target: { value: "40" } });
    expect(onChange).toHaveBeenLastCalledWith({ min: 20, max: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Durée cible par série en plage", pressed: true }));
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it("palier : le numéro ouvre les plages et le RPE ; une plage s'affiche « 6–8 » dans la rangée", () => {
    const onChange = vi.fn<(steps: SessionStepInstruction[]) => void>();
    const single: SessionStepInstruction = { id: "p", position: 0, durationSec: 2100, speedKmh: 5, inclinePercent: 6 };
    const { rerender } = render(<StepsEditor steps={[single]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Plages et RPE du palier 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Pente du palier 1 (%) en plage" }));
    expect(onChange).toHaveBeenLastCalledWith([{ ...single, inclinePercent: { min: 6, max: 8 } }]);

    rerender(<StepsEditor steps={[{ ...single, inclinePercent: { min: 6, max: 8 } }]} onChange={onChange} />);
    expect(screen.getByLabelText("pente du palier 1").textContent).toBe("6–8");
    expect(screen.getByText("35 min")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith([{ ...single, inclinePercent: { min: 6, max: 8 }, targetRpe: { min: 7, max: 8 } }]);
  });
});
