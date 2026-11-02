import type { Exercise, ExerciseBlock, ExerciseInstructions, Goal, SessionTemplate, TestMeasureSpec, TestProtocolVersion } from "../../domain";
import { OPEN_BOOK_EXERCISE_ID } from "./programCalendarV4";
import { PROGRAM_V4_START } from "./programV4";

/**
 * Programme V4, lot L5 — les routines du soir (spec § 3, correction du
 * 02/11/2026 sur la Routine C) :
 * - aucune flexion lombaire forcée, aucun exercice de jambes, dos neutre ;
 * - Routine A — Abdominaux (dimanche et mercredi) ;
 * - Routine B — Souplesse générale (lundi et jeudi) ;
 * - Routine C — Abdos + souplesse (mardi), partie abdos ramenée à 2
 *   exercices : 32 séries d'abdos par semaine.
 *
 * Nouveaux modèles ; les routines A, B et C actuelles sont archivées
 * (historique conservé). Rien ne change avant `PROGRAM_V4_START`.
 */

export const ROUTINE_A_V4_ID = "v4-routine-a";
export const ROUTINE_B_V4_ID = "v4-routine-b";
export const ROUTINE_C_V4_ID = "v4-routine-c";
export const ROUTINES_V4_IDS = [ROUTINE_A_V4_ID, ROUTINE_B_V4_ID, ROUTINE_C_V4_ID] as const;
/** Anciennes routines, archivées à l'activation. */
export const ROUTINES_V1_IDS = ["v1-routine-a", "v1-routine-b", "v1-routine-c"] as const;

export const PALLOF_ELASTIQUE_ID = "pallof-elastique";
export const ISCHIO_SANGLE_ID = "ischio-sangle";
export const HANCHES_90_90_ID = "hanches-90-90";
export const GLISSES_MUR_ID = "glisses-mur";
export const EXTENSION_HAUT_DOS_ID = "extension-haut-dos";

/* -------------------------------------------------------------------------- */
/* Exercices créés                                                            */
/* -------------------------------------------------------------------------- */

export function routineExercisesV4(now: string): Exercise[] {
  const base = { location: "Maison" as const, mode: "series" as const, status: "active" as const, createdAt: now, updatedAt: now };
  return [
    {
      ...base,
      id: PALLOF_ELASTIQUE_ID,
      name: "Pallof press élastique",
      category: "Musculation",
      zone: "Core",
      movement: "Gainage",
      equipment: "Élastique",
      measurementType: "reps_per_side",
      progressionGroup: "Abdominaux",
      technique: "Élastique attaché à hauteur de poitrine, de côté, pieds écartés à largeur de hanches. Tends les bras devant toi sans laisser le tronc pivoter, marque un temps, puis ramène les mains à la poitrine.",
      description: "Anti-rotation du tronc à la maison, sans flexion du dos.",
      advice: "Épaules et bassin restent face à l'avant. Si le tronc tourne, rapproche-toi du point d'attache.",
      muscles: ["Obliques", "Transverse", "Abdominaux"],
    },
    {
      ...base,
      id: ISCHIO_SANGLE_ID,
      name: "Ischio-jambiers allongé avec sangle",
      category: "Mobilité",
      measurementType: "duration_per_side",
      technique: "Allongé sur le dos, dos à plat, une sangle sous le pied. Lève la jambe tendue jusqu'à une tension légère à l'arrière de la cuisse ; l'autre jambe reste au sol.",
      description: "Étirement des ischio-jambiers dos à plat, sans charger le bas du dos.",
      advice: "Le bas du dos reste collé au sol ; la tension doit rester douce, jamais une douleur.",
      muscles: ["Ischio-jambiers"],
    },
    {
      ...base,
      id: HANCHES_90_90_ID,
      name: "Hanches 90/90",
      category: "Mobilité",
      measurementType: "duration_per_side",
      technique: "Assis au sol, jambe avant pliée à 90° devant toi, jambe arrière pliée à 90° sur le côté. Buste droit, penche-toi légèrement au-dessus de la jambe avant.",
      description: "Mobilité des hanches en rotation, assis.",
      advice: "Garde le dos droit, mains au sol en appui si besoin. Ne force pas sur les genoux.",
      muscles: ["Hanches", "Fessiers"],
    },
    {
      ...base,
      id: GLISSES_MUR_ID,
      name: "Glissés au mur (épaules)",
      category: "Mobilité",
      measurementType: "reps",
      technique: "Dos, tête et bras contre le mur, coudes à 90°. Fais glisser les bras vers le haut sans décoller le dos ni les poignets, puis redescends lentement.",
      description: "Mobilité des épaules et du haut du dos.",
      advice: "Amplitude confortable : arrête la montée dès que le dos ou les poignets décollent.",
      muscles: ["Épaules", "Haut du dos"],
    },
    {
      ...base,
      id: EXTENSION_HAUT_DOS_ID,
      name: "Extension du haut du dos (rouleau ou chaise)",
      category: "Mobilité",
      measurementType: "duration",
      technique: "Rouleau sous le haut du dos (ou dossier de chaise), mains derrière la tête, bassin au sol. Laisse le haut du dos s'ouvrir doucement par-dessus le support.",
      description: "Ouverture du haut du dos, sans cambrer le bas du dos.",
      advice: "Le bas du dos ne bouge pas ; l'extension vient du haut du dos seulement.",
      muscles: ["Haut du dos"],
    },
  ] as Exercise[];
}

