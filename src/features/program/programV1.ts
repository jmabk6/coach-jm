import type {
  DistanceStepInstruction,
  ExerciseBlock,
  ExerciseInstructions,
  GroupBlock,
  NoteBlock,
  SessionBlock,
  SessionTemplate,
  SpeedInclineStepInstruction,
  TestScheduleEntry,
  WeeklyProgram,
} from "../../domain";

/**
 * Programme V1 (conception V2 § 2.5) : 6 modèles et 3 routines à
 * identifiants fixes, la règle hebdomadaire du dimanche au samedi et la
 * place des tests. Données pures ; les seeds 5 et 6 les installent.
 *
 * Plages (D16) : une consigne en est une quand la prescription en est
 * une (« 8-10 min », « pente 6-8 % »). Aucune valeur inventée : Cardio B
 * n'a pas de distance prescrite, elle est facultative sur le vélo.
 */

type TemplateContent = Pick<
  SessionTemplate,
  "id" | "name" | "category" | "description" | "blocks" | "letter" | "subtitle" | "tags" | "mainBlockId"
>;

const tapisStep = (id: string, durationSec: SpeedInclineStepInstruction["durationSec"], speedKmh: number, inclinePercent: SpeedInclineStepInstruction["inclinePercent"]): SpeedInclineStepInstruction => ({
  id,
  position: 0,
  durationSec,
  speedKmh,
  inclinePercent,
});

function exercise(
  id: string,
  position: number,
  exerciseId: string,
  instructions: ExerciseInstructions,
  extra: Partial<Pick<ExerciseBlock, "notes" | "role">> = {},
): ExerciseBlock {
  return { id, kind: "exercise", position, exerciseId, instructions, ...extra };
}

function reps(sets: number, min: number, max: number, restBetweenSetsSec: number, technicalCue?: string): ExerciseInstructions {
  return {
    shape: "reps",
    sets,
    reps: { min, max },
    restBetweenSetsSec,
    ...(technicalCue !== undefined ? { technicalCue } : {}),
  };
}

/** Échauffement (D14) : une vraie brique cardio facile, un palier de 8-10 min. */
function warmup(prefix: string): ExerciseBlock {
  return exercise(
    `${prefix}-echauffement`,
    0,
    "tapis",
    { shape: "steps", steps: [tapisStep(`${prefix}-echauffement-p1`, { min: 480, max: 600 }, 5, 0)] },
    { role: "warmup", notes: "Cardio facile, tapis ou vélo." },
  );
}

const muscuA: TemplateContent = {
  id: "v1-muscu-a",
  name: "Muscu A — Traction force / dos",
  category: "Musculation",
  letter: "A",
  subtitle: "Traction force / dos",
  tags: ["Haut du corps", "Dos"],
  description: "Environ 60 min.",
  blocks: [
    warmup("v1-muscu-a"),
    exercise("v1-muscu-a-traction", 1, "traction-assistee", reps(3, 6, 8, 150)),
    exercise("v1-muscu-a-squat", 2, "squat", reps(3, 8, 10, 120)),
    exercise("v1-muscu-a-rowing", 3, "rowing-poulie-basse", reps(3, 8, 12, 90)),
    exercise("v1-muscu-a-chest-press", 4, "chest-press", reps(3, 8, 12, 90)),
    exercise("v1-muscu-a-leg-curl", 5, "leg-curl-assis", reps(3, 10, 12, 90)),
    exercise("v1-muscu-a-elevations", 6, "elevations-laterales-halteres", reps(2, 12, 15, 90)),
  ],
};

const muscuB: TemplateContent = {
  id: "v1-muscu-b",
  name: "Muscu B — Pecs / épaules",
  category: "Musculation",
  letter: "B",
  subtitle: "Pecs / épaules",
  tags: ["Haut du corps", "Pecs", "Épaules"],
  description: "Environ 60 min.",
  blocks: [
    warmup("v1-muscu-b"),
    exercise("v1-muscu-b-traction-negative", 1, "traction-negative", reps(3, 3, 5, 120, "Descente visée : 5 s ou plus.")),
    exercise("v1-muscu-b-developpe-epaules", 2, "developpe-epaules-machine", reps(3, 8, 10, 90)),
    exercise("v1-muscu-b-presse", 3, "presse-cuisses", reps(3, 10, 12, 120)),
    exercise("v1-muscu-b-developpe-incline", 4, "developpe-incline-halteres", reps(3, 8, 12, 90)),
    exercise("v1-muscu-b-tirage-vertical", 5, "tirage-vertical", reps(3, 8, 12, 90)),
    exercise("v1-muscu-b-elevations", 6, "elevations-laterales-halteres", reps(2, 12, 15, 90)),
    exercise("v1-muscu-b-extension-triceps", 7, "extension-triceps-poulie", reps(2, 10, 15, 60)),
  ],
};

