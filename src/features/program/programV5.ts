import type { Exercise, ExerciseBlock, ExerciseInstructions, SessionTemplate, SpeedInclineStepInstruction, TestScheduleEntry, WeeklyProgram, Weekday } from "../../domain";
import type { V4Template } from "./programV4";
import { ROUTINE_PROGRESSIONS, ROUTINE_RPE_MAX, type RoutineProgression } from "./programRoutinesV4";
import { LIBRE_PROGRESSIONS } from "./program20261115";

/**
 * Programme V5 (audit et décisions de JM du 07/11/2026,
 * `COFFRE_COACH-JM/2-SPECS/AUDIT_PROGRAMME_V5_2026-11-07.md`).
 *
 * Priorités : 1. traction stricte ; 2. dos et abdos (routine maison tous les
 * jours) ; 3. hypertrophie du haut du corps, épaules d'abord.
 *
 * - Muscu A, B et C gardent leurs identifiants (`v2-muscu-a/b/c`) : le pari
 *   traction V6 ne bouge pas (palier A, règle B, négatives, semaines test).
 * - Tout le travail d'épaules passe avant la 10e série de chaque séance (Q13).
 * - Le tirage vertical passe de C en A et le rowing léger de B en C **avec
 *   leur identifiant de brique** : historique et piste continus.
 * - Plus de jambes en salle : 6 min à la fin du Cardio A (Q5).
 * - Trois cardios sur tapis (les modèles v2 repris et ajustés), vélos archivés.
 * - Une seule routine « Dos + abdos » tous les soirs ; version légère les deux
 *   premières semaines (Q10), puis complète, légère le samedi.
 *
 * Rien ne s'applique avant `PROGRAM_V5_START`.
 */

/**
 * Activation de la V5 : dès le samedi 07/11/2026 au soir (décision de JM :
 * « fais-le à partir de ce soir »). Le calendrier V5 commence le lendemain,
 * `PROGRAM_V5_FIRST_DAY` : aucune séance V5 n'est prévue le 07/11, donc
 * aucune séance « manquée ».
 */
export const PROGRAM_V5_START = "2026-11-07";
/** Premier jour du calendrier V5 : dimanche 08/11/2026 (Muscu A). */
export const PROGRAM_V5_FIRST_DAY = "2026-11-08";
/** À partir de ce dimanche, la routine complète remplace la légère (sauf le samedi). */
export const ROUTINE_DOS_COMPLETE_START = "2026-11-22";

/** L'heure donnée aux seeds V5 au lancement ; sous Vitest, figée avant l'activation (les tests V5 passent leur date). */
export function v5SeedNow(): string {
  return import.meta.env.MODE === "test" ? "2026-11-06T12:00:00.000Z" : new Date().toISOString();
}

const ISOLATION = 90;

function reps(sets: number, min: number, max: number, restBetweenSetsSec: number, targetRpe?: { min: number; max: number }): ExerciseInstructions {
  return { shape: "reps", sets, reps: { min, max }, restBetweenSetsSec, ...(targetRpe ? { targetRpe } : {}) };
}

function exercise(id: string, exerciseId: string, instructions: ExerciseInstructions, extra: Partial<Pick<ExerciseBlock, "notes" | "outsideFrame">> = {}): ExerciseBlock {
  return { id, kind: "exercise", position: 0, exerciseId, instructions, ...extra };
}

/* -------------------------------------------------------------------------- */
/* Muscu A, B, C                                                              */
/* -------------------------------------------------------------------------- */

