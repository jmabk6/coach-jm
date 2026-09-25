// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { PerformedSeries, StrengthFrameVersion } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { advisedLoadOf, formatAdvisedLoad } from "./advisedLoad";
import { startFreeWorkout } from "./startFreeWorkout";
import { suggestFrameLoad } from "./suggestedLoad";
import { WorkoutScreen } from "./WorkoutScreen";

/**
 * Lot M.2 — « Charge conseillée » chiffrée pour les exercices à venir, la
 * même valeur que la fiche exercice (charge à travailler du cadre).
 */

const T = "2026-09-20T10:00:00.000Z";
const byId = (id: string) => exerciseCatalog.find((exercise) => exercise.id === id)!;

function version(overrides: Partial<StrengthFrameVersion> = {}): StrengthFrameVersion {
  return {
    id: "v1", frameId: "f1", number: 1, status: "active", progressionType: "charge_croissante", workSets: 3,
    repRange: { min: 8, max: 10 }, rpeTarget: 8, restSec: 120, increment: { unit: "kg", value: 5 }, createdAt: T, updatedAt: T, ...overrides,
  };
}

const series = (kg: number, role: PerformedSeries["role"] = "travail"): PerformedSeries => ({
  id: `s${kg}`, position: 0, status: "completed", role, load: { kind: "total", kg }, reps: 10,
});

describe("charge conseillée", () => {
  it("cadre : l'objectif accepté, sinon la dernière série de travail — la même valeur que le « Conseillé » de la fiche", () => {
    const withTarget = version({ currentTarget: { value: 40, unit: "kg", acceptedAt: T }, barWeightKg: 20 });
    expect(formatAdvisedLoad(advisedLoadOf(byId("squat"), withTarget, [series(35)])!)).toBe("40 kg (barre + 10 kg de chaque côté)");
    expect(advisedLoadOf(byId("squat"), withTarget, [])!.value).toBe(suggestFrameLoad(withTarget, []).toWork!.value);

    const lastOnly = version();
    expect(formatAdvisedLoad(advisedLoadOf(byId("squat"), lastOnly, [series(30), series(35), series(20, "echauffement")])!)).toBe("35 kg");
    expect(advisedLoadOf(byId("squat"), lastOnly, [series(35)])!.value).toBe(suggestFrameLoad(lastOnly, [series(35)]).toWork!.value);
  });

  it("assistance : « d'assistance » ; sans cadre : la dernière charge ; sans historique : rien", () => {
    const assisted = version({ progressionType: "assistance_decroissante", currentTarget: { value: 52, unit: "kg", acceptedAt: T } });
    expect(formatAdvisedLoad(advisedLoadOf(byId("traction-assistee"), assisted, [])!)).toBe("52 kg d'assistance");
    expect(formatAdvisedLoad(advisedLoadOf(byId("tirage-vertical"), undefined, [series(40)])!)).toBe("40 kg");
    expect(advisedLoadOf(byId("tirage-vertical"), undefined, [])).toBeUndefined();
    expect(advisedLoadOf(byId("squat"), version(), undefined)).toBeUndefined();
  });
});

describe("écran de séance — exercices à venir", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resumeSeedsForTests();
    await runSeeds();
  });

  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 50));
    db.close();
    await db.delete();
  });

  it("Muscu A : squat « 35 kg (barre + 7,5 kg de chaque côté) », traction « 52 kg d'assistance » (maquette M9)", async () => {
    const template = (await db.sessionTemplates.get("v1-muscu-a"))!;
    await startFreeWorkout("2026-09-27", "2026-09-27T08:00:00.000Z", template);
    render(
      <MemoryRouter initialEntries={["/seance-en-cours"]}>
        <Routes>
          <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Charge conseillée : 35 kg (barre + 7,5 kg de chaque côté)", {}, { timeout: 4000 })).toBeDefined();
    expect(screen.getByText("Charge conseillée : 52 kg d'assistance")).toBeDefined();
  });
});