/* -------------------------------------------------------------------------- */
/* Progression (spec § 3.4)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Progression d'un exercice des routines : la cible monte d'un cran quand
 * toutes les séries de la séance précédente l'ont atteinte, à RPE ≤ 7,
 * sans douleur ; sinon elle reste. Un seul suivi par exercice, partagé
 * entre les routines. Le plafond atteint, la cible y reste (la variante plus
 * difficile se décidera plus tard).
 */
export interface RoutineProgression {
  measure: "reps" | "duration";
  step: number;
  max: number;
}

export const ROUTINE_RPE_MAX = 7;

export const ROUTINE_PROGRESSIONS: Readonly<Record<string, RoutineProgression>> = {
  "dead-bug": { measure: "reps", step: 1, max: 12 },
  planche: { measure: "duration", step: 5, max: 60 },
  "planche-laterale": { measure: "duration", step: 5, max: 45 },
  [PALLOF_ELASTIQUE_ID]: { measure: "reps", step: 2, max: 15 },
  "bird-dog": { measure: "reps", step: 1, max: 12 },
  "mobilite-flechisseur-hanche": { measure: "duration", step: 15, max: 60 },
  [ISCHIO_SANGLE_ID]: { measure: "duration", step: 5, max: 60 },
  [HANCHES_90_90_ID]: { measure: "duration", step: 5, max: 60 },
  [OPEN_BOOK_EXERCISE_ID]: { measure: "reps", step: 1, max: 12 },
  "mobilite-ouverture-epaules-mur": { measure: "duration", step: 5, max: 60 },
  [GLISSES_MUR_ID]: { measure: "reps", step: 1, max: 15 },
  [EXTENSION_HAUT_DOS_ID]: { measure: "duration", step: 5, max: 45 },
  "papillon-assis": { measure: "duration", step: 10, max: 90 },
};

/* -------------------------------------------------------------------------- */
/* Séances                                                                    */
/* -------------------------------------------------------------------------- */

type TemplateContent = Omit<SessionTemplate, "status" | "position" | "createdAt" | "updatedAt">;

const REST = 30;
const STRETCH_REST = 15;