export const MUSCU_A_V5: V4Template = {
  id: "v2-muscu-a",
  name: "Muscu A — Traction force, dos, épaules, biceps",
  subtitle: "Traction force, dos, épaules, biceps",
  tags: ["Haut du corps", "Dos", "Épaules"],
  description: "Environ 68 min.",
  before: ["v2-muscu-a-echauffement", "v2-muscu-a-traction", "v2-muscu-a-rowing", "v2-muscu-a-chest-press", "v2-muscu-a-elevations", "v2-muscu-a-curl-poulie", "v2-muscu-a-curl"],
  blocks: [
    { keep: "v2-muscu-a-echauffement" },
    { keep: "v2-muscu-a-traction" },
    {
      set: exercise("v2-muscu-a-rowing", "rowing-poulie-basse", reps(3, 6, 8, 150, { min: 8, max: 9 }), {
        notes: "Lourd / force : RPE 8-9 au plus, jamais RPE 10. Départ V5 : 50 kg sur les 3 séries ; 55 kg quand les 3 séries font 8.",
      }),
    },
    {
      set: exercise("v2-muscu-a-elevations", "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION), {
        notes: "Épaules à frais, avant le tirage. Strict, sans élan du buste. Départ V5 : 5 kg ; 6 kg après 3 × 15 propres.",
      }),
    },
    /* Venu de C avec son identifiant : historique et piste continus. */
    {
      set: exercise("v2-muscu-c-tirage-vertical", "tirage-vertical", reps(2, 10, 12, 120, { min: 8, max: 8 }), {
        notes: "Volume : RPE 8 au plus, jamais RPE 10. Départ V5 : 50 kg.",
      }),
    },
    { keep: "v2-muscu-a-chest-press" },
    { keep: "v2-muscu-a-curl" },
  ],
};

export const MUSCU_B_V5: V4Template = {
  id: "v2-muscu-b",
  name: "Muscu B — Épaules, pectoraux, triceps",
  subtitle: "Épaules, pectoraux, triceps",
  tags: ["Haut du corps", "Épaules", "Pecs"],
  description: "Environ 74 min.",
  before: [
    "v2-muscu-b-echauffement",
    "v2-muscu-b-traction",
    "v2-muscu-b-chest-press",
    "v2-muscu-b-developpe-incline",
    "v2-muscu-c-ecarte",
    "v2-muscu-b-rowing",
    "v2-muscu-b-developpe-epaules",
    "v2-muscu-b-elevations",
    "v2-muscu-b-extension-triceps",
  ],
  blocks: [
    { keep: "v2-muscu-b-echauffement" },
    /* Traction de volume du pari V6 (aide = palier A validé + 7 kg) : 2 séries au lieu de 3. */
    { set: exercise("v2-muscu-b-traction", "traction-assistee", reps(2, 8, 10, 120), { outsideFrame: true }) },
    {
      set: exercise("v2-muscu-b-developpe-epaules", "developpe-epaules-machine", reps(3, 8, 12, 150), {
        notes: "En premier des poussées, à frais (priorité épaules). Départ V5 : 20 kg ; monter seulement après 3 × 12 propres.",
      }),
    },
    {
      set: exercise("v2-muscu-b-elevations", "elevations-laterales-halteres", reps(3, 12, 15, ISOLATION), {
        notes: "Juste après le développé épaules. Strict, sans élan du buste. Départ V5 : 5 kg ; 6 kg après 3 × 15 propres.",
      }),
    },
    {
      set: exercise("v2-muscu-b-chest-press", "chest-press", reps(3, 6, 10, 150, { min: 8, max: 9 }), {
        notes: "Lourd : RPE 8-9 au plus, jamais RPE 10. Départ V5 : 55 kg ; monter après 3 × 10.",
      }),
    },
    {
      set: exercise("v2-muscu-b-developpe-incline", "developpe-incline-halteres", reps(2, 8, 12, 120), {
        notes: "Départ V5 : 10 kg par haltère ; 12 kg à la séance suivante si c'est trop facile.",
      }),
    },
    {
      set: exercise("v2-muscu-c-ecarte", "ecarte-poulie", reps(2, 12, 15, ISOLATION), {
        notes: "Coudes légèrement fléchis, amplitude confortable, sans à-coup. Départ V5 : 7,5 kg ; 10 kg après 2 × 15.",
      }),
    },
    { keep: "v2-muscu-b-extension-triceps" },
  ],
};

