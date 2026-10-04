import type {
  ExerciseBlock,
  ExerciseInstructions,
  GroupBlock,
  SessionTemplate,
  SpeedInclineStepInstruction,
  StrengthProgressionType,
  TestScheduleEntry,
  WeeklyProgram,
} from "../../domain";
import { CHAISE_NOTE } from "./programV1";

/**
 * Programme V2 (validé le 26/09/2026, contenu sportif figé), en place à
 * partir du dimanche 04/10/2026. Les séances du 27/09 au 03/10 restent
 * celles du programme V1 (semaine de tests).
 *
 * Six nouveaux modèles à identifiants fixes (`v2-…`) ; la règle
 * hebdomadaire garde les mêmes jours et les routines du soir. Squat,
 * traction négative et suspension + omoplates sortent du programme (ils
 * restent au catalogue). Les cardios démarrent en étalonnage : un seul
 * bloc tapis par séance, des plages indicatives, le ressenti décide.
 */

type TemplateContent = Pick<
  SessionTemplate,
  "id" | "name" | "category" | "description" | "blocks" | "letter" | "subtitle" | "tags" | "mainBlockId"
>;

export const PROGRAM_V2_START = "2026-10-04";

const KNEE = "Douleur au genou : arrêt.";

function exercise(
  id: string,
  position: number,
  exerciseId: string,
  instructions: ExerciseInstructions,
  extra: Partial<Pick<ExerciseBlock, "notes" | "role" | "outsideFrame">> = {},
): ExerciseBlock {
  return { id, kind: "exercise", position, exerciseId, instructions, ...extra };
}

function reps(sets: number, min: number, max: number, restBetweenSetsSec: number): ExerciseInstructions {
  return { shape: "reps", sets, reps: { min, max }, restBetweenSetsSec };
}

/** Repos : gros mouvements 2 min (traction de Muscu A 3 min), isolations 90 s. */
const BIG = 120;
const ISOLATION = 90;

function step(
  id: string,
  position: number,
  durationSec: SpeedInclineStepInstruction["durationSec"],
  speedKmh: SpeedInclineStepInstruction["speedKmh"],
  inclinePercent: SpeedInclineStepInstruction["inclinePercent"],
  targetRpe?: { min: number; max: number },
): SpeedInclineStepInstruction {
  return { id, position, durationSec, speedKmh, inclinePercent, ...(targetRpe ? { targetRpe } : {}) };
}

/** Échauffement tapis 8-10 min en tête de chaque séance de musculation (D14). */
function warmup(prefix: string): ExerciseBlock {
  return exercise(
    `${prefix}-echauffement`,
    0,
    "tapis",
    { shape: "steps", steps: [step(`${prefix}-echauffement-p1`, 0, { min: 480, max: 600 }, 5, 0)] },
    { role: "warmup", notes: "Cardio facile sur tapis." },
  );
}

/* -------------------------------------------------------------------------- */
/* Musculation                                                                */
/* -------------------------------------------------------------------------- */

/** Curl biceps du programme : le curl à la barre EZ, celui des séances de septembre. */
export const CURL_BICEPS_ID = "import-curl-biceps-ez";

/** Muscu B, traction légère (03/10/2026). */
export const TRACTION_LIGHT_NOTE = "Traction légère, en premier : un cran d'aide au-dessus de la Muscu A (A + 7 kg), 3 × 8-10, RPE 6-8, jamais à l'échec. Semaine test : 2 × 8.";
/** Muscu C, tractions négatives (pari V6, à partir du 01/11/2026). */
export const NEGATIVES_NOTE = "Juste après la suspension, avant les sprints : descente contrôlée d'environ 5 s, 2 à 3 min de repos, jamais à l'échec. Passer à 2 × 3 seulement si la récupération et les coudes vont bien.";
/** Muscu C, suspension (03/10/2026). */
export const SUSPENSION_NOTE = "Facile et technique : omoplates basses et serrées, bras tendus. Pas un test de durée maximale : s'arrêter bien avant la fatigue du grip, pour arriver frais à la Muscu A.";


