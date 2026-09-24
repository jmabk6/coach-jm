import { describe, expect, it } from "vitest";
import type { Exercise, PerformedExerciseBlock, SessionTemplate, WorkoutSession } from "../../domain";
import { exerciseCatalog } from "../exercises/exerciseCatalog";
import { PROGRAM_V1_ROUTINES, PROGRAM_V1_TEMPLATES } from "./programV1";
import { summarizeMonth } from "./monthSummary";

/**
 * Lot F.3 — résumé du mois (§ 5.8, N8), sur un jeu recalculé à la main.
 * Septembre 2026, aujourd'hui = jeudi 24 :
 *
 * | séance | date  | contenu                              | compte | ligne       |
 * |--------|-------|--------------------------------------|--------|-------------|
 * | w1     | 01/09 | Muscu A                              | oui    | Musculation |
 * | w2     | 02/09 | Cardio A                             | oui    | Cardio      |
 * | w3     | 02/09 | libre : échauffement tapis + presse  | oui    | Musculation |
 * | w4     | 05/09 | libre : tapis seul                   | oui    | Cardio      |
 * | w5     | 08/09 | Routine A                            | oui    | Routine     |
 * | w6     | 10/09 | libre : étirement seul               | oui    | aucune (N8) |
 * | w7     | 12/09 | bilan de mobilité                    | non    | —           |
 * | w8     | 15/09 | enregistrée, rien de réalisé         | non    | —           |
 * | w9     | 16/09 | en cours                             | non    | —           |
 * | w10    | 24/09 | Muscu C (aujourd'hui)                | oui    | Musculation |
 * | w11    | 31/08 | Muscu A (autre mois)                 | —      | —           |
 *
 * Total 7 ; Musculation 3, Cardio 2, Routine 1 (somme 6 : l'écart est la
 * mobilité). Jours écoulés : 1 → 23 septembre = 23 ; jours actifs parmi
 * eux : 01, 02, 05, 08, 10 = 5 ; jours sans séance = 18.
 */

const exerciseById = new Map<string, Exercise>(exerciseCatalog.map((exercise) => [exercise.id, exercise]));
const T = "2026-09-01T08:00:00.000Z";
const templateById = new Map<string, SessionTemplate>(
  [...PROGRAM_V1_TEMPLATES, ...PROGRAM_V1_ROUTINES].map((content, position) => [
    content.id,
    { ...content, status: "active", position, createdAt: T, updatedAt: T } as SessionTemplate,
  ]),
);

const block = (exerciseId: string, extra: Partial<PerformedExerciseBlock> = {}): PerformedExerciseBlock => ({
  id: `b-${exerciseId}-${extra.role ?? "x"}`, kind: "exercise", position: 0, addedDuringWorkout: false, exerciseId, status: "performed",
  snapshotInstructions: { shape: "reps", sets: 1, reps: { min: 10, max: 10 }, restBetweenSetsSec: 60 }, ...extra,
});

function workout(id: string, date: string, blocks: PerformedExerciseBlock[], extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id, source: "free", kind: "training", status: "completed", date, startedAt: `${date}T08:00:00.000Z`, completedAt: `${date}T09:00:00.000Z`,
    lastActionAt: `${date}T09:00:00.000Z`, activeDurationSec: 3600, blocks, createdAt: T, updatedAt: T, ...extra,
  };
}

const workouts: WorkoutSession[] = [
  workout("w1", "2026-09-01", [block("presse-cuisses")], { source: "planned", sessionTemplateId: "v1-muscu-a" }),
  workout("w2", "2026-09-02", [block("tapis")], { source: "planned", sessionTemplateId: "v1-cardio-a" }),
  workout("w3", "2026-09-02", [block("tapis", { role: "warmup" }), block("presse-cuisses")]),
  workout("w4", "2026-09-05", [block("tapis")]),
  workout("w5", "2026-09-08", [block("planche")], { sessionTemplateId: "v1-routine-a" }),
  workout("w6", "2026-09-10", [block("import-position-enfant")]),
  workout("w7", "2026-09-12", [block("import-position-enfant")], { kind: "mobility_assessment" }),
  workout("w8", "2026-09-15", [block("presse-cuisses", { status: "not_performed" })]),
  workout("w9", "2026-09-16", [block("presse-cuisses")], { status: "in_progress" }),
  workout("w10", "2026-09-24", [block("presse-cuisses")], { sessionTemplateId: "v1-muscu-c" }),
  workout("w11", "2026-08-31", [block("presse-cuisses")], { sessionTemplateId: "v1-muscu-a" }),
];

describe("résumé du mois", () => {
  it("septembre, mois en cours : total, lignes, mobilité hors lignes, jours sans séance jusqu'à hier", () => {
    expect(summarizeMonth(workouts, "2026-09-01", "2026-09-24", templateById, exerciseById)).toEqual({
      total: 7,
      musculation: 3,
      cardio: 2,
      routine: 1,
      mobility: 1,
      daysWithoutSession: 18,
      elapsedDays: 23,
    });
  });

  it("août, mois passé : tous ses jours sont écoulés", () => {
    expect(summarizeMonth(workouts, "2026-08-01", "2026-09-24", templateById, exerciseById)).toMatchObject({
      total: 1,
      musculation: 1,
      elapsedDays: 31,
      daysWithoutSession: 30,
    });
  });

  it("octobre, mois futur (ou vide) : tout à 0", () => {
    expect(summarizeMonth(workouts, "2026-10-01", "2026-09-24", templateById, exerciseById)).toEqual({
      total: 0, musculation: 0, cardio: 0, routine: 0, mobility: 0, daysWithoutSession: 0, elapsedDays: 0,
    });
  });

  it("premier jour du mois : aucun jour encore écoulé", () => {
    expect(summarizeMonth(workouts, "2026-09-01", "2026-09-01", templateById, exerciseById)).toMatchObject({
      elapsedDays: 0,
      daysWithoutSession: 0,
    });
  });
});

describe("sauvegarde réelle (COACH_JM_BACKUP) : classement des séances sans modèle (option B)", () => {
  const path = process.env.COACH_JM_BACKUP;

  it.skipIf(!path)("séances importées de septembre : Cardio les 03, 06, 09 et 16/09, Musculation les autres ; les lignes et la mobilité font le total", async () => {
    const { readFile } = await import("node:fs/promises");
    const { parseBackup } = await import("../backup/restoreBackup");
    const { categoryForWorkout } = await import("./freeWorkouts");
    const file = parseBackup(await readFile(path!, "utf8"));
    const all = file.stores.workouts as WorkoutSession[];
    const byId = new Map<string, Exercise>((file.stores.exercises as Exercise[]).map((exercise) => [exercise.id, exercise]));
    const templates = new Map<string, SessionTemplate>(((file.stores.sessionTemplates ?? []) as SessionTemplate[]).map((template) => [template.id, template]));

    const imported = all.filter((workout) => workout.id.startsWith("import-"));
    expect(imported.length).toBeGreaterThan(0);
    const cardio = imported
      .filter((workout) => categoryForWorkout(workout, undefined, byId) === "Cardio")
      .map((workout) => workout.date)
      .sort();
    expect(cardio).toEqual(["2026-09-03", "2026-09-06", "2026-09-09", "2026-09-16"]);

    const summary = summarizeMonth(all, "2026-09-01", "2026-09-30", templates, byId);
    expect(summary.musculation + summary.cardio + summary.routine + summary.mobility).toBe(summary.total);
    expect(summary.cardio).toBeGreaterThanOrEqual(4);
  });
});
