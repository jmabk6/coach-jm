// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PerformedExerciseBlock, TestResult, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { TestProtocolsScreen } from "../tests/TestProtocolsScreen";
import { testProtocolId, testProtocolVersionId } from "../tests/testProtocolsV1";
import { activateNextSegment } from "./goalActions";
import { GoalDetailScreen } from "./GoalDetailScreen";

/**
 * Lot H.4 — M5 Progression : cartes, courbe (résultats de test seulement),
 * indicateurs secondaires, séances liées (échauffement exclu, N10), édition
 * de la cible, de l'échéance et de la mesure de Jambes, « Passer à la
 * traction stricte » seulement si S1 est atteint (N12).
 */

const T = "2026-09-23T08:00:00.000Z";

function result(key: string, date: string, measures: TestResult["measures"]): TestResult {
  return {
    id: `r-${key}-${date}`, protocolId: testProtocolId(key), versionId: testProtocolVersionId(key, 1), date, origin: "manual",
    status: "complete", measures, createdAt: T, updatedAt: T,
  };
}

function block(id: string, exerciseId: string, series: Array<{ kg: number; reps: number }>, role?: "warmup"): PerformedExerciseBlock {
  return {
    id, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId, status: "performed", ...(role ? { role } : {}),
    snapshotInstructions: { shape: "reps", sets: series.length, reps: { min: 6, max: 12 }, restBetweenSetsSec: 90 },
    series: series.map((item, index) => ({ id: `${id}-${index}`, position: index, status: "completed" as const, load: { kind: "total" as const, kg: item.kg }, reps: item.reps, completedAt: T })),
  };
}

function workout(id: string, date: string, blocks: WorkoutSession["blocks"]): WorkoutSession {
  return {
    id, source: "free", kind: "training", status: "completed", date, startedAt: `${date}T08:00:00.000Z`, completedAt: `${date}T09:00:00.000Z`,
    lastActionAt: `${date}T09:00:00.000Z`, activeDurationSec: 3600, blocks, createdAt: T, updatedAt: T,
  };
}

function Where() {
  return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
}

