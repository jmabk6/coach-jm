import { db } from "../../db/database";
import type { InstallMarkers, PerformedBlock, PerformedExerciseBlock, WorkoutSession } from "../../domain";
import { FIX_WORKOUT_ID } from "../workout/seedFixWorkout20260924";
import { buildImportedWorkout, type WorkoutSpec } from "./importedWorkouts";

/**
 * Seed 12 — la séance de musculation du vendredi 25/09/2026, que
 * l'utilisateur n'a pas pu saisir dans l'app : transcrite de sa feuille,
 * même notation que les séances importées de septembre (charge d'une
 * traction assistée = contrepoids ; haltères = charge par main).
 *
 * Une seule fois (marqueur `install.addWorkout20260925`), seulement dans la
 * base de l'utilisateur (reconnue à sa Cardio A du 24/09), et seulement si
 * aucune séance n'est déjà enregistrée ce jour-là : une saisie faite dans
 * l'app entre-temps n'est jamais doublée.
 */

export const WORKOUT_20260925_ID = "import-2026-09-25";

/** Heure de début (Paris), à défaut de chronométrage. */
const START = "2026-09-25T16:00:00.000Z";

const SPEC: WorkoutSpec = {
  date: "2026-09-25",
  blocks: [
    {
      exercise: "tapis",
      note: "Échauffement, FC 82 → 119",
      steps: [
        { min: 3, kmh: 5, incline: 3, bpm: 82 },
        { min: 3, kmh: 5, incline: 6, bpm: 92 },
        { min: 2, kmh: 5, incline: 9, bpm: 105 },
        { min: 2, kmh: 5, incline: 12, bpm: 119 },
      ],
    },
    {
      exercise: "traction-assistee",
      note: "Charge saisie = contrepoids d'assistance",
      sets: [
        { load: 49, reps: 8, rpe: 8 },
        { load: 49, reps: 8, rpe: 8 },
        { load: 49, reps: 8, rpe: 9 },
      ],
    },
    {
      exercise: "developpe-epaules-machine",
      sets: [
        { load: 15, reps: 10, rpe: 7 },
        { load: 25, reps: 6, note: "limite" },
        { load: 20, reps: 7, note: "pas plus" },
        { load: 15, reps: 7, note: "pas plus" },
      ],
    },
    {
      exercise: "presse-cuisses",
      sets: [
        { load: 80, reps: 10, rpe: 6 },
        { load: 100, reps: 6, rpe: 6 },
        { load: 120, reps: 10, rpe: 8 },
        { load: 120, reps: 10, rpe: 8 },
        { load: 120, reps: 10, rpe: 8 },
      ],
    },
    {
      exercise: "developpe-incline-halteres",
      note: "Charge par haltère",
      sets: [
        { load: 6, reps: 10, rpe: 7, note: "tremblements" },
        { load: 6, reps: 10, rpe: 7, note: "moins de tremblements" },
        { load: 8, reps: 10, rpe: 8 },
      ],
    },
    {
      exercise: "tirage-vertical",
      sets: [
        { load: 40, reps: 10, rpe: 7 },
        { load: 40, reps: 12, rpe: 8 },
        { load: 40, reps: 10, rpe: 9 },
      ],
    },
    {
      exercise: "elevations-laterales-halteres",
      note: "Charge par haltère",
      sets: [
        { load: 5, reps: 12, rpe: 8 },
        { load: 5, reps: 6, note: "épuisé" },
      ],
    },
    {
      exercise: "extension-triceps-poulie",
      sets: [
        { load: 12.5, reps: 10, rpe: 9 },
        { load: 10, reps: 10, rpe: 9, note: "je suis cuit" },
      ],
    },
  ],
};

function shift(iso: string | undefined, deltaMs: number): string | undefined {
  return iso === undefined ? undefined : new Date(Date.parse(iso) + deltaMs).toISOString();
}

export function buildWorkout20260925(now: string): WorkoutSession {
  const built = buildImportedWorkout(SPEC);
  const delta = Date.parse(START) - Date.parse(built.startedAt);

  const blocks: PerformedBlock[] = built.blocks.map((block) => {
    if (block.kind !== "exercise") return block;
    const moved: PerformedExerciseBlock = {
      ...block,
      ...(block.series ? { series: block.series.map((series) => ({ ...series, completedAt: shift(series.completedAt, delta)! })) } : {}),
      ...(block.cardioSteps ? { cardioSteps: block.cardioSteps.map((step) => ({ ...step, completedAt: shift(step.completedAt, delta)! })) } : {}),
    };
    /* Le tapis est l'échauffement ; les deux premières séries de presse aussi. */
    if (block.exerciseId === "tapis") moved.role = "warmup";
    if (block.exerciseId === "presse-cuisses") {
      moved.series = moved.series!.map((series, index) => (index < 2 ? { ...series, role: "echauffement" as const } : { ...series, role: "travail" as const }));
    }
    return moved;
  });

  /* Tractions négatives : essayées, impossibles à tenir en haut, abandonnées. */
  const negative: PerformedExerciseBlock = {
    id: `${WORKOUT_20260925_ID}-negatives`,
    kind: "exercise",
    position: 1,
    addedDuringWorkout: false,
    exerciseId: "traction-negative",
    status: "not_performed",
    note: "Essai : impossible de tenir en haut, abandonnées",
    snapshotInstructions: { shape: "reps", sets: 1, reps: { min: 1, max: 1 }, restBetweenSetsSec: 90 },
    series: [],
  };
  blocks.splice(1, 0, negative);

  return {
    ...built,
    id: WORKOUT_20260925_ID,
    startedAt: shift(built.startedAt, delta)!,
    completedAt: shift(built.completedAt, delta)!,
    lastActionAt: shift(built.lastActionAt, delta)!,
    blocks: blocks.map((block, position) => ({ ...block, position })),
    createdAt: now,
    updatedAt: now,
  };
}

export async function seedWorkout20260925(now: string = new Date().toISOString()): Promise<void> {
  await db.transaction("rw", db.workouts, db.settings, async () => {
    const install = (await db.settings.get("install"))?.value as InstallMarkers | undefined;
    if (install?.addWorkout20260925 !== undefined) return;

    const mine = (await db.workouts.get(FIX_WORKOUT_ID)) !== undefined;
    const sameDay = await db.workouts.where("date").equals("2026-09-25").toArray();
    if (mine && !sameDay.some((workout) => workout.status === "completed")) {
      await db.workouts.put(buildWorkout20260925(now));
    }

    await db.settings.put({ key: "install", value: { ...install, addWorkout20260925: now } });
  });
}
