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
 * Historique des feuilles SEMAINE_1/2/3.xlsx (1er → 15 septembre 2026),
 * transcrit à la main dans une notation compacte puis converti en
 * réalisations libres (`source: "free"`, décision du 16/09/2026).
 *
 * Les feuilles n'ont ni heure ni durée : chaque séance démarre à 18 h
 * (heure de Paris) et sa durée active est la somme des paliers cardio,
 * des durées mesurées et de 1 min 30 par série (repos compris).
 *
 * Identifiants fixes : réimporter réécrit les mêmes séances, sans doublon.
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

interface WorkoutSpec {
  date: string;
  blocks: BlockSpec[];
}

const IMPORT_TIMESTAMP = "2026-09-16T12:00:00.000Z";

/* -------------------------------------------------------------------------- */
/* Les séances                                                                */
/* -------------------------------------------------------------------------- */

const CHAT_VACHE_NOTE =
  "8 répétitions lentes. Arrondis doucement le dos, puis reviens dans l'autre sens sans forcer.";
const ENFANT_NOTE = "Fesses vers les talons, bras devant.";
const FLECHISSEUR_NOTE =
  "Un genou au sol, l'autre pied devant ; avance très légèrement le bassin.";
const ISCHIOS_NOTE =
  "Jambe presque tendue, penche-toi depuis les hanches en gardant le dos relativement droit.";
const FESSIERS_NOTE =
  "Allongé, cheville droite sur genou gauche et ramène doucement la cuisse gauche vers toi.";

