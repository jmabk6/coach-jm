// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Dexie from "dexie";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { PlusScreen } from "../plus/PlusScreen";
import { buildEstablishedDataset } from "../progression/fixtures/establishedDataset";
import { BackupSection } from "./BackupSection";
import { readStores } from "./exportBackup";
import { canonicalStringify } from "./canonicalJson";
import { createTestDatabase, WRITE_METHODS, writePrototypeOf } from "./testDatabase";

const dataset = buildEstablishedDataset("2026-09-10");
const opened: Dexie[] = [];

async function populatedDatabase(): Promise<Dexie> {
  const database = createTestDatabase();
  opened.push(database);
  await database.table("exercises").bulkAdd(dataset.exercises);
  await database.table("sessionTemplates").bulkAdd(dataset.templates);
  await database.table("workouts").bulkAdd(buildImportedWorkouts());
  return database;
}

function fakeWindow(navigator: Partial<Navigator>): { nav: Navigator; win: Window } {
  const nav = { userAgent: "iPhone test", ...navigator } as Navigator;
  const win = {
    navigator: nav,
    document,
    matchMedia: () => ({ matches: true }),
  } as unknown as Window;
  return { nav, win };
}

async function renderReady(navigator: Partial<Navigator>, database?: Dexie) {
  const base = database ?? (await populatedDatabase());
  const { nav, win } = fakeWindow(navigator);
  render(<BackupSection database={base} now={() => new Date(2026, 8, 19, 10, 42)} buildTime="build-test" navigator={nav} window={win} />);
  fireEvent.click(screen.getByRole("button", { name: /Sauvegarder mes données/ }));
  await screen.findByText("Sauvegarde prête à partager");
  return { base, nav };
}

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

