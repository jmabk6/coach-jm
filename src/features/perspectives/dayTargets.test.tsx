// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/database";
import type { DayTarget, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { WorkoutScreen } from "../workout/WorkoutScreen";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { activateBlock } from "../workout/engine/workoutEngine";
import { formatTargetLines } from "./dayTargetFormat";
import { freezeDayTargets, loadDayTargetContext, withDayTargets } from "./dayTargets";

/**
 * Objectif du jour en séance (lot P2, 22/10/2026) : figé à l'ouverture de
 * la séance, jamais déplacé par ce qui est noté, préremplissage aligné,
 * retour après la dernière série, lien vers la perspective ; le chrono du
 * repos n'est pas touché.
 */

const T = "2026-10-21T17:00:00.000Z";

/** Une Muscu B enregistrée : chest press 55 kg · 8/8/6 · RPE 8/9/9 (ta séance du 21/10). */
function chestSession(date: string, reps: number[], rpe: number[], kg = 55): WorkoutSession {
  return {
    id: `w-${date}`, source: "planned", sessionTemplateId: "v2-muscu-b", status: "completed", date, startedAt: `${date}T17:00:00.000Z`,
    completedAt: `${date}T18:00:00.000Z`, lastActionAt: T, activeDurationSec: 3600, createdAt: T, updatedAt: T,
    blocks: [
      {
        id: "workout-block-v2-muscu-b-chest-press", sourceBlockId: "v2-muscu-b-chest-press", kind: "exercise", position: 2, addedDuringWorkout: false,
        exerciseId: "chest-press", status: "performed", snapshotInstructions: { shape: "reps", sets: 3, reps: { min: 6, max: 8 }, restBetweenSetsSec: 150 },
        series: reps.map((value, index) => ({ id: `s${index}`, position: index, status: "completed" as const, role: "travail" as const, load: { kind: "total" as const, kg }, reps: value, rpe: rpe[index]!, completedAt: T })),
      },
    ],
  } as WorkoutSession;
}

const chestOf = (workout: WorkoutSession) => workout.blocks.find((block) => block.kind === "exercise" && block.sourceBlockId === "v2-muscu-b-chest-press") as PerformedExerciseBlock;
const presseOf = (workout: WorkoutSession) => workout.blocks.find((block) => block.kind === "exercise" && block.sourceBlockId === "v2-muscu-b-presse") as PerformedExerciseBlock;

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 50));
  db.close();
  await db.delete();
});

describe("objectif du jour figé", () => {
  it("calculé à l'ouverture sur la dernière séance comparable : chest press 55 kg · 8/8/6–7, RPE ≤ 9 ; presse suspendue ; traction : pas de second objectif", async () => {
    await db.workouts.put(chestSession("2026-10-21", [8, 8, 6], [8, 9, 9]));
    const template = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const started = await startFreeWorkout("2026-10-27", "2026-10-27T17:00:00.000Z", template);
    const frozen = (await freezeDayTargets(started.id, [chestSession("2026-10-21", [8, 8, 6], [8, 9, 9])], "2026-10-27T17:00:01.000Z"))!;
    expect(chestOf(frozen).dayTarget).toMatchObject({ kind: "progress", rpeMax: 9, basisWorkoutId: "w-2026-10-21", sets: [{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 7, stretch: true }] });
    expect(presseOf(frozen).dayTarget).toMatchObject({ kind: "suspended", sets: [] });
    expect(frozen.blocks.find((block) => block.kind === "exercise" && block.exerciseId === "traction-assistee") as PerformedExerciseBlock).not.toHaveProperty("dayTarget");
    expect((await db.workouts.get(started.id))!.blocks).toEqual(frozen.blocks);
  });

  it("jamais déplacé : second passage sans écriture ; une brique déjà commencée n'en reçoit pas ; un objectif existant n'est pas recalculé", async () => {
    const template = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const started = await startFreeWorkout("2026-10-27", "2026-10-27T17:00:00.000Z", template);
    const history = [chestSession("2026-10-21", [8, 8, 6], [8, 9, 9])];
    const context = await loadDayTargetContext(history);
    const once = withDayTargets(started, context, "2026-10-27T17:00:01.000Z");
    expect(withDayTargets(once, context, "2026-10-27T18:00:00.000Z")).toBe(once);
    /* Même si l'historique changeait (correction de séance), l'objectif présenté reste celui du début. */
    const corrected = await loadDayTargetContext([chestSession("2026-10-21", [8, 8, 8], [8, 8, 8])]);
    expect(chestOf(withDayTargets(once, corrected, "2026-10-27T18:00:00.000Z")).dayTarget).toEqual(chestOf(once).dayTarget);

    const begun: WorkoutSession = {
      ...started,
      blocks: started.blocks.map((block) => (block.kind === "exercise" && block.sourceBlockId === "v2-muscu-b-chest-press" ? { ...block, series: block.series!.map((series, index) => (index === 0 ? { ...series, endedAt: "2026-10-27T17:05:00.000Z" } : series)) } : block)),
    };
    expect(chestOf(withDayTargets(begun, context, "2026-10-27T17:06:00.000Z")).dayTarget).toBeUndefined();
  });

  it("format : charge par haltère, répétition visée, transition aux rôles explicites, durées", () => {
    const target = (sets: DayTarget["sets"], kind: DayTarget["kind"] = "progress"): DayTarget => ({ computedAt: T, kind, sets, rpeMax: 8, reason: "" });
    expect(formatTargetLines(target([{ kg: 55, reps: 8 }, { kg: 55, reps: 8 }, { kg: 55, reps: 7, stretch: true }]), false)).toEqual(["55 kg · 8/8/6–7"]);
    expect(formatTargetLines(target([{ kg: 10, reps: 12 }, { kg: 10, reps: 12 }, { kg: 10, reps: 12 }]), true)).toEqual(["10 kg par haltère · 12/12/12"]);
    expect(formatTargetLines(target([{ kg: 5, reps: 15, step: "previous" }, { kg: 7.5, reps: 12, step: "new" }, { kg: 7.5, reps: 12, step: "new" }], "transition"), false)).toEqual(["Série 1 : 5 kg × 15 (ancien cran)", "Séries 2, 3 : 7,5 kg × 12/12 (nouveau cran)"]);
    expect(formatTargetLines(target([{ durationSec: 22 }, { durationSec: 20 }, { durationSec: 20 }]), false)).toEqual(["22 s / 20 s / 20 s"]);
  });
});

