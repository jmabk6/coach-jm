import type {
  Exercise,
  Id,
  SessionBlock,
  SessionCategory,
  SessionTemplate,
  WeeklyProgram,
  WorkoutSession,
} from "../models";
import { calculateSessionDuration } from "./workoutRules";

/* -------------------------------------------------------------------------- */
/* Numérotation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Numérotation affichée des briques et de leurs enfants (§6).
 *
 * Toujours calculée, jamais stockée :
 * - une note n'a pas de numéro ;
 * - un groupe compte pour un numéro, ses enfants sont `3a`, `3b`… ;
 * - déplacer une brique recalcule tout.
 *
 * Les clés sont les identifiants des briques et des enfants de groupe.
 */
export function calculateBlockNumbering(
  blocks: SessionBlock[],
): Partial<Record<Id, string>> {
  const numbering: Partial<Record<Id, string>> = {};
  let visibleNumber = 0;

  const orderedBlocks = [...blocks].sort(
    (a, b) => a.position - b.position,
  );

  for (const block of orderedBlocks) {
    if (block.kind === "note") {
      continue;
    }

    /* Comme la frise de la séance en cours (décision du 25/09/2026) :
       l'échauffement n'a pas de numéro, les exercices vont de 1 à N. */
    if (block.kind === "exercise" && block.role === "warmup") {
      continue;
    }

    visibleNumber += 1;
    numbering[block.id] = String(visibleNumber);

    if (block.kind === "group") {
      const orderedChildren = [...block.children].sort(
        (a, b) => a.position - b.position,
      );

      orderedChildren.forEach((child, index) => {
        numbering[child.id] =
          `${visibleNumber}${String.fromCharCode(97 + index)}`;
      });
    }
  }

  return numbering;
}

/* -------------------------------------------------------------------------- */
/* Résumé calculé                                                             */
/* -------------------------------------------------------------------------- */

export interface SessionTemplateSummary {
  /**
   * Exercices hors cardio, enfants de groupe compris.
   */
  exerciseCount: number;

  /**
   * Exercices cardio, jamais comptés dans `exerciseCount`.
   */
  cardioCount: number;


  /**
   * Noms des exercices cardio, dans l'ordre de la séance.
   */
  cardioNames: string[];
}

/**
 * Exercices référencés par la séance, dans l'ordre structurel,
 * enfants de groupe compris. Les références inconnues sont ignorées.
 */
export function listTemplateExercises(
  blocks: SessionBlock[],
  exerciseById: Map<Id, Exercise>,
): Exercise[] {
  const exercises: Exercise[] = [];

  const orderedBlocks = [...blocks].sort(
    (a, b) => a.position - b.position,
  );

  for (const block of orderedBlocks) {
    if (block.kind === "exercise") {
      const exercise = exerciseById.get(block.exerciseId);

      if (exercise) {
        exercises.push(exercise);
      }

      continue;
    }

    if (block.kind === "group") {
      const orderedChildren = [...block.children].sort(
        (a, b) => a.position - b.position,
      );

      for (const child of orderedChildren) {
        const exercise = exerciseById.get(child.exerciseId);

        if (exercise) {
          exercises.push(exercise);
        }
      }
    }
  }

  return exercises;
}

/** Raison affichée d'une routine sans contenu (conception V2 § 2.5, correction B). */
export const EMPTY_ROUTINE_REASON = "Contenu à définir : cette routine n'a encore aucun exercice.";

/**
 * Pourquoi un modèle ne peut pas démarrer, ou rien. Un modèle vide ne
 * démarre pas ; une routine vide le dit à sa façon (« Contenu à définir »).
 */
export function startBlockedReason(template: Pick<SessionTemplate, "category" | "blocks">): string | undefined {
  if (template.blocks.length > 0) return undefined;

  return template.category === "Routine" ? EMPTY_ROUTINE_REASON : "Ajoutez au moins une brique pour démarrer";
}

/** Garde-fou des démarrages : une routine vide ne se démarre jamais, d'où qu'on vienne. */
export function assertRoutineStartable(template: Pick<SessionTemplate, "category" | "blocks">): void {
  if (template.category === "Routine" && template.blocks.length === 0) throw new Error(EMPTY_ROUTINE_REASON);
}

export function summarizeSessionTemplate(
  blocks: SessionBlock[],
  exerciseById: Map<Id, Exercise>,
): SessionTemplateSummary {
  const summary: SessionTemplateSummary = {
    exerciseCount: 0,
    cardioCount: 0,
    cardioNames: [],
  };

  /* L'échauffement (D14) n'est pas un « exercice cardio » (26/09/2026). */
  const worked = blocks.filter((block) => !(block.kind === "exercise" && block.role === "warmup"));

  for (const exercise of listTemplateExercises(worked, exerciseById)) {
    if (exercise.category === "Cardio") {
      summary.cardioCount += 1;
      summary.cardioNames.push(exercise.name);
      continue;
    }

    summary.exerciseCount += 1;
  }

  return summary;
}

/**
 * Première ligne du résumé : `6 exercices` (les zones sont retirées le 26/09/2026 : le nom suffit).
 *
 * Une seule syntaxe (§5). Les exercices cardio ne comptent pas ici ;
 * une séance qui n'en contient que du cardio est résumée par ses exercices,
 * suivis de la description du modèle si elle existe (`Tapis · Intervalles`).
 */
export function formatSessionTemplateSummary(
  summary: SessionTemplateSummary,
  description?: string,
): string {
  if (summary.exerciseCount === 0) {
    if (summary.cardioCount === 0) {
      return "Aucune brique";
    }

    const names = summary.cardioNames.join(", ");

    return description ? `${names} · ${description}` : names;
  }

  const count =
    summary.exerciseCount === 1
      ? "1 exercice"
      : `${summary.exerciseCount} exercices`;

  /* Plus de zones (décision du 26/09/2026) : le nom de la séance suffit. */
  return count;
}

