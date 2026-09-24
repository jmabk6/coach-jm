import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Exercise, PerformedExerciseBlock, PerformedSeries, WorkoutSession } from "../../domain";
import { getLoadKg } from "../../domain/rules/workoutRules";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { parseBackup } from "../backup/restoreBackup";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { buildImportedWorkouts } from "../history/importedWorkouts";
import { computeWorkoutRecords, retainedSeriesByExercise } from "./workoutRecords";

/**
 * Lot E.3 — records (conception V2 § 5.6, D22, N7, N10) : fonction pure.
 * Première mesure = référence, jamais un record ; dominance charge × reps,
 * assistance inversée ; pas de record cardio ; échauffement exclu.
 */

const byId = new Map<string, Exercise>(exerciseCatalog.map((exercise) => [exercise.id, exercise]));
const kg = (value: number) => ({ kind: "total" as const, kg: value });
let n = 0;
const s = (values: Partial<PerformedSeries>): PerformedSeries => ({ id: `s${++n}`, position: n, status: "completed", role: "travail", ...values });

function workout(id: string, date: string, blocks: Array<{ exerciseId: string; series: PerformedSeries[]; role?: "warmup" }>, status: WorkoutSession["status"] = "completed"): WorkoutSession {
  return {
    id, source: "free", status, kind: "training", date, startedAt: `${date}T10:00:00.000Z`, lastActionAt: `${date}T11:00:00.000Z`,
    ...(status === "completed" ? { completedAt: `${date}T11:00:00.000Z` } : {}),
    activeDurationSec: 3600, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T11:00:00.000Z`,
    blocks: blocks.map((block, index): PerformedExerciseBlock => ({
      id: `${id}-b${index}`, kind: "exercise", position: index, addedDuringWorkout: false, exerciseId: block.exerciseId, status: "performed",
      ...(block.role ? { role: block.role } : {}),
      snapshotInstructions: { shape: "reps", sets: block.series.length, reps: { min: 8, max: 12 }, restBetweenSetsSec: 90 },
      series: block.series,
    })),
  };
}

const line = (series: PerformedSeries | undefined) =>
  series ? `${series.load ? getLoadKg(series.load) : "-"}×${series.reps ?? series.durationSec}` : undefined;

describe("cas réel du 15/09 (séances importées de septembre)", () => {
  it("presse 120 × 15 et leg curl 30 × 15 sont des records ; la traction assistée pose sa référence ; rien d'autre", () => {
    const imported = buildImportedWorkouts();
    const day = imported.find((item) => item.id === "import-2026-09-15")!;

    const { records, references } = computeWorkoutRecords(day, imported, byId);

    expect(references).toEqual(["traction-assistee"]);
    expect(records.map((record) => [record.exerciseId, line(record.series), line(record.previous), record.previousWorkoutId])).toEqual([
      ["presse-cuisses", "120×15", "120×12", "import-2026-09-11"],
      ["leg-curl-assis", "30×15", "20×12", "import-2026-09-08"],
    ]);
  });

  it("durées : strictement au-dessus du maximum ; par côté, le côté le plus faible ; égalité : pas de record", () => {
    const imported = buildImportedWorkouts();
    const on = (id: string) => computeWorkoutRecords(imported.find((item) => item.id === id)!, imported, byId);
    const weakest = (series: PerformedSeries | undefined) =>
      series?.durationSec ?? Math.min(...(series?.sideValues ?? []).map((side) => side.durationSec ?? Infinity));
    const summary = (id: string) => on(id).records.map((record) => [record.exerciseId, weakest(record.series), weakest(record.previous)]);

    /* CT § 5.6 : les étirements mesurés en durée entrent dans la règle (catégorie Mobilité). */
    expect(summary("import-2026-09-09")).toEqual([
      ["planche", 60, 50],
      ["mobilite-flechisseur-hanche", 40, 30],
      ["mobilite-ischio-jambiers", 40, 30],
      ["import-position-enfant", 60, 30],
    ]);
    /* 16/09 : planche 60 s = maximum antérieur, pas de record. */
    expect(summary("import-2026-09-16")).toEqual([["mobilite-flechisseur-hanche", 45, 40]]);
  });
});

describe("règles", () => {
  it("première mesure : une référence, jamais un record", () => {
    const first = workout("w1", "2026-09-20", [{ exerciseId: "chest-press", series: [s({ load: kg(40), reps: 10 })] }]);
    expect(computeWorkoutRecords(first, [first], byId)).toEqual({ records: [], references: ["chest-press"] });
  });

  it("charge : dominée par une séance antérieure au moins aussi lourde avec au moins autant de reps", () => {
    const before = workout("w1", "2026-09-20", [{ exerciseId: "chest-press", series: [s({ load: kg(35), reps: 12 }), s({ load: kg(40), reps: 8 })] }]);
    const heavier = workout("w2", "2026-09-22", [{ exerciseId: "chest-press", series: [s({ load: kg(40), reps: 10 })] }]);
    const lighter = workout("w3", "2026-09-22", [{ exerciseId: "chest-press", series: [s({ load: kg(35), reps: 11 })] }]);

    expect(computeWorkoutRecords(heavier, [before, heavier], byId).records.map((record) => line(record.previous))).toEqual(["40×8"]);
    expect(computeWorkoutRecords(lighter, [before, lighter], byId).records).toEqual([]);
  });

  it("assistance : moins d'aide est mieux ; à même aide, plus de reps", () => {
    const before = workout("w1", "2026-09-20", [{ exerciseId: "traction-assistee", series: [s({ load: kg(52), reps: 8 })] }]);
    const lessHelp = workout("w2", "2026-09-27", [{ exerciseId: "traction-assistee", series: [s({ load: kg(49), reps: 8 })] }]);
    const moreHelp = workout("w3", "2026-09-27", [{ exerciseId: "traction-assistee", series: [s({ load: kg(56), reps: 8 })] }]);

    expect(loadSemanticsOf(byId.get("traction-assistee"))).toBe("assistance");
    expect(computeWorkoutRecords(lessHelp, [before, lessHelp], byId).records).toHaveLength(1);
    expect(computeWorkoutRecords(moreHelp, [before, moreHelp], byId).records).toEqual([]);
  });

  it("échauffement (série), côté limitant, brique warmup : exclus des records et de l'historique", () => {
    const before = workout("w1", "2026-09-20", [{ exerciseId: "chest-press", series: [s({ load: kg(35), reps: 10 })] }]);
    const day = workout("w2", "2026-09-22", [
      { exerciseId: "chest-press", series: [s({ load: kg(50), reps: 12, role: "echauffement" }), s({ load: kg(45), reps: 12, sideLimited: true }), s({ load: kg(35), reps: 10 })] },
      { exerciseId: "presse-cuisses", role: "warmup", series: [s({ load: kg(200), reps: 20 })] },
    ]);

    expect(retainedSeriesByExercise(day).get("chest-press")?.map(line)).toEqual(["35×10"]);
    expect(retainedSeriesByExercise(day).has("presse-cuisses")).toBe(false);
    expect(computeWorkoutRecords(day, [before, day], byId)).toEqual({ records: [], references: [] });
  });

  it("cardio (paliers) : jamais de record (N7)", () => {
    const tapis = (id: string, date: string): WorkoutSession => ({
      ...workout(id, date, []),
      blocks: [
        {
          id: `${id}-t`, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId: "tapis", status: "performed",
          snapshotInstructions: { shape: "steps", steps: [] },
          cardioSteps: [{ id: `${id}-p`, position: 0, status: "completed", settings: { durationSec: 2400, speedKmh: 6, inclinePercent: 8 } }],
        },
      ],
    });
    const later = tapis("w2", "2026-09-22");
    expect(computeWorkoutRecords(later, [tapis("w1", "2026-09-20"), later], byId)).toEqual({ records: [], references: [] });
  });

  it("puissance : comparée à même unité, même durée, même résistance", () => {
    const sprint = (value: number, durationSec = 12, resistance = 8, unit: "watts" | "meters" = "watts") =>
      s({ durationSec, resistance, result: { unit, value } });
    const before = workout("w1", "2026-09-20", [{ exerciseId: "sprint-velo", series: [sprint(600), sprint(900, 20)] }]);

    const better = workout("w2", "2026-10-01", [{ exerciseId: "sprint-velo", series: [sprint(650)] }]);
    expect(computeWorkoutRecords(better, [before, better], byId).records.map((record) => record.previous?.result?.value)).toEqual([600]);

    const otherResistance = workout("w3", "2026-10-01", [{ exerciseId: "sprint-velo", series: [sprint(700, 12, 10)] }]);
    expect(computeWorkoutRecords(otherResistance, [before, otherResistance], byId)).toEqual({ records: [], references: [] });
  });

  it("répétitions + durée : record si aucune séance antérieure n'a à la fois autant de reps et une descente aussi longue", () => {
    const neg = (reps: number, slowest: number) => s({ reps, repDurationsSec: [slowest], durationSec: slowest });
    const before = workout("w1", "2026-09-22", [{ exerciseId: "traction-negative", series: [neg(4, 5)] }]);

    const longer = workout("w2", "2026-09-29", [{ exerciseId: "traction-negative", series: [neg(4, 7)] }]);
    expect(computeWorkoutRecords(longer, [before, longer], byId).records).toHaveLength(1);

    const same = workout("w3", "2026-09-29", [{ exerciseId: "traction-negative", series: [neg(3, 5)] }]);
    expect(computeWorkoutRecords(same, [before, same], byId).records).toEqual([]);
  });

  it("historique : seulement les séances enregistrées antérieures (ni en cours, ni postérieures)", () => {
    const later = workout("w9", "2026-10-10", [{ exerciseId: "chest-press", series: [s({ load: kg(60), reps: 12 })] }]);
    const running = workout("w8", "2026-09-19", [{ exerciseId: "chest-press", series: [s({ load: kg(60), reps: 12 })] }], "in_progress");
    const day = workout("w2", "2026-09-22", [{ exerciseId: "chest-press", series: [s({ load: kg(40), reps: 10 })] }]);

    expect(computeWorkoutRecords(day, [later, running, day], byId)).toEqual({ records: [], references: ["chest-press"] });
  });
});

describe("sauvegarde réelle (COACH_JM_BACKUP) : aucun record inventé", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("chaque record a un historique et n'est dominé par aucune série antérieure ; une première mesure n'est jamais un record", async () => {
    const file = parseBackup(await readFile(path!, "utf8"));
    const workouts = (file.stores.workouts as WorkoutSession[]).filter((item) => item.status === "completed");
    const exercises = new Map<string, Exercise>((file.stores.exercises as Exercise[]).map((exercise) => [exercise.id, exercise]));
    const seen = new Set<string>();
    let recordCount = 0;

    for (const item of [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
      const { records, references } = computeWorkoutRecords(item, workouts, exercises);
      for (const exerciseId of references) expect(seen.has(exerciseId), `${item.id} ${exerciseId}`).toBe(false);

      for (const record of records) {
        expect(seen.has(record.exerciseId), `${item.id} ${record.exerciseId} sans historique`).toBe(true);
        recordCount += 1;
        if (record.kind !== "load") continue;

        /* Vérification indépendante de la dominance, sur tout l'historique. */
        const semantics = loadSemanticsOf(exercises.get(record.exerciseId));
        const recordKg = getLoadKg(record.series.load!)!;
        const recordReps = record.series.reps!;
        for (const earlier of workouts.filter((other) => other.startedAt < item.startedAt)) {
          for (const series of retainedSeriesByExercise(earlier).get(record.exerciseId) ?? []) {
            if (!series.load || series.reps === undefined) continue;
            const other = getLoadKg(series.load);
            if (other === undefined) continue;
            const asGood = semantics === "assistance" ? other <= recordKg : other >= recordKg;
            expect(asGood && series.reps >= recordReps, `${item.id} ${record.exerciseId} dominé par ${earlier.id}`).toBe(false);
          }
        }
      }

      for (const exerciseId of retainedSeriesByExercise(item).keys()) seen.add(exerciseId);
    }

    console.info("[records réels]", { séances: workouts.length, records: recordCount });
  });
});
