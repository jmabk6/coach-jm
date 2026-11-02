import type { Exercise, ExerciseBlock, SessionTemplate, TestScheduleEntry, WeeklyProgram, Weekday } from "../../domain";
import { PROGRAM_V4_START } from "./programV4";

/**
 * Programme V4, lot L4 — le calendrier (spec § 1, § 2.4 à § 2.7, § 6) :
 *
 * | Jour      | Journée                  | Soir                         |
 * |-----------|--------------------------|------------------------------|
 * | Dimanche  | Muscu A                  | Routine A                    |
 * | Lundi     | Vélo endurance           | Routine B                    |
 * | Mardi     | Muscu B                  | Routine C                    |
 * | Mercredi  | Vélo côtes               | Routine A                    |
 * | Jeudi     | Muscu C                  | Routine B                    |
 * | Vendredi  | repos                    | rien                         |
 * | Samedi    | padel facultatif         | récupération facultative     |
 *
 * Le samedi n'a **aucune séance prévue** (Q4) : l'Accueil propose padel et
 * récupération. En semaine de tests, le test cardio sur tapis (Cardio A)
 * remplace le vélo côtes du mercredi. Rien ne change avant
 * `PROGRAM_V4_START`.
 */

export const VELO_ENDURANCE_ID = "v4-velo-endurance";
export const VELO_COTES_ID = "v4-velo-cotes";
export const PADEL_ID = "v4-padel";
export const RECUPERATION_ID = "v4-recuperation";
export const PADEL_EXERCISE_ID = "padel";
export const OPEN_BOOK_EXERCISE_ID = "rotation-thoracique-allongee";

/** Routines du soir par jour : les routines V4 (lot L5, `programRoutinesV4.ts`). */
export const EVENING_BY_WEEKDAY_V4: Partial<Record<Weekday, string>> = {
  sunday: "v4-routine-a",
  monday: "v4-routine-b",
  tuesday: "v4-routine-c",
  wednesday: "v4-routine-a",
  thursday: "v4-routine-b",
};

export const PROGRAM_V4_DAYS: WeeklyProgram["days"] = [
  { weekday: "sunday", sessionTemplateId: "v2-muscu-a" },
  { weekday: "monday", sessionTemplateId: VELO_ENDURANCE_ID },
  { weekday: "tuesday", sessionTemplateId: "v2-muscu-b" },
  { weekday: "wednesday", sessionTemplateId: VELO_COTES_ID },
  { weekday: "thursday", sessionTemplateId: "v2-muscu-c" },
  { weekday: "friday" },
  { weekday: "saturday" },
];

export const OPTIONAL_BY_WEEKDAY_V4: Partial<Record<Weekday, string[]>> = { saturday: [PADEL_ID, RECUPERATION_ID] };

/** Anciens cardios archivés à l'activation (historique conservé). Cardio A reste : c'est le support du test cardio sur tapis. */
export const ARCHIVED_TEMPLATES_V4 = ["v2-cardio-b", "v2-cardio-c"] as const;

/** Avertissement de la carte Padel la veille d'un test traction (spec § 2.6). */
export const PADEL_TEST_EVE_WARNING = "Test traction demain : garde de la fraîcheur pour les bras et le dos.";

export const PADEL_NOTE_PREFILL = "Fatigue jambes : …/10 · Rester bas : facile / moyen / difficile · Douleur : aucune / genou / dos — ";

const KNEE = "Douleur au genou : arrêt.";

/* -------------------------------------------------------------------------- */
/* Exercices                                                                  */
/* -------------------------------------------------------------------------- */

