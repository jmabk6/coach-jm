import type { ExerciseBlock, ExerciseInstructions, SessionTemplate, SpeedInclineStepInstruction, TestScheduleEntry, WeeklyProgram } from "../../domain";
import type { V4Template } from "./programV4";
import { V6_LIGHT_IN_C_FROM } from "../goals/tractionV6";

/**
 * Programme « 4 muscus + 2 cardios » (brief de JM et rapport de conception
 * validé du 12/11/2026, `COFFRE_COACH-JM/2-SPECS/CONCEPTION_PROGRAMME_4+2_2026-11-12.md`).
 *
 * Lot 1 : Muscu A, B, C (mêmes identifiants, nouveau contenu) et Muscu D
 * (nouveau modèle). Chaque brique déplacée garde son identifiant, donc son
 * historique, sa piste et l'objectif du jour calculé sur ses vraies séries.
 * - A, dimanche : tirage force (traction lourde, rowing lourd, élévations
 *   version légère, curl haltères).
 * - B, lundi : poussée force (développé épaules en premier, chest press,
 *   élévations, triceps poulie, abdos machine, rotary).
 * - C, mercredi : tirage volume (suspension en échauffement, traction légère
 *   du pari V6, négatives, tirage vertical, face pull, curl marteau).
 * - D, jeudi : poussée hypertrophie (élévations en premier, incliné, écarté,
 *   face pull, triceps au-dessus de la tête, abdos machine, rotary).
 *
 * Rien ne s'applique avant `PROGRAM_4P2_START`.
 */

/**
 * Activation : dès le vendredi 13/11/2026 (décision de JM : « la mise en
 * ligne maintenant », la semaine en cours gardant l'ancien programme). Le
 * calendrier 4+2 commence le dimanche `PROGRAM_4P2_FIRST_DAY` : les séances
 * du 13 et du 14/11 (Cardio C, routines du soir) restent telles quelles.
 */
export const PROGRAM_4P2_START = "2026-11-13";
/** Premier jour du calendrier 4+2 : dimanche 15/11/2026 (Muscu A). La traction légère passe en C le même jour. */
export const PROGRAM_4P2_FIRST_DAY = V6_LIGHT_IN_C_FROM;

/** L'heure donnée au seed au lancement ; sous Vitest, figée avant l'activation (les tests du programme passent leur date). */
export function seedNow20261115(): string {
  return import.meta.env.MODE === "test" ? "2026-11-12T12:00:00.000Z" : new Date().toISOString();
}

export const MUSCU_D_ID = "v2-muscu-d";

const ISOLATION = 90;
const ABDOS_REST = 45;

function reps(sets: number, min: number, max: number, restBetweenSetsSec: number, targetRpe?: { min: number; max: number }): ExerciseInstructions {
  return { shape: "reps", sets, reps: { min, max }, restBetweenSetsSec, ...(targetRpe ? { targetRpe } : {}) };
}

function exercise(id: string, exerciseId: string, instructions: ExerciseInstructions, extra: Partial<Pick<ExerciseBlock, "notes" | "outsideFrame">> = {}): ExerciseBlock {
  return { id, kind: "exercise", position: 0, exerciseId, instructions, ...extra };
}

/** Échauffement : 8 min de tapis à 5 km/h, pente 0 % (identifiants d'étape gardés). */
function warmup(id: string): ExerciseBlock {
  return {
    id,
    kind: "exercise",
    position: 0,
    exerciseId: "tapis",
    role: "warmup",
    instructions: { shape: "steps", steps: [{ id: `${id}-p1`, position: 0, durationSec: 480, speedKmh: 5, inclinePercent: 0 }] },
    notes: "8 min de tapis facile, 5 km/h, pente 0 %.",
  };
}

const ELEVATIONS_NOTE = "Strict, sans élan du buste. 6 kg : monter les répétitions jusqu'à 3 × 15 propres avant d'aller plus haut.";
const CRUNCH_NOTE = "En fin de séance. Enroule le buste, menton rentré, sans tirer sur les poignées ; bas du dos contre le dossier. Charge à étalonner à la 1re séance : RPE 7-8.";
const ROTARY_NOTE = "Par côté : toutes les répétitions d'un côté, puis de l'autre ; note le côté le plus faible. Lent, en amplitude confortable, sans à-coup en fin de rotation (bas du dos). Charge à étalonner à la 1re séance : RPE 7.";

