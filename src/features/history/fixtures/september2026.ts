import type { WorkoutSession } from "../../../domain";
import { buildImportedWorkout, type WorkoutSpec } from "../importedWorkouts";

/**
 * Les dix séances des feuilles SEMAINE_1/2/3.xlsx (1er → 16 septembre
 * 2026). L'import depuis l'interface est retiré (D3, lot L) et l'action
 * d'import au lot N.3 : ces données ne servent plus qu'aux tests (et à la
 * page de recette v3). Les séances réelles importées restent dans la
 * base, sous leurs identifiants `import-*`.
 */

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
  {
    date: "2026-09-16",
    blocks: [
      {
        exercise: "tapis",
        steps: [
          { min: 5, kmh: 4.5, incline: 0, bpm: 86 },
          { min: 5, kmh: 5, incline: 5, bpm: 98 },
          { min: 5, kmh: 5, incline: 7, bpm: 111 },
          { min: 5, kmh: 5, incline: 5, bpm: 102 },
          { min: 5, kmh: 5, incline: 7, bpm: 112 },
          { min: 5, kmh: 5, incline: 5, bpm: 105 },
          { min: 2, kmh: 5, incline: 15, bpm: 140 },
          { min: 8, kmh: 4.5, incline: 0, bpm: 92 },
        ],
      },
      {
        exercise: "dead-bug",
        sets: [
          { perSide: { reps: 8 }, rpe: 7 },
          { perSide: { reps: 8 }, rpe: 8 },
        ],
      },
      {
        exercise: "planche",
        sets: [
          { sec: 45, rpe: 8 },
          { sec: 45, rpe: 8 },
          { sec: 60, rpe: 9 },
        ],
      },
      {
        exercise: "mobilite-chat-vache",
        note: "8 répétitions lentes.",
        sets: [{ reps: 8 }],
      },
      {
        exercise: "import-position-enfant",
        sets: [{ sec: 45 }],
      },
      {
        exercise: "mobilite-flechisseur-hanche",
        sets: [{ perSide: { sec: 45 } }],
      },
      {
        exercise: "import-rotation-dos-allonge",
        note: "5 répétitions lentes de chaque côté.",
        sets: [{ perSide: { reps: 5 } }],
      },
    ],
  },
];

export function buildImportedWorkouts(): WorkoutSession[] {
  return importedWorkoutSpecs.map(buildImportedWorkout);
}