const resterBas: GroupBlock = {
  id: "v1-muscu-c-rester-bas",
  kind: "group",
  position: 4,
  name: "Rester bas",
  rounds: 3,
  restBetweenRoundsSec: 90,
  children: [
    { id: "v1-muscu-c-chaise", position: 0, exerciseId: "chaise-60", instructions: { shape: "duration", durationSec: { min: 30, max: 45 } } },
    { id: "v1-muscu-c-marche-laterale", position: 1, exerciseId: "marche-laterale-elastique", instructions: { shape: "reps", reps: { min: 10, max: 10 } }, notes: "10 pas par côté." },
    { id: "v1-muscu-c-mollets", position: 2, exerciseId: "mollets-debout", instructions: { shape: "reps", reps: { min: 15, max: 20 } } },
  ],
};

const muscuC: TemplateContent = {
  id: "v1-muscu-c",
  name: "Muscu C — Jambes padel",
  category: "Musculation",
  letter: "C",
  subtitle: "Jambes padel",
  tags: ["Jambes", "Padel"],
  description: "Environ 60 min.",
  blocks: [
    warmup("v1-muscu-c"),
    exercise("v1-muscu-c-suspension", 1, "suspension-omoplates", { shape: "duration", sets: 3, durationSec: { min: 20, max: 30 }, restBetweenSetsSec: 60 }),
    exercise("v1-muscu-c-sprints", 2, "sprint-velo", { shape: "duration", sets: 6, durationSec: 12, restBetweenSetsSec: 48 }, { notes: "Même vélo, même résistance à chaque séance." }),
    exercise("v1-muscu-c-montee-banc", 3, "montee-banc", reps(3, 8, 8, 60), { notes: "8 par jambe." }),
    resterBas,
    exercise("v1-muscu-c-pullover", 5, "pullover-poulie", reps(3, 10, 15, 90)),
    /* N5 : 2 × 12 contre 3 × 10-12 au cadre — prescription réduite (D.3). */
    exercise("v1-muscu-c-leg-curl", 6, "leg-curl-assis", reps(2, 12, 12, 90)),
  ],
};

const cardioA: TemplateContent = {
  id: "v1-cardio-a",
  name: "Cardio A — Endurance facile",
  category: "Cardio",
  letter: "A",
  subtitle: "Endurance facile",
  tags: ["Endurance"],
  description: "45 min.",
  mainBlockId: "v1-cardio-a-principal",
  blocks: [
    exercise("v1-cardio-a-debut", 0, "tapis", { shape: "steps", steps: [tapisStep("v1-cardio-a-debut-p1", 300, 4.5, 0)] }),
    exercise("v1-cardio-a-principal", 1, "tapis", { shape: "steps", steps: [tapisStep("v1-cardio-a-principal-p1", 2100, 5, { min: 6, max: 8 })] }),
    exercise("v1-cardio-a-retour", 2, "tapis", { shape: "steps", steps: [tapisStep("v1-cardio-a-retour-p1", 300, 4.5, 0)] }, { notes: "Retour au calme." }),
  ],
};

/**
 * Cardio B (décision du 24/09/2026) : paliers préremplis, **sans distance**
 * — elle est facultative sur le vélo : 10 min progressif, 8 × (1 min à
 * RPE 7-8 puis 2 min facile), 5 min de retour au calme. 39 min de paliers,
 * 40 min estimées avec l'installation.
 */
function cardioBSteps(): DistanceStepInstruction[] {
  const steps: DistanceStepInstruction[] = [{ id: "v1-cardio-b-progressif", position: 0, durationSec: 600 }];

  for (let round = 1; round <= 8; round += 1) {
    steps.push({ id: `v1-cardio-b-effort-${round}`, position: steps.length, durationSec: 60, targetRpe: { min: 7, max: 8 } });
    steps.push({ id: `v1-cardio-b-facile-${round}`, position: steps.length, durationSec: 120 });
  }

  steps.push({ id: "v1-cardio-b-retour", position: steps.length, durationSec: 300 });

  return steps;
}