/** Abdos machine en fin de B et de D : même consigne. */
const abdos = (prefix: "v2-muscu-b" | "v2-muscu-d") => [
  { add: exercise(`${prefix}-crunch`, "crunch-machine", reps(2, 12, 15, ABDOS_REST, { min: 7, max: 8 }), { notes: CRUNCH_NOTE }) },
  { add: exercise(`${prefix}-rotary`, "rotary", reps(2, 12, 12, ABDOS_REST, { min: 7, max: 7 }), { notes: ROTARY_NOTE }) },
];

/* -------------------------------------------------------------------------- */
/* Muscu A, B, C, D                                                           */
/* -------------------------------------------------------------------------- */

export const MUSCU_A_20261115: V4Template = {
  id: "v2-muscu-a",
  name: "Muscu A — Tirage force",
  subtitle: "Traction lourde, dos, biceps",
  tags: ["Haut du corps", "Dos"],
  description: "Environ 55-60 min.",
  before: ["v2-muscu-a-echauffement", "v2-muscu-a-traction", "v2-muscu-a-rowing", "v2-muscu-a-elevations", "v2-muscu-c-tirage-vertical", "v2-muscu-a-chest-press", "v2-muscu-a-curl"],
  blocks: [
    { set: warmup("v2-muscu-a-echauffement") },
    { keep: "v2-muscu-a-traction" },
    {
      set: exercise("v2-muscu-a-rowing", "rowing-poulie-basse", reps(4, 6, 8, 150, { min: 8, max: 9 }), {
        notes: "Lourd / force : RPE 8-9 au plus, jamais RPE 10. Départ : 55 kg ; viser 4 × 8 avant de monter.",
      }),
    },
    /* Venues de C avec leur identifiant : la version légère garde son historique (6 kg le 12/11). */
    {
      set: exercise("v2-muscu-c-elevations", "elevations-laterales-halteres", reps(3, 12, 20, ISOLATION, { min: 7, max: 8 }), {
        notes: "Version légère : séries longues, RPE 7-8, technique stricte. Départ : 6 kg ; monter les répétitions vers 15-20 avant toute hausse de charge.",
        outsideFrame: true,
      }),
    },
    { set: exercise("v2-muscu-a-curl", "curl-halteres", reps(3, 8, 12, ISOLATION), { notes: "Haltères, bras alternés. Départ : 8 kg." }) },
  ],
};