function renderGoal(key: string) {
  render(
    <MemoryRouter initialEntries={[`/objectifs/${key}`]}>
      <Routes>
        <Route path="/objectifs/:key" element={<GoalDetailScreen />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const card = (title: string) => screen.getByText(title).closest(".goal-card") as HTMLElement;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T10:00:00"));
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  /* Les chargements lancés par un écran démonté se terminent avant la fermeture de la base. */
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

describe("M5 — Traction sans résultat", () => {
  it("cartes, premier test, courbe vide ; indicateurs et séances liées lus sur l'entraînement", async () => {
    await db.workouts.bulkPut([
      workout("w1", "2026-09-01", [block("b1", "tirage-vertical", [{ kg: 40, reps: 8 }])]),
      workout("w2", "2026-09-20", [block("b2", "tirage-vertical", [{ kg: 45, reps: 7 }, { kg: 40, reps: 10 }])]),
    ]);
    renderGoal("traction");

    expect(await screen.findByRole("heading", { level: 1, name: "Traction" })).toBeDefined();
    expect(within(card("Aujourd'hui")).getByText("À mesurer")).toBeDefined();
    expect(within(card("Statut")).getByText("Premier test le 27 septembre 2026")).toBeDefined();
    expect(within(card("Échéance")).getByText("31 mars 2027")).toBeDefined();
    expect(within(card("Échéance")).getByText("6 mois restants")).toBeDefined();

    expect(screen.getByRole("heading", { name: "Premier test" })).toBeDefined();
    expect(screen.getByText("Les résultats apparaîtront ici après ton premier test.")).toBeDefined();
    /* Aucune séance ne devient un point de la courbe. */
    expect(document.querySelectorAll(".goal-curve__point")).toHaveLength(0);

    const tirage = screen.getAllByText("Tirage vertical à la poulie")[0]!.closest(".goal-secondary__card") as HTMLElement;
    expect(within(tirage).getByText("45 kg × 7")).toBeDefined();
    expect(within(tirage).getByText("+5 kg depuis le 1 sept.")).toBeDefined();

    const rows = document.querySelectorAll(".goal-linked__row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Tirage vertical à la poulie : 45 kg × 7");
    expect(screen.queryByRole("button", { name: /traction stricte/ })).toBeNull();
  });

  it("« Saisir un test passé » ouvre la saisie du protocole et y revient", async () => {
    render(
      <MemoryRouter initialEntries={[`/plus/protocoles?saisie=${testProtocolId("traction")}&retour=%2Fobjectifs%2Ftraction`]}>
        <Routes>
          <Route path="/plus/protocoles" element={<TestProtocolsScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "‹ Protocoles" }));
    expect(await screen.findByText("/objectifs/traction")).toBeDefined();
  });
});

describe("M5 — séances liées : échauffement exclu (N10)", () => {
  it("un tapis d'échauffement ne fait pas une séance liée au Cardio", async () => {
    await db.workouts.put(workout("w3", "2026-09-21", [block("b3", "tapis", [{ kg: 0, reps: 0 }], "warmup")]));
    renderGoal("cardio");
    expect(await screen.findByText("Aucune séance enregistrée avec ces exercices pour le moment.")).toBeDefined();
  });
});

describe("M5 — Palier atteint (N12)", () => {
  it("Traction à 0 kg : « Palier atteint », jamais « objectif atteint » ; bouton puis passage à S2 avec échéance", async () => {
    await db.testResults.put(result("traction", "2026-09-20", [{ key: "assistance_min_kg", value: 0, unit: "kg" }]));
    renderGoal("traction");
    expect(await screen.findByText("Palier atteint — prochaine étape : traction stricte")).toBeDefined();
    expect(within(card("Statut")).getByText("Palier atteint")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/objectif atteint/i);
    expect(screen.getByRole("button", { name: "Passer à la traction stricte" })).toBeDefined();

    const goal = await activateNextSegment("goal-traction", "2027-06-30", T);
    expect(goal.currentSegmentId).toBe("goal-traction-s2");
    expect(goal.segments[1]!.dueDate).toBe("2027-06-30");
    /* S1 garde sa cible et son échéance. */
    expect(goal.segments[0]).toMatchObject({ target: 0, dueDate: "2027-03-31" });
  });
});

describe("M5 — édition", () => {
  it("Tronc : cible et échéance saisies, statut recalculé", async () => {
    await db.testResults.put(result("tronc", "2026-09-20", [{ key: "planche_duree_s", value: 60, unit: "s" }]));
    renderGoal("core");
    expect(await within(await waitFor(() => card("Statut"))).findByText("Cible ou échéance à définir")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Modifier la cible et l'échéance" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Cible"), { target: { value: "120" } });
    fireEvent.change(within(sheet).getByLabelText("Échéance"), { target: { value: "2027-03-31" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /Enregistrer/ }));

    await waitFor(async () => expect((await db.goals.get("goal-core"))!.segments[0]).toMatchObject({ target: 120, dueDate: "2027-03-31" }));
    expect(await within(card("Statut")).findByText("Dans les temps")).toBeDefined();
  });

  it("Jambes : la mesure choisie devient celle du segment, avec son sens et son libellé", async () => {
    renderGoal("legs");
    fireEvent.click(await screen.findByRole("button", { name: "Modifier la mesure, la cible et l'échéance" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Mesure"), { target: { value: "sprint_baisse_pct" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /Enregistrer/ }));

    await waitFor(async () =>
      expect((await db.goals.get("goal-legs"))!.segments[0]).toMatchObject({
        measure: { source: "test", protocolId: "protocol-jambes", measureKey: "sprint_baisse_pct" },
        direction: "decrease",
        label: "Baisse du 1er au 6e sprint",
      }),
    );
    expect((await db.goals.get("goal-legs"))!.segments[0]!.target).toBeUndefined();
  });
});