const reps = (sets: number, value: number, rest: number): ExerciseInstructions => ({ shape: "reps", sets, reps: { min: value, max: value }, restBetweenSetsSec: rest, targetRpe: { min: 6, max: ROUTINE_RPE_MAX } });
const hold = (sets: number, seconds: number, rest: number): ExerciseInstructions => ({ shape: "duration", sets, durationSec: seconds, restBetweenSetsSec: rest, targetRpe: { min: 5, max: ROUTINE_RPE_MAX } });

function block(id: string, position: number, exerciseId: string, instructions: ExerciseInstructions, notes: string): ExerciseBlock {
  return { id, kind: "exercise", position, exerciseId, instructions, notes };
}

const PAIN = "Arrêt au premier signe de douleur (note « douleur » sur la série : la cible ne monte pas).";

const routineA: TemplateContent = {
  id: ROUTINE_A_V4_ID,
  name: "Routine A — Abdominaux",
  category: "Routine",
  letter: "A",
  subtitle: "Abdominaux",
  tags: ["Tronc"],
  description: "Environ 25 min.",
  contentSince: PROGRAM_V4_START,
  estimatedMinutes: 25,
  blocks: [
    block("v4-routine-a-dead-bug", 0, "dead-bug", reps(3, 8, REST), `Lent, par côté, bas du dos plaqué au sol. ${PAIN}`),
    block("v4-routine-a-planche", 1, "planche", hold(3, 30, REST), `Corps aligné, bassin ni affaissé ni relevé : si les hanches descendent, arrête la série. ${PAIN}`),
    block("v4-routine-a-planche-laterale", 2, "planche-laterale", hold(3, 20, REST), `Par côté, coude sous l'épaule, corps aligné. ${PAIN}`),
    block("v4-routine-a-pallof", 3, PALLOF_ELASTIQUE_ID, reps(3, 10, REST), `Par côté, le tronc ne tourne pas. ${PAIN}`),
    block("v4-routine-a-bird-dog", 4, "bird-dog", reps(2, 8, REST), `Par côté, pause de 2 s bras et jambe tendus, dos neutre. ${PAIN}`),
    block("v4-routine-a-flechisseurs", 5, "mobilite-flechisseur-hanche", hold(2, 30, STRETCH_REST), `Par côté, avec appui, bassin rentré, sans cambrer. ${PAIN}`),
  ],
};

const routineB: TemplateContent = {
  id: ROUTINE_B_V4_ID,
  name: "Routine B — Souplesse générale",
  category: "Routine",
  letter: "B",
  subtitle: "Souplesse générale",
  tags: ["Souplesse"],
  description: "Environ 25 min.",
  contentSince: PROGRAM_V4_START,
  estimatedMinutes: 25,
  blocks: [
    block("v4-routine-b-flechisseurs", 0, "mobilite-flechisseur-hanche", hold(2, 45, STRETCH_REST), `Par côté, avec appui, bassin rentré, sans cambrer. ${PAIN}`),
    block("v4-routine-b-ischio", 1, ISCHIO_SANGLE_ID, hold(2, 45, STRETCH_REST), `Par côté, dos à plat, tension douce. ${PAIN}`),
    block("v4-routine-b-90-90", 2, HANCHES_90_90_ID, hold(2, 45, STRETCH_REST), `Par côté, buste droit. ${PAIN}`),
    block("v4-routine-b-open-book", 3, OPEN_BOOK_EXERCISE_ID, reps(2, 8, STRETCH_REST), `Par côté, lentement, genoux collés au sol. ${PAIN}`),
    block("v4-routine-b-pectoraux", 4, "mobilite-ouverture-epaules-mur", hold(2, 45, STRETCH_REST), `Par côté, épaule détendue, sans forcer l'amplitude. ${PAIN}`),
    block("v4-routine-b-glisses", 5, GLISSES_MUR_ID, reps(2, 10, STRETCH_REST), `Dos et poignets contre le mur. ${PAIN}`),
    block("v4-routine-b-extension", 6, EXTENSION_HAUT_DOS_ID, hold(2, 30, STRETCH_REST), `Le bas du dos ne bouge pas. ${PAIN}`),
    block("v4-routine-b-papillon", 7, "papillon-assis", hold(1, 60, 0), `Dos droit, sans appuyer sur les genoux. ${PAIN}`),
  ],
};