export const MUSCU_C_V5: V4Template = {
  id: "v2-muscu-c",
  name: "Muscu C — Traction technique, épaules, bras",
  subtitle: "Traction technique, épaules, bras",
  tags: ["Haut du corps", "Dos", "Épaules"],
  description: "Environ 73 min.",
  before: [
    "v2-muscu-c-echauffement",
    "v2-muscu-c-negatives",
    "v2-muscu-c-suspension",
    "v2-muscu-c-tirage-vertical",
    "v2-muscu-c-elevations",
    "v2-muscu-c-face-pull",
    "v2-muscu-c-curl-marteau",
    "v2-muscu-c-triceps-tete",
    "v2-muscu-c-montee",
    "v2-muscu-c-position-basse",
    "v2-muscu-c-marche-laterale",
    "v2-muscu-a-leg-curl",
    "v2-muscu-c-tapis-incline",
  ],
  blocks: [
    { keep: "v2-muscu-c-echauffement" },
    { set: exercise("v2-muscu-c-negatives", "traction-negative", reps(3, 2, 2, 150)) },
    { set: exercise("v2-muscu-c-suspension", "suspension-omoplates", { shape: "duration", sets: 3, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 90 }) },
    {
      set: exercise("v2-muscu-c-elevations", "elevations-laterales-halteres", reps(3, 15, 20, ISOLATION, { min: 7, max: 8 }), {
        notes: "Séries longues : RPE 7-8, technique stricte, sans élan. Départ V5 : 4 kg.",
        outsideFrame: true,
      }),
    },
    {
      set: exercise("v2-muscu-c-face-pull", "face-pull", reps(3, 12, 15, ISOLATION), {
        notes: "Poulie à hauteur du visage, corde, tirer vers le front en écartant les mains. Départ V5 : 25 kg.",
      }),
    },
    /* Venu de B avec son identifiant : historique et piste continus. */
    {
      set: exercise("v2-muscu-b-rowing", "rowing-poulie-basse", reps(2, 10, 12, 120), {
        notes: "Volume : charge plus légère que le rowing lourd du dimanche. Départ V5 : 45 kg.",
        outsideFrame: true,
      }),
    },
    { set: exercise("v2-muscu-c-curl-marteau", "curl-marteau-halteres", reps(3, 10, 12, ISOLATION), { notes: "Départ V5 : 8 kg par haltère." }) },
    { set: exercise("v2-muscu-c-triceps-tete", "extension-triceps-dessus-tete", reps(2, 10, 15, ISOLATION), { notes: "Départ V5 : 17,5 kg ; 20 kg après 2 × 15." }) },
  ],
};

export const MUSCU_V5_TEMPLATES: readonly V4Template[] = [MUSCU_A_V5, MUSCU_B_V5, MUSCU_C_V5];

/** Pistes closes à l'activation (exercices retirés du programme actif). */
export const CLOSED_TRACKS_V5 = ["v2-muscu-a-curl-poulie", "v2-muscu-c-position-basse", "v2-muscu-a-leg-curl"] as const;

/** Pistes qui changent de séance avec leur brique. */
export const MOVED_TRACKS_V5: Readonly<Record<string, { session: "A" | "B" | "C"; templateId: string }>> = {
  "v2-muscu-c-tirage-vertical": { session: "A", templateId: "v2-muscu-a" },
  "v2-muscu-b-rowing": { session: "C", templateId: "v2-muscu-c" },
};

/** Pistes dont la consigne change : leur référence détaillée est recalculée sur la nouvelle consigne. */
export const RECALCULATED_TRACKS_V5 = [
  "v2-muscu-c-tirage-vertical",
  "v2-muscu-b-developpe-epaules",
  "v2-muscu-b-chest-press",
  "v2-muscu-b-developpe-incline",
  "v2-muscu-c-ecarte",
  "v2-muscu-b-rowing",
  "v2-muscu-c-elevations",
  "v2-muscu-c-negatives",
  "v2-muscu-c-curl-marteau",
] as const;

/** Élévations de C : nouvelle référence datée (3 × 15-20). */
export const ELEVATIONS_C_REFERENCE_V5 = { from: PROGRAM_V5_START, reason: "Programme V5 : 3 × 15-20, RPE 7-8 (séries longues)." } as const;