export const MUSCU_B_20261115: V4Template = {
  id: "v2-muscu-b",
  name: "Muscu B — Poussée force",
  subtitle: "Épaules, pectoraux, triceps, abdos",
  tags: ["Haut du corps", "Épaules", "Pecs"],
  description: "Environ 55-60 min.",
  before: [
    "v2-muscu-b-echauffement",
    "v2-muscu-b-traction",
    "v2-muscu-b-developpe-epaules",
    "v2-muscu-b-elevations",
    "v2-muscu-b-chest-press",
    "v2-muscu-b-developpe-incline",
    "v2-muscu-c-ecarte",
    "v2-muscu-b-extension-triceps",
  ],
  blocks: [
    { set: warmup("v2-muscu-b-echauffement") },
    {
      set: exercise("v2-muscu-b-developpe-epaules", "developpe-epaules-machine", reps(3, 8, 12, 150, { min: 8, max: 9 }), {
        notes: "En premier, à frais (priorité épaules). RPE 8-9. Départ : 20 kg ; monter seulement après 3 × 12 propres.",
      }),
    },
    {
      set: exercise("v2-muscu-b-chest-press", "chest-press", reps(3, 6, 10, 150, { min: 8, max: 9 }), {
        notes: "Lourd : RPE 8-9 au plus, jamais RPE 10. Départ : 60 kg ; monter après 3 × 10.",
      }),
    },
    { set: exercise("v2-muscu-b-elevations", "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION), { notes: `Départ : 6 kg. ${ELEVATIONS_NOTE}` }) },
    { set: exercise("v2-muscu-b-extension-triceps", "extension-triceps-poulie", reps(3, 10, 15, ISOLATION), { notes: "Départ : 15 kg." }) },
    ...abdos("v2-muscu-b"),
  ],
};

export const MUSCU_C_20261115: V4Template = {
  id: "v2-muscu-c",
  name: "Muscu C — Tirage volume",
  subtitle: "Traction, dos, deltoïdes postérieurs, biceps",
  tags: ["Haut du corps", "Dos"],
  description: "Environ 65-70 min : la plus longue, à surveiller.",
  before: [
    "v2-muscu-c-echauffement",
    "v2-muscu-c-negatives",
    "v2-muscu-c-suspension",
    "v2-muscu-c-elevations",
    "v2-muscu-c-face-pull",
    "v2-muscu-b-rowing",
    "v2-muscu-c-curl-marteau",
    "v2-muscu-c-triceps-tete",
  ],
  blocks: [
    { set: warmup("v2-muscu-c-echauffement") },
    {
      set: exercise("v2-muscu-c-suspension", "suspension-omoplates", { shape: "duration", sets: 2, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 60, targetRpe: { min: 7, max: 7 } }, {
        notes: "Échauffement des tractions, non compté : omoplates basses et serrées, bras tendus, bien avant la fatigue du grip.",
      }),
    },
    /* Venue de B avec son identifiant : la traction légère du pari V6 (aide = palier A validé + 7 kg). */
    {
      set: exercise("v2-muscu-b-traction", "traction-assistee", reps(3, 8, 10, 120), {
        notes: "Traction légère : l'aide de volume du dernier palier A validé (palier A + 7 kg), 3 × 8-10, RPE 6-8, jamais à l'échec. Semaine test : 2 × 8.",
        outsideFrame: true,
      }),
    },
    {
      set: exercise("v2-muscu-c-negatives", "traction-negative", reps(2, 2, 3, 150), {
        notes: "Descente contrôlée d'environ 5 s, jamais à l'échec. 3 répétitions seulement si la descente reste lente et propre ; surveiller coudes et épaules : la priorité reste la traction lourde du dimanche.",
      }),
    },
    /* Revient de A avec son identifiant. */
    {
      set: exercise("v2-muscu-c-tirage-vertical", "tirage-vertical", reps(3, 10, 12, 120, { min: 8, max: 8 }), {
        notes: "Volume : RPE 8 au plus, jamais RPE 10. Départ : 45 kg.",
      }),
    },
    {
      set: exercise("v2-muscu-c-face-pull", "face-pull", reps(3, 12, 15, ISOLATION, { min: 8, max: 8 }), {
        notes: "Poulie à hauteur du visage, corde, tirer vers le front en écartant les mains. Départ : 30 kg (27,5 puis 30 kg × 12 le 12/11).",
      }),
    },
    {
      set: exercise("v2-muscu-c-curl-marteau", "curl-marteau-halteres", reps(3, 10, 12, ISOLATION), {
        notes: "Départ : 8 kg sur la 1re série, 6 kg ensuite (12/11 : 8 × 12, puis 6 × 12 et 9, RPE 9).",
      }),
    },
  ],
};

export const MUSCU_D_20261115: V4Template = {
  id: MUSCU_D_ID,
  name: "Muscu D — Poussée hypertrophie",
  subtitle: "Largeur d'épaules, pectoraux, triceps, abdos",
  tags: ["Haut du corps", "Épaules", "Pecs"],
  description: "Environ 55-60 min.",
  before: [],
  blocks: [
    { add: warmup("v2-muscu-d-echauffement") },
    /* Venues de A et de B, de C pour les triceps, avec leur identifiant. */
    { set: exercise("v2-muscu-a-elevations", "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION), { notes: `En premier : c'est la séance largeur d'épaules. Départ : 6 kg. ${ELEVATIONS_NOTE}` }) },
    {
      set: exercise("v2-muscu-b-developpe-incline", "developpe-incline-halteres", reps(3, 8, 12, 120, { min: 8, max: 9 }), {
        notes: "Départ : 12 kg par haltère ; 3 × 12 avant de monter.",
      }),
    },
    {
      set: exercise("v2-muscu-c-ecarte", "ecarte-poulie", reps(3, 12, 15, ISOLATION), {
        notes: "Coudes légèrement fléchis, amplitude confortable, sans à-coup. Départ : 10 kg sur la 1re série, 7,5 kg ensuite (10 kg × 11 puis × 5 le 10/11).",
      }),
    },
    {
      add: exercise("v2-muscu-d-face-pull", "face-pull", reps(2, 15, 15, ISOLATION, { min: 7, max: 8 }), {
        notes: "Deltoïdes postérieurs, version légère : 2 × 15, RPE 7-8. Départ : la charge de ton dernier face pull en Muscu C, un cran plus bas si 15 ne passe pas.",
      }),
    },
    {
      set: exercise("v2-muscu-c-triceps-tete", "extension-triceps-dessus-tete", reps(3, 10, 15, ISOLATION), {
        notes: "Départ : 20 kg (20 × 12 le 12/11) ; monter après 3 × 15.",
      }),
    },
    ...abdos("v2-muscu-d"),
  ],
};

export const MUSCU_20261115_TEMPLATES: readonly V4Template[] = [MUSCU_A_20261115, MUSCU_B_20261115, MUSCU_C_20261115, MUSCU_D_20261115];

/** Le nouveau modèle D (hors briques), tel qu'il est créé. */
export function muscuDTemplateBase(position: number, now: string): Omit<SessionTemplate, "blocks"> {
  return {
    id: MUSCU_D_ID,
    name: MUSCU_D_20261115.name,
    category: "Musculation",
    letter: "D",
    subtitle: MUSCU_D_20261115.subtitle,
    tags: [...MUSCU_D_20261115.tags],
    description: MUSCU_D_20261115.description,
    origin: "program_v2",
    status: "active",
    position,
    contentSince: PROGRAM_4P2_START,
    createdAt: now,
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Pistes et cadres                                                            */
/* -------------------------------------------------------------------------- */

/** Pistes closes à la bascule (exercices sortis du programme). */
export const CLOSED_TRACKS_20261115 = ["v2-muscu-a-chest-press", "v2-muscu-b-rowing"] as const;

/** Pistes qui changent de séance avec leur brique. */
export const MOVED_TRACKS_20261115: Readonly<Record<string, { session: "A" | "B" | "C" | "D"; templateId: string }>> = {
  "v2-muscu-c-elevations": { session: "A", templateId: "v2-muscu-a" },
  "v2-muscu-a-elevations": { session: "D", templateId: MUSCU_D_ID },
  "v2-muscu-b-traction": { session: "C", templateId: "v2-muscu-c" },
  "v2-muscu-c-tirage-vertical": { session: "C", templateId: "v2-muscu-c" },
  "v2-muscu-b-developpe-incline": { session: "D", templateId: MUSCU_D_ID },
  "v2-muscu-c-ecarte": { session: "D", templateId: MUSCU_D_ID },
  "v2-muscu-c-triceps-tete": { session: "D", templateId: MUSCU_D_ID },
};

/** Pistes dont la consigne change : leur référence détaillée est recalculée sur la nouvelle consigne. */
export const RECALCULATED_TRACKS_20261115 = [
  "v2-muscu-a-rowing",
  "v2-muscu-c-elevations",
  "v2-muscu-a-elevations",
  "v2-muscu-b-elevations",
  "v2-muscu-b-developpe-epaules",
  "v2-muscu-c-suspension",
  "v2-muscu-c-negatives",
  "v2-muscu-c-tirage-vertical",
  "v2-muscu-c-face-pull",
  "v2-muscu-b-developpe-incline",
  "v2-muscu-c-ecarte",
  "v2-muscu-c-triceps-tete",
] as const;

/**
 * Élévations de B et D (groupe partagé) : nouvelle référence à 6 kg
 * (décision de JM du 12/11 : 6 kg partout). Sans elle, l'historique à 5 kg
 * de B proposerait une transition 6 / 5 / 5 kg, impossible dans la salle
 * sans haltères de 5 kg.
 */
export const ELEVATIONS_6KG_REFERENCE = { from: PROGRAM_4P2_FIRST_DAY, reason: "Programme 4+2 : 6 kg partout, 3 × 12-15." } as const;
export const ELEVATIONS_6KG_TRACKS = ["v2-muscu-a-elevations", "v2-muscu-b-elevations"] as const;

/**
 * Écarté (2 → 3 séries) : la séance du 10/11 (10 kg × 11 puis × 5, RPE 9)
 * serait lue comme « incomplète » et donnerait 10 kg × 11 / 5 / 12. Nouvelle
 * référence : la 1re séance D suit la note (10 kg, puis 7,5 kg).
 */
export const ECARTE_REFERENCE = { from: PROGRAM_4P2_FIRST_DAY, reason: "Programme 4+2 : 3 × 12-15, départ 10 kg puis 7,5 kg." } as const;
export const ECARTE_TRACK = "v2-muscu-c-ecarte";

/** Cadres qui changent (nouvelle version ; l'ancienne reste consultable). */
export const FRAMES_20261115 = [
  { exerciseId: "rowing-poulie-basse", workSets: 4, repRange: { min: 6, max: 8 }, rpeTarget: 9, restSec: 150 },
  { exerciseId: "tirage-vertical", workSets: 3, repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 120 },
  { exerciseId: "developpe-incline-halteres", workSets: 3, repRange: { min: 8, max: 12 }, rpeTarget: 9, restSec: 120 },
  { exerciseId: "ecarte-poulie", workSets: 3, repRange: { min: 12, max: 15 }, rpeTarget: 8, restSec: ISOLATION },
  { exerciseId: "extension-triceps-dessus-tete", workSets: 3, repRange: { min: 10, max: 15 }, rpeTarget: 8, restSec: ISOLATION },
] as const;

/* -------------------------------------------------------------------------- */
/* Lot 2 — Cardios sur tapis et bloc jambes                                    */
/* -------------------------------------------------------------------------- */

/**
 * Les deux cardios gardent leur modèle **par contenu** (historique continu) :
 * - `v2-cardio-b` (intervalles) devient le **Cardio A** du mardi :
 *   fractionné en marche inclinée, puis le bloc jambes ;
 * - `v2-cardio-a` (endurance) devient le **Cardio B** du samedi :
 *   endurance longue. Il reste l'hôte du test cardio (`mainBlockId`).
 * Les noms et les lettres s'échangent ; les identifiants ne bougent pas.
 */
export const FRACTIONNE_ID = "v2-cardio-b";
export const ENDURANCE_ID = "v2-cardio-a";

const BACK = "Sans tenir les barres du tapis. Si une pente réveille le dos, baisse-la de 2 points : c'est un réglage, pas un échec.";

type Range = number | { min: number; max: number };

function step(id: string, position: number, minutes: number, speedKmh: Range, inclinePercent: Range, targetRpe?: { min: number; max: number }): SpeedInclineStepInstruction {
  return { id, position, durationSec: minutes * 60, speedKmh, inclinePercent, ...(targetRpe ? { targetRpe } : {}) };
}

export const FRACTIONNE_STEPS: SpeedInclineStepInstruction[] = [
  step("v2-cardio-b-progressif", 0, 8, { min: 4.5, max: 5.5 }, { min: 0, max: 5 }, { min: 3, max: 4 }),
  ...[1, 2, 3, 4, 5].flatMap((n) => [
    step(`v2-cardio-b-effort-${n}`, 2 * n - 1, 3, 5.5, 10, { min: 7, max: 8 }),
    ...(n < 5 ? [step(`v2-cardio-b-recup-${n}`, 2 * n, 2, 4.5, 2)] : []),
  ]),
  step("v2-cardio-b-retour", 10, 5, 4.5, 0),
];

export const ENDURANCE_STEPS: SpeedInclineStepInstruction[] = [
  step("v2-cardio-a-progressif", 0, 10, { min: 4.5, max: 5.5 }, { min: 0, max: 6 }, { min: 3, max: 4 }),
  step("v2-cardio-a-continu", 1, 40, 5.5, { min: 6, max: 8 }, { min: 5, max: 6 }),
  step("v2-cardio-a-retour", 2, 5, 4.5, 0),
];

export const FRACTIONNE_NOTE = `Marche rapide en pente, sans course : 5 efforts de 3 min à RPE 7-8, récupérations faciles entre deux ; note la FC en fin d'effort. Le 26/10 : 5 efforts à 5,5 km/h, pente 10 %, FC 125 → 137. ${BACK}`;
export const ENDURANCE_NOTE = `Effort facile à modéré (RPE 5-6), tu parles en phrases complètes. Relève la FC toutes les 10 min. Le 09/11 : 30 min à 5,5 km/h, pente 6 → 8 %, FC 104 → 128. ${BACK}`;

const LEGS_STOP = "Arrêt immédiat si douleur devant le genou ou dans le bas du dos ; la brûlure dans la cuisse est normale.";
const legReps = (sets: number, min: number, max: number) => reps(sets, min, max, 60, { min: 7, max: 7 });

/**
 * Bloc jambes endurance, après le fractionné (~15-20 min) : monter les
 * marches et enchaîner les flexions sans brûlure. Pas de fentes (genou).
 * Si une série ne passe pas ou si le bloc dépasse 20 min : retirer d'abord
 * le squat sur chaise, puis la montée sur banc. La montée et la chaise
 * gardent leur brique (historique continu).
 */
export const LEG_BLOCKS: ExerciseBlock[] = [
  exercise("v2-cardio-b-presse-une-jambe", "presse-cuisses-une-jambe", legReps(2, 15, 20), {
    notes: `Répétitions PAR JAMBE : enchaîne les deux jambes, 1 min entre les séries ; note la jambe la plus faible. Départ : 40 kg, à étalonner à la 1re séance (crans de 10 kg). Genou à environ 90°, bassin collé au dossier ; si le bas du dos décolle, réduis l'amplitude. ${LEGS_STOP}`,
  }),
  exercise("v5-cardio-a-montee", "montee-banc", legReps(2, 12, 15), {
    notes: `Répétitions PAR JAMBE, banc de 30-40 cm, sans élan, genou dans l'axe du pied. ${LEGS_STOP}`,
  }),
  exercise("v5-cardio-a-chaise", "chaise-60", { shape: "duration", sets: 2, durationSec: { min: 45, max: 60 }, restBetweenSetsSec: 60, targetRpe: { min: 7, max: 8 } }, {
    notes: `Dos au mur, genoux au-dessus des chevilles. ${LEGS_STOP}`,
  }),
  exercise("v2-cardio-b-squat-chaise", "squat-chaise", legReps(2, 15, 20), {
    notes: `S'asseoir brièvement, se relever sans élan. À retirer en premier si le bloc dépasse 20 min. ${LEGS_STOP}`,
  }),
];

/* -------------------------------------------------------------------------- */
/* Lot 2 — Séances hors planning : Souplesse et Abdos                          */
/* -------------------------------------------------------------------------- */

/**
 * Séances libres du soir (décision de JM du 12/11 : plus de routine au
 * planning). Visibles dans Séances, lancées quand JM veut, jamais planifiées
 * donc jamais « sautées ». Leurs exercices alimentent les objectifs
 * Souplesse et Tronc ; la cible de chaque exercice suit le moteur des
 * routines (historique partagé avec les routines V4 et V5).
 */
export const SOUPLESSE_ID = "libre-souplesse";
export const ABDOS_ID = "libre-abdos";

export type LibreTemplateContent = Omit<SessionTemplate, "status" | "position" | "createdAt" | "updatedAt">;

const stretch = (sets: number, seconds: number): ExerciseInstructions => ({ shape: "duration", sets, durationSec: seconds, restBetweenSetsSec: 15, targetRpe: { min: 5, max: 6 } });
const mobilityReps = (sets: number, value: number): ExerciseInstructions => ({ shape: "reps", sets, reps: { min: value, max: value }, restBetweenSetsSec: 15, targetRpe: { min: 5, max: 6 } });
const coreHold = (sets: number, seconds: number, rest: number): ExerciseInstructions => ({ shape: "duration", sets, durationSec: seconds, restBetweenSetsSec: rest, targetRpe: { min: 7, max: 8 } });
const coreReps = (sets: number, value: number, rest: number): ExerciseInstructions => ({ shape: "reps", sets, reps: { min: value, max: value }, restBetweenSetsSec: rest, targetRpe: { min: 7, max: 8 } });

function libre(prefix: string, items: Array<[string, string, ExerciseInstructions, string]>): ExerciseBlock[] {
  return items.map(([suffix, exerciseId, instructions, notes], position) => ({ id: `${prefix}-${suffix}`, kind: "exercise", position, exerciseId, instructions, notes }));
}

const STRETCH_NOTE = "Tension nette, jamais de douleur (RPE 5-6).";
const CORE_NOTE = "Dos neutre ; arrêt au premier signe de douleur dans le bas du dos.";

export const SOUPLESSE_TEMPLATE: LibreTemplateContent = {
  id: SOUPLESSE_ID,
  name: "Souplesse",
  category: "Routine",
  subtitle: "Mains dans le dos, papillon, ischios",
  tags: ["Souplesse"],
  description: "Environ 22 min, quand tu veux (hors planning). Ciblée sur les 3 mesures du test souplesse.",
  contentSince: PROGRAM_4P2_START,
  estimatedMinutes: 22,
  blocks: libre(SOUPLESSE_ID, [
    ["rotation-thoracique", "rotation-thoracique-allongee", mobilityReps(2, 8), `Par côté. ${STRETCH_NOTE}`],
    ["ouverture-epaules", "mobilite-ouverture-epaules-mur", stretch(2, 45), STRETCH_NOTE],
    ["epaule-main-dos", "etirement-epaule-main-dos", stretch(2, 45), `Par côté. ${STRETCH_NOTE}`],
    ["glisses-mur", "glisses-mur", mobilityReps(2, 10), STRETCH_NOTE],
    ["flechisseurs", "mobilite-flechisseur-hanche", stretch(2, 45), `Par côté, bassin rentré, sans cambrer. ${STRETCH_NOTE}`],
    ["ischios", "ischio-sangle", stretch(2, 45), `Par côté. ${STRETCH_NOTE}`],
    ["hanches-90-90", "hanches-90-90", stretch(2, 45), `Par côté. ${STRETCH_NOTE}`],
    ["papillon", "papillon-assis", stretch(2, 60), STRETCH_NOTE],
  ]),
};

export const ABDOS_TEMPLATE: LibreTemplateContent = {
  id: ABDOS_ID,
  name: "Abdos à la maison",
  category: "Routine",
  subtitle: "Gainage et anti-rotation, sans machine",
  tags: ["Tronc"],
  description: "Environ 20 min, quand tu veux (hors planning). Matériel : un tapis de sol et un élastique.",
  contentSince: PROGRAM_4P2_START,
  estimatedMinutes: 20,
  blocks: libre(ABDOS_ID, [
    ["planche", "planche", coreHold(3, 30, 45), `Corps aligné, fessiers serrés. ${CORE_NOTE}`],
    ["planche-laterale", "planche-laterale", coreHold(3, 20, 30), `Par côté, coude sous l'épaule. ${CORE_NOTE}`],
    ["pallof", "pallof-elastique", coreReps(3, 10, 30), `Par côté, le buste ne tourne pas. ${CORE_NOTE}`],
    ["hollow", "hollow-body-genoux", coreHold(3, 20, 45), `Genoux fléchis, bas du dos plaqué au sol. ${CORE_NOTE}`],
    ["crunch-inverse", "crunch-inverse", coreReps(2, 10, 45), `Contrôlé, sans élan. ${CORE_NOTE}`],
  ]),
};

export const LIBRE_TEMPLATES: readonly LibreTemplateContent[] = [SOUPLESSE_TEMPLATE, ABDOS_TEMPLATE];

/** Progressions des exercices d'Abdos absents des routines V4 et V5 : +5 s ou +1 répétition quand tout est fait dans le plafond. */
export const LIBRE_PROGRESSIONS: Readonly<Record<string, { measure: "reps" | "duration"; step: number; max: number }>> = {
  "hollow-body-genoux": { measure: "duration", step: 5, max: 45 },
  "crunch-inverse": { measure: "reps", step: 1, max: 15 },
};

/**
 * Les briques des séances libres suivies par le moteur des routines :
 * exercice et consigne de départ (fonction de la progression connue de
 * l'exercice, passée en paramètre pour éviter une dépendance circulaire).
 */
export function libreRoutineBlocks(hasProgression: (exerciseId: string) => boolean): Map<string, { exerciseId: string; sets: number; start: number }> {
  return new Map(
    LIBRE_TEMPLATES.flatMap((template) =>
      template.blocks.flatMap((item) => {
        if (item.kind !== "exercise" || !hasProgression(item.exerciseId)) return [];
        const instructions = item.instructions;
        if (instructions.shape === "reps") return [[item.id, { exerciseId: item.exerciseId, sets: instructions.sets, start: instructions.reps.min }] as const];
        if (instructions.shape === "duration") {
          const value = typeof instructions.durationSec === "number" ? instructions.durationSec : instructions.durationSec.min;
          return [[item.id, { exerciseId: item.exerciseId, sets: instructions.sets, start: value }] as const];
        }
        return [];
      }),
    ),
  );
}

/**
 * Règles propres aux séances libres (décision de JM du 13/11), qui
 * l'emportent sur celles de l'exercice (l'historique, lui, reste partagé) :
 * - Souplesse : +15 s par position quand toutes les séries sont réussies,
 *   sans douleur, à RPE 6 au plus ; les exercices en répétitions gardent
 *   +1 répétition, au même plafond de RPE ;
 * - Abdos : +5 s ou +1 répétition par série quand tout est à RPE 7 au plus
 *   (le Pallof press passe donc de +2 à +1 répétition).
 */
export function libreBlockRules(base: (exerciseId: string) => { measure: "reps" | "duration"; step: number; max: number } | undefined): Map<string, { measure: "reps" | "duration"; step: number; max: number; rpeMax: number }> {
  const rules = new Map<string, { measure: "reps" | "duration"; step: number; max: number; rpeMax: number }>();
  for (const item of SOUPLESSE_TEMPLATE.blocks) {
    if (item.kind !== "exercise") continue;
    const rule = base(item.exerciseId);
    if (!rule) continue;
    rules.set(item.id, rule.measure === "duration" ? { measure: "duration", step: 15, max: Math.max(rule.max, 90), rpeMax: 6 } : { ...rule, step: 1, rpeMax: 6 });
  }
  for (const item of ABDOS_TEMPLATE.blocks) {
    if (item.kind !== "exercise") continue;
    const rule = base(item.exerciseId);
    if (!rule) continue;
    rules.set(item.id, { ...rule, step: rule.measure === "duration" ? 5 : 1, rpeMax: 7 });
  }
  return rules;
}

/** Exercices ajoutés à l'objectif Tronc (ceux de la séance Abdos qui n'y étaient pas). */
export const CORE_GOAL_ADDED = ["hollow-body-genoux", "crunch-inverse"] as const;

/* -------------------------------------------------------------------------- */
/* Lot 3 — Calendrier et tests                                                 */
/* -------------------------------------------------------------------------- */

/** Semaine type : dimanche A, lundi B, mardi Cardio A + jambes, mercredi C, jeudi D, vendredi repos, samedi Cardio B. */
export const PROGRAM_4P2_DAYS: WeeklyProgram["days"] = [
  { weekday: "sunday", sessionTemplateId: "v2-muscu-a" },
  { weekday: "monday", sessionTemplateId: "v2-muscu-b" },
  { weekday: "tuesday", sessionTemplateId: FRACTIONNE_ID },
  { weekday: "wednesday", sessionTemplateId: "v2-muscu-c" },
  { weekday: "thursday", sessionTemplateId: MUSCU_D_ID },
  { weekday: "friday" },
  { weekday: "saturday", sessionTemplateId: ENDURANCE_ID },
];

/** Archivés à la bascule (historique gardé) : le Cardio C et les routines du soir (plus de routine au planning, décision de JM du 12/11). */
export const ARCHIVED_TEMPLATES_20261115 = ["v2-cardio-c", "v5-routine-dos", "v5-routine-dos-legere"] as const;

/**
 * Place des tests (cycle de 4 semaines inchangé ; semaines du 22/11 et du 20/12) :
 * - traction : dimanche, en Muscu A, après l'échauffement (inchangé) ;
 * - cardio de référence : **samedi**, dans le Cardio B (endurance) : le test
 *   de 20 min remplace la partie continue ; progressif et retour au calme
 *   gardés ;
 * - souplesse et tronc : lundi soir. Plus de routine du soir : le soir de
 *   test se crée sur la séance Souplesse, dont le test remplace le contenu.
 */
export function testSchedule20261115(schedule: ReadonlyArray<TestScheduleEntry>): TestScheduleEntry[] {
  return schedule.map((entry): TestScheduleEntry => {
    if (entry.protocolKey === "cardio" && entry.slot === "day") {
      const next: TestScheduleEntry = { ...entry, weekday: "saturday", templateId: ENDURANCE_ID, targetBlockId: `${ENDURANCE_ID}-tapis`, targetStepIds: ["v2-cardio-a-continu"] };
      delete next.insteadOfTemplateId;
      delete next.targetStepId;
      return next;
    }
    if ((entry.protocolKey === "souplesse" || entry.protocolKey === "tronc") && entry.slot === "evening") return { ...entry, templateId: SOUPLESSE_ID };
    return entry;
  });
}
