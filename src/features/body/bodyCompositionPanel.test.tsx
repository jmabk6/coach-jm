// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Dexie from "dexie";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { saveBodyMeasurement } from "../../db/repositories/bodyRepository";
import { getSetting } from "../../db/repositories/settingsRepository";
import type { BodyMeasurement } from "../../domain";
import { canonicalStringify } from "../backup/canonicalJson";
import { readBackup, readStores, serializeBackup } from "../backup/exportBackup";
import { parseBackup, restoreInto } from "../backup/restoreBackup";
import { createTestDatabase } from "../backup/testDatabase";
import { GoalDetailScreen } from "../goals/GoalDetailScreen";
import { goalId } from "../goals/goalsV1";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { BodyTargetsScreen } from "./BodyTargetsScreen";

/**
 * Corps, phase 2.1 : le bloc « Composition corporelle » d'Objectifs ›
 * Poids (actuel, cible personnelle indicative, évolution) et l'écran
 * « Modifier la cible ».
 */

process.env.TZ = "Europe/Paris";

const T = "2026-10-05T06:00:00.000Z";

function renpho(id: string, takenAt: string, values: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return {
    id, date: takenAt.slice(0, 10), takenAt, device: "renpho", source: "manual", weightReference: true,
    weightKg: 91.15, fatPct: 27.5, muscleKg: 61.71, skeletalMuscleKg: 37.83, createdAt: T, updatedAt: T, ...values,
  };
}