/** Cadres qui changent (nouvelle version ; l'ancienne reste consultable). */
export const FRAMES_V5 = [
  { exerciseId: "tirage-vertical", workSets: 2, repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: 120 },
  { exerciseId: "developpe-epaules-machine", workSets: 3, repRange: { min: 8, max: 12 }, rpeTarget: 9, restSec: 150 },
  { exerciseId: "chest-press", workSets: 3, repRange: { min: 6, max: 10 }, rpeTarget: 9, restSec: 150 },
  { exerciseId: "developpe-incline-halteres", workSets: 2, repRange: { min: 8, max: 12 }, rpeTarget: 8, restSec: 120 },
  { exerciseId: "ecarte-poulie", workSets: 2, repRange: { min: 12, max: 15 }, rpeTarget: 8, restSec: ISOLATION },
  { exerciseId: "curl-marteau-halteres", workSets: 3, repRange: { min: 10, max: 12 }, rpeTarget: 8, restSec: ISOLATION },
] as const;

/* -------------------------------------------------------------------------- */
/* Cardios sur tapis (modèles v2 repris)                                      */
/* -------------------------------------------------------------------------- */

export const CARDIO_A_ID = "v2-cardio-a";
export const CARDIO_B_ID = "v2-cardio-b";
export const CARDIO_C_ID = "v2-cardio-c";
export const CARDIOS_V5_IDS = [CARDIO_A_ID, CARDIO_B_ID, CARDIO_C_ID] as const;

const BACK = "Sans tenir les barres du tapis. Si une pente réveille le dos, baisse-la de 2 points : c'est un réglage, pas un échec.";

function step(id: string, position: number, minutes: number, speedKmh: SpeedInclineStepInstruction["speedKmh"], inclinePercent: SpeedInclineStepInstruction["inclinePercent"], targetRpe?: { min: number; max: number }): SpeedInclineStepInstruction {
  return { id, position, durationSec: minutes * 60, speedKmh, inclinePercent, ...(targetRpe ? { targetRpe } : {}) };
}

export const CARDIO_A_NOTE = `Effort facile, tu parles en phrases complètes (RPE 4-5). Pente 6 % au départ ; progression : vers 8 %, puis la partie principale de 30 à 35 min — un seul réglage à la fois, au plus une fois par semaine. Relève la FC toutes les 5 min. ${BACK}`;
export const CARDIO_B_NOTE = `Marche rapide en pente : pas de course, pas de sprint. Efforts à RPE 7-8, récupérations faciles ; note la FC en fin d'effort. Progression (aux bilans) : 5, puis 6 intervalles, ensuite pente de 10 à 12 %. ${BACK}`;
export const CARDIO_C_NOTE = `Effort soutenu, tu ne parles plus qu'en phrases courtes (RPE 6). Relève la FC à la fin de chaque bloc. Progression : pente 8 puis 10 % sur les blocs soutenus, puis 15 min au lieu de 10 à la fin — un seul réglage à la fois. Alternative : randonnée avec dénivelé, même durée. ${BACK}`;

/** Jambes en fin de Cardio A (Q5) : sans charge sur la colonne, sans élastique. */
export const MONTEE_V5_NOTE = "Par jambe, sur une marche stable d'environ 30 cm. Monter sans élan, genou dans l'axe du pied. RPE 7 au plus. Douleur au genou : arrêt.";
export const CHAISE_V5_NOTE = "Dos au mur, flexion modérée (environ 60°), genoux au-dessus des chevilles. RPE 7 au plus. Douleur au genou : arrêt.";

export const CARDIO_A_STEPS: SpeedInclineStepInstruction[] = [
  step("v2-cardio-a-progressif", 0, 10, { min: 4.5, max: 5.5 }, { min: 0, max: 6 }),
  ...[1, 2, 3, 4, 5, 6].map((n) => step(`v2-cardio-a-bloc-${n}`, n, 5, 5.5, 6, { min: 4, max: 5 })),
  step("v2-cardio-a-retour", 7, 5, 4.5, 0),
];