const routineC: TemplateContent = {
  id: ROUTINE_C_V4_ID,
  name: "Routine C — Abdos + souplesse",
  category: "Routine",
  letter: "C",
  subtitle: "Abdos + souplesse",
  tags: ["Tronc", "Souplesse"],
  description: "Environ 21 min.",
  contentSince: PROGRAM_V4_START,
  estimatedMinutes: 21,
  blocks: [
    block("v4-routine-c-dead-bug", 0, "dead-bug", reps(2, 8, REST), `Rappel léger, par côté, bas du dos plaqué au sol. ${PAIN}`),
    block("v4-routine-c-planche-laterale", 1, "planche-laterale", hold(2, 30, REST), `Rappel léger, par côté, corps aligné. ${PAIN}`),
    block("v4-routine-c-ischio", 2, ISCHIO_SANGLE_ID, hold(2, 30, STRETCH_REST), `Par côté, dos à plat, tension douce. ${PAIN}`),
    block("v4-routine-c-flechisseurs", 3, "mobilite-flechisseur-hanche", hold(2, 30, STRETCH_REST), `Par côté, avec appui, sans cambrer. ${PAIN}`),
    block("v4-routine-c-open-book", 4, OPEN_BOOK_EXERCISE_ID, reps(2, 6, STRETCH_REST), `Par côté, lentement. ${PAIN}`),
  ],
};

export const ROUTINES_V4_TEMPLATES: readonly TemplateContent[] = [routineA, routineB, routineC];