function renderApp(path = "/objectifs/weight") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/objectifs/:key" element={<GoalDetailScreen />} />
        <Route path="/objectifs/weight/cible" element={<BodyTargetsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function panel(): Promise<HTMLElement> {
  return (await screen.findByRole("heading", { name: "Composition corporelle" })).closest("section") as HTMLElement;
}

/** Une ligne du tableau : libellé, actuel, cible, évolution. */
function row(section: HTMLElement, label: string): string[] {
  const header = within(section).getByRole("rowheader", { name: label });
  return Array.from(header.closest("tr")!.querySelectorAll("th, td")).map((cell) => cell.textContent ?? "");
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00"));
  db.close();
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("bloc « Composition corporelle » de l'objectif Poids", () => {
  it("une mesure RENPHO : quatre valeurs actuelles, quatre cibles, aucune évolution, libellé « Cible personnelle indicative »", async () => {
    await saveBodyMeasurement(renpho("r1", "2026-10-05T05:00:00.000Z"), T);
    renderApp();
    const section = await panel();
    await waitFor(() => expect(within(section).getByText("RENPHO · depuis le 5 oct.")).toBeTruthy());
    expect(row(section, "Poids")).toEqual(["Poids", "91,2 kg", "78–80 kg", "—"]);
    expect(row(section, "% graisse")).toEqual(["% graisse", "27,5 %", "12–15 %", "—"]);
    expect(row(section, "Masse grasse")).toEqual(["Masse grasse", "25,1 kg", "9–12 kg", "—"]);
    expect(row(section, "Muscle squel.")).toEqual(["Muscle squel.", "37,8 kg", "≥ 39 kg", "—"]);
    expect(within(section).getByText(/Cible personnelle indicative/)).toBeTruthy();
    expect(within(section).queryByText(/médical/i)).toBeNull();
    expect(within(section).queryAllByLabelText("dans la cible")).toHaveLength(0);
  });

  it("deux mesures RENPHO : évolution depuis la première, % de graisse en points ; coche discrète quand la cible est atteinte", async () => {
    await saveBodyMeasurement(renpho("r1", "2026-10-05T05:00:00.000Z"), T);
    await saveBodyMeasurement(renpho("r2", "2026-11-05T06:00:00.000Z", { weightKg: 86.95, fatPct: 24.4, skeletalMuscleKg: 39.13 }), T);
    renderApp();
    const section = await panel();
    await waitFor(() => expect(row(section, "Poids")).toEqual(["Poids", "87,0 kg", "78–80 kg", "−4,2 kg"]));
    expect(row(section, "% graisse")[3]).toBe("−3,1 points");
    expect(row(section, "Masse grasse")[3]).toBe("−3,9 kg");
    expect(row(section, "Muscle squel.")[3]).toBe("+1,3 kg");
    expect(within(section).getAllByLabelText("dans la cible")).toHaveLength(1);
  });

  it("la composition des pesées (Withings) n'entre jamais dans le bloc ; sans mesure RENPHO, pas de valeur inventée", async () => {
    await db.weightEntries.add({ id: "w-old", date: "2026-09-20", kg: 92, fatPct: 30, muscleKg: 60, createdAt: T, updatedAt: T });
    await db.bodyMeasurements.add(renpho("w1", "2026-09-21T05:00:00.000Z", { device: "withings", weightReference: false, weightKg: 92.4, fatPct: 29 }));
    renderApp();
    const section = await panel();
    await waitFor(() => expect(within(section).getByText("Aucune mesure RENPHO pour l'instant.")).toBeTruthy());
    expect(row(section, "Poids")).toEqual(["Poids", "—", "78–80 kg", "—"]);
    expect(row(section, "% graisse")).toEqual(["% graisse", "—", "12–15 %", "—"]);
    /* Les relevés Withings restent lisibles à part. */
    expect(screen.getByRole("heading", { name: "Composition Withings" })).toBeTruthy();
  });

  it("modifier la cible : valeurs préremplies, refus d'un minimum au-dessus du maximum, enregistrement, l'objectif Poids ne bouge pas ; persistant après redémarrage", async () => {
    await saveBodyMeasurement(renpho("r1", "2026-10-05T05:00:00.000Z"), T);
    const goalBefore = canonicalStringify(await db.goals.get(goalId("weight")));
    renderApp();
    const section = await panel();
    fireEvent.click(within(section).getByRole("link", { name: "Modifier" }));
    await screen.findByRole("heading", { name: "Cible de composition" });
    expect(screen.getByText(/pas une norme médicale/)).toBeTruthy();
    expect((screen.getByLabelText("Poids minimum en kg") as HTMLInputElement).value).toBe("78");
    expect((screen.getByLabelText("Poids maximum en kg") as HTMLInputElement).value).toBe("80");
    expect((screen.getByLabelText("Muscle squelettique minimum en kg") as HTMLInputElement).value).toBe("39");
    expect((screen.getByLabelText("Muscle squelettique maximum en kg (facultatif)") as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByLabelText("Poids minimum en kg"), { target: { value: "82" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la cible" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Poids : le minimum dépasse le maximum.");
    expect((await getSetting("bodyCompositionTargets"))?.weightKg).toEqual({ min: 78, max: 80 });

    fireEvent.change(screen.getByLabelText("Poids minimum en kg"), { target: { value: "76" } });
    fireEvent.change(screen.getByLabelText("Poids maximum en kg"), { target: { value: "78,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la cible" }));
    await waitFor(async () => expect(row(await panel(), "Poids")[2]).toBe("76–78,5 kg"));
    expect(canonicalStringify(await db.goals.get(goalId("weight")))).toBe(goalBefore);

    /* Redémarrage : la base se rouvre, la cible est toujours là. */
    cleanup();
    db.close();
    await db.open();
    renderApp();
    await waitFor(async () => expect(row(await panel(), "Poids")[2]).toBe("76–78,5 kg"));
  });

  it("sauvegarde puis restauration : la cible modifiée revient à l'identique", async () => {
    renderApp("/objectifs/weight/cible");
    await screen.findByRole("heading", { name: "Cible de composition" });
    fireEvent.change(screen.getByLabelText("% graisse maximum"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la cible" }));
    await waitFor(async () => expect((await getSetting("bodyCompositionTargets"))?.fatPct).toEqual({ min: 12, max: 16 }));

    const file = parseBackup(serializeBackup(await readBackup(db, { now: new Date(), buildTime: "b", userAgent: "t", standalone: true })));
    const target = createTestDatabase("coach-jm-cible-restauration", 3);
    await target.open();
    await restoreInto(file, target);
    const restored = (await readStores(target)).stores.settings as Array<{ key: string }>;
    const original = (await readStores(db)).stores.settings as Array<{ key: string }>;
    const pick = (records: Array<{ key: string }>) => records.find((record) => record.key === "bodyCompositionTargets");
    expect(canonicalStringify(pick(restored))).toBe(canonicalStringify(pick(original)));
    target.close();
    await Dexie.delete(target.name);
  });
});
