// @vitest-environment jsdom
import "fake-indexeddb/auto";

import Dexie from "dexie";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import { formatWeightKg, parseWeightInput, weightDateError } from "../../domain/rules/weightRules";
import { canonicalStringify } from "../backup/canonicalJson";
import { readBackup, readStores, serializeBackup } from "../backup/exportBackup";
import { parseBackup, replaceWith } from "../backup/restoreBackup";
import { createTestDatabase } from "../backup/testDatabase";
import { WeightCard } from "./WeightCard";
import { correctWeight, recordWeight, removeWeight, todayForWeight } from "./weightActions";

/**
 * Lot I.1 — pesée quotidienne : une par jour local, remplacement le même
 * jour, jour passé permis, jour futur refusé, 30-250 kg, correction et
 * suppression ; sauvegarde à l'identique.
 */

/* Le fuseau de l'iPhone : les jours se comptent à Paris, jamais en UTC. */
process.env.TZ = "Europe/Paris";

const NOW = new Date("2026-09-24T07:00:00.000Z"); // jeudi 24/09, 9 h à Paris

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

describe("règles de saisie", () => {
  it("virgule ou point, une décimale, 30 à 250 kg", () => {
    expect(parseWeightInput("81,4")).toEqual({ ok: true, kg: 81.4 });
    expect(parseWeightInput(" 81.46 ")).toEqual({ ok: true, kg: 81.5 });
    expect(parseWeightInput("30")).toEqual({ ok: true, kg: 30 });
    expect(parseWeightInput("250")).toEqual({ ok: true, kg: 250 });
    expect(parseWeightInput("29,9")).toMatchObject({ ok: false, message: "Le poids doit être compris entre 30 et 250 kg." });
    expect(parseWeightInput("250,1")).toMatchObject({ ok: false });
    expect(parseWeightInput("")).toMatchObject({ ok: false, message: "Indiquez votre poids en kg." });
    expect(parseWeightInput("quatre-vingts")).toMatchObject({ ok: false });
    expect(formatWeightKg(81)).toBe("81,0 kg");
  });

  it("jamais une date future", () => {
    expect(weightDateError("2026-09-24", "2026-09-24")).toBeUndefined();
    expect(weightDateError("2026-09-20", "2026-09-24")).toBeUndefined();
    expect(weightDateError("2026-09-25", "2026-09-24")).toBe("Pas de pesée dans le futur.");
  });

  it("date locale : 00 h 30 à Paris appartient au jour qui commence, 23 h 30 au jour qui finit", () => {
    expect(todayForWeight(new Date("2026-09-26T22:30:00.000Z"))).toBe("2026-09-27"); // dim. 00 h 30 à Paris, sam. 22 h 30 UTC
    expect(todayForWeight(new Date("2026-09-27T21:30:00.000Z"))).toBe("2026-09-27"); // dim. 23 h 30 à Paris
  });
});

describe("enregistrement", () => {
  it("une pesée par jour : la seconde saisie remplace la valeur, même id, même création", async () => {
    const first = await recordWeight("2026-09-24", "81,4", NOW);
    const second = await recordWeight("2026-09-24", "80,9", new Date("2026-09-24T18:00:00.000Z"));

    expect(await db.weightEntries.count()).toBe(1);
    expect(second).toMatchObject({ id: first.id, createdAt: first.createdAt, kg: 80.9, updatedAt: "2026-09-24T18:00:00.000Z" });
  });

  it("pesée d'un jour passé ; jour futur et valeur hors bornes refusés sans rien écrire", async () => {
    await recordWeight("2026-09-23", "81,7", NOW);
    await expect(recordWeight("2026-09-25", "81", NOW)).rejects.toThrow("Pas de pesée dans le futur.");
    await expect(recordWeight("2026-09-24", "300", NOW)).rejects.toThrow("Le poids doit être compris entre 30 et 250 kg.");

    expect((await db.weightEntries.toArray()).map((entry) => [entry.date, entry.kg])).toEqual([["2026-09-23", 81.7]]);
  });

  it("à 00 h 30 à Paris, la pesée du jour est celle du jour qui commence", async () => {
    const entry = await recordWeight(todayForWeight(new Date("2026-09-26T22:30:00.000Z")), "81", new Date("2026-09-26T22:30:00.000Z"));
    expect(entry.date).toBe("2026-09-27");
  });

  it("correction : valeur et jour ; jamais vers un jour déjà pesé ; suppression", async () => {
    const a = await recordWeight("2026-09-22", "82", NOW);
    await recordWeight("2026-09-23", "81,8", NOW);

    await correctWeight(a.id, "2026-09-21", "82,3", NOW);
    expect(await db.weightEntries.get(a.id)).toMatchObject({ date: "2026-09-21", kg: 82.3 });

    await expect(correctWeight(a.id, "2026-09-23", "82", NOW)).rejects.toThrow("Une pesée existe déjà à cette date");
    await expect(correctWeight(a.id, "2026-09-30", "82", NOW)).rejects.toThrow("Pas de pesée dans le futur.");

    await removeWeight(a.id);
    expect((await db.weightEntries.toArray()).map((entry) => entry.date)).toEqual(["2026-09-23"]);
  });
});

