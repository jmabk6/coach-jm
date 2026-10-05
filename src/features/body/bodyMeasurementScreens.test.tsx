// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Dexie from "dexie";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { saveSetting } from "../../db/repositories/settingsRepository";
import { weightBodyContradictions } from "../../domain/rules/bodyWeightRules";
import { canonicalStringify } from "../backup/canonicalJson";
import { readBackup, readStores, serializeBackup } from "../backup/exportBackup";
import { parseBackup, restoreInto } from "../backup/restoreBackup";
import { createTestDatabase } from "../backup/testDatabase";
import { WeightCard } from "../weight/WeightCard";
import { recordWeight } from "../weight/weightActions";
import { BodyMeasurementCard } from "./BodyMeasurementCard";
import { BodyMeasurementFormScreen } from "./BodyMeasurementFormScreen";
import { BodyMeasurementScreen } from "./BodyMeasurementScreen";
import { BodyMeasurementsScreen } from "./BodyMeasurementsScreen";

/**
 * Corps, phase 2 : saisir, voir, corriger et supprimer une mesure
 * corporelle (RENPHO par défaut) ; la carte « dernière mesure » de
 * l'Accueil ; la pesée du jour suit la mesure de référence.
 */

process.env.TZ = "Europe/Paris";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <WeightCard today="2026-10-05" />
              <BodyMeasurementCard />
            </>
          }
        />
        <Route path="/corps/mesures" element={<BodyMeasurementsScreen />} />
        <Route path="/corps/mesures/nouvelle" element={<BodyMeasurementFormScreen />} />
        <Route path="/corps/mesures/:id" element={<BodyMeasurementScreen />} />
        <Route path="/corps/mesures/:id/modifier" element={<BodyMeasurementFormScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const valueOf = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

async function consistent(): Promise<string[]> {
  return weightBodyContradictions(await db.weightEntries.toArray(), await db.bodyMeasurements.toArray());
}

/** Saisie de la mesure du 05/10 par l'écran, depuis l'Accueil. */
async function enter0510() {
  fireEvent.click(await screen.findByRole("link", { name: "Ajouter une mesure" }));
  await screen.findByRole("heading", { name: "Nouvelle mesure" });
  type("Poids en kg", "91,90");
  type("Masse grasse en %", "27,5");
  type("Masse musculaire en kg", "62,12");
  type("Muscle squelettique en kg", "38,06");
  fireEvent.click(screen.getByText("Détails"));
  type("IMC", "29,3");
  type("Eau en kg", "48,80");
  type("Protéines en kg", "13,33");
  type("Os en kg", "4,50");
  type("Graisse viscérale (indice)", "10");
  type("Métabolisme de base en kcal", "1696");
  type("Âge métabolique en ans", "60");
  type("Score", "73");
  type("Bras gauche : graisse en kg", "1,6");
  type("Bras gauche : muscle en kg", "3,4");
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer la mesure" }));
  await screen.findByRole("heading", { name: /^Mesure du/ });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T06:50:00"));
  db.close();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("saisie d'une mesure corporelle", () => {
  it("création : RENPHO par défaut, valeurs calculées affichées sans être demandées, détails repliés ; la pesée du jour suit", async () => {
    renderApp();
    expect(await screen.findByText("Aucune mesure corporelle")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Ajouter une mesure" }));
    await screen.findByRole("heading", { name: "Nouvelle mesure" });

    /* Défauts : maintenant, RENPHO, poids de référence du jour. */
    expect(valueOf("Jour de la mesure")).toBe("2026-10-05");
    expect(valueOf("Heure de la mesure")).toBe("06:50");
    expect((screen.getByLabelText("Appareil") as HTMLSelectElement).value).toBe("renpho");
    expect(screen.getByText(/donne le poids du jour/)).toBeTruthy();

    /* Graisse en kg et masse sans graisse : calculées, jamais saisies. */
    expect(screen.queryByLabelText("Masse grasse en kg")).toBeNull();
    expect(screen.queryByLabelText("Masse sans graisse en kg")).toBeNull();
    type("Poids en kg", "91,90");
    type("Masse grasse en %", "27,5");
    const computed = screen.getByRole("group", { name: "Valeurs calculées" });
    expect(within(computed).getByText("25,27 kg")).toBeTruthy();
    expect(within(computed).getByText("66,63 kg")).toBeTruthy();

    /* Les détails sont repliés au départ. */
    const details = screen.getByText("Détails").closest("details")!;
    expect(details.open).toBe(false);
    cleanup();

    await db.delete();
    await db.open();
    renderApp();
    await enter0510();

    const [measurement] = await db.bodyMeasurements.toArray();
    expect(measurement).toMatchObject({
      date: "2026-10-05", device: "renpho", source: "manual", weightReference: true,
      weightKg: 91.9, fatPct: 27.5, muscleKg: 62.12, skeletalMuscleKg: 38.06, bmi: 29.3, waterKg: 48.8, proteinKg: 13.33, boneKg: 4.5,
      visceralFat: 10, bmrKcal: 1696, metabolicAge: 60, score: 73, segments: { leftArm: { fatKg: 1.6, muscleKg: 3.4 } },
    });
    expect(measurement).not.toHaveProperty("fatKg");
    expect(new Date(measurement!.takenAt).getHours()).toBe(6);
    expect(await db.weightEntries.toArray()).toEqual([expect.objectContaining({ date: "2026-10-05", kg: 91.9, bodyMeasurementId: measurement!.id })]);
    expect(await db.weightEntries.toArray()).toEqual([expect.not.objectContaining({ fatPct: expect.anything() })]);
    expect(await consistent()).toEqual([]);

    /* Écran de la mesure : toutes les valeurs, la provenance. */
    expect(screen.getByText("RENPHO · saisie manuelle")).toBeTruthy();
    expect(screen.getByText("Donne le poids du jour")).toBeTruthy();
    expect(screen.getByText("25,27 kg")).toBeTruthy();
    expect(screen.getByText("1 696 kcal")).toBeTruthy();
  });

  it("carte de l'Accueil : poids, % de graisse, graisse en kg, muscle squelettique, date, heure et appareil ; la pesée du jour reprend le poids", async () => {
    renderApp();
    await enter0510();
    fireEvent.click(screen.getByRole("link", { name: "Accueil" }));

    const card = await screen.findByRole("region", { name: "Dernière mesure corporelle" });
    await waitFor(() => expect(within(card).getByText("91,9 kg")).toBeTruthy());
    expect(within(card).getByText("27,5 %")).toBeTruthy();
    expect(within(card).getByText("25,3 kg")).toBeTruthy();
    expect(within(card).getByText("38,1 kg")).toBeTruthy();
    expect(within(card).getByText("lun. 5 oct. · 06:50 · RENPHO")).toBeTruthy();
    /* Pas de détail sur l'Accueil : il est sur l'écran de la mesure. */
    expect(within(card).queryByText(/1 696/)).toBeNull();

    const weight = screen.getByRole("region", { name: "Pesée du jour" });
    expect(within(weight).getByText("91,9 kg")).toBeTruthy();

    fireEvent.click(within(card).getByRole("link", { name: /Voir la mesure/ }));
    expect(await screen.findByRole("heading", { name: /^Mesure du/ })).toBeTruthy();
  });

  it("modification : préremplie, nouveau poids → pesée du jour mise à jour ; autre appareil → la pesée manuelle d'origine revient", async () => {
    const manual = await recordWeight("2026-10-05", "91,6", new Date("2026-10-05T05:10:00.000Z"), () => "manuel");
    renderApp();
    await enter0510();
    expect(await db.weightEntries.get("weight-manuel")).toMatchObject({ kg: 91.9 });

    fireEvent.click(screen.getByRole("link", { name: "Modifier" }));
    await screen.findByRole("heading", { name: "Modifier la mesure" });
    expect(valueOf("Poids en kg")).toBe("91,9");
    expect(valueOf("Muscle squelettique en kg")).toBe("38,06");
    type("Poids en kg", "91,7");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la mesure" }));
    await screen.findByRole("heading", { name: /^Mesure du/ });
    expect(await db.weightEntries.get("weight-manuel")).toMatchObject({ kg: 91.7 });
    expect(await db.bodyMeasurements.where("device").equals("renpho").count()).toBe(1);

    /* Changement de référence : la mesure passe sur un autre appareil, non éligible. */
    fireEvent.click(screen.getByRole("link", { name: "Modifier" }));
    await screen.findByRole("heading", { name: "Modifier la mesure" });
    fireEvent.change(screen.getByLabelText("Appareil"), { target: { value: "other" } });
    type("Nom de l'appareil", "Tanita BC-545");
    expect(screen.getByText(/ne donne pas le poids du jour/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la mesure" }));
    await screen.findByText("Tanita BC-545 · saisie manuelle");
    expect(await db.weightEntries.get("weight-manuel")).toEqual(manual);
    expect(await consistent()).toEqual([]);
  });

  it("réglage d'appareil de référence : une nouvelle mesure suit le réglage, sans rien coder en dur", async () => {
    await saveSetting({ key: "weightReferenceDevice", value: "withings" });
    renderApp("/corps/mesures/nouvelle");
    await screen.findByRole("heading", { name: "Nouvelle mesure" });
    type("Poids en kg", "91,9");
    expect(screen.getByText(/ne donne pas le poids du jour/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la mesure" }));
    await screen.findByRole("heading", { name: /^Mesure du/ });
    expect(await db.bodyMeasurements.toArray()).toEqual([expect.objectContaining({ device: "renpho", weightReference: false })]);
    expect(await db.weightEntries.count()).toBe(0);
  });

  it("refus : message en français, rien d'écrit", async () => {
    renderApp("/corps/mesures/nouvelle");
    await screen.findByRole("heading", { name: "Nouvelle mesure" });
    type("Masse grasse en %", "27,5");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la mesure" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Poids : obligatoire.");
    expect(await db.bodyMeasurements.count()).toBe(0);
  });

  it("suppression : confirmation d'abord (Annuler ne fait rien) ; puis la mesure disparaît, la pesée liée aussi", async () => {
    renderApp();
    await enter0510();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Supprimer cette mesure ?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await db.bodyMeasurements.count()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Supprimer\s*La mesure disparaît/ }));
    expect(await screen.findByText("Aucune mesure corporelle")).toBeTruthy();
    expect(await db.bodyMeasurements.count()).toBe(0);
    expect(await db.weightEntries.count()).toBe(0);
  });

  it("copie d'une pesée remplacée : lisible, ni modifiable ni supprimable", async () => {
    await recordWeight("2026-10-05", "91,6", new Date("2026-10-05T05:10:00.000Z"), () => "manuel");
    renderApp();
    await enter0510();
    cleanup();
    renderApp("/corps/mesures/body-from-weight-manuel");
    await screen.findByRole("heading", { name: /^Mesure du/ });
    expect(screen.getByText(/Copie de la pesée manuelle/)).toBeTruthy();
    expect(screen.getByText("Appareil inconnu · pesée d'origine")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Modifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
  });

  it("toutes les mesures : de la plus récente à la plus ancienne, avec l'appareil", async () => {
    renderApp();
    await enter0510();
    cleanup();
    renderApp("/corps/mesures");
    const list = await screen.findByRole("list", { name: "Mesures corporelles" });
    expect(within(list).getAllByRole("listitem")[0]?.textContent).toContain("RENPHO");
    expect(within(list).getAllByRole("listitem")[0]?.textContent).toContain("91,9 kg");
  });

  it("sauvegarde puis restauration après la saisie : mesure et pesée liée identiques", async () => {
    renderApp();
    await enter0510();
    const context = { now: new Date(), buildTime: "b", userAgent: "t", standalone: true };
    const file = parseBackup(serializeBackup(await readBackup(db, context)));
    expect(file.stores.bodyMeasurements).toHaveLength(1);

    const target = createTestDatabase("coach-jm-corps-restauration", 3);
    await target.open();
    await restoreInto(file, target);
    const restored = await readStores(target);
    expect(canonicalStringify(restored.stores.bodyMeasurements)).toBe(canonicalStringify(file.stores.bodyMeasurements));
    expect(canonicalStringify(restored.stores.weightEntries)).toBe(canonicalStringify(file.stores.weightEntries));
    target.close();
    await Dexie.delete(target.name);
  });
});
