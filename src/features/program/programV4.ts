import type { Exercise, ExerciseBlock, ExerciseInstructions } from "../../domain";

/**
 * Programme V4 (spec du 02/11/2026, décisions D1 à D13 et Q1 à Q6), lot L3 :
 * le contenu des séances de musculation A, B et C.
 *
 * - Les trois modèles gardent leurs identifiants (`v2-muscu-a/b/c`) : le pari
 *   traction V6 (briques, règles, semaines test) ne bouge pas.
 * - L'écarté passe de C en B et le leg curl de A en C **avec le même
 *   identifiant de brique** : leur historique et leur piste de perspectives
 *   continuent sans raccord.
 * - La presse quitte A et B (sa piste est close, pas supprimée).
 * - Le curl biceps à la poulie (nouvel exercice) entre en A ; trois exercices
 *   de jambes et le leg curl entrent en C, avant le tapis incliné (gardé, Q3).
 * - Élévations de C : 2 × 12-15, RPE 7-8 (Q2), hors cadre, nouvelle référence.
 *
 * Rien ne s'applique avant `PROGRAM_V4_START` (Q1, Q6).
 */

/** Jour d'activation de la V4 : lundi 02/11/2026 (décision de JM du 02/11, au lieu d'un dimanche). */
export const PROGRAM_V4_START = "2026-11-02";

/**
 * L'heure donnée aux seeds V4 au lancement. Sous Vitest, elle est figée
 * avant l'activation : les tests écrits pour le programme actuel le gardent
 * quelle que soit la date du jour ; les tests de la V4 passent leur date.
 */
export function v4SeedNow(): string {
  return import.meta.env.MODE === "test" ? "2026-11-01T12:00:00.000Z" : new Date().toISOString();
}

const ISOLATION = 90;

function reps(sets: number, min: number, max: number, restBetweenSetsSec: number, targetRpe?: { min: number; max: number }): ExerciseInstructions {
  return { shape: "reps", sets, reps: { min, max }, restBetweenSetsSec, ...(targetRpe ? { targetRpe } : {}) };
}

function exercise(
  id: string,
  exerciseId: string,
  instructions: ExerciseInstructions,
  extra: Partial<Pick<ExerciseBlock, "notes" | "outsideFrame">> = {},
): ExerciseBlock {
  return { id, kind: "exercise", position: 0, exerciseId, instructions, ...extra };
}

/* -------------------------------------------------------------------------- */
/* Nouvel exercice                                                            */
/* -------------------------------------------------------------------------- */

export const CURL_POULIE_ID = "curl-biceps-poulie";

