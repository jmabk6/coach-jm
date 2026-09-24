// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DistanceStepInstruction, PerformedCardioStep, SessionStepInstruction, SessionTemplate } from "../../domain";
import { formatExerciseInstructionsRow, formatStepPrescription } from "../../domain/rules/blockInstructionRules";
import { estimateSessionTemplateDurationSec } from "../../domain/rules/sessionTemplateRules";
import { StepsEditor } from "../sessions/StepsEditor";
import { createWorkoutSnapshot } from "../workout/createWorkoutSnapshot";
import type { StepValues } from "../workout/engine/workoutEngine";
import { StepForm } from "../workout/StepForm";
import { formatCardioSettings } from "../workout/workoutRecap";
import { PROGRAM_V1_TEMPLATES, PROGRAM_V1_TEST_SCHEDULE } from "./programV1";

/**
 * Lot D.6 bis (décisions du 24/09/2026) : distance facultative sur le
 * vélo ; Cardio B aux paliers préremplis (10 min progressif, 8 × (1 min
 * RPE 7-8 / 2 min facile), 5 min de retour), 40 min estimées ; test
 * traction après l'échauffement.
 */

afterEach(cleanup);

const cardioB = PROGRAM_V1_TEMPLATES.find((template) => template.id === "v1-cardio-b")!;
const veloBlock = cardioB.blocks.find((block) => block.id === "v1-cardio-b-velo")!;
const steps = (veloBlock.kind === "exercise" && veloBlock.instructions.shape === "steps" ? veloBlock.instructions.steps : []) as DistanceStepInstruction[];

describe("Cardio B", () => {
  it("18 paliers préremplis, sans distance : 10 min, 8 × (1 min RPE 7-8 / 2 min), 5 min", () => {
    expect(steps.map((step) => [step.durationSec, step.targetRpe ? `${step.targetRpe.min}-${step.targetRpe.max}` : ""])).toEqual([
      [600, ""],
      ...Array.from({ length: 8 }, () => [[60, "7-8"], [120, ""]]).flat(),
      [300, ""],
    ]);
    expect(steps.every((step) => step.distanceKm === undefined)).toBe(true);
    expect(steps.map((step) => step.position)).toEqual(steps.map((_, index) => index));
  });

  it("durée estimée : 40 min (39 min de paliers + l'installation)", () => {
    expect(estimateSessionTemplateDurationSec(cardioB.blocks)).toBe(40 * 60);
    expect(formatExerciseInstructionsRow({ shape: "steps", steps })).toBe("18 paliers · 39 min");
  });

  it("au démarrage : paliers réalisés sans distance, jamais une distance inventée", () => {
    const template = { ...cardioB, status: "active", position: 0, createdAt: "x", updatedAt: "x" } as SessionTemplate;
    const block = createWorkoutSnapshot(template).find((item) => item.id === "workout-block-v1-cardio-b-velo");
    const settings = block?.kind === "exercise" ? block.cardioSteps?.map((step) => step.settings) : [];
    expect(settings).toHaveLength(18);
    expect(settings?.every((item) => !("distanceKm" in item))).toBe(true);
    expect(settings?.[1]).toEqual({ durationSec: 60 });
  });

  it("consigne lue sous le palier : « 1 min · RPE 7–8 » ; rien pour un palier sans RPE", () => {
    expect(formatStepPrescription(steps[1]!)).toBe("1 min · RPE 7–8");
    expect(formatStepPrescription(steps[0]!)).toBeUndefined();
    expect(formatStepPrescription({ id: "d", position: 0, durationSec: 600, distanceKm: 4, targetRpe: { min: 5, max: 6 } })).toBe("10 min · 4 km · RPE 5–6");
  });
});

describe("vélo : distance facultative", () => {
  const step: PerformedCardioStep = { id: "s", position: 0, status: "active", settings: { durationSec: 60 } };

  it("saisie en séance : la distance vide n'empêche pas de valider ; saisie, elle est gardée", () => {
    const onSubmit = vi.fn<(values: StepValues) => void>();
    render(<StepForm step={step} mode="execute" submitLabel="Valider" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ settings: { durationSec: 60 } });

    fireEvent.change(screen.getByLabelText("Distance (optionnel)"), { target: { value: "0,6" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ settings: { durationSec: 60, distanceKm: 0.6 } });
  });

  it("affichage d'un palier sans distance : rien à la place d'une distance", () => {
    expect(formatCardioSettings({ durationSec: 60 })).toEqual({ duration: "1 min", first: "", second: "" });
  });

  it("éditeur : distance « libre », retirable ; RPE posé puis retiré par le numéro du palier", () => {
    const onChange = vi.fn<(next: SessionStepInstruction[]) => void>();
    const withDistance: DistanceStepInstruction = { id: "p", position: 0, durationSec: 60, distanceKm: 0.5 };
    const { rerender } = render(<StepsEditor steps={[withDistance]} kind="distance" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("distance du palier 1"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: "p", position: 0, durationSec: 60 }]);

    fireEvent.click(screen.getByRole("button", { name: "RPE du palier 1" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith([{ ...withDistance, targetRpe: { min: 7, max: 8 } }]);

    rerender(<StepsEditor steps={[{ ...withDistance, targetRpe: { min: 7, max: 8 } }]} kind="distance" onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith([withDistance]);
  });

  it("éditeur : une liste vide de vélo reste un éditeur de vélo (nature lue sur l'exercice)", () => {
    const onChange = vi.fn<(next: SessionStepInstruction[]) => void>();
    render(<StepsEditor steps={[]} kind="distance" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un palier" }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ durationSec: 300, distanceKm: 1 })]);
    expect("speedKmh" in (onChange.mock.lastCall?.[0][0] ?? {})).toBe(false);
  });

  it("tapis (régression D.2) : décocher le RPE le retire vraiment", () => {
    const onChange = vi.fn<(next: SessionStepInstruction[]) => void>();
    const tapis: SessionStepInstruction = { id: "t", position: 0, durationSec: 60, speedKmh: 10, inclinePercent: 1, targetRpe: { min: 7, max: 8 } };
    render(<StepsEditor steps={[tapis]} kind="speed_incline" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Plages et RPE du palier 1" }));
    fireEvent.click(screen.getByRole("checkbox"));
    const { targetRpe: _removed, ...withoutRpe } = tapis;
    void _removed;
    expect(onChange).toHaveBeenLastCalledWith([withoutRpe]);
  });
});

describe("test traction", () => {
  it("placé après l'échauffement de Muscu A, traction ramenée à 2 séries", () => {
    expect(PROGRAM_V1_TEST_SCHEDULE.find((entry) => entry.protocolKey === "traction")).toMatchObject({
      templateId: "v1-muscu-a",
      placement: "after_warmup",
      adjustments: [{ blockId: "v1-muscu-a-traction", sets: 2 }],
    });
  });
});