/** Les briques des routines V4 qui ont une progression, par identifiant : exercice et consigne de départ. */
export const ROUTINE_V4_BLOCKS: ReadonlyMap<string, { exerciseId: string; sets: number; start: number }> = new Map(
  ROUTINES_V4_TEMPLATES.flatMap((template) =>
    template.blocks.flatMap((item) => {
      if (item.kind !== "exercise" || !ROUTINE_PROGRESSIONS[item.exerciseId]) return [];
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
/* Indicateurs Tronc et Souplesse (spec § 3.4)                                */
/* -------------------------------------------------------------------------- */


/** Souplesse V4 : mains dans le dos, papillon et ischio allongé en principaux ; doigts-sol secondaire et facultatif, sans forcer. */
export const SOUPLESSE_V4: Pick<TestProtocolVersion, "instructions" | "measures" | "primaryMeasureKey"> = {
  instructions: [
    "État : à froid, avant tout échauffement.",
    "Position et méthode : toujours les mêmes.",
    "Mains dans le dos (Apley) : écart entre les doigts, côté gauche et côté droit, au mètre ruban.",
    "Papillon : assis, plantes des pieds jointes, talons près du bassin ; distance genou-sol.",
    "Ischio allongé : sur le dos, l'autre jambe au sol, jambe tendue levée avec la sangle jusqu'à la première tension franche ; angle relevé avec le niveau de l'app Mesures de l'iPhone posé sur le tibia ; gauche et droite.",
    "Doigts-sol (facultatif) : debout sur une marche, jambes tendues, sans forcer ni rebondir ; 0 = niveau des pieds, positif = au-dessus, négatif = au-delà.",
    "Consigne d'arrêt : à la première tension franche, sans à-coup.",
  ],
  measures: [
    { key: "apley_cm", label: "Mains dans le dos", unit: "cm", input: "entered", required: true, side: true, exerciseId: "test-apley" },
    { key: "papillon_cm", label: "Papillon", unit: "cm", input: "entered", required: true, exerciseId: "test-papillon" },
    { key: "ischio_allonge_deg", label: "Ischio allongé", unit: "°", input: "entered", required: true, side: true, exerciseId: ISCHIO_SANGLE_ID },
    { key: "doigts_sol_cm", label: "Doigts-sol (facultatif)", unit: "cm", input: "entered", required: false, signed: true, exerciseId: "test-doigts-sol" },
  ] satisfies TestMeasureSpec[],
  primaryMeasureKey: "apley_cm",
};

/** Tronc V4 : la planche maximale (test actuel), la planche latérale en secondaire, facultative. */
export const TRONC_V4: Pick<TestProtocolVersion, "instructions" | "measures" | "primaryMeasureKey"> = {
  instructions: [
    "Planche sur les avant-bras, un seul essai.",
    "Durée maximale en bonne forme.",
    "Arrêt dès que le bassin descend ou monte franchement.",
    "Planche latérale (facultatif) : un essai par côté, même règle d'arrêt.",
  ],
  measures: [
    { key: "planche_duree_s", label: "Planche", unit: "s", input: "entered", required: true, exerciseId: "planche" },
    { key: "planche_laterale_s", label: "Planche latérale (facultatif)", unit: "s", input: "entered", required: false, side: true, exerciseId: "planche-laterale" },
  ] satisfies TestMeasureSpec[],
  primaryMeasureKey: "planche_duree_s",
};

/** Objectif Souplesse V4 : la mesure principale passe du doigts-sol aux mains dans le dos ; les autres en indicateurs secondaires. */
export function flexibilityGoalV4(goal: Goal, now: string): Goal {
  const segments = goal.segments.map((segment) =>
    segment.id === goal.currentSegmentId
      ? { ...segment, measure: { source: "test" as const, protocolId: "protocol-souplesse", measureKey: "apley_cm" }, direction: "decrease" as const, label: "Mains dans le dos" }
      : segment,
  );
  return {
    ...goal,
    segments,
    secondaryIndicators: [
      { kind: "test_measure", protocolId: "protocol-souplesse", measureKey: "ischio_allonge_deg" },
      { kind: "test_measure", protocolId: "protocol-souplesse", measureKey: "papillon_cm" },
      { kind: "test_measure", protocolId: "protocol-souplesse", measureKey: "doigts_sol_cm" },
    ],
    linkedExercises: ["mobilite-flechisseur-hanche", ISCHIO_SANGLE_ID, HANCHES_90_90_ID, OPEN_BOOK_EXERCISE_ID, "mobilite-ouverture-epaules-mur", GLISSES_MUR_ID, EXTENSION_HAUT_DOS_ID, "papillon-assis"].map((exerciseId) => ({ exerciseId })),
    updatedAt: now,
  };
}

/** Objectif Tronc V4 : planche latérale en secondaire ; exercices liés sans flexion lombaire. */
export function coreGoalV4(goal: Goal, now: string): Goal {
  return {
    ...goal,
    secondaryIndicators: [{ kind: "test_measure", protocolId: "protocol-tronc", measureKey: "planche_laterale_s" }],
    linkedExercises: ["planche", "planche-laterale", "dead-bug", PALLOF_ELASTIQUE_ID, "bird-dog"].map((exerciseId) => ({ exerciseId })),
    updatedAt: now,
  };
}

/** Courbes des maintiens en routine, par objectif : l'exercice et son libellé. */
export const HOLD_CURVES_V4: Readonly<Record<string, ReadonlyArray<{ exerciseId: string; label: string }>>> = {
  core: [
    { exerciseId: "planche", label: "Planche" },
    { exerciseId: "planche-laterale", label: "Planche latérale" },
  ],
  flexibility: [
    { exerciseId: ISCHIO_SANGLE_ID, label: "Ischio-jambiers avec sangle" },
    { exerciseId: HANCHES_90_90_ID, label: "Hanches 90/90" },
    { exerciseId: "papillon-assis", label: "Papillon assis" },
  ],
};
