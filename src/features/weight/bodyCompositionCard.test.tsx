// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { WeightCard } from "./WeightCard";
import { recordWeight } from "./weightActions";

/** Carte « Pesée du jour » : masse grasse et masse musculaire facultatives (26/09/2026). */

process.env.TZ = "Europe/Paris";

const NOW = new Date("2026-09-24T07:00:00.000Z");

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterEach(cleanup);

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("carte « Pesée du jour » — composition", () => {
  it("poids seul : enregistré sans composition ; avec : affichée sous le poids, préremplie à la modification", async () => {
    const { container } = render(<WeightCard today="2026-09-24" />);

    fireEvent.change(await screen.findByLabelText("Poids en kg"), { target: { value: "81,4" } });
    fireEvent.change(screen.getByLabelText("Masse grasse en %"), { target: { value: "18,4" } });
    fireEvent.change(screen.getByLabelText("Masse musculaire en kg"), { target: { value: "62,1" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(container.querySelector(".weight-card__composition")?.textContent).toBe("MG 18,4 % · MM 62,1 kg"));
    expect(await db.weightEntries.toArray()).toEqual([expect.objectContaining({ kg: 81.4, fatPct: 18.4, muscleKg: 62.1 })]);

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect((screen.getByLabelText("Masse grasse en %") as HTMLInputElement).value).toBe("18,4");
    expect((screen.getByLabelText("Masse musculaire en kg") as HTMLInputElement).value).toBe("62,1");

    /* Vider la masse grasse l'efface. */
    fireEvent.change(screen.getByLabelText("Masse grasse en %"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(container.querySelector(".weight-card__composition")?.textContent).toBe("MM 62,1 kg"));
    expect((await db.weightEntries.toArray())[0]).not.toHaveProperty("fatPct");
  });

  it("hors bornes : message, rien d'écrit", async () => {
    render(<WeightCard today="2026-09-24" />);
    fireEvent.change(await screen.findByLabelText("Poids en kg"), { target: { value: "81" } });
    fireEvent.change(screen.getByLabelText("Masse musculaire en kg"), { target: { value: "130" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Masse musculaire : entre 20 et 120 kg.");
    expect(await db.weightEntries.count()).toBe(0);
  });

  it("pesées récentes : composition sous la ligne ; la correction la modifie", async () => {
    await recordWeight("2026-09-23", { kg: "81,8", fatPct: "18,6" }, NOW);
    await recordWeight("2026-09-22", "82", NOW);
    render(<WeightCard today="2026-09-24" />);

    fireEvent.click(await screen.findByRole("button", { name: "Pesées récentes" }));
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("MG 18,6 %");
    expect(rows[1]?.textContent).not.toContain("MG");

    fireEvent.click(screen.getAllByRole("button", { name: "Corriger" })[0]!);
    expect((screen.getByLabelText("Masse grasse en % corrigée du 2026-09-23") as HTMLInputElement).value).toBe("18,6");
    fireEvent.change(screen.getByLabelText("Masse musculaire en kg corrigée du 2026-09-23"), { target: { value: "61,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("MG 18,6 % · MM 61,5 kg"));
  });
});