describe("sauvegarde", () => {
  it("les pesées sont exportées puis restaurées à l'identique", async () => {
    await recordWeight("2026-09-21", "82,3", NOW);
    await recordWeight("2026-09-22", "82", NOW);
    await recordWeight("2026-09-24", "81,4", NOW);
    const file = parseBackup(serializeBackup(await readBackup(db, { now: NOW, buildTime: "b", userAgent: "t", standalone: true })));
    expect(file.counts.weightEntries).toBe(3);

    const target = createTestDatabase("coach-jm-pesees", 3);
    await target.open();
    await replaceWith(file, target);
    expect(canonicalStringify((await readStores(target)).stores.weightEntries)).toBe(canonicalStringify(file.stores.weightEntries));
    target.close();
    await Dexie.delete(target.name);
  });
});

describe("carte « Pesée du jour »", () => {
  it("pas de pesée : champ ouvert ; enregistrer ; la valeur s'affiche, modifiable, sans doublon", async () => {
    render(<WeightCard today="2026-09-24" />);

    fireEvent.change(await screen.findByLabelText("Poids en kg"), { target: { value: "81,4" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("81,4 kg")).toBeTruthy();
    expect(screen.queryByLabelText("Poids en kg")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const input = screen.getByLabelText("Poids en kg") as HTMLInputElement;
    expect(input.value).toBe("81,4");
    expect(screen.getByText(/81,4 kg déjà noté, la nouvelle valeur le remplacera/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "80,9" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("80,9 kg")).toBeTruthy();
    expect(await db.weightEntries.count()).toBe(1);
  });

  it("valeur hors bornes : message, rien d'écrit ; jour passé choisi dans le champ Jour", async () => {
    render(<WeightCard today="2026-09-24" />);

    fireEvent.change(await screen.findByLabelText("Poids en kg"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Le poids doit être compris entre 30 et 250 kg.");
    expect(await db.weightEntries.count()).toBe(0);

    expect((screen.getByLabelText("Jour de la pesée") as HTMLInputElement).max).toBe("2026-09-24");
    fireEvent.change(screen.getByLabelText("Jour de la pesée"), { target: { value: "2026-09-23" } });
    fireEvent.change(screen.getByLabelText("Poids en kg"), { target: { value: "81,7" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(async () => expect((await db.weightEntries.toArray()).map((entry) => entry.date)).toEqual(["2026-09-23"]));
    /* Aucune pesée aujourd'hui : le champ reste ouvert. */
    expect(screen.getByLabelText("Poids en kg")).toBeTruthy();
  });

  it("pesées récentes : correction, puis suppression après confirmation", async () => {
    await recordWeight("2026-09-22", "82", NOW);
    await recordWeight("2026-09-23", "81,8", NOW);
    render(<WeightCard today="2026-09-24" />);

    fireEvent.click(await screen.findByRole("button", { name: "Pesées récentes" }));
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("81,8 kg"), expect.stringContaining("82,0 kg")]);

    fireEvent.click(screen.getAllByRole("button", { name: "Corriger" })[0]!);
    fireEvent.change(screen.getByLabelText("Poids corrigé du 2026-09-23"), { target: { value: "81,6" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la correction" }));
    expect(await screen.findByText("81,6 kg")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[1]!);
    expect(screen.getByText(/Supprimer la pesée de/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Supprimer\s*La pesée disparaît/ }));
    await waitFor(async () => expect((await db.weightEntries.toArray()).map((entry) => entry.date)).toEqual(["2026-09-23"]));
  });
});
