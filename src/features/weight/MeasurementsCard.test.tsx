// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { saveManualTestResult } from "../tests/manualTestResult";
import { MeasurementsCard } from "./MeasurementsCard";

/**
 * Lot I.3 — carte « Mensurations du matin » de l'Accueil : le lundi d'une
 * semaine de tests, épaules et taille forment un résultat du protocole
 * « mensurations », rapport dérivé à 0,01 ; correction en une transaction.
 */

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("mensurations du matin", () => {
  it("lundi 28/09 : saisie, rapport en direct, résultat enregistré ; puis correction sans doublon", async () => {
    render(<MeasurementsCard today="2026-09-28" />);
    expect(await screen.findByText("Mensurations du matin")).toBeTruthy();
    expect(screen.getByText(/Épaules : au plus large, bras relâchés le long du corps\./)).toBeTruthy();

    type("Tour d'épaules en cm", "118");
    type("Tour de taille en cm", "92,3");
    expect(screen.getByText("Rapport épaules / taille : 1,28")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Rapport 1,28")).toBeTruthy();
    const [saved] = await db.testResults.toArray();
    expect(saved).toMatchObject({ protocolId: "protocol-mensurations", date: "2026-09-28", origin: "manual", status: "complete" });
    expect(saved!.measures).toEqual([
      { key: "epaules_cm", value: 118, unit: "cm" },
      { key: "taille_cm", value: 92.3, unit: "cm" },
      { key: "ratio_epaules_taille", value: 1.28, unit: "" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    type("Tour de taille en cm", "94");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Rapport 1,26")).toBeTruthy();
    const all = await db.testResults.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.measures.find((measure) => measure.key === "taille_cm")?.value).toBe(94);
  });

  it("une seule mesure : refus, rien d'enregistré", async () => {
    render(<MeasurementsCard today="2026-09-28" />);
    await screen.findByText("Mensurations du matin");
    type("Tour d'épaules en cm", "118");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Les deux tours sont nécessaires");
    expect(await db.testResults.count()).toBe(0);
  });

  it("jeudi de la même semaine, sans résultat : encore à faire ; semaine ordinaire : aucune carte", async () => {
    const { unmount } = render(<MeasurementsCard today="2026-10-01" />);
    expect(await screen.findByText(/Prévues le lundi 28 septembre 2026 : encore à faire cette semaine de tests\./)).toBeTruthy();
    unmount();

    render(<MeasurementsCard today="2026-10-05" />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Mensurations du matin")).toBeNull();
  });

  it("correction qui échoue : l'ancien résultat reste (une seule transaction)", async () => {
    const first = await saveManualTestResult(
      { protocolId: "protocol-mensurations", date: "2026-09-28", draft: { values: { epaules_cm: 118, taille_cm: 92 } } },
      "2026-09-28",
    );
    await expect(
      saveManualTestResult({ protocolId: "protocol-mensurations", date: "2026-09-28", draft: {}, replacesResultId: first.id }, "2026-09-28"),
    ).rejects.toThrow(/Aucune mesure/);
    await waitFor(async () => expect((await db.testResults.toArray()).map((result) => result.id)).toEqual([first.id]));
  });
});
