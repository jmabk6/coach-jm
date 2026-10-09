import type {
  ExerciseBlock,
  ExerciseInstructions,
  SessionTemplate,
  SpeedInclineStepInstruction,
  StrengthProgressionType,
  TestScheduleEntry,
  WeeklyProgram,
} from "../../domain";

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
  extra: Partial<Pick<ExerciseBlock, "notes" | "role" | "outsideFrame" | "ownReference">> = {},
): ExerciseBlock {
  return { id, kind: "exercise", position, exerciseId, instructions, ...extra };
}

function reps(sets: number, min: number, max: number, restBetweenSetsSec: number, targetRpe?: { min: number; max: number }): ExerciseInstructions {
  return { shape: "reps", sets, reps: { min, max }, restBetweenSetsSec, ...(targetRpe ? { targetRpe } : {}) };
}

/** Repos : gros mouvements 2 min (traction de Muscu A 3 min), isolations 90 s. */
const BIG = 120;
const ISOLATION = 90;
/** Programme muscu du 05/10/2026 : les briques lourdes (rowing de A, chest press de B), 2 min 30. */
const HEAVY = 150;
/** RPE 8-9 au plus, jamais 10 (briques lourdes et chest press de rappel). */
const RPE_8_9 = { min: 8, max: 9 };

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

/** Curl biceps de Muscu A : le curl haltères, bras alternés (décision du 04/10/2026 ; avant : le curl à la barre EZ). */
export const CURL_BICEPS_ID = "curl-halteres";
export const CURL_HALTERES_NOTE = "Haltères, bras alternés.";

