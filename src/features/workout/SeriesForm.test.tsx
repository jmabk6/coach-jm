// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RPE_SCALE_V1_TABLE } from "../../domain/rules/strengthRules";
import type { SeriesValues } from "./engine/workoutEngine";
import { SeriesForm } from "./SeriesForm";

afterEach(cleanup);

function typeReps(value: string) {
  fireEvent.change(screen.getByLabelText("Reps"), { target: { value } });
}

describe("SeriesForm — rôle, drapeau et aide RPE (lot 4A)", () => {
  it("série de musculation : travail par défaut, drapeau à faux, échauffement sans drapeau", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(
      <SeriesForm layout="load_reps" initial={{}} strengthFields rpeTable={RPE_SCALE_V1_TABLE} submitLabel="Valider" onSubmit={onSubmit} />,
    );

    const travail = screen.getByRole("button", { name: "Travail", pressed: true });
    expect(travail).toBeTruthy();
    const flag = screen.getByLabelText("Limitée par un côté") as HTMLInputElement;
    expect(flag.checked).toBe(false);

    typeReps("10");
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ reps: 10, role: "travail", sideLimited: false });

    fireEvent.click(flag);
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ reps: 10, role: "travail", sideLimited: true });

    /* Échauffement : la case disparaît, la valeur envoyée n'a pas de drapeau. */
    fireEvent.click(screen.getByRole("button", { name: "Échauffement" }));
    expect(screen.queryByLabelText("Limitée par un côté")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ reps: 10, role: "echauffement" });
  });

  it("l'aide RPE se déplie sur « ? » avec les six lignes de l'échelle en vigueur", () => {
    render(<SeriesForm layout="reps" initial={{}} strengthFields rpeTable={RPE_SCALE_V1_TABLE} submitLabel="Valider" onSubmit={() => undefined} />);

    expect(screen.queryByRole("table")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Échelle de RPE" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.textContent)).toEqual([
      "100 — échec, aucune répétition de plus",
      "91",
      "82 à 3",
      "74 à 5",
      "66 à 7",
      "5 et moins8 ou plus, estimation imprécise",
    ]);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("hors musculation ou sans table : ni rôle, ni drapeau, ni aide ; les valeurs restent nues", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(<SeriesForm layout="reps" initial={{}} submitLabel="Valider" onSubmit={onSubmit} />);

    expect(screen.queryByRole("button", { name: "Travail" })).toBeNull();
    expect(screen.queryByLabelText("Limitée par un côté")).toBeNull();
    expect(screen.queryByRole("button", { name: "Échelle de RPE" })).toBeNull();

    typeReps("8");
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ reps: 8 });
  });

  it("exercice mesuré par côté : le rôle existe, pas le drapeau", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(<SeriesForm layout="reps_per_side" initial={{}} strengthFields submitLabel="Valider" onSubmit={onSubmit} />);

    expect(screen.getByRole("button", { name: "Travail", pressed: true })).toBeTruthy();
    expect(screen.queryByLabelText("Limitée par un côté")).toBeNull();

    fireEvent.change(screen.getByLabelText("Gauche"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ sideValues: [{ side: "left", reps: 12 }], role: "travail", sideLimited: false });
  });

  it("barre connue (décision 4) : saisie par côté par défaut, total affiché, tare enregistrée avec la série", () => {
    const onSubmit = vi.fn<(values: SeriesValues) => void>();
    render(<SeriesForm layout="load_reps" initial={{}} strengthFields barWeightKg={20} submitLabel="Valider" onSubmit={onSubmit} />);

    expect(screen.getByRole("button", { name: "Par côté", pressed: true })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Charge"), { target: { value: "7,5" } });
    expect(screen.getByText("= 35 kg (7,5 / côté + 20 barre)")).toBeTruthy();

    typeReps("12");
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      load: { kind: "per_side", kgPerSide: 7.5, tareKg: 20 },
      reps: 12,
      role: "travail",
      sideLimited: false,
    });

    /* Total choisi explicitement : pas de tare, comme avant. */
    fireEvent.click(screen.getByRole("button", { name: "Total" }));
    fireEvent.change(screen.getByLabelText("Charge"), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ load: { kind: "total", kg: 35 }, reps: 12, role: "travail", sideLimited: false });
  });

  it("modification : rôle et drapeau de la série sont repris", () => {
    render(
      <SeriesForm
        layout="load_reps"
        initial={{ load: { kind: "total", kg: 40 }, reps: 10, role: "travail", sideLimited: true }}
        strengthFields
        submitLabel="Enregistrer"
        onSubmit={() => undefined}
      />,
    );

    expect((screen.getByLabelText("Limitée par un côté") as HTMLInputElement).checked).toBe(true);
  });
});
