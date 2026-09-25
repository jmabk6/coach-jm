// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { getLastExport, LAST_EXPORT_KEY, recordExport } from "../backup/lastExport";
import { BackupScreen } from "./BackupScreen";

/** Lot L.4 — Plus > Sauvegarde : exporter, importer, effacer, dernier export de l'appareil. */

beforeEach(async () => {
  localStorage.clear();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

function renderScreen() {
  render(
    <MemoryRouter>
      <BackupScreen />
    </MemoryRouter>,
  );
}

describe("Plus > Sauvegarde", () => {
  it("les trois actions ; aucun export encore depuis cet appareil", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Sauvegarde" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Sauvegarder mes données/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Importer une sauvegarde/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Effacer toutes les données/ })).toBeDefined();
    expect(screen.getByText(/Aucun export depuis cet appareil/)).toBeDefined();
  });

  it("dernier export : la date retenue au dernier fichier parti", () => {
    recordExport(new Date(2026, 8, 25, 22, 32));
    expect(localStorage.getItem(LAST_EXPORT_KEY)).toBe(new Date(2026, 8, 25, 22, 32).toISOString());
    expect(getLastExport()).toBe(new Date(2026, 8, 25, 22, 32).toISOString());
    renderScreen();
    expect(screen.getByText(/Dernier export depuis cet appareil : vendredi 25 septembre 2026 à 22:32/)).toBeDefined();
  });
});