/** Muscu A, leg press (05/10/2026). */
export const LEG_PRESS_A_NOTE = "Environ 2 reps en réserve (RPE 8), jamais à l'échec. Charge : la dernière utilisée. Dimanche de test traction : travail propre, sans recherche de record.";
/** Muscu B, traction légère (03/10/2026). */
export const TRACTION_LIGHT_NOTE = "Traction légère, en premier : l'aide de volume du dernier palier A validé (elle ne descend qu'après la validation du palier A suivant), 3 × 8-10, RPE 6-8, jamais à l'échec. Semaine test : 2 × 8.";
/** La consigne d'avant le 05/10/2026 (« A + 7 kg »), remplacée par le seed 34. */
export const TRACTION_LIGHT_NOTE_A_PLUS_7 = "Traction légère, en premier : un cran d'aide au-dessus de la Muscu A (A + 7 kg), 3 × 8-10, RPE 6-8, jamais à l'échec. Semaine test : 2 × 8.";
/** Muscu C, tractions négatives (pari V6, à partir du 01/11/2026) ; place du 05/10/2026 : juste après l'échauffement. */
export const NEGATIVES_NOTE = "Juste après l'échauffement, à frais, avant la suspension et les sprints : descente contrôlée d'environ 5 s, 2 min 30 de repos, jamais à l'échec. Passer à 2 × 3 seulement si la récupération et les coudes vont bien.";
/** La consigne d'avant le 05/10/2026 (négatives après la suspension), remplacée par le seed 38. */
export const NEGATIVES_NOTE_AFTER_SUSPENSION = "Juste après la suspension, avant les sprints : descente contrôlée d'environ 5 s, 2 à 3 min de repos, jamais à l'échec. Passer à 2 × 3 seulement si la récupération et les coudes vont bien.";
/** Muscu A, rowing lourd (05/10/2026). */
export const ROWING_HEAVY_NOTE = "Lourd / force : RPE 8-9 au plus, jamais RPE 10.";
/** Muscu B, rowing de volume (05/10/2026) : référence propre, jamais la charge du dimanche. */
export const ROWING_VOLUME_NOTE = "Volume : charge volontairement plus légère que le rowing lourd du dimanche, 1 min 30 à 2 min de repos, jamais RPE 10. Charge : celle du dernier rowing de Muscu B.";
/** Muscu A, chest press de rappel (05/10/2026) : référence propre, jamais la charge du mardi. */
export const CHEST_PRESS_REMINDER_NOTE = "Rappel modéré : RPE 8-9 au plus, jamais RPE 10. Charge : celle du dernier chest press de Muscu A.";
/** Muscu B, chest press lourd (05/10/2026). */
export const CHEST_PRESS_HEAVY_NOTE = "Lourd / force : RPE 8-9 au plus, jamais RPE 10.";
/** Muscu C, tirage vertical de volume (05/10/2026, à la place du pullover). */
export const TIRAGE_VOLUME_NOTE = "Volume : RPE 8 au plus, jamais RPE 10. 1 min 30 à 2 min de repos.";
/** Muscu C, sprints vélo (05/10/2026) : consigne durable, sans date — étalonnage à la première séance, puis même résistance. */
export const SPRINTS_NOTE = "Première séance : étalonne la résistance pour pouvoir sprinter rapidement pendant 12 s. Ensuite, conserve le même vélo si possible et la même résistance à chaque séance.";
/** La consigne des sprints d'avant le 05/10/2026. */
export const SPRINTS_NOTE_BEFORE = "Même vélo, même résistance à chaque séance.";
/** Muscu C, montée sur banc (05/10/2026). */
export const MONTEE_BANC_NOTE = "8 par jambe. Mouvement contrôlé, pas de step-up explosif.";
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
    /* Programme du 05/10/2026 : rowing lourd 3 × 6-8, 2 min 30, RPE 8-9 — la brique du cadre rowing. */
    exercise("v2-muscu-a-rowing", 2, "rowing-poulie-basse", reps(3, 6, 8, HEAVY, RPE_8_9), { notes: ROWING_HEAVY_NOTE }),
    /* Chest press de rappel 2 × 8-12 (le cadre lourd est celui de Muscu B) : hors palier, référence propre. */
    exercise("v2-muscu-a-chest-press", 3, "chest-press", reps(2, 8, 12, BIG, RPE_8_9), { notes: CHEST_PRESS_REMINDER_NOTE, outsideFrame: true, ownReference: true }),
    exercise("v2-muscu-a-elevations", 4, "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION)),
    exercise("v2-muscu-a-curl", 5, CURL_BICEPS_ID, reps(3, 8, 12, ISOLATION), { notes: CURL_HALTERES_NOTE }),
    /* Leg curl couché à la place du leg curl assis (décision du 27/09/2026). */
    exercise("v2-muscu-a-leg-curl", 6, "leg-curl-couche", reps(2, 10, 12, ISOLATION)),
    /* Leg press (05/10/2026) : 2 × 10-12, environ 2 reps en réserve. Hors palier (le cadre est celui de
       Muscu B) : la charge reprend la dernière séance, ni objectif ni conseil du cadre. */
    exercise(
      "v2-muscu-a-presse",
      7,
      "presse-cuisses",
      { shape: "reps", sets: 2, reps: { min: 10, max: 12 }, targetRpe: { min: 8, max: 8 }, restBetweenSetsSec: BIG },
      { notes: LEG_PRESS_A_NOTE, outsideFrame: true },
    ),
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
    /* Programme du 05/10/2026 : chest press lourd 3 × 6-8, 2 min 30, RPE 8-9 — la brique du cadre chest press. */
    exercise("v2-muscu-b-chest-press", 2, "chest-press", reps(3, 6, 8, HEAVY, RPE_8_9), { notes: CHEST_PRESS_HEAVY_NOTE }),
    exercise("v2-muscu-b-developpe-incline", 3, "developpe-incline-halteres", reps(3, 8, 12, BIG)),
    /* Rowing de volume 2 × 10-15 (le cadre lourd est celui de Muscu A) : hors palier, référence propre. */
    exercise("v2-muscu-b-rowing", 4, "rowing-poulie-basse", reps(2, 10, 15, BIG), { notes: ROWING_VOLUME_NOTE, outsideFrame: true, ownReference: true }),
    exercise("v2-muscu-b-developpe-epaules", 5, "developpe-epaules-machine", reps(3, 8, 10, BIG)),
    exercise("v2-muscu-b-elevations", 6, "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION)),
    exercise("v2-muscu-b-extension-triceps", 7, "extension-triceps-poulie", reps(3, 10, 15, ISOLATION)),
    exercise("v2-muscu-b-presse", 8, "presse-cuisses", reps(3, 10, 12, BIG)),
  ],
};