const cardioB: TemplateContent = {
  id: "v1-cardio-b",
  name: "Cardio B — Intervalles vélo",
  category: "Cardio",
  letter: "B",
  subtitle: "Intervalles vélo",
  tags: ["Intervalles"],
  description: "40 min.",
  blocks: [
    {
      id: "v1-cardio-b-consigne",
      kind: "note",
      position: 0,
      title: "Déroulé",
      text: "10 min progressif ; 8 × (1 min à RPE 7-8, puis 2 min facile) ; 5 min de retour au calme.",
    } satisfies NoteBlock,
    exercise("v1-cardio-b-velo", 1, "velo", { shape: "steps", steps: cardioBSteps() }, { notes: "Distance facultative : notez-la si le vélo l'affiche." }),
  ],
};

const cardioC: TemplateContent = {
  id: "v1-cardio-c",
  name: "Cardio C — Endurance longue",
  category: "Cardio",
  letter: "C",
  subtitle: "Endurance longue",
  tags: ["Endurance longue"],
  description: "55 min, ou une randonnée.",
  blocks: [
    exercise(
      "v1-cardio-c-tapis",
      0,
      "tapis",
      {
        shape: "steps",
        steps: [
          { ...tapisStep("v1-cardio-c-p1", 300, 4.5, 0), position: 0 },
          { ...tapisStep("v1-cardio-c-p2", 2700, 5, { min: 6, max: 8 }), position: 1 },
          { ...tapisStep("v1-cardio-c-p3", 300, 4.5, 0), position: 2 },
        ],
      },
      { notes: "+5 min quand c'est confortable, jusqu'à 90 min. Une randonnée convient aussi." },
    ),
  ],
};

export const PROGRAM_V1_TEMPLATES: TemplateContent[] = [muscuA, muscuB, muscuC, cardioA, cardioB, cardioC];

/** Routines du soir (correction B) : trois cadres vides, aucun exercice inventé. */
export const PROGRAM_V1_ROUTINES: TemplateContent[] = (["A", "B", "C"] as const).map((letter) => ({
  id: `v1-routine-${letter.toLowerCase()}`,
  name: `Routine ${letter} — à définir`,
  category: "Routine",
  letter,
  blocks: [] as SessionBlock[],
}));

export const PROGRAM_V1_WEEKLY: Omit<WeeklyProgram, "id" | "createdAt" | "updatedAt"> = {
  name: "Programme V1",
  days: [
    { weekday: "sunday", sessionTemplateId: "v1-muscu-a" },
    { weekday: "monday", sessionTemplateId: "v1-cardio-b" },
    { weekday: "tuesday", sessionTemplateId: "v1-muscu-b" },
    { weekday: "wednesday", sessionTemplateId: "v1-cardio-a" },
    { weekday: "thursday", sessionTemplateId: "v1-muscu-c" },
    { weekday: "friday" },
    { weekday: "saturday", sessionTemplateId: "v1-cardio-c" },
  ],
  eveningRotation: ["v1-routine-a", "v1-routine-b", "v1-routine-c"],
  /* Première semaine de tests : la routine A du dimanche 27/09 sert de repère. */
  eveningRotationAnchor: "2026-09-27",
};

/** Place de chaque test (conception V2 § 2.3) ; le tronc reste à placer (N2). */
export const PROGRAM_V1_TEST_SCHEDULE: TestScheduleEntry[] = [
  {
    protocolKey: "traction",
    weekday: "sunday",
    slot: "day",
    templateId: "v1-muscu-a",
    /* Après l'échauffement cardio (décision du 24/09/2026). */
    placement: "after_warmup",
    adjustments: [{ blockId: "v1-muscu-a-traction", sets: 2 }],
  },
  { protocolKey: "mensurations", weekday: "monday", slot: "morning" },
  { protocolKey: "souplesse", weekday: "monday", slot: "evening", placement: "replace_all" },
  {
    protocolKey: "cardio",
    weekday: "wednesday",
    slot: "day",
    templateId: "v1-cardio-a",
    placement: "replace_block",
    targetBlockId: "v1-cardio-a-principal",
  },
  { protocolKey: "jambes", weekday: "thursday", slot: "day", templateId: "v1-muscu-c", placement: "after_warmup" },
];