export function curlPoulieExercise(now: string): Exercise {
  return {
    id: CURL_POULIE_ID,
    name: "Curl biceps à la poulie",
    category: "Musculation",
    zone: "Bras",
    movement: "Isolation",
    equipment: "Poulie",
    progressionGroup: "Bras",
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    technique: "Face à la poulie basse, barre droite ou corde en main, paumes vers le haut. Fléchis les coudes pour monter la barre sans avancer les coudes ni basculer le buste, puis redescends lentement.",
    description: "Isolation des biceps avec une tension continue sur toute l'amplitude, en complément du curl haltères.",
    advice: "Garde les coudes collés au corps et le buste fixe. Si tu dois te balancer pour monter, la charge est trop lourde.",
    muscles: ["Biceps", "Brachial", "Avant-bras"],
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as Exercise;
}

/* -------------------------------------------------------------------------- */
/* Consignes (dont consignes de sécurité des jambes)                          */
/* -------------------------------------------------------------------------- */

export const CURL_POULIE_NOTE = "Coudes collés au corps, buste fixe, descente lente ; RPE 8 au plus.";
export const ELEVATIONS_C_NOTE = "Volume léger : RPE 7-8, jamais à l'échec ; les épaules travaillent déjà en A et B.";
export const MONTEE_MARCHE_NOTE =
  "Par jambe, sur une marche stable et antidérapante d'environ 30 cm (hauteur à tester). Monter sans élan, genou dans l'axe du pied. RPE 7 au plus (vélo côtes la veille). Douleur au genou : arrêt.";
export const POSITION_BASSE_NOTE =
  "Dos au mur, flexion modérée (environ 60°, pas cuisses parallèles), genoux au-dessus des chevilles. RPE 7 au plus. Douleur au genou : arrêt.";
export const MARCHE_LATERALE_NOTE = "10 pas par côté, genoux légèrement fléchis, élastique toujours tendu. RPE 7 au plus.";
export const LEG_CURL_C_NOTE = "Bassin plaqué au banc, descente lente ; RPE 8 au plus. Douleur derrière le genou : arrêt.";

/* -------------------------------------------------------------------------- */
/* Séances                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Une brique de la V4 : `keep` = la brique existante (même identifiant, prise
 * dans A, B ou C), seule sa place change ; `set` = la brique existante si
 * elle existe, avec la consigne et les notes de la V4 ; `add` = brique créée.
 */
export type V4Block = { keep: string } | { set: ExerciseBlock } | { add: ExerciseBlock };

export interface V4Template {
  id: string;
  name: string;
  subtitle: string;
  tags: string[];
  description: string;
  /** Les briques que le modèle doit avoir exactement avant la V4 ; sinon il reste tel quel. */
  before: readonly string[];
  blocks: V4Block[];
}

export const MUSCU_A_V4: V4Template = {
  id: "v2-muscu-a",
  name: "Muscu A — Dos / traction / biceps",
  subtitle: "Dos / traction / biceps",
  tags: ["Haut du corps", "Dos"],
  description: "Environ 70 min.",
  before: [
    "v2-muscu-a-echauffement",
    "v2-muscu-a-traction",
    "v2-muscu-a-rowing",
    "v2-muscu-a-chest-press",
    "v2-muscu-a-elevations",
    "v2-muscu-a-curl",
    "v2-muscu-a-leg-curl",
    "v2-muscu-a-presse",
  ],
  blocks: [
    { keep: "v2-muscu-a-echauffement" },
    { keep: "v2-muscu-a-traction" },
    { keep: "v2-muscu-a-rowing" },
    { keep: "v2-muscu-a-chest-press" },
    { keep: "v2-muscu-a-elevations" },
    { keep: "v2-muscu-a-curl" },
    { add: exercise("v2-muscu-a-curl-poulie", CURL_POULIE_ID, reps(2, 10, 15, ISOLATION), { notes: CURL_POULIE_NOTE }) },
  ],
};

export const MUSCU_B_V4: V4Template = {
  id: "v2-muscu-b",
  name: "Muscu B — Pecs / épaules / triceps",
  subtitle: "Pecs / épaules / triceps",
  tags: ["Haut du corps", "Pecs", "Épaules"],
  description: "Environ 90 min.",
  before: [
    "v2-muscu-b-echauffement",
    "v2-muscu-b-traction",
    "v2-muscu-b-chest-press",
    "v2-muscu-b-developpe-incline",
    "v2-muscu-b-rowing",
    "v2-muscu-b-developpe-epaules",
    "v2-muscu-b-elevations",
    "v2-muscu-b-extension-triceps",
    "v2-muscu-b-presse",
  ],
  blocks: [
    { keep: "v2-muscu-b-echauffement" },
    { keep: "v2-muscu-b-traction" },
    { keep: "v2-muscu-b-chest-press" },
    { keep: "v2-muscu-b-developpe-incline" },
    /* Venu de C avec son identifiant (D3) : historique et piste continus. */
    { keep: "v2-muscu-c-ecarte" },
    { keep: "v2-muscu-b-rowing" },
    { keep: "v2-muscu-b-developpe-epaules" },
    { keep: "v2-muscu-b-elevations" },
    { keep: "v2-muscu-b-extension-triceps" },
  ],
};

export const MUSCU_C_V4: V4Template = {
  id: "v2-muscu-c",
  name: "Muscu C — Jambes, haut du corps, traction",
  subtitle: "Jambes, haut du corps, traction",
  tags: ["Haut du corps", "Dos", "Jambes"],
  description: "Environ 105 min.",
  before: [
    "v2-muscu-c-echauffement",
    "v2-muscu-c-negatives",
    "v2-muscu-c-suspension",
    "v2-muscu-c-tirage-vertical",
    "v2-muscu-c-ecarte",
    "v2-muscu-c-elevations",
    "v2-muscu-c-face-pull",
    "v2-muscu-c-curl-marteau",
    "v2-muscu-c-triceps-tete",
    "v2-muscu-c-tapis-incline",
  ],
  blocks: [
    { keep: "v2-muscu-c-echauffement" },
    { keep: "v2-muscu-c-negatives" },
    { keep: "v2-muscu-c-suspension" },
    { keep: "v2-muscu-c-tirage-vertical" },
    { set: exercise("v2-muscu-c-elevations", "elevations-laterales-halteres", reps(2, 12, 15, ISOLATION, { min: 7, max: 8 }), { notes: ELEVATIONS_C_NOTE, outsideFrame: true }) },
    { keep: "v2-muscu-c-face-pull" },
    { keep: "v2-muscu-c-curl-marteau" },
    { keep: "v2-muscu-c-triceps-tete" },
    { add: exercise("v2-muscu-c-montee", "montee-banc", reps(2, 8, 10, ISOLATION, { min: 6, max: 7 }), { notes: MONTEE_MARCHE_NOTE }) },
    {
      add: exercise(
        "v2-muscu-c-position-basse",
        "chaise-60",
        { shape: "duration", sets: 3, durationSec: { min: 15, max: 25 }, restBetweenSetsSec: 75, targetRpe: { min: 6, max: 7 } },
        { notes: POSITION_BASSE_NOTE },
      ),
    },
    { add: exercise("v2-muscu-c-marche-laterale", "marche-laterale-elastique", reps(2, 10, 10, 60, { min: 6, max: 7 }), { notes: MARCHE_LATERALE_NOTE }) },
    /* Venu de A avec son identifiant (D4) : historique et piste continus ; 2 × 12-15. */
    { set: exercise("v2-muscu-a-leg-curl", "leg-curl-couche", reps(2, 12, 15, ISOLATION), { notes: LEG_CURL_C_NOTE }) },
    { keep: "v2-muscu-c-tapis-incline" },
  ],
};

export const MUSCU_V4_TEMPLATES: readonly V4Template[] = [MUSCU_A_V4, MUSCU_B_V4, MUSCU_C_V4];

/** Pistes closes à l'activation (presse retirée du programme actif). */
export const CLOSED_TRACKS_V4 = ["v2-muscu-a-presse", "v2-muscu-b-presse"] as const;

/** Pistes qui changent de séance avec leur brique. */
export const MOVED_TRACKS_V4: Readonly<Record<string, { session: "A" | "B" | "C"; templateId: string }>> = {
  "v2-muscu-c-ecarte": { session: "B", templateId: "v2-muscu-b" },
  "v2-muscu-a-leg-curl": { session: "C", templateId: "v2-muscu-c" },
};

/** Pistes dont la consigne change : leur référence détaillée sera recalculée sur la nouvelle consigne. */
export const RECALCULATED_TRACKS_V4 = ["v2-muscu-a-leg-curl", "v2-muscu-c-elevations"] as const;

/** Élévations de C : nouvelle référence datée ; elles quittent le groupe partagé de A et B. */
export const ELEVATIONS_C_REFERENCE = { from: PROGRAM_V4_START, reason: "Programme V4 : 2 × 12-15, RPE 7-8 (volume léger)." } as const;

/** Cadres : leg curl 2 × 12-15 (nouvelle version) ; curl poulie créé, sans objectif en cours. */
export const FRAMES_V4 = [
  { exerciseId: "leg-curl-couche", workSets: 2, repRange: { min: 12, max: 15 }, rpeTarget: 8, restSec: ISOLATION },
  { exerciseId: CURL_POULIE_ID, workSets: 2, repRange: { min: 10, max: 15 }, rpeTarget: 8, restSec: ISOLATION },
] as const;