export const FACE_PULL_NOTE = "Poulie à hauteur du visage, corde, tirer vers le front en écartant les mains, coudes hauts ; charge légère, sans à-coups.";

/** Muscu C, écarté à la poulie (09/10/2026) : les pecs en isolation, à côté des développés de A et B. */
export const ECARTE_NOTE = "Coudes légèrement fléchis, amplitude confortable, sans à-coups ; RPE 8 au plus.";
/** Muscu C, tapis incliné de fin de séance (09/10/2026) : la pente se règle sur les bpm, cible de départ. */
export const TAPIS_INCLINE_NOTE =
  "Travail : vise 115-125 bpm (autour de 120), cible de départ à ajuster. Règle la pente pour y rester et attends 1 à 2 min entre deux changements ; tu dois pouvoir parler en phrases, sans te tenir aux poignées. Au-dessus de 130 bpm durablement, baisse la pente. Note les bpm en fin de palier.";

/** Les briques de Muscu C après le seed 38 (programme du 05/10/2026), avant le seed 39. */
export const MUSCU_C_BLOCKS_BEFORE_20261009 = [
  "v2-muscu-c-echauffement",
  "v2-muscu-c-negatives",
  "v2-muscu-c-suspension",
  "v2-muscu-c-sprints",
  "v2-muscu-c-montee-banc",
  "v2-muscu-c-rester-bas",
  "v2-muscu-c-tirage-vertical",
  "v2-muscu-c-face-pull",
  "v2-muscu-c-curl-marteau",
  "v2-muscu-c-triceps-tete",
] as const;

/**
 * Muscu C, haut du corps (décision du 09/10/2026, seed 39) : le step et
 * « Rester bas » passent à la maison (Routine A du soir), les sprints vélo
 * sont remplacés par 20 min de tapis incliné réglé sur les bpm ;
 * l'écarté à la poulie et les élévations latérales entrent. Les
 * négatives du pari V6 et les allègements des semaines test ne changent pas.
 */