const muscuA: TemplateContent = {
  id: "v2-muscu-a",
  name: "Muscu A — Dos / traction / biceps",
  category: "Musculation",
  letter: "A",
  subtitle: "Dos / traction / biceps",
  tags: ["Haut du corps", "Dos"],
  description: "Environ 70 min.",
  blocks: [
    warmup("v2-muscu-a"),
    /* Pari traction V6 (04/10/2026) : 3 séries jusqu'à 5 reps propres, 3 min de repos. */
    exercise("v2-muscu-a-traction", 1, "traction-assistee", reps(3, 1, 5, 180)),
    exercise("v2-muscu-a-rowing", 2, "rowing-poulie-basse", reps(3, 8, 12, BIG)),
    exercise("v2-muscu-a-tirage-vertical", 3, "tirage-vertical", reps(2, 8, 12, BIG)),
    /* N5 : 2 séries contre 3 au cadre (suit B) — prescription réduite, ni palier ni stagnation. */
    exercise("v2-muscu-a-chest-press", 4, "chest-press", reps(2, 8, 12, BIG)),
    exercise("v2-muscu-a-elevations", 5, "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION)),
    exercise("v2-muscu-a-curl", 6, CURL_BICEPS_ID, reps(3, 8, 12, ISOLATION)),
    /* Leg curl couché à la place du leg curl assis (décision du 27/09/2026). */
    exercise("v2-muscu-a-leg-curl", 7, "leg-curl-couche", reps(2, 10, 12, ISOLATION)),
  ],
};

const muscuB: TemplateContent = {
  id: "v2-muscu-b",
  name: "Muscu B — Pecs / épaules / triceps",
  category: "Musculation",
  letter: "B",
  subtitle: "Pecs / épaules / triceps",
  tags: ["Haut du corps", "Pecs", "Épaules"],
  description: "Environ 70 min.",
  blocks: [
    warmup("v2-muscu-b"),
    /* Pari traction V6 (04/10/2026) : la traction légère en premier, faite à frais ; 3 × 8-10,
       2 × 8 en semaine test. Hors palier : ni validation du cadre, ni stagnation. */
    exercise("v2-muscu-b-traction", 1, "traction-assistee", reps(3, 8, 10, BIG), { notes: TRACTION_LIGHT_NOTE, outsideFrame: true }),
    exercise("v2-muscu-b-chest-press", 2, "chest-press", reps(3, 8, 12, BIG)),
    exercise("v2-muscu-b-developpe-incline", 3, "developpe-incline-halteres", reps(3, 8, 12, BIG)),
    exercise("v2-muscu-b-developpe-epaules", 4, "developpe-epaules-machine", reps(3, 8, 10, BIG)),
    exercise("v2-muscu-b-elevations", 5, "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION)),
    exercise("v2-muscu-b-extension-triceps", 6, "extension-triceps-poulie", reps(3, 10, 15, ISOLATION)),
    exercise("v2-muscu-b-presse", 7, "presse-cuisses", reps(3, 10, 12, BIG)),
  ],
};

const resterBas: GroupBlock = {
  id: "v2-muscu-c-rester-bas",
  kind: "group",
  position: 5,
  name: "Rester bas",
  rounds: 3,
  restBetweenRoundsSec: 90,
  children: [
    { id: "v2-muscu-c-chaise", position: 0, exerciseId: "chaise-60", instructions: { shape: "duration", durationSec: { min: 30, max: 45 } }, notes: CHAISE_NOTE },
    { id: "v2-muscu-c-marche-laterale", position: 1, exerciseId: "marche-laterale-elastique", instructions: { shape: "reps", reps: { min: 10, max: 10 } }, notes: "10 pas par côté." },
    { id: "v2-muscu-c-mollets", position: 2, exerciseId: "mollets-debout", instructions: { shape: "reps", reps: { min: 15, max: 20 } } },
  ],
};

export const FACE_PULL_NOTE = "Poulie à hauteur du visage, corde, tirer vers le front en écartant les mains, coudes hauts ; charge légère, sans à-coups.";

const muscuC: TemplateContent = {
  id: "v2-muscu-c",
  name: "Muscu C — Jambes padel + rappel haut",
  category: "Musculation",
  letter: "C",
  subtitle: "Jambes padel + rappel haut",
  tags: ["Jambes", "Padel"],
  description: "Environ 70 min.",
  blocks: [
    warmup("v2-muscu-c"),
    /* Pari traction (03/10/2026) : suspension et omoplates, facile et technique. */
    exercise("v2-muscu-c-suspension", 1, "suspension-omoplates", { shape: "duration", sets: 3, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 60 }, { notes: SUSPENSION_NOTE }),
    /* Pari V6 : 2 × 2 négatives, présentes dans la séance à partir du 01/11/2026 seulement. */
    exercise("v2-muscu-c-negatives", 2, "traction-negative", reps(2, 2, 2, 150), { notes: NEGATIVES_NOTE }),
    exercise("v2-muscu-c-sprints", 3, "sprint-velo", { shape: "duration", sets: 6, durationSec: 12, restBetweenSetsSec: 48 }, { notes: "Même vélo, même résistance à chaque séance." }),
    exercise("v2-muscu-c-montee-banc", 4, "montee-banc", reps(3, 8, 8, 60), { notes: "8 par jambe." }),
    resterBas,
    exercise("v2-muscu-c-pullover", 6, "pullover-poulie", reps(3, 10, 15, ISOLATION)),
    exercise("v2-muscu-c-face-pull", 7, "face-pull", reps(3, 12, 15, ISOLATION), { notes: FACE_PULL_NOTE }),
    exercise("v2-muscu-c-curl-marteau", 8, "curl-marteau-halteres", reps(3, 10, 15, ISOLATION)),
    exercise("v2-muscu-c-triceps-tete", 9, "extension-triceps-dessus-tete", reps(2, 10, 15, ISOLATION)),
  ],
};

/* -------------------------------------------------------------------------- */
/* Cardio : un seul bloc tapis, en étalonnage                                  */
/* -------------------------------------------------------------------------- */

/** Cardio A : le bloc principal de 30 min, en 6 paliers de 5 min (un relevé de FC chacun). */
export const CARDIO_A_V2_MAIN_STEP_IDS = [1, 2, 3, 4, 5, 6].map((index) => `v2-cardio-a-bloc-${index}`);

const cardioA: TemplateContent = {
  id: "v2-cardio-a",
  name: "Cardio A — Endurance facile",
  category: "Cardio",
  letter: "A",
  subtitle: "Endurance facile",
  tags: ["Endurance"],
  description: "Environ 45 min.",
  mainBlockId: "v2-cardio-a-tapis",
  blocks: [
    exercise(
      "v2-cardio-a-tapis",
      0,
      "tapis",
      {
        shape: "steps",
        steps: [
          step("v2-cardio-a-progressif", 0, 600, { min: 4.5, max: 5.5 }, { min: 0, max: 6 }),
          ...CARDIO_A_V2_MAIN_STEP_IDS.map((id, index) => step(id, index + 1, 300, 5.5, { min: 6, max: 8 }, { min: 4, max: 5 })),
          step("v2-cardio-a-retour", 7, 300, 4.5, 0),
        ],
      },
      {
        notes: `Effort facile, tu parles en phrases complètes. Ajuste le réglage pour rester à RPE 4-5. Relève la FC toutes les 5 min. ${KNEE}`,
      },
    ),
  ],
};

function cardioBSteps(): SpeedInclineStepInstruction[] {
  const steps: SpeedInclineStepInstruction[] = [step("v2-cardio-b-progressif", 0, 600, { min: 4.5, max: 5.5 }, { min: 0, max: 5 })];
  for (let round = 1; round <= 5; round += 1) {
    steps.push(step(`v2-cardio-b-effort-${round}`, steps.length, 180, 5.5, { min: 10, max: 15 }, { min: 8, max: 8 }));
    /* Pas de récupération après le 5e intervalle : le retour au calme enchaîne. */
    if (round < 5) steps.push(step(`v2-cardio-b-recup-${round}`, steps.length, 120, 4.5, { min: 2, max: 3 }));
  }
  steps.push(step("v2-cardio-b-retour", steps.length, 300, 4.5, 0));
  return steps;
}

const cardioB: TemplateContent = {
  id: "v2-cardio-b",
  name: "Cardio B — Intervalles en marche inclinée",
  category: "Cardio",
  letter: "B",
  subtitle: "Intervalles en marche inclinée",
  tags: ["Intervalles"],
  description: "Environ 38 min.",
  blocks: [
    exercise(
      "v2-cardio-b-tapis",
      0,
      "tapis",
      { shape: "steps", steps: cardioBSteps() },
      {
        notes: `1er intervalle à 10 %, puis +1 à 2 % par intervalle jusqu'à RPE 8. Relève la FC à la fin de chaque intervalle. Sans tenir les barres. Marche uniquement, pas de course. ${KNEE}`,
      },
    ),
  ],
};

const cardioC: TemplateContent = {
  id: "v2-cardio-c",
  name: "Cardio C — Endurance soutenue",
  category: "Cardio",
  letter: "C",
  subtitle: "Endurance soutenue",
  tags: ["Endurance"],
  description: "Environ 57 min, ou une randonnée.",
  blocks: [
    exercise(
      "v2-cardio-c-tapis",
      0,
      "tapis",
      {
        shape: "steps",
        steps: [
          step("v2-cardio-c-progressif", 0, 600, { min: 4.5, max: 5.5 }, { min: 0, max: 8 }),
          step("v2-cardio-c-soutenu-1", 1, 720, 5.5, { min: 8, max: 12 }, { min: 6, max: 6 }),
          step("v2-cardio-c-entre", 2, 180, 4.5, 3),
          step("v2-cardio-c-soutenu-2", 3, 720, 5.5, { min: 8, max: 12 }, { min: 6, max: 6 }),
          /* « 15 min faciles, RPE 4-5 » : le réglage facile de Cardio A. */
          step("v2-cardio-c-facile", 4, 900, 5.5, { min: 6, max: 8 }, { min: 4, max: 5 }),
          step("v2-cardio-c-retour", 5, 300, 4.5, 0),
        ],
      },
      {
        notes: `Effort soutenu, tu ne parles plus qu'en phrases courtes. Relève la FC à la fin de chaque bloc. Alternative possible : randonnée avec dénivelé, même durée, même ressenti. ${KNEE}`,
      },
    ),
  ],
};

export const PROGRAM_V2_TEMPLATES: TemplateContent[] = [muscuA, muscuB, muscuC, cardioA, cardioB, cardioC];

/** Modèle V1 → modèle V2 de la même lettre, pour basculer les séances planifiées. */
export const V1_TO_V2: Record<string, string> = {
  "v1-muscu-a": "v2-muscu-a",
  "v1-muscu-b": "v2-muscu-b",
  "v1-muscu-c": "v2-muscu-c",
  "v1-cardio-a": "v2-cardio-a",
  "v1-cardio-b": "v2-cardio-b",
  "v1-cardio-c": "v2-cardio-c",
};

export const PROGRAM_V2_DAYS: WeeklyProgram["days"] = [
  { weekday: "sunday", sessionTemplateId: "v2-muscu-a" },
  { weekday: "monday", sessionTemplateId: "v2-cardio-b" },
  { weekday: "tuesday", sessionTemplateId: "v2-muscu-b" },
  { weekday: "wednesday", sessionTemplateId: "v2-cardio-a" },
  { weekday: "thursday", sessionTemplateId: "v2-muscu-c" },
  { weekday: "friday" },
  { weekday: "saturday", sessionTemplateId: "v2-cardio-c" },
];

/** Place des tests en V2 : mêmes jours ; les modèles et briques visés changent. */
export const PROGRAM_V2_TEST_SCHEDULE: TestScheduleEntry[] = [
  {
    protocolKey: "traction",
    weekday: "sunday",
    slot: "day",
    templateId: "v2-muscu-a",
    /* Pari V6 (05/10/2026) : le test remplace la traction de Muscu A, aucune série de travail après. */
    placement: "replace_block",
    targetBlockId: "v2-muscu-a-traction",
  },
  { protocolKey: "mensurations", weekday: "monday", slot: "morning" },
  { protocolKey: "souplesse", weekday: "monday", slot: "evening", placement: "replace_all" },
  { protocolKey: "tronc", weekday: "monday", slot: "evening", placement: "replace_all" },
  {
    protocolKey: "cardio",
    weekday: "wednesday",
    slot: "day",
    templateId: "v2-cardio-a",
    /* Le test remplace le bloc principal (6 paliers) ; progressif et retour au calme restent. */
    placement: "replace_block",
    targetBlockId: "v2-cardio-a-tapis",
    targetStepIds: CARDIO_A_V2_MAIN_STEP_IDS,
  },
  {
    protocolKey: "jambes",
    weekday: "thursday",
    slot: "day",
    templateId: "v2-muscu-c",
    placement: "replace_block",
    targetBlockId: "v2-muscu-c-sprints",
  },
];

/* -------------------------------------------------------------------------- */
/* Cadres de progression                                                      */
/* -------------------------------------------------------------------------- */

export interface FrameSpecV2 {
  exerciseId: string;
  workSets: number;
  repRange: { min: number; max: number };
  restSec: number;
  /** Cible en kg ; absente = cadre sans cible (à étalonner). */
  target?: number;
  /** Cran : utile seulement pour un cadre créé. */
  increment?: number;
  progressionType?: StrengthProgressionType;
}

/**
 * Cadres V2 (décisions du 26/09/2026). Traction assistée : inchangée
 * (3 × 6-8, 52 kg d'aide), absente de cette liste. Pullover et mollets :
 * inchangés. Un cadre qui change reçoit une nouvelle version, jamais un
 * écrasement ; un cadre absent est créé.
 */
export const PROGRAM_V2_FRAMES: FrameSpecV2[] = [
  { exerciseId: "chest-press", workSets: 3, repRange: { min: 8, max: 12 }, restSec: BIG, target: 40 },
  { exerciseId: "rowing-poulie-basse", workSets: 3, repRange: { min: 8, max: 12 }, restSec: BIG, target: 40 },
  { exerciseId: "developpe-incline-halteres", workSets: 3, repRange: { min: 8, max: 12 }, restSec: BIG, target: 8 },
  { exerciseId: "elevations-laterales-halteres", workSets: 3, repRange: { min: 12, max: 15 }, restSec: ISOLATION, target: 5 },
  { exerciseId: "tirage-vertical", workSets: 2, repRange: { min: 8, max: 12 }, restSec: BIG, target: 40 },
  /* 27/09/2026 : le leg curl couché remplace le leg curl assis ; cadre créé sans cible (à étalonner). */
  { exerciseId: "leg-curl-couche", workSets: 2, repRange: { min: 10, max: 12 }, restSec: ISOLATION, increment: 2.5 },
  { exerciseId: "developpe-epaules-machine", workSets: 3, repRange: { min: 8, max: 10 }, restSec: BIG },
  { exerciseId: "extension-triceps-poulie", workSets: 3, repRange: { min: 10, max: 15 }, restSec: ISOLATION, target: 10 },
  { exerciseId: "presse-cuisses", workSets: 3, repRange: { min: 10, max: 12 }, restSec: BIG, target: 120 },
  { exerciseId: CURL_BICEPS_ID, workSets: 3, repRange: { min: 8, max: 12 }, restSec: ISOLATION, increment: 2.5 },
  { exerciseId: "curl-marteau-halteres", workSets: 3, repRange: { min: 10, max: 15 }, restSec: ISOLATION, increment: 1 },
  { exerciseId: "face-pull", workSets: 3, repRange: { min: 12, max: 15 }, restSec: ISOLATION, increment: 2.5 },
  { exerciseId: "extension-triceps-dessus-tete", workSets: 2, repRange: { min: 10, max: 15 }, restSec: ISOLATION, increment: 2.5 },
];

/* -------------------------------------------------------------------------- */
/* Objectifs : exercices liés                                                 */
/* -------------------------------------------------------------------------- */

export const GOAL_LINKS_V2: Record<string, string[]> = {
  traction: ["traction-assistee", "tirage-vertical", "rowing-poulie-basse", "pullover-poulie"],
  upper_body: [
    "chest-press",
    "developpe-incline-halteres",
    "developpe-epaules-machine",
    "elevations-laterales-halteres",
    "rowing-poulie-basse",
    "tirage-vertical",
    "face-pull",
    CURL_BICEPS_ID,
    "curl-marteau-halteres",
    "extension-triceps-poulie",
    "extension-triceps-dessus-tete",
  ],
  legs: ["presse-cuisses", "leg-curl-couche", "montee-banc", "chaise-60", "marche-laterale-elastique", "mollets-debout", "sprint-velo"],
  cardio: ["tapis"],
};