export function padelExercise(now: string): Exercise {
  return {
    id: PADEL_EXERCISE_ID,
    name: "Padel",
    category: "Cardio",
    equipment: "Poids du corps",
    location: "Salle",
    mode: "series",
    measurementType: "duration",
    description: "Partie de padel, enregistrée en durée avec le ressenti et une note sur les jambes et les douleurs.",
    advice: "Échauffe-toi quelques minutes avant de jouer. Arrête en cas de douleur au genou ou au dos.",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

/** Rotation thoracique allongée (« open book ») : aussi utilisée par les routines V4 (lot L5). */
export function openBookExercise(now: string): Exercise {
  return {
    id: OPEN_BOOK_EXERCISE_ID,
    name: "Rotation thoracique allongée (open book)",
    category: "Mobilité",
    location: "Maison",
    mode: "series",
    measurementType: "reps_per_side",
    technique: "Allongé sur le côté, genoux fléchis à 90° et bras tendus devant toi, mains l'une sur l'autre. Ouvre le bras du dessus vers l'arrière en suivant la main du regard, sans décoller les genoux, puis reviens lentement.",
    description: "Mobilité du haut du dos en rotation, sans charge sur le bas du dos.",
    advice: "Garde les genoux collés au sol : la rotation vient du haut du dos, pas du bassin. Amplitude confortable, jamais forcée.",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Séances                                                                    */
/* -------------------------------------------------------------------------- */

type TemplateContent = Omit<SessionTemplate, "status" | "position" | "createdAt" | "updatedAt">;

const rpe = (min: number, max: number) => ({ min, max });

function veloStep(id: string, position: number, minutes: number, targetRpe: { min: number; max: number }) {
  return { id, position, durationSec: minutes * 60, targetRpe };
}

export const VELO_ENDURANCE_NOTE =
  `Effort facile et continu, RPE 3-4 : tu parles facilement. Durée visée : 45-60 min en novembre, 60-75 min en décembre, 75-90 min en janvier, jusqu'à 90-120 min en février si c'est bien toléré. Semaine de tests : environ 25 % de moins. N'allonge que si la séance précédente a été facile (RPE 4 au plus) et sans douleur. Note la FC en fin de séance ; la distance du vélo de salle est indicative. ${KNEE}`;

export const VELO_COTES_NOTE =
  `Chaque côte est un palier : note sa FC en fin de palier. Côtes à RPE 6-7, récupérations faciles. Progression : 4 × 3 min, puis 4 × 4 min, puis 4 × 5 min, quand toutes les côtes de la séance précédente sont restées à RPE 7 au plus et bien récupérées. ${KNEE}`;

const veloEndurance: TemplateContent = {
  id: VELO_ENDURANCE_ID,
  name: "Vélo endurance",
  category: "Cardio",
  subtitle: "Endurance continue",
  tags: ["Endurance"],
  description: "Environ 60 min.",
  contentSince: PROGRAM_V4_START,
  mainBlockId: "v4-velo-endurance-velo",
  blocks: [
    {
      id: "v4-velo-endurance-velo",
      kind: "exercise",
      position: 0,
      exerciseId: "velo",
      instructions: { shape: "steps", steps: [veloStep("v4-velo-endurance-continu", 0, 60, rpe(3, 4))] },
      notes: VELO_ENDURANCE_NOTE,
    },
  ],
};

const veloCotes: TemplateContent = {
  id: VELO_COTES_ID,
  name: "Vélo côtes",
  category: "Cardio",
  subtitle: "4 côtes de 3 min",
  tags: ["Intervalles"],
  description: "Environ 41 min.",
  contentSince: PROGRAM_V4_START,
  blocks: [
    {
      id: "v4-velo-cotes-velo",
      kind: "exercise",
      position: 0,
      exerciseId: "velo",
      instructions: {
        shape: "steps",
        steps: [
          veloStep("v4-velo-cotes-echauffement", 0, 10, rpe(3, 3)),
          veloStep("v4-velo-cotes-cote-1", 1, 3, rpe(6, 7)),
          veloStep("v4-velo-cotes-recup-1", 2, 3, rpe(2, 3)),
          veloStep("v4-velo-cotes-cote-2", 3, 3, rpe(6, 7)),
          veloStep("v4-velo-cotes-recup-2", 4, 3, rpe(2, 3)),
          veloStep("v4-velo-cotes-cote-3", 5, 3, rpe(6, 7)),
          veloStep("v4-velo-cotes-recup-3", 6, 3, rpe(2, 3)),
          veloStep("v4-velo-cotes-cote-4", 7, 3, rpe(6, 7)),
          veloStep("v4-velo-cotes-retour", 8, 10, rpe(2, 2)),
        ],
      },
      notes: VELO_COTES_NOTE,
    },
  ],
};

const padel: TemplateContent = {
  id: PADEL_ID,
  name: "Padel",
  category: "Cardio",
  subtitle: "Partie facultative du samedi",
  tags: ["Padel"],
  description: "Facultatif : seulement quand tu joues.",
  contentSince: PROGRAM_V4_START,
  notePrefill: PADEL_NOTE_PREFILL,
  blocks: [
    {
      id: "v4-padel-partie",
      kind: "exercise",
      position: 0,
      exerciseId: PADEL_EXERCISE_ID,
      instructions: { shape: "duration", sets: 1, durationSec: { min: 3600, max: 5400 }, restBetweenSetsSec: 0 },
      notes: `Note la durée de la partie. À l'enregistrement : le ressenti, puis complète la note (fatigue des jambes, rester bas, douleur). ${KNEE}`,
    },
  ],
};

const stretch = (id: string, position: number, exerciseId: string, durationSec: number, notes: string): ExerciseBlock => ({
  id,
  kind: "exercise",
  position,
  exerciseId,
  instructions: { shape: "duration", sets: 1, durationSec, restBetweenSetsSec: 0 },
  notes,
});

const recuperation: TemplateContent = {
  id: RECUPERATION_ID,
  name: "Récupération douce",
  category: "Routine",
  subtitle: "Samedi soir, facultatif",
  tags: ["Souplesse"],
  description: "Environ 10 min, facultatif.",
  contentSince: PROGRAM_V4_START,
  estimatedMinutes: 10,
  blocks: [
    stretch("v4-recuperation-flechisseurs", 0, "mobilite-flechisseur-hanche", 45, "45 s par côté, avec appui, bassin rentré, sans cambrer."),
    stretch("v4-recuperation-pectoraux", 1, "mobilite-ouverture-epaules-mur", 45, "45 s par côté, épaule détendue, sans forcer l'amplitude."),
    {
      id: "v4-recuperation-open-book",
      kind: "exercise",
      position: 2,
      exerciseId: OPEN_BOOK_EXERCISE_ID,
      instructions: { shape: "reps", sets: 1, reps: { min: 6, max: 6 }, restBetweenSetsSec: 0 },
      notes: "6 par côté, lentement, genoux collés au sol.",
    },
    stretch("v4-recuperation-papillon", 3, "papillon-assis", 60, "60 s, dos droit, sans appuyer sur les genoux."),
  ],
};

export const CALENDAR_V4_TEMPLATES: readonly TemplateContent[] = [veloEndurance, veloCotes, padel, recuperation];

/** Place des tests en V4 : le test cardio sur tapis (Cardio A) prend la place du vélo côtes du mercredi. */
export function testScheduleV4(schedule: ReadonlyArray<TestScheduleEntry>): TestScheduleEntry[] {
  return schedule.map((entry) => (entry.protocolKey === "cardio" && entry.slot === "day" && entry.templateId === "v2-cardio-a" ? { ...entry, insteadOfTemplateId: VELO_COTES_ID } : entry));
}