describe("Sauvegarder mes données — écran", () => {
  it("lit la base sans rien écrire et affiche comptes, taille, version du schéma lue et empreinte", async () => {
    const database = await populatedDatabase();
    const before = canonicalStringify(await readStores(database));
    const proto = writePrototypeOf(database);
    const spies = WRITE_METHODS.map((method) => vi.spyOn(proto, method));

    await renderReady({}, database);

    const card = screen.getByRole("region", { name: "Sauvegarde prête" });
    expect(within(card).getByText(/coach-jm-sauvegarde-2026-09-19-1042\.json · \d+ Ko · schéma version 1/)).toBeTruthy();
    const counts = Object.fromEntries(
      [...card.querySelectorAll("dl div")].map((row) => [row.querySelector("dt")!.textContent, row.querySelector("dd")!.textContent]),
    );
    expect(counts).toEqual({
      Exercices: String(dataset.exercises.length),
      "Modèles de séance": String(dataset.templates.length),
      Programmation: "0",
      "Séances planifiées": "0",
      "Séances réalisées": "10",
      Objectifs: "0",
      Pesées: "0",
    });
    expect(within(card).getByText("Empreinte").querySelector("code")!.textContent).toMatch(/^[0-9a-f]{8}$/);
    expect(within(card).getByText(/Notez-la/)).toBeTruthy();

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(canonicalStringify(await readStores(database))).toBe(before);
    /* Aucune formulation ne prétend que la sauvegarde est faite. */
    expect(card.textContent).not.toMatch(/réussi|effectuée|sauvegardé/i);
  });

  it("Partager : Web Share lancé → le message renvoie à la vérification sur PC, jamais à une réussite", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    await renderReady({ canShare: () => true, share } as Partial<Navigator>);

    fireEvent.click(screen.getByRole("button", { name: "Partager" }));

    await screen.findByText(/Partage lancé\. Enregistrez le fichier/);
    expect(share).toHaveBeenCalledOnce();
    const [{ files }] = share.mock.calls[0] as [{ files: File[] }];
    expect(files[0]!.name).toBe("coach-jm-sauvegarde-2026-09-19-1042.json");
    expect(files[0]!.type).toBe("application/json");
    expect(screen.getByText(/c'est cette vérification qui valide la sauvegarde/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Sauvegarde partagée|réussi/);
  });

  it("Partager annulé : « rien n'a été enregistré »", async () => {
    const abort = Object.assign(new Error("abort"), { name: "AbortError" });
    await renderReady({ canShare: () => true, share: vi.fn().mockRejectedValue(abort) } as Partial<Navigator>);

    fireEvent.click(screen.getByRole("button", { name: "Partager" }));

    await screen.findByText(/Partage refermé sans destination : rien n'a été enregistré/);
  });

  it("sans Web Share : téléchargement proposé, avec la consigne de vérifier qu'un fichier existe", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await renderReady({});

    fireEvent.click(screen.getByRole("button", { name: "Partager" }));

    await screen.findByText(/Téléchargement proposé\. Vérifiez qu'un fichier a bien été enregistré/);
    expect(click).toHaveBeenCalledOnce();
  });

  it("Copier le JSON : presse-papiers si possible, sinon la zone de texte apparaît", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await renderReady({ clipboard: { writeText } } as unknown as Partial<Navigator>);
    fireEvent.click(screen.getByRole("button", { name: "Copier le JSON" }));
    await screen.findByText(/JSON copié dans le presse-papiers/);
    expect(JSON.parse(writeText.mock.calls[0]![0] as string).format).toBe("coach-jm-backup");
    expect(screen.queryByLabelText("Contenu de la sauvegarde")).toBeNull();

    cleanup();
    await renderReady({});
    fireEvent.click(screen.getByRole("button", { name: "Copier le JSON" }));
    await screen.findByText(/Copie impossible/);
    const area = screen.getByLabelText("Contenu de la sauvegarde") as HTMLTextAreaElement;
    expect(area.value).toContain('"format": "coach-jm-backup"');
  });

  it("une base avec une valeur sans forme JSON fidèle : refus expliqué, aucun fichier", async () => {
    const database = createTestDatabase();
    opened.push(database);
    await database.table("goals").add({ id: "g", status: "active", dueDate: new Date() });
    const { nav, win } = fakeWindow({});
    render(<BackupSection database={database} navigator={nav} window={win} buildTime="b" />);

    fireEvent.click(screen.getByRole("button", { name: /Sauvegarder mes données/ }));

    await screen.findByText(/Sauvegarde refusée : 1 valeur sans forme JSON fidèle — goals · g · dueDate : objet Date/);
    expect(screen.queryByText("Sauvegarde prête à partager")).toBeNull();
  });

  it("sur une base v2, la carte garde les sept stores d'origine et résume les nouveaux stores vides", async () => {
    const database = createTestDatabase("coach-jm-test", 2);
    opened.push(database);
    await database.table("workouts").bulkAdd(buildImportedWorkouts());
    await database.table("mobilityObservations").add({ id: "o1", assessmentId: "a1", zone: "dos", ressenti: "limite" });

    await renderReady({}, database);

    const card = screen.getByRole("region", { name: "Sauvegarde prête" });
    expect(within(card).getByText(/schéma version 2/)).toBeTruthy();
    const labels = [...card.querySelectorAll("dl dt")].map((dt) => dt.textContent);
    expect(labels).toEqual([
      "Exercices",
      "Modèles de séance",
      "Programmation",
      "Séances planifiées",
      "Séances réalisées",
      "Objectifs",
      "Pesées",
      "Observations de mobilité",
    ]);
    expect(within(card).getByText("11 autres stores, vides, inclus dans le fichier.")).toBeTruthy();
  });

  it("signale les valeurs écrites sous une forme équivalente sans bloquer", async () => {
    const database = createTestDatabase();
    opened.push(database);
    const [workout] = buildImportedWorkouts();
    await database.table("workouts").add({ ...workout, activeRest: undefined });

    await renderReady({}, database);

    const details = screen.getByText(/1 valeur écrite sous une forme équivalente/);
    fireEvent.click(details);
    expect(screen.getByText(/workouts · import-2026-09-01 · activeRest : propriété indéfinie/)).toBeTruthy();
  });
});

describe("écran Plus — rappels", () => {
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("affiche en permanence « Sauvegardez avant d'importer » sous l'import, et le répète dans la confirmation", async () => {
    await db.delete();
    await db.open();
    render(
      <MemoryRouter>
        <PlusScreen />
      </MemoryRouter>,
    );

    const importButton = screen.getByRole("button", { name: /Importer mes séances de septembre 2026/ });
    expect(importButton.nextElementSibling?.textContent).toBe("Sauvegardez avant d'importer.");
    expect(screen.getByRole("button", { name: /Sauvegarder mes données/ })).toBeTruthy();

    fireEvent.click(importButton);
    await waitFor(() => expect(screen.getByText(/Sauvegardez vos données avant d'importer\./)).toBeTruthy());
    /* Rien n'a été importé : la confirmation attend. */
    expect(await db.workouts.count()).toBe(0);
  });
});
