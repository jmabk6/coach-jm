import type {
  ExerciseInstructions,
  Id,
  Load,
  PerformedBlock,
  PerformedCardioStep,
  PerformedSeries,
  PerformedSideValue,
  WorkoutSession,
} from "../../domain";

/**
 * Notation compacte d'une séance transcrite à la main, et sa conversion
 * en réalisation libre (`source: "free"`, décision du 16/09/2026). Écrite
 * pour les feuilles SEMAINE_1/2/3.xlsx (1er → 16 septembre 2026), dont les
 * données sont désormais sous `fixtures/september2026.ts` (lot N.3) ;
 * servie en production par la séance du 25/09 (`seedWorkout20260925`).
 *
 * Les feuilles n'ont ni heure ni durée : chaque séance démarre à 18 h
 * (heure de Paris) et sa durée active est la somme des paliers cardio,
 * des durées mesurées et de 1 min 30 par série (repos compris).
 *
 * Identifiants fixes (`import-<date>`) : réécrire une séance ne la double pas.
 * Les quatre exercices absents du catalogue à l'origine (curl EZ, position
 * de l'enfant, rotation du dos allongé, marche) y ont été ajoutés depuis,
 * sous leurs identifiants `import-*`.
 */

/* -------------------------------------------------------------------------- */
/* Notation                                                                   */
/* -------------------------------------------------------------------------- */

type LoadSpec = number | "vide" | { perSide: number };

interface SetSpec {
  load?: LoadSpec;
  reps?: number;
  sec?: number;
  /** Valeur identique des deux côtés (reps ou secondes selon l'exercice). */
  perSide?: { reps?: number; sec?: number };
  rpe?: number;
  note?: string;
}

interface StepSpec {
  min: number;
  kmh: number;
  incline: number;
  bpm?: number;
}

type BlockSpec =
  | { exercise: Id; sets: SetSpec[]; note?: string }
  | { exercise: Id; steps: StepSpec[]; note?: string }
  | { exercise: Id; distanceKm: number; note?: string };

export interface WorkoutSpec {
  date: string;
  blocks: BlockSpec[];
}

const IMPORT_TIMESTAMP = "2026-09-17T12:00:00.000Z";

/* -------------------------------------------------------------------------- */
/* Conversion vers le modèle                                                  */
/* -------------------------------------------------------------------------- */

/** 18 h à Paris en septembre (UTC+2). */
const START_HOUR_UTC = 16;

/** Une série et son repos, faute de chronométrage réel. */
const SECONDS_PER_SET = 90;

const MOBILITY_TRANSITION_SEC = 15;

function toLoad(spec: LoadSpec): Load {
  if (spec === "vide") return { kind: "empty" };
  if (typeof spec === "number") return { kind: "total", kg: spec };

  return { kind: "per_side", kgPerSide: spec.perSide };
}

function sideValues(spec: NonNullable<SetSpec["perSide"]>): PerformedSideValue[] {
  return (["left", "right"] as const).map((side) => ({
    side,
    ...(spec.reps !== undefined ? { reps: spec.reps } : {}),
    ...(spec.sec !== undefined ? { durationSec: spec.sec } : {}),
  }));
}

function setDurationSec(set: SetSpec): number {
  if (set.sec !== undefined) return set.sec + MOBILITY_TRANSITION_SEC;
  if (set.perSide?.sec !== undefined) return set.perSide.sec * 2 + MOBILITY_TRANSITION_SEC;

  return SECONDS_PER_SET;
}

function snapshotFor(sets: SetSpec[]): ExerciseInstructions {
  const first = sets[0];
  const durations = sets
    .map((set) => set.sec ?? set.perSide?.sec)
    .filter((value): value is number => value !== undefined);

  if (first && (first.sec !== undefined || first.perSide?.sec !== undefined)) {
    return {
      shape: "duration",
      sets: sets.length,
      durationSec: Math.max(...durations),
      restBetweenSetsSec: 45,
    };
  }

  const reps = sets
    .map((set) => set.reps ?? set.perSide?.reps)
    .filter((value): value is number => value !== undefined);

  return {
    shape: "reps",
    sets: sets.length,
    reps: {
      min: reps.length > 0 ? Math.min(...reps) : 8,
      max: reps.length > 0 ? Math.max(...reps) : 12,
    },
    restBetweenSetsSec: 90,
  };
}

function iso(baseMs: number, offsetSec: number): string {
  return new Date(baseMs + offsetSec * 1000).toISOString();
}

export function buildImportedWorkout(spec: WorkoutSpec): WorkoutSession {
  const id = `import-${spec.date}`;
  const startMs = Date.parse(`${spec.date}T${String(START_HOUR_UTC).padStart(2, "0")}:00:00.000Z`);
  let elapsedSec = 0;

  const blocks: PerformedBlock[] = spec.blocks.map((block, position) => {
    const blockId = `${id}-b${position + 1}`;
    const base = {
      id: blockId,
      position,
      addedDuringWorkout: false,
      kind: "exercise" as const,
      exerciseId: block.exercise,
      status: "performed" as const,
      ...(block.note ? { note: block.note } : {}),
    };

    if ("steps" in block) {
      const cardioSteps: PerformedCardioStep[] = block.steps.map((step, index) => {
        elapsedSec += step.min * 60;

        return {
          id: `${blockId}-s${index + 1}`,
          position: index,
          status: "completed",
          settings: {
            durationSec: step.min * 60,
            speedKmh: step.kmh,
            inclinePercent: step.incline,
          },
          ...(step.bpm !== undefined ? { bpm: step.bpm } : {}),
          completedAt: iso(startMs, elapsedSec),
        };
      });

      return {
        ...base,
        snapshotInstructions: {
          shape: "steps",
          steps: cardioSteps.map((step) => ({
            id: `${step.id}-plan`,
            position: step.position,
            ...(step.settings as { durationSec: number; speedKmh: number; inclinePercent: number }),
          })),
        },
        cardioSteps,
      };
    }

    if ("distanceKm" in block) {
      /* Marche : 7 km ≈ 1 h 20 à 5,2 km/h. */
      elapsedSec += Math.round((block.distanceKm / 5.2) * 3600);

      return {
        ...base,
        snapshotInstructions: { shape: "distance" },
        simpleMeasurement: {
          distanceKm: block.distanceKm,
          completedAt: iso(startMs, elapsedSec),
        },
      };
    }

    const series: PerformedSeries[] = block.sets.map((set, index) => {
      elapsedSec += setDurationSec(set);

      return {
        id: `${blockId}-s${index + 1}`,
        position: index,
        status: "completed",
        ...(set.load !== undefined ? { load: toLoad(set.load) } : {}),
        ...(set.reps !== undefined ? { reps: set.reps } : {}),
        ...(set.sec !== undefined ? { durationSec: set.sec } : {}),
        ...(set.perSide ? { sideValues: sideValues(set.perSide) } : {}),
        ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
        ...(set.note ? { note: set.note } : {}),
        completedAt: iso(startMs, elapsedSec),
      };
    });

    return {
      ...base,
      snapshotInstructions: snapshotFor(block.sets),
      series,
    };
  });

  const startedAt = iso(startMs, 0);
  const completedAt = iso(startMs, elapsedSec);

  return {
    id,
    source: "free",
    status: "completed",
    date: spec.date,
    startedAt,
    completedAt,
    lastActionAt: completedAt,
    activeDurationSec: elapsedSec,
    blocks,
    createdAt: IMPORT_TIMESTAMP,
    updatedAt: IMPORT_TIMESTAMP,
  };
}
