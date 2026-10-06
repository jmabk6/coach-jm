// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { BodyMeasurement, WeightEntry } from "../../domain";
import { WeightHistoryTable } from "./WeightHistoryTable";

/**
 * Objectif Poids : tout l'historique jour par jour sur une ligne
 * (06/10/2026) — date, poids, % de graisse, masse grasse, muscle
 * squelettique.
 */

const measure = (id: string, date: string, weightKg: number, fatPct: number, skeletalMuscleKg: number): BodyMeasurement =>
  ({ id, date, takenAt: `${date}T05:00:00.000Z`, device: "renpho", source: "manual", weightReference: true, weightKg, fatPct, skeletalMuscleKg, createdAt: "x", updatedAt: "x" }) as BodyMeasurement;
const entry = (date: string, kg: number, bodyMeasurementId?: string): WeightEntry =>
  ({ id: `weight-${date}`, date, kg, ...(bodyMeasurementId ? { bodyMeasurementId } : {}), createdAt: "x", updatedAt: "x" }) as WeightEntry;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

describe("WeightHistoryTable", () => {
  it("une ligne par pesée, la plus récente en haut : « 6/10 · 90,3 · 27,3 % · 24,7 kg · 37,6 kg »", async () => {
    await db.bodyMeasurements.bulkPut([measure("m6", "2026-10-06", 90.3, 27.3, 37.6), measure("m7", "2026-10-07", 89.6, 27.1, 37.7)]);
    await db.weightEntries.bulkPut([entry("2026-10-07", 89.6, "m7"), entry("2026-10-06", 90.3, "m6"), entry("2026-10-08", 89.4)]);
    render(<WeightHistoryTable />);

    const table = await screen.findByRole("table", { name: "Historique des pesées" });
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Date", "Poids", "% graisse", "M. grasse", "Muscle sq."]);
    const rows = within(table).getAllByRole("row").slice(1).map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["8/10", "89,4", "—", "—", "—"],
      ["7/10", "89,6", "27,1 %", "24,3 kg", "37,7 kg"],
      ["6/10", "90,3", "27,3 %", "24,7 kg", "37,6 kg"],
    ]);
  });

  it("aucune pesée : rien n'est affiché", async () => {
    const { container } = render(<WeightHistoryTable />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.textContent).toBe("");
  });
});