describe("à l'écran, pendant la séance", () => {
  function renderLive() {
    return render(
      <MemoryRouter initialEntries={["/seance-en-cours"]}>
        <Routes>
          <Route path="/seance-en-cours" element={<WorkoutScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("bloc compact sous le nom : objectif, RPE, dernière fois, consigne de réserve, lien ; préremplissage ; retour après la dernière série ; chrono intact", async () => {
    await db.workouts.put(chestSession("2026-10-21", [8, 8, 6], [8, 9, 9]));
    const template = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const started = await startFreeWorkout("2026-10-27", new Date().toISOString(), template);
    /* Ouvrir la chest press. */
    await db.workouts.put(activateBlock(started, "workout-block-v2-muscu-b-chest-press", new Date().toISOString()));
    renderLive();

    const block = await screen.findByRole("region", { name: "Objectif du jour" }, { timeout: 5000 });
    expect(within(block).getByText("55 kg · 8/8/6–7")).toBeDefined();
    expect(within(block).getByText("RPE ≤ 9")).toBeDefined();
    expect(within(block).getByText(/Dernière fois \(/)).toBeDefined();
    expect(within(block).getByText(/RPE ≤ 9 : finir chaque série avec au moins 1 répétition en réserve/)).toBeDefined();
    expect(within(block).getByText("Dernière fois (21/10) : 55 kg · 8/8/6 · RPE 8/9/9")).toBeDefined();
    expect(within(block).getByRole("link", { name: "Voir ma perspective ›" }).getAttribute("href")).toBe("/objectifs/perspectives/v2-muscu-b-chest-press?retour=seance");
    /* « Pour valider » et « Conseillé » remplacés ; cadre, consigne et dernière fois repliés. */
    expect(screen.queryByText("Pour valider :")).toBeNull();
    expect(screen.getByText("Cadre, consigne et dernière fois")).toBeDefined();
    const frozen = chestOf((await db.workouts.get(started.id))!).dayTarget;

    /* Trois séries au parcours du chrono : Série terminée, saisie préremplie (charge 55, répétitions de l'objectif, jamais le ressenti), Enregistrer. */
    for (const [index, reps] of [[1, "8"], [2, "8"], [3, "6"]] as const) {
      fireEvent.click(await screen.findByRole("button", { name: /Série terminée/ }, { timeout: 5000 }));
      const save = await screen.findByRole("button", { name: `Enregistrer la série ${index}` }, { timeout: 5000 });
      expect(document.querySelectorAll(".wseries__rest-slot")).toHaveLength(1);
      const form = save.closest("form")!;
      expect((within(form).getByLabelText("Charge") as HTMLInputElement).value).toBe("55");
      expect((within(form).getByLabelText("Reps") as HTMLInputElement).value).toBe(reps);
      expect((within(form).getByLabelText("RPE (optionnel)") as HTMLInputElement).value).toBe("");
      fireEvent.change(within(form).getByLabelText("RPE (optionnel)"), { target: { value: index === 1 ? "8" : "9" } });
      if (index === 3) fireEvent.change(within(form).getByLabelText("Reps"), { target: { value: "8" } });
      fireEvent.click(save);
      await waitFor(async () => expect(chestOf((await db.workouts.get(started.id))!).series![index - 1]!.status).toBe("completed"), { timeout: 5000 });
    }

    /* Objectif figé : inchangé après les séries ; retour sur la carte refermée. */
    expect(chestOf((await db.workouts.get(started.id))!).dayTarget).toEqual(frozen);
    expect(await screen.findByText(/Objectif dépassé/, {}, { timeout: 5000 })).toBeDefined();
  }, 30000);

  it("presse suspendue : « Progression suspendue », aucune charge préremplie", async () => {
    const template = (await db.sessionTemplates.get("v2-muscu-b"))!;
    const started = await startFreeWorkout("2026-10-27", new Date().toISOString(), template);
    await db.workouts.put(activateBlock(started, "workout-block-v2-muscu-b-presse", new Date().toISOString()));
    renderLive();
    const block = await screen.findByRole("region", { name: "Objectif du jour" }, { timeout: 5000 });
    expect(within(block).getByText("Progression suspendue")).toBeDefined();
    expect(within(block).queryByText(/en réserve/)).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Série terminée/ }, { timeout: 5000 }));
    const save = await screen.findByRole("button", { name: "Enregistrer la série 1" }, { timeout: 5000 });
    expect((within(save.closest("form")!).getByLabelText("Charge") as HTMLInputElement).value).toBe("");
  }, 20000);
});