/**
 * Seconde ligne du résumé : `+ 1 exercice cardio`.
 * Absente si la séance n'a pas de cardio, ou si elle n'a que du cardio
 * (la première ligne le dit déjà).
 */
export function formatSessionTemplateCardioLine(
  summary: SessionTemplateSummary,
): string | undefined {
  if (summary.cardioCount === 0 || summary.exerciseCount === 0) {
    return undefined;
  }

  return summary.cardioCount === 1
    ? "+ 1 exercice cardio"
    : `+ ${summary.cardioCount} exercices cardio`;
}

/* -------------------------------------------------------------------------- */
/* Durée                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Nombre de réalisations à partir duquel la moyenne réelle
 * remplace l'estimation (§5).
 */
export const REAL_DURATION_MIN_COMPLETIONS = 3;

/**
 * Temps de travail estimé d'une répétition, quand le modèle ne mesure
 * que des répétitions. Ordre de grandeur, pas une donnée : l'estimation
 * disparaît dès que trois réalisations existent.
 */
const ESTIMATED_SECONDS_PER_REP = 3;

/**
 * Installation et transition entre deux briques.
 */
const ESTIMATED_TRANSITION_SEC = 60;

/**
 * Mise en place de chaque série en répétitions hors circuit (charger,
 * régler la machine, se placer).
 * Calibrée le 26/09/2026 sur les séances réelles : 200 à 250 s par série,
 * repos compris, contre environ 120 s estimées jusque-là.
 */
const ESTIMATED_SET_SETUP_SEC = 45;

/**
 * Estimation de la durée d'un modèle jamais (ou peu) réalisé.
 *
 * `calculateSessionDuration` ne compte que les temps mesurés (repos,
 * durées cibles, paliers) ; on y ajoute le travail en répétitions et
 * une transition par exercice.
 */
export function estimateSessionTemplateDurationSec(
  blocks: SessionBlock[],
  category?: SessionCategory,
): number {
  /* Mise en place par série : en salle seulement, pas pour une routine au sol. */
  const setupSec = category === "Routine" || category === "Mobilité" ? 0 : ESTIMATED_SET_SETUP_SEC;
  let totalSec = calculateSessionDuration(blocks);
  /* Une transition entre deux briques : aucune avant la première (26/09/2026,
     une séance cardio d'un seul bloc dure exactement la somme de ses paliers). */
  let transitions = 0;

  for (const block of blocks) {
    if (block.kind === "note") {
      continue;
    }

    if (block.kind === "exercise") {
      transitions += 1;

      if (block.instructions.shape === "reps") {
        const { sets, reps, restBetweenSetsSec } = block.instructions;
        const averageReps = (reps.min + reps.max) / 2;

        /* Travail, mise en place de chaque série, et repos après la dernière avant l'exercice suivant. */
        totalSec += sets * averageReps * ESTIMATED_SECONDS_PER_REP + sets * setupSec + restBetweenSetsSec;
      } else if (block.instructions.shape === "duration") {
        /* Séries en durée (sprints, maintiens) : enchaînées sans mise en place ; le repos après la dernière compte. */
        totalSec += block.instructions.restBetweenSetsSec;
      }

      continue;
    }

    transitions += block.children.length;

    for (const child of block.children) {
      if (child.instructions.shape === "reps") {
        const { reps } = child.instructions;
        const averageReps = (reps.min + reps.max) / 2;

        totalSec +=
          block.rounds * averageReps * ESTIMATED_SECONDS_PER_REP;
      }
    }
  }

  totalSec += Math.max(0, transitions - 1) * ESTIMATED_TRANSITION_SEC;

  return totalSec;
}

export type SessionTemplateDuration =
  | { kind: "estimated"; minutes: number }
  | { kind: "average"; minutes: number };

/**
 * Durée affichée sur la carte : estimée avant 3 réalisations,
 * moyenne de la durée active à partir de 3 (§5, §12).
 */
export function calculateSessionTemplateDuration(
  template: SessionTemplate,
  completedWorkouts: WorkoutSession[],
): SessionTemplateDuration {
  if (completedWorkouts.length >= REAL_DURATION_MIN_COMPLETIONS) {
    const totalSec = completedWorkouts.reduce(
      (sum, workout) => sum + workout.activeDurationSec,
      0,
    );

    return {
      kind: "average",
      minutes: Math.round(totalSec / completedWorkouts.length / 60),
    };
  }

  return {
    kind: "estimated",
    minutes: Math.round(
      estimateSessionTemplateDurationSec(template.blocks, template.category) / 60,
    ),
  };
}

export function formatSessionTemplateDuration(
  duration: SessionTemplateDuration,
): string {
  const label = duration.kind === "average" ? "Moyenne" : "Estimé";

  return `${label} ${duration.minutes} min`;
}

/* -------------------------------------------------------------------------- */
/* Programmation et réalisations                                              */
/* -------------------------------------------------------------------------- */

/**
 * Un modèle est `Programmée` s'il figure dans la règle hebdomadaire (§5, §9).
 * `Non programmée` est un état normal, pas une erreur.
 */
export function isSessionTemplateScheduled(
  templateId: Id,
  program: WeeklyProgram | undefined,
): boolean {
  return (
    program?.days.some((day) => day.sessionTemplateId === templateId) ??
    false
  );
}

/**
 * `0 réalisation`, `1 réalisation`, `12 réalisations` : zéro reste au singulier.
 */
export function formatCompletionCount(count: number): string {
  return count <= 1 ? `${count} réalisation` : `${count} réalisations`;
}