export const CARDIO_A_LEG_BLOCKS: ExerciseBlock[] = [
  { id: "v5-cardio-a-montee", kind: "exercise", position: 1, exerciseId: "montee-banc", instructions: reps(2, 10, 10, 60, { min: 6, max: 7 }), notes: MONTEE_V5_NOTE },
  {
    id: "v5-cardio-a-chaise",
    kind: "exercise",
    position: 2,
    exerciseId: "chaise-60",
    instructions: { shape: "duration", sets: 2, durationSec: 45, restBetweenSetsSec: 60, targetRpe: { min: 6, max: 7 } },
    notes: CHAISE_V5_NOTE,
  },
];

export const CARDIO_B_STEPS: SpeedInclineStepInstruction[] = [
  step("v2-cardio-b-progressif", 0, 8, { min: 4.5, max: 5.5 }, { min: 0, max: 5 }),
  step("v2-cardio-b-effort-1", 1, 3, 5.5, 10, { min: 7, max: 8 }),
  step("v2-cardio-b-recup-1", 2, 2, 4.5, 2),
  step("v2-cardio-b-effort-2", 3, 3, 5.5, 10, { min: 7, max: 8 }),
  step("v2-cardio-b-recup-2", 4, 2, 4.5, 2),
  step("v2-cardio-b-effort-3", 5, 3, 5.5, 10, { min: 7, max: 8 }),
  step("v2-cardio-b-recup-3", 6, 2, 4.5, 2),
  step("v2-cardio-b-effort-4", 7, 3, 5.5, 10, { min: 7, max: 8 }),
  step("v2-cardio-b-retour", 8, 5, 4.5, 0),
];

export const CARDIO_C_STEPS: SpeedInclineStepInstruction[] = [
  step("v2-cardio-c-progressif", 0, 10, { min: 4.5, max: 5.5 }, { min: 0, max: 8 }),
  step("v2-cardio-c-soutenu-1", 1, 12, 5.5, 8, { min: 6, max: 6 }),
  step("v2-cardio-c-entre", 2, 3, 4.5, 3),
  step("v2-cardio-c-soutenu-2", 3, 12, 5.5, 8, { min: 6, max: 6 }),
  step("v2-cardio-c-facile", 4, 10, 5.5, 6, { min: 4, max: 5 }),
  step("v2-cardio-c-retour", 5, 5, 4.5, 0),
];

/** Le contenu V5 d'un cardio v2 (fonction pure) ; identifiants de modèle, de brique et d'étapes gardés. */
export function cardioTemplateV5(template: SessionTemplate, now: string): SessionTemplate {
  const tapisId = `${template.id}-tapis`;
  const tapis = template.blocks.find((block) => block.id === tapisId);
  const steps = template.id === CARDIO_A_ID ? CARDIO_A_STEPS : template.id === CARDIO_B_ID ? CARDIO_B_STEPS : CARDIO_C_STEPS;
  const notes = template.id === CARDIO_A_ID ? CARDIO_A_NOTE : template.id === CARDIO_B_ID ? CARDIO_B_NOTE : CARDIO_C_NOTE;
  const main: ExerciseBlock = { ...(tapis as ExerciseBlock | undefined), id: tapisId, kind: "exercise", position: 0, exerciseId: "tapis", instructions: { shape: "steps", steps: structuredClone(steps) }, notes };
  const blocks = template.id === CARDIO_A_ID ? [main, ...structuredClone(CARDIO_A_LEG_BLOCKS)] : [main];
  const description = template.id === CARDIO_A_ID ? "Environ 51 min, jambes comprises." : template.id === CARDIO_B_ID ? "Environ 33 min." : "Environ 52 min, ou une randonnée.";
  return { ...template, status: "active", description, blocks, contentSince: PROGRAM_V5_START, updatedAt: now };
}

/* -------------------------------------------------------------------------- */
/* Routine Dos + abdos                                                        */
/* -------------------------------------------------------------------------- */

