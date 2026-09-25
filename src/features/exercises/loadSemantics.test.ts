import { describe, expect, it } from "vitest";
import type { Exercise, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { compareAssistedSeries, loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { frameTypesFor } from "../../domain/rules/strengthRules";
import { calculateVolume } from "../../domain/rules/workoutRules";
import { buildImportedWorkout } from "../history/importedWorkouts";
import { buildImportedWorkouts } from "../history/fixtures/september2026";
import { formatLoadSuggestion } from "../workout/suggestedLoad";
import { pickBestSeries } from "../workout/workoutBlockDetail";
import { summarizeWorkout } from "../workout/workoutRecap";
import { exerciseCatalog as catalog } from "./exerciseCatalog";
import {
  buildExercisePerformanceHistory,
  buildExercisePerformanceSummary,
  getCompatiblePerformanceMetrics,
} from "./exercisePerformance";

/**
 * Lot a (23/09/2026) : la charge saisie sur une traction ou des dips
 * assistés est une **assistance**. Fixture = la séance réelle du
 * 15/09/2026 transcrite dans l'import : 49 kg × 10, 49 kg × 6, 56 kg × 10.
 */

const exerciseCatalog: Exercise[] = catalog;
const byId = new Map<string, Exercise>(exerciseCatalog.map((exercise) => [exercise.id, exercise]));
const traction = byId.get("traction-assistee")!;
const squat = byId.get("squat")!;

/** La traction telle qu'une base antérieure au lot a la stocke : sans le champ. */
function withoutSemantics(exercise: Exercise): Exercise {
  const copy = { ...exercise };
  delete copy.loadSemantics;
  return copy;
}

function session15(): WorkoutSession {
  const workout = buildImportedWorkouts().find((item) => item.id === "import-2026-09-15");
  if (!workout) throw new Error("séance du 15/09 absente de l'import");
  return workout;
}

function tractionBlock(workout: WorkoutSession): PerformedExerciseBlock {
  const block = workout.blocks.find(
    (item): item is PerformedExerciseBlock => item.kind === "exercise" && item.exerciseId === "traction-assistee",
  );
  if (!block) throw new Error("traction absente");
  return block;
}

type Spec = Parameters<typeof buildImportedWorkout>[0];

function tractionOn(date: string, sets: Array<[number, number]>, exerciseId = "traction-assistee"): WorkoutSession {
  const spec: Spec = { date, blocks: [{ exercise: exerciseId, sets: sets.map(([load, reps]) => ({ load, reps })) }] };
  return buildImportedWorkout(spec);
}

describe("sens de la charge — catalogue et valeur par défaut", () => {
  it("traction et dips assistés sont des assistances ; tout le reste du catalogue est external", () => {
    const assisted = exerciseCatalog.filter((exercise) => exercise.loadSemantics === "assistance").map((e) => e.id);
    expect(assisted.sort()).toEqual(["dips-assistes", "traction-assistee"]);
    expect(exerciseCatalog.filter((e) => e.loadSemantics === "external")).toEqual([]);
  });

  it("un exercice sans le champ est traité comme external, un exercice inconnu aussi", () => {
    expect(loadSemanticsOf(withoutSemantics(traction))).toBe("external");
    expect(loadSemanticsOf(undefined)).toBe("external");
    expect(loadSemanticsOf(traction)).toBe("assistance");
  });
});

describe("séance réelle du 15/09/2026 — traction assistée 49 × 10, 49 × 6, 56 × 10", () => {
  it("la fixture est bien la séance transcrite", () => {
    const series = tractionBlock(session15()).series ?? [];
    expect(series.map((item) => [item.load, item.reps])).toEqual([
      [{ kind: "total", kg: 49 }, 10],
      [{ kind: "total", kg: 49 }, 6],
      [{ kind: "total", kg: 56 }, 10],
    ]);
  });

  it("volume de ces séries = 0, partout où le volume se calcule", () => {
    const workout = session15();
    const series = tractionBlock(workout).series ?? [];
    const assistedKg = 49 * 10 + 49 * 6 + 56 * 10;

    expect(calculateVolume(series, "assistance")).toBe(0);
    expect(calculateVolume(series)).toBe(assistedKg);

    /* Récapitulatif : exactement le volume sans la traction. */
    const withAssistance = summarizeWorkout(workout).volumeKg;
    expect(summarizeWorkout(workout, undefined, byId).volumeKg).toBe(withAssistance - assistedKg);

    /* Fiche exercice : aucun volume pour l'assistance. */
    const [entry] = buildExercisePerformanceHistory(traction, [workout]);
    expect(entry?.volumeKg).toBeUndefined();
  });

  it("meilleure série = 49 × 10 ; classement 49 × 10 > 49 × 6 > 56 × 10", () => {
    const series = tractionBlock(session15()).series ?? [];
    const best = pickBestSeries(series, "assistance");
    expect([best?.load, best?.reps]).toEqual([{ kind: "total", kg: 49 }, 10]);

    const ranked = [...series]
      .map((item) => ({ kg: (item.load as { kg: number }).kg, reps: item.reps! }))
      .sort(compareAssistedSeries);
    expect(ranked).toEqual([
      { kg: 49, reps: 10 },
      { kg: 49, reps: 6 },
      { kg: 56, reps: 10 },
    ]);

    /* Fiche : « Assistance min » 49 kg, départagée par 10 répétitions. */
    const [entry] = buildExercisePerformanceHistory(traction, [session15()]);
    expect(entry).toMatchObject({ chargeMaxKg: 49, repsAtBestLoad: 10, repsMax: 10 });
  });

  it("les valeurs stockées ne changent pas : aucun calcul n'écrit dans la séance", () => {
    const workout = session15();
    const before = structuredClone(workout);

    calculateVolume(tractionBlock(workout).series ?? [], "assistance");
    pickBestSeries(tractionBlock(workout).series ?? [], "assistance");
    summarizeWorkout(workout, undefined, byId);
    buildExercisePerformanceSummary(buildExercisePerformanceHistory(traction, [workout]), "chargeMax", "assistance");

    expect(workout).toEqual(before);
    expect(tractionBlock(workout).series?.map((item) => item.load)).toEqual([
      { kind: "total", kg: 49 },
      { kind: "total", kg: 49 },
      { kind: "total", kg: 56 },
    ]);
  });
});

describe("meilleure réalisation et progression depuis le début", () => {
  it("assistance : la plus basse gagne, à égalité le plus de répétitions ; baisser l'assistance est un progrès", () => {
    const history = buildExercisePerformanceHistory(traction, [
      tractionOn("2026-09-01", [[56, 10]]),
      tractionOn("2026-09-08", [[49, 6]]),
      tractionOn("2026-09-15", [[49, 10]]),
      tractionOn("2026-09-22", [[52, 8]]),
    ]);
    const summary = buildExercisePerformanceSummary(history, "chargeMax", "assistance")!;

    expect(summary.bestValue).toBe(49);
    expect(summary.bestEntry.date).toBe("2026-09-15");
    expect(summary.firstValue).toBe(56);
    expect(summary.latestValue).toBe(52);
    expect(summary.progressionPercent).toBeCloseTo(((56 - 52) / 56) * 100);
  });

  it("assistance : pas de volume parmi les métriques ; sans le champ, les trois métriques historiques", () => {
    expect(getCompatiblePerformanceMetrics(traction)).toEqual(["chargeMax", "reps"]);
    expect(getCompatiblePerformanceMetrics(withoutSemantics(traction))).toEqual(["chargeMax", "volume", "reps"]);
  });

  it("non-régression external : la plus lourde gagne, la meilleure série reste charge × reps", () => {
    const history = buildExercisePerformanceHistory(squat, [
      tractionOn("2026-09-01", [[30, 12]], "squat"),
      tractionOn("2026-09-08", [[35, 10]], "squat"),
    ]);
    const summary = buildExercisePerformanceSummary(history, "chargeMax")!;
    expect(summary.bestValue).toBe(35);
    expect(summary.progressionPercent).toBeCloseTo(((35 - 30) / 30) * 100);
    expect(history[0]).toMatchObject({ chargeMaxKg: 35, volumeKg: 350 });
    expect(history[0]).not.toHaveProperty("repsAtBestLoad");

    /* Règle historique charge × reps : 35 × 10 = 350 > 30 × 10 et 35 × 8. */
    const series = tractionOn("2026-09-01", [[30, 10], [35, 10], [35, 8]], "squat").blocks[0] as PerformedExerciseBlock;
    const best = pickBestSeries(series.series ?? []);
    expect([best?.load, best?.reps]).toEqual([{ kind: "total", kg: 35 }, 10]);
    expect(pickBestSeries(series.series ?? [], "external")).toBe(best);
  });
});

describe("cohérence avec le cadre et le conseil", () => {
  it("un exercice en assistance ne se cadre qu'en assistance décroissante ; external garde ses deux choix", () => {
    expect(frameTypesFor(traction)).toEqual(["assistance_decroissante"]);
    expect(frameTypesFor(withoutSemantics(traction))).toEqual(["charge_croissante", "assistance_decroissante"]);
    expect(frameTypesFor(squat)).toEqual(["charge_croissante", "assistance_decroissante"]);
  });

  it("le conseil qualitatif se lit dans le bon sens pour une assistance, inchangé sinon", () => {
    const referenceLoad = { kind: "total", kg: 49 } as const;
    expect(formatLoadSuggestion({ referenceLoad, action: "increase" }, "assistance")).toBe(
      "49 kg d'assistance · moins d'assistance envisageable",
    );
    expect(formatLoadSuggestion({ referenceLoad, action: "decrease" }, "assistance")).toBe(
      "49 kg d'assistance · plus d'assistance à envisager",
    );
    expect(formatLoadSuggestion({ referenceLoad, action: "decrease" })).toBe("49 kg · réduction à envisager");
  });
});
