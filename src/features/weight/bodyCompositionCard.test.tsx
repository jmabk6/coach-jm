// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { saveBodyMeasurement } from "../../db/repositories/bodyRepository";
import type { WeightEntry } from "../../domain";
import { WeightCard } from "./WeightCard";
import { correctWeight, recordWeight } from "./weightActions";

/**
 * Carte « Pesée du jour » (Corps, phase 2, 05/10/2026) : la pesée ne
 * porte plus que le poids. La composition se saisit dans une mesure
 * corporelle ; les anciennes compositions restent lisibles, jamais
 * modifiables ici.
 */

process.env.TZ = "Europe/Paris";

const NOW = new Date("2026-09-24T07:00:00.000Z");
const T = NOW.toISOString();

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

describe("carte « Pesée du jour » — poids seul", () => {
  it("ni masse grasse ni masse musculaire, ni « + composition » : la pesée s'enregistre sans composition", async () => {
    render(<WeightCard today="2026-09-24" />);
    fireEvent.change(await screen.findByLabelText("Poids en kg"), { target: { value: "81,4" } });
    expect(screen.queryByRole("button", { name: "+ composition" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "autre jour" }));
    expect(screen.queryByLabelText(/Masse grasse/)).toBeNull();
    expect(screen.queryByLabelText(/Masse musculaire/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Poids en kg"), { target: { value: "81,4" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(async () => expect(await db.weightEntries.count()).toBe(1));
    expect(Object.keys((await db.weightEntries.toArray())[0]!).sort()).toEqual(["createdAt", "date", "id", "kg", "updatedAt"]);
  });

  it("l'ancien formulaire ne peut plus créer de composition, même appelé avec", async () => {
    const legacyForm = { kg: "81,2", fatPct: "18,4", muscleKg: "62,1" } as unknown as string;
    const saved = await recordWeight("2026-09-24", legacyForm, NOW);
    expect(saved).not.toHaveProperty("fatPct");
    expect(saved).not.toHaveProperty("muscleKg");
    expect(saved.kg).toBe(81.2);
  });

  it("ancienne pesée avec composition : lisible dans les pesées récentes ; la correction ne touche que le poids et le jour, la composition reste", async () => {
    const old: WeightEntry = { id: "w-old", date: "2026-09-23", kg: 81.8, fatPct: 18.6, muscleKg: 61.5, createdAt: T, updatedAt: T };
    await db.weightEntries.add(old);
    await recordWeight("2026-09-22", "82", NOW);
    render(<WeightCard today="2026-09-24" />);

    fireEvent.click(await screen.findByRole("button", { name: "autre jour" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pesées récentes" }));
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("MG 18,6 % · MM 61,5 kg");
    expect(rows[1]?.textContent).not.toContain("MG");

    fireEvent.click(screen.getAllByRole("button", { name: "Corriger" })[0]!);
    expect(screen.queryByLabelText(/Masse grasse/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Poids corrigé du 2026-09-23"), { target: { value: "81,7" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("81,7 kg"));
    expect(await db.weightEntries.get("w-old")).toMatchObject({ kg: 81.7, fatPct: 18.6, muscleKg: 61.5 });

    await correctWeight("w-old", "2026-09-23", "81,6", NOW);
    expect(await db.weightEntries.get("w-old")).toMatchObject({ kg: 81.6, fatPct: 18.6, muscleKg: 61.5 });
  });

  it("pesée liée à une mesure : la carte dit d'où vient le poids ; ni correction ni suppression à la main", async () => {
    await saveBodyMeasurement({
      id: "m1", date: "2026-09-24", takenAt: "2026-09-24T04:50:00.000Z", device: "renpho", source: "manual", weightReference: true,
      weightKg: 81.3, createdAt: T, updatedAt: T,
    }, T);
    await recordWeight("2026-09-23", "81,8", NOW);
    render(<WeightCard today="2026-09-24" />);

    fireEvent.click(await screen.findByRole("button", { name: /^Pesée/ }));
    expect(screen.getByText("Poids repris de la mesure RENPHO de 06:50 : pour le changer, modifiez la mesure.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pesées récentes" }));
    const [linked, manual] = screen.getAllByRole("listitem");
    expect(linked?.textContent).toContain("mesure RENPHO");
    expect(within(linked!).queryByRole("button", { name: "Corriger" })).toBeNull();
    expect(within(linked!).queryByRole("button", { name: "Supprimer" })).toBeNull();
    expect(within(manual!).getByRole("button", { name: "Corriger" })).toBeTruthy();
  });
});