export const PONT_FESSIER_ID = "pont-fessier";
export const ROUTINE_DOS_ID = "v5-routine-dos";
export const ROUTINE_DOS_LEGERE_ID = "v5-routine-dos-legere";

export function pontFessierExercise(now: string): Exercise {
  return {
    id: PONT_FESSIER_ID,
    name: "Pont fessier au sol",
    category: "Musculation",
    zone: "Jambes",
    movement: "Charnière",
    equipment: "Poids du corps",
    progressionGroup: "Fessiers",
    location: "Maison",
    mode: "series",
    measurementType: "reps",
    technique: "Allongé sur le dos, genoux pliés, pieds à plat au sol à largeur de hanches, bras le long du corps. Serre les fessiers et soulève le bassin jusqu'à aligner épaules, hanches et genoux, marque un temps en haut, puis redescends lentement.",
    description: "Renforcement des fessiers à la maison, sans charge sur la colonne : des fessiers forts soulagent le bas du dos en position debout.",
    advice: "La poussée vient des fessiers et des talons, pas du bas du dos : ne cambre pas en haut. Douleur dans le bas du dos : monte moins haut.",
    muscles: ["Fessiers", "Ischio-jambiers", "Core"],
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as Exercise;
}

/** Progressions propres à la V5 (les autres exercices gardent celles des routines V4). */
export const ROUTINE_PROGRESSIONS_V5: Readonly<Record<string, RoutineProgression>> = {
  [PONT_FESSIER_ID]: { measure: "reps", step: 2, max: 15 },
};

type TemplateContent = Omit<SessionTemplate, "status" | "position" | "createdAt" | "updatedAt">;

const PAIN = "Arrêt au premier signe de douleur ou de décharge (note « douleur » sur la série : la cible ne monte pas).";

const routineReps = (sets: number, value: number, rest: number): ExerciseInstructions => ({ shape: "reps", sets, reps: { min: value, max: value }, restBetweenSetsSec: rest, targetRpe: { min: 6, max: ROUTINE_RPE_MAX } });
const routineHold = (sets: number, seconds: number, rest: number): ExerciseInstructions => ({ shape: "duration", sets, durationSec: seconds, restBetweenSetsSec: rest, targetRpe: { min: 5, max: ROUTINE_RPE_MAX } });

function routineBlocks(prefix: string, full: boolean): ExerciseBlock[] {
  const sets = (n: number) => (full ? n : 1);
  const items: Array<[string, string, ExerciseInstructions, string]> = [
    ["chat-vache", "mobilite-chat-vache", routineReps(sets(2), 10, 15), "Amplitude confortable, jamais forcée. Seul exercice à faire aussi au réveil."],
    ["pont-fessier", PONT_FESSIER_ID, routineReps(sets(2), 10, 30), `Fessiers serrés, sans cambrer en haut. ${PAIN}`],
    ["bird-dog", "bird-dog", routineReps(sets(3), 6, 30), `Par côté, 5 s tenues bras et jambe tendus, dos neutre. ${PAIN}`],
    ["dead-bug", "dead-bug", routineReps(sets(3), 6, 30), `Lent, par côté, bas du dos plaqué au sol. ${PAIN}`],
    ["planche-laterale", "planche-laterale", routineHold(sets(3), 15, 30), `Par côté, sur les pieds, coude sous l'épaule, corps aligné. ${PAIN}`],
    ["flechisseurs", "mobilite-flechisseur-hanche", routineHold(sets(2), 30, 15), `Par côté, avec appui, bassin rentré, sans cambrer. ${PAIN}`],
  ];
  return items.map(([suffix, exerciseId, instructions, notes], position) => ({ id: `${prefix}-${suffix}`, kind: "exercise", position, exerciseId, instructions, notes }));
}

const routineDos: TemplateContent = {
  id: ROUTINE_DOS_ID,
  name: "Routine dos + abdos",
  category: "Routine",
  subtitle: "Dos, gainage, hanches",
  tags: ["Tronc", "Souplesse"],
  description: "Environ 18 min. Gainage plus tard dans la journée, jamais dans l'heure qui suit le lever.",
  contentSince: PROGRAM_V5_START,
  estimatedMinutes: 18,
  blocks: routineBlocks(ROUTINE_DOS_ID, true),
};

const routineDosLegere: TemplateContent = {
  id: ROUTINE_DOS_LEGERE_ID,
  name: "Routine dos + abdos — légère",
  category: "Routine",
  subtitle: "Une série de chaque",
  tags: ["Tronc", "Souplesse"],
  description: "Environ 7 min. Le but est l'habitude, pas l'effort.",
  contentSince: PROGRAM_V5_START,
  estimatedMinutes: 7,
  blocks: routineBlocks(ROUTINE_DOS_LEGERE_ID, false),
};

export const ROUTINES_V5_TEMPLATES: readonly TemplateContent[] = [routineDos, routineDosLegere];

/** La progression d'un exercice de routine (V4 ou V5). */
export function routineProgressionOf(exerciseId: string): RoutineProgression | undefined {
  return ROUTINE_PROGRESSIONS_V5[exerciseId] ?? ROUTINE_PROGRESSIONS[exerciseId] ?? (LIBRE_PROGRESSIONS[exerciseId] as RoutineProgression | undefined);
}

/**
 * Les briques des routines V5 qui ont une progression : exercice et consigne
 * de départ. La routine se fait tous les jours : la cible ne change qu'**une
 * fois par semaine** (voir `dayTargets.ts`), et le suivi est partagé entre la
 * version complète et la légère.
 */
export const ROUTINE_V5_BLOCKS: ReadonlyMap<string, { exerciseId: string; sets: number; start: number }> = new Map(
  ROUTINES_V5_TEMPLATES.flatMap((template) =>
    template.blocks.flatMap((item) => {
      if (item.kind !== "exercise" || !routineProgressionOf(item.exerciseId)) return [];
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

/* -------------------------------------------------------------------------- */
/* Calendrier                                                                 */
/* -------------------------------------------------------------------------- */

export const PROGRAM_V5_DAYS: WeeklyProgram["days"] = [
  { weekday: "sunday", sessionTemplateId: "v2-muscu-a" },
  { weekday: "monday", sessionTemplateId: CARDIO_A_ID },
  { weekday: "tuesday", sessionTemplateId: "v2-muscu-b" },
  { weekday: "wednesday", sessionTemplateId: CARDIO_B_ID },
  { weekday: "thursday", sessionTemplateId: "v2-muscu-c" },
  { weekday: "friday", sessionTemplateId: CARDIO_C_ID },
  { weekday: "saturday" },
];

const WEEKDAYS: readonly Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Semaines 1 et 2 (Q10) : la version légère tous les soirs. */
export const EVENING_BY_WEEKDAY_V5_START: Partial<Record<Weekday, string>> = Object.fromEntries(WEEKDAYS.map((day) => [day, ROUTINE_DOS_LEGERE_ID]));
/** À partir du 22/11 : complète du dimanche au vendredi, légère le samedi. */
export const EVENING_BY_WEEKDAY_V5_COMPLETE: Partial<Record<Weekday, string>> = Object.fromEntries(WEEKDAYS.map((day) => [day, day === "saturday" ? ROUTINE_DOS_LEGERE_ID : ROUTINE_DOS_ID]));

/** Archivés à l'activation (historique conservé). */
export const ARCHIVED_TEMPLATES_V5 = ["v4-velo-endurance", "v4-velo-cotes", "v4-recuperation", "v4-routine-a", "v4-routine-b", "v4-routine-c"] as const;

/** Place des tests en V5 : le test cardio sur tapis (Cardio A) prend la place des intervalles du mercredi. */
export function testScheduleV5(schedule: ReadonlyArray<TestScheduleEntry>): TestScheduleEntry[] {
  return schedule.map((entry) => (entry.protocolKey === "cardio" && entry.slot === "day" && entry.templateId === CARDIO_A_ID ? { ...entry, insteadOfTemplateId: CARDIO_B_ID } : entry));
}