const muscuC: TemplateContent = {
  id: "v2-muscu-c",
  name: "Muscu C — Haut du corps + tapis",
  category: "Musculation",
  letter: "C",
  subtitle: "Haut du corps + tapis",
  tags: ["Haut du corps", "Dos"],
  description: "Environ 80 min.",
  blocks: [
    warmup("v2-muscu-c"),
    /* Pari V6 : 2 × 2 négatives, présentes dans la séance à partir du 01/11/2026 seulement ;
       place du 05/10/2026 : juste après l'échauffement, à frais. */
    exercise("v2-muscu-c-negatives", 1, "traction-negative", reps(2, 2, 2, 150), { notes: NEGATIVES_NOTE }),
    /* Pari traction (03/10/2026) : suspension et omoplates, facile et technique. */
    exercise("v2-muscu-c-suspension", 2, "suspension-omoplates", { shape: "duration", sets: 3, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 60 }, { notes: SUSPENSION_NOTE }),
    /* Programme du 05/10/2026 : le tirage vertical de volume remplace le pullover. */
    exercise("v2-muscu-c-tirage-vertical", 3, "tirage-vertical", reps(2, 10, 15, BIG), { notes: TIRAGE_VOLUME_NOTE }),
    /* 09/10/2026 : l'écarté à la poulie, pour varier le travail des pecs (pas une 3e chest press). */
    exercise("v2-muscu-c-ecarte", 4, "ecarte-poulie", reps(3, 12, 15, ISOLATION), { notes: ECARTE_NOTE }),
    exercise("v2-muscu-c-elevations", 5, "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION)),
    exercise("v2-muscu-c-face-pull", 6, "face-pull", reps(3, 12, 15, ISOLATION), { notes: FACE_PULL_NOTE }),
    exercise("v2-muscu-c-curl-marteau", 7, "curl-marteau-halteres", reps(3, 10, 15, ISOLATION)),
    exercise("v2-muscu-c-triceps-tete", 8, "extension-triceps-dessus-tete", reps(2, 10, 15, ISOLATION)),
    /* 09/10/2026 : 20 min de tapis incliné à la place des sprints vélo ; la pente suit les bpm. */
    exercise(
      "v2-muscu-c-tapis-incline",
      9,
      "tapis",
      {
        shape: "steps",
        steps: [
          step("v2-muscu-c-tapis-incline-montee", 0, 180, 5, { min: 3, max: 6 }),
          step("v2-muscu-c-tapis-incline-travail", 1, 840, 5, { min: 6, max: 10 }),
          step("v2-muscu-c-tapis-incline-retour", 2, 180, 4.5, { min: 0, max: 2 }),
        ],
      },
      { notes: TAPIS_INCLINE_NOTE },
    ),
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

/** Pari traction V6 : le test jambes n'est pas planifié du 04/10/2026 au 31/03/2027 (décision du 05/10/2026). */
export const JAMBES_SUSPENDED_FROM = "2026-10-04";
export const JAMBES_SUSPENDED_UNTIL = "2027-03-31";

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
    /* Pari V6 : pas de test jambes (6 sprints et chaise maximaux) dans les semaines de test allégées. */
    suspendedFrom: JAMBES_SUSPENDED_FROM,
    suspendedUntil: JAMBES_SUSPENDED_UNTIL,
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

/** Cadres du programme muscu du 05/10/2026 (seed 38) : nouvelles versions, sans objectif en cours. */
export interface FrameSpec20261005 {
  exerciseId: string;
  workSets: number;
  repRange: { min: number; max: number };
  rpeTarget: number;
  restSec: number;
}

export const PROGRAM_MUSCU_20261005_FRAMES: FrameSpec20261005[] = [
  { exerciseId: "rowing-poulie-basse", workSets: 3, repRange: { min: 6, max: 8 }, rpeTarget: 9, restSec: HEAVY },
  { exerciseId: "chest-press", workSets: 3, repRange: { min: 6, max: 8 }, rpeTarget: 9, restSec: HEAVY },
  { exerciseId: "tirage-vertical", workSets: 2, repRange: { min: 10, max: 15 }, rpeTarget: 8, restSec: BIG },
];

/** Cadre créé par le seed 39 (09/10/2026) : l'écarté à la poulie de Muscu C, sans objectif en cours. */
export const PROGRAM_MUSCU_C_20261009_FRAMES: FrameSpec20261005[] = [
  { exerciseId: "ecarte-poulie", workSets: 3, repRange: { min: 12, max: 15 }, rpeTarget: 8, restSec: ISOLATION },
];

/* -------------------------------------------------------------------------- */
/* Objectifs : exercices liés                                                 */
/* -------------------------------------------------------------------------- */

export const GOAL_LINKS_V2: Record<string, string[]> = {
  /* 05/10/2026 (seed 38) : le pullover quitte le programme et l'objectif (lien d'affichage seulement), sans remplaçant. */
  traction: ["traction-assistee", "tirage-vertical", "rowing-poulie-basse"],
  upper_body: [
    "chest-press",
    "developpe-incline-halteres",
    /* 09/10/2026 (seed 39) : l'écarté à la poulie de Muscu C. */
    "ecarte-poulie",
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