export const importedWorkoutSpecs: WorkoutSpec[] = [
  {
    date: "2026-09-01",
    blocks: [
      {
        exercise: "tapis",
        steps: [
          { min: 5, kmh: 4.5, incline: 0, bpm: 78 },
          { min: 5, kmh: 5, incline: 5, bpm: 95 },
          { min: 5, kmh: 5, incline: 7, bpm: 100 },
          { min: 3, kmh: 5, incline: 15, bpm: 137 },
          { min: 7, kmh: 4.5, incline: 0, bpm: 85 },
        ],
      },
      {
        exercise: "presse-cuisses",
        note: "Leg press inclinée à disques",
        sets: [
          { load: 60, reps: 10, rpe: 5 },
          { load: 80, reps: 10, rpe: 6 },
          { load: 120, reps: 10, rpe: 8 },
        ],
      },
      {
        exercise: "chest-press",
        sets: [
          { load: 15, reps: 10, rpe: 2 },
          { load: 25, reps: 10, rpe: 5 },
          { load: 35, reps: 10, rpe: 8 },
        ],
      },
      {
        exercise: "rowing-poulie-basse",
        sets: [
          { load: 30, reps: 10, rpe: 5 },
          { load: 40, reps: 10, rpe: 8 },
        ],
      },
      {
        exercise: "tirage-vertical",
        sets: [{ load: 40, reps: 10, rpe: 8 }],
      },
      {
        exercise: "mobilite-chat-vache",
        note: CHAT_VACHE_NOTE,
        sets: [{ reps: 8 }],
      },
      {
        exercise: "import-position-enfant",
        note: ENFANT_NOTE,
        sets: [{ sec: 30 }, { sec: 30 }],
      },
      {
        exercise: "mobilite-flechisseur-hanche",
        note: FLECHISSEUR_NOTE,
        sets: [{ perSide: { sec: 30 } }],
      },
      {
        exercise: "mobilite-ischio-jambiers",
        note: ISCHIOS_NOTE,
        sets: [{ perSide: { sec: 30 } }],
      },
      {
        exercise: "mobilite-figure-4",
        note: FESSIERS_NOTE,
        sets: [{ perSide: { sec: 30 } }],
      },
    ],
  },
  {
    date: "2026-09-02",
    blocks: [
      {
        exercise: "tapis",
        steps: [
          { min: 4, kmh: 4.5, incline: 0 },
          { min: 8, kmh: 5, incline: 6, bpm: 114 },
          { min: 3, kmh: 4.5, incline: 0 },
        ],
      },
      {
        exercise: "developpe-epaules-machine",
        sets: [
          { load: 20, reps: 12, rpe: 8 },
          { load: 20, reps: 12, rpe: 10 },
        ],
      },
      {
        exercise: "rowing-poulie-basse",
        sets: [
          { load: 30, reps: 12, rpe: 6 },
          { load: 40, reps: 12, rpe: 10 },
          { load: 30, reps: 12, rpe: 10 },
        ],
      },
      {
        exercise: "leg-curl-assis",
        sets: [
          { load: 20, reps: 12, rpe: 6 },
          { load: 20, reps: 12, rpe: 10 },
          { load: 15, reps: 12, rpe: 10 },
        ],
      },
      {
        exercise: "import-curl-biceps-ez",
        sets: [
          { load: "vide", reps: 12, rpe: 8 },
          { load: "vide", reps: 12, rpe: 8 },
          { load: "vide", reps: 12, rpe: 8 },
        ],
      },
      {
        exercise: "extension-triceps-poulie",
        sets: [
          { load: 10, reps: 12, rpe: 8 },
          { load: 10, reps: 12, rpe: 10, note: "Tremblement" },
        ],
      },
    ],
  },
  {
    date: "2026-09-03",
    blocks: [
      {
        exercise: "tapis",
        steps: [
          { min: 5, kmh: 4.5, incline: 0 },
          { min: 5, kmh: 5, incline: 5 },
          { min: 5, kmh: 5.2, incline: 7 },
          { min: 5, kmh: 5.2, incline: 8, bpm: 130 },
          { min: 15, kmh: 5.2, incline: 8, bpm: 143 },
          { min: 5, kmh: 4.5, incline: 0, bpm: 102 },
        ],
      },
    ],
  },
  {
    date: "2026-09-05",
    blocks: [
      {
        exercise: "tapis",
        steps: [
          { min: 5, kmh: 4.5, incline: 0 },
          { min: 7, kmh: 5, incline: 5, bpm: 105 },
          { min: 3, kmh: 4.5, incline: 0, bpm: 85 },
        ],
      },
      {
        exercise: "presse-cuisses",
        note: "Leg press horizontale à colonne de plaques",
        sets: [
          { load: 70, reps: 12, rpe: 4 },
          { load: 90, reps: 12, rpe: 6 },
          { load: 100, reps: 12, rpe: 8 },
        ],
      },
      {
        exercise: "tirage-vertical",
        note: "Poulie haute Bodyguard",
        sets: [
          { load: 40, reps: 12, rpe: 10 },
          { load: 30, reps: 12, rpe: 8 },
          { load: 35, reps: 12, rpe: 10 },
        ],
      },
      {
        exercise: "elevations-laterales-halteres",
        sets: [
          { load: 5, reps: 12, rpe: 8 },
          { load: 5, reps: 12, rpe: 10 },
          { load: 5, reps: 8, rpe: 10 },
        ],
      },
    ],
  },
  {
    date: "2026-09-06",
    blocks: [{ exercise: "import-marche", distanceKm: 7 }],
  },
  {
    date: "2026-09-08",
    blocks: [
      {
        exercise: "tapis",
        steps: [
          { min: 3, kmh: 4.5, incline: 0, bpm: 80 },
          { min: 4, kmh: 5, incline: 5, bpm: 99 },
          { min: 3, kmh: 5, incline: 8, bpm: 112 },
          { min: 2, kmh: 4.5, incline: 0, bpm: 85 },
        ],
      },
      {
        exercise: "squat",
        sets: [
          { load: "vide", reps: 15, rpe: 5 },
          { load: { perSide: 5 }, reps: 12, rpe: 6 },
          { load: { perSide: 5 }, reps: 12, rpe: 8 },
          { load: { perSide: 5 }, reps: 12, rpe: 8 },
        ],
      },
      {
        exercise: "tirage-vertical",
        note: "35 kg = bonne base de travail. 40 kg × 10 est actuellement ta performance limite.",
        sets: [
          { load: 30, reps: 10, rpe: 6 },
          { load: 35, reps: 10, rpe: 8 },
          { load: 40, reps: 10, rpe: 10 },
          { load: 35, reps: 10, rpe: 10 },
        ],
      },
      {
        exercise: "leg-curl-assis",
        note: "20 kg est ta charge de travail actuelle, mais probablement plutôt sur 10–12 reps sans chercher systématiquement l'échec.",
        sets: [
          { load: 15, reps: 12, rpe: 6 },
          { load: 20, reps: 12, rpe: 8 },
          { load: 20, reps: 12, rpe: 10 },
        ],
      },
      {
        exercise: "chest-press",
        note: "Très clair : 30 kg = charge de travail, 35 kg est actuellement ta charge lourde.",
        sets: [
          { load: 30, reps: 12, rpe: 8 },
          { load: 30, reps: 12, rpe: 8 },
          { load: 35, reps: 8, rpe: 10 },
        ],
      },
      {
        exercise: "planche",
        note: "Référence actuelle : ≈ 45–50 secondes.",
        sets: [
          { sec: 40, note: "encore 10 s possible" },
          { sec: 50, note: "tremblements" },
          { sec: 45, note: "max" },
        ],
      },
      {
        exercise: "mobilite-chat-vache",
        note: CHAT_VACHE_NOTE,
        sets: [{ reps: 8 }],
      },
      {
        exercise: "import-position-enfant",
        note: ENFANT_NOTE,
        sets: [{ sec: 30 }, { sec: 30 }],
      },
      {
        exercise: "mobilite-flechisseur-hanche",
        note: FLECHISSEUR_NOTE,
        sets: [{ perSide: { sec: 30 } }],
      },
    ],
  },
  {
    date: "2026-09-09",
    blocks: [
      {
        exercise: "tapis",
        note: "RPE global : 6/10",
        steps: [
          { min: 5, kmh: 4.5, incline: 0, bpm: 79 },
          { min: 5, kmh: 5, incline: 5, bpm: 106 },
          { min: 5, kmh: 5, incline: 8, bpm: 121 },
          { min: 5, kmh: 5, incline: 10, bpm: 139 },
          { min: 5, kmh: 5, incline: 10, bpm: 138 },
          { min: 2, kmh: 5, incline: 12, bpm: 150 },
          { min: 5, kmh: 4.5, incline: 0, bpm: 97 },
          { min: 3, kmh: 4.5, incline: 0, bpm: 98 },
        ],
      },
      {
        exercise: "planche",
        sets: [{ sec: 40 }, { sec: 40 }, { sec: 60, note: "max" }],
      },
      {
        exercise: "dead-bug",
        note: "À la fin je décolle un peu le dos",
        sets: [
          { perSide: { reps: 8 } },
          { perSide: { reps: 8 } },
          { perSide: { reps: 8 } },
        ],
      },
      {
        exercise: "mobilite-flechisseur-hanche",
        note: "Position fente, un genou au sol. Rentre légèrement le bassin et avance doucement.",
        sets: [{ perSide: { sec: 40 } }, { perSide: { sec: 40 } }],
      },
      {
        exercise: "mobilite-ischio-jambiers",
        note: "Jambe presque tendue devant toi, dos droit, penche le buste depuis les hanches.",
        sets: [{ perSide: { sec: 40 } }],
      },
      {
        exercise: "import-rotation-dos-allonge",
        note: "30–40 s de chaque côté, sans forcer.",
        sets: [{ perSide: { sec: 40 } }],
      },
      {
        exercise: "import-position-enfant",
        note: "Respiration lente.",
        sets: [{ sec: 60 }],
      },
    ],
  },
  {
    date: "2026-09-11",
    blocks: [
      {
        exercise: "tapis",
        steps: [
          { min: 4, kmh: 4.5, incline: 0, bpm: 80 },
          { min: 4, kmh: 5, incline: 5, bpm: 99 },
          { min: 4, kmh: 5, incline: 8, bpm: 112 },
        ],
      },
      {
        exercise: "rowing-poulie-basse",
        note: "Tirage horizontal",
        sets: [
          { load: 30, reps: 12, rpe: 6 },
          { load: 40, reps: 12, rpe: 8 },
          { load: 45, reps: 8, rpe: 10 },
          { load: 40, reps: 5, rpe: 10 },
        ],
      },
      {
        exercise: "presse-cuisses",
        note: "Leg press",
        sets: [
          { load: 80, reps: 12, rpe: 6 },
          { load: 90, reps: 12, rpe: 6 },
          { load: 100, reps: 12, rpe: 7 },
          { load: 120, reps: 12, rpe: 8 },
        ],
      },
      {
        exercise: "developpe-epaules-machine",
        sets: [
          { load: 30, reps: 12, rpe: 6 },
          { load: 30, reps: 12, rpe: 8 },
          { load: 30, reps: 8, rpe: 10 },
        ],
      },
      {
        exercise: "elevations-laterales-halteres",
        sets: [
          { load: 5, reps: 12, rpe: 8 },
          { load: 5, reps: 8, rpe: 10 },
        ],
      },
      {
        exercise: "extension-triceps-poulie",
        sets: [
          { load: 15, reps: 12, rpe: 8 },
          { load: 15, reps: 12, rpe: 8 },
          { load: 15, reps: 6, rpe: 10 },
        ],
      },
    ],
  },
  {
    date: "2026-09-15",
    blocks: [
      {
        exercise: "developpe-epaules-machine",
        sets: [
          { load: 20, reps: 10, rpe: 8 },
          { load: 20, reps: 10, rpe: 9, note: "bras gauche problème" },
          { load: 15, reps: 10, rpe: 10, note: "bras gauche au taquet" },
        ],
      },
      {
        exercise: "traction-assistee",
        note: "Charge saisie = contrepoids d'assistance",
        sets: [
          { load: 49, reps: 10, rpe: 9 },
          { load: 49, reps: 6, rpe: 10 },
          { load: 56, reps: 10, rpe: 9 },
        ],
      },
      {
        exercise: "presse-cuisses",
        note: "Leg press",
        sets: [
          { load: 100, reps: 10, rpe: 6 },
          { load: 120, reps: 10, rpe: 8 },
          { load: 120, reps: 15, rpe: 9 },
        ],
      },
      {
        exercise: "leg-curl-assis",
        sets: [
          { load: 30, reps: 15, rpe: 8 },
          { load: 35, reps: 10, rpe: 10 },
          { load: 30, reps: 10, rpe: 9 },
        ],
      },
      {
        exercise: "elevations-laterales-halteres",
        sets: [
          { load: 5, reps: 10, rpe: 7 },
          { load: 5, reps: 12, rpe: 10, note: "surtout à gauche" },
        ],
      },
      {
        exercise: "rowing-poulie-basse",
        sets: [
          { load: 35, reps: 12, rpe: 8 },
          { load: 35, reps: 12, rpe: 10 },
        ],
      },
    ],
  },
];

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

export function buildImportedWorkouts(): WorkoutSession[] {
  return importedWorkoutSpecs.map(buildImportedWorkout);
}

const IMPORTED_ID_PREFIX = "import-";

export function isImportedWorkoutId(id: Id): boolean {
  return id.startsWith(IMPORTED_ID_PREFIX);
}

/**
 * Début de la collecte complète : le premier jour des feuilles importées
 * (§16 : « données réelles depuis le 1er septembre 2026 »). Avant cette
 * date, rien n'a été relevé — ce n'est pas une absence de séances.
 */
export function getImportedHistoryStart(): string {
  return importedWorkoutSpecs
    .map((spec) => spec.date)
    .reduce((min, date) => (date < min ? date : min));
}
