import { describe, expect, it } from "vitest";

import type {
  Exercise,
  SessionBlock,
  SessionTemplate,
  WeeklyProgram,
  WorkoutSession,
} from "../models";
import {
  calculateBlockNumbering,
  calculateSessionTemplateDuration,
  estimateSessionTemplateDurationSec,
  formatCompletionCount,
  formatSessionTemplateCardioLine,
  formatSessionTemplateDuration,
  formatSessionTemplateSummary,
  isSessionTemplateScheduled,
  summarizeSessionTemplate,
} from "./sessionTemplateRules";

const now = "2026-09-16T08:00:00.000Z";

function strengthExercise(
  id: string,
  zone: Exercise["zone"] & string,
): Exercise {
  return {
    id,
    name: id,
    category: "Musculation",
    zone,
    movement: "Poussée",
    equipment: "Machine",
    location: "Salle",
    mode: "series",
    measurementType: "load_reps",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const exercises: Exercise[] = [
  strengthExercise("squat", "Jambes"),
  strengthExercise("leg-press", "Jambes"),
  strengthExercise("lat-pulldown", "Dos"),
  strengthExercise("rowing", "Dos"),
  strengthExercise("crunch", "Core"),
  strengthExercise("chest-press", "Pecs"),
  {
    id: "tapis",
    name: "Tapis",
    category: "Cardio",
    equipment: "Tapis",
    location: "Salle",
    mode: "steps",
    measurementType: "duration_speed_incline",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "chat-vache",
    name: "Chat-vache",
    category: "Mobilité",
    location: "Maison",
    mode: "series",
    measurementType: "reps",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
];

const exerciseById = new Map(
  exercises.map((exercise) => [exercise.id, exercise]),
);

function repsBlock(
  id: string,
  position: number,
  exerciseId: string,
): SessionBlock {
  return {
    id,
    kind: "exercise",
    position,
    exerciseId,
    instructions: {
      shape: "reps",
      sets: 3,
      reps: { min: 8, max: 12 },
      restBetweenSetsSec: 120,
    },
  };
}

/**
 * Muscu A : note, deux exercices, un groupe de deux, un exercice.
 */
const muscuABlocks: SessionBlock[] = [
  {
    id: "note-1",
    kind: "note",
    position: 0,
    text: "10 min de cardio léger",
  },
  repsBlock("b-squat", 1, "squat"),
  repsBlock("b-leg-press", 2, "leg-press"),
  {
    id: "g-dos",
    kind: "group",
    position: 3,
    rounds: 3,
    restBetweenRoundsSec: 60,
    children: [
      {
        id: "c-rowing",
        position: 1,
        exerciseId: "rowing",
        instructions: { shape: "reps", reps: { min: 8, max: 12 } },
      },
      {
        id: "c-lat",
        position: 0,
        exerciseId: "lat-pulldown",
        instructions: { shape: "reps", reps: { min: 8, max: 12 } },
      },
    ],
  },
  repsBlock("b-crunch", 4, "crunch"),
];

describe("calculateBlockNumbering", () => {
  it("numérote les briques, saute les notes et lettre les enfants", () => {
    // Positions volontairement dans le désordre : la numérotation suit `position`.
    const shuffled = [...muscuABlocks].reverse();

    expect(calculateBlockNumbering(shuffled)).toEqual({
      "b-squat": "1",
      "b-leg-press": "2",
      "g-dos": "3",
      "c-lat": "3a",
      "c-rowing": "3b",
      "b-crunch": "4",
    });
  });

  it("recalcule après déplacement d'un groupe", () => {
    const moved = muscuABlocks.map((block) => {
      if (block.id === "g-dos") return { ...block, position: 0.5 };
      return block;
    });

    expect(calculateBlockNumbering(moved)).toEqual({
      "g-dos": "1",
      "c-lat": "1a",
      "c-rowing": "1b",
      "b-squat": "2",
      "b-leg-press": "3",
      "b-crunch": "4",
    });
  });
});

describe("summarizeSessionTemplate", () => {
  it("compte les enfants de groupe et ordonne les zones par apparition", () => {
    const summary = summarizeSessionTemplate(muscuABlocks, exerciseById);

    expect(summary).toEqual({
      exerciseCount: 5,
      cardioCount: 0,
      zones: ["Jambes", "Dos", "Core"],
      cardioNames: [],
    });
    expect(formatSessionTemplateSummary(summary)).toBe(
      "5 exercices · Jambes, Dos, Core",
    );
    expect(formatSessionTemplateCardioLine(summary)).toBeUndefined();
  });

  it("sort le cardio du compte et l'annonce sur sa propre ligne", () => {
    const blocks: SessionBlock[] = [
      ...muscuABlocks,
      {
        id: "b-tapis",
        kind: "exercise",
        position: 5,
        exerciseId: "tapis",
        instructions: { shape: "steps", steps: [] },
      },
    ];
    const summary = summarizeSessionTemplate(blocks, exerciseById);

    expect(summary.exerciseCount).toBe(5);
    expect(summary.cardioCount).toBe(1);
    expect(formatSessionTemplateSummary(summary)).toBe(
      "5 exercices · Jambes, Dos, Core",
    );
    expect(formatSessionTemplateCardioLine(summary)).toBe(
      "+ 1 exercice cardio",
    );
  });

  it("dit Full body au-delà de trois zones", () => {
    const blocks: SessionBlock[] = [
      ...muscuABlocks,
      repsBlock("b-chest", 5, "chest-press"),
    ];

    expect(
      formatSessionTemplateSummary(
        summarizeSessionTemplate(blocks, exerciseById),
      ),
    ).toBe("6 exercices · Full body");
  });

  it("résume une séance cardio seule par ses exercices", () => {
    const blocks: SessionBlock[] = [
      {
        id: "b-tapis",
        kind: "exercise",
        position: 0,
        exerciseId: "tapis",
        instructions: { shape: "steps", steps: [] },
      },
    ];
    const summary = summarizeSessionTemplate(blocks, exerciseById);

    expect(formatSessionTemplateSummary(summary)).toBe("Tapis");
    expect(
      formatSessionTemplateSummary(summary, "Endurance fondamentale"),
    ).toBe("Tapis · Endurance fondamentale");
    expect(formatSessionTemplateCardioLine(summary)).toBeUndefined();
  });

  it("n'invente pas de zone pour la mobilité et gère la séance vide", () => {
    const mobility: SessionBlock[] = [
      repsBlock("b-chat", 0, "chat-vache"),
    ];

    expect(
      formatSessionTemplateSummary(
        summarizeSessionTemplate(mobility, exerciseById),
      ),
    ).toBe("1 exercice");
    expect(
      formatSessionTemplateSummary(
        summarizeSessionTemplate([], exerciseById),
      ),
    ).toBe("Aucune brique");
  });

  it("ignore une référence d'exercice inconnue", () => {
    const summary = summarizeSessionTemplate(
      [repsBlock("b-ghost", 0, "inconnu")],
      exerciseById,
    );

    expect(summary.exerciseCount).toBe(0);
  });
});

describe("durée d'un modèle", () => {
  const template: SessionTemplate = {
    id: "muscu-a",
    name: "Muscu A",
    category: "Musculation",
    status: "active",
    position: 0,
    blocks: muscuABlocks,
    createdAt: now,
    updatedAt: now,
  };

  function completed(activeDurationSec: number): WorkoutSession {
    return {
      id: `w-${activeDurationSec}`,
      sessionTemplateId: template.id,
      source: "free",
      status: "completed",
      date: "2026-09-16",
      startedAt: now,
      lastActionAt: now,
      activeDurationSec,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    } as WorkoutSession;
  }

  it("estime le travail en répétitions, les repos et les transitions", () => {
    // 3 exercices autonomes : 3 × (3 séries × 10 reps × 3 s + 2 repos × 120 s + 60 s) = 1170
    // groupe : 2 × 60 s de transition + 2 enfants × 3 tours × 10 reps × 3 s + 2 × 60 s de repos = 420
    expect(estimateSessionTemplateDurationSec(muscuABlocks)).toBe(1590);
  });

  it("affiche Estimé avant trois réalisations", () => {
    const duration = calculateSessionTemplateDuration(template, [
      completed(3000),
      completed(3300),
    ]);

    expect(duration).toEqual({ kind: "estimated", minutes: 27 });
    expect(formatSessionTemplateDuration(duration)).toBe("Estimé 27 min");
  });

  it("affiche la moyenne de la durée active à partir de trois", () => {
    const duration = calculateSessionTemplateDuration(template, [
      completed(3000),
      completed(3300),
      completed(3060),
    ]);

    expect(duration).toEqual({ kind: "average", minutes: 52 });
    expect(formatSessionTemplateDuration(duration)).toBe("Moyenne 52 min");
  });
});

describe("programmation et réalisations", () => {
  it("lit la programmation dans la règle hebdomadaire", () => {
    const program: WeeklyProgram = {
      id: "weekly-program",
      name: "Programme principal",
      days: [
        { weekday: "monday", sessionTemplateId: "muscu-a" },
        { weekday: "tuesday" },
      ],
      createdAt: now,
      updatedAt: now,
    };

    expect(isSessionTemplateScheduled("muscu-a", program)).toBe(true);
    expect(isSessionTemplateScheduled("muscu-b", program)).toBe(false);
    expect(isSessionTemplateScheduled("muscu-a", undefined)).toBe(false);
  });

  it("accorde le nombre de réalisations", () => {
    expect(formatCompletionCount(0)).toBe("0 réalisation");
    expect(formatCompletionCount(1)).toBe("1 réalisation");
    expect(formatCompletionCount(12)).toBe("12 réalisations");
  });
});
