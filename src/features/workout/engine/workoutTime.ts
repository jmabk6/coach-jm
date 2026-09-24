import type {
  ActiveRest,
  PerformedBlock,
  WorkoutPause,
  WorkoutSession,
} from "../../../domain";

/**
 * Règles de temps de la séance (spec v2.9, §12 et §15).
 *
 * Tout se calcule à partir d'horodatages ISO : jamais de compteur en
 * mémoire, jamais d'hypothèse sur le fait que l'application soit restée
 * ouverte. Trois notions, à ne jamais confondre :
 * - l'absence (hors de l'app) n'a aucun effet ;
 * - le repos suit l'horloge réelle jusqu'à son heure de fin cible ;
 * - la pause explicite est la seule chose retirée de la durée active.
 */

/**
 * Absence à partir de laquelle la feuille `Séance en cours retrouvée`
 * s'affiche au retour (§15). Informative : elle ne modifie rien.
 */
export const ABSENCE_SHEET_THRESHOLD_SEC = 60;

/**
 * Cadence du battement de présence quand l'application est visible.
 */
export const PRESENCE_HEARTBEAT_SEC = 15;

export function secondsBetween(fromIso: string, toIso: string): number {
  return Math.max(
    0,
    Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000),
  );
}

/* -------------------------------------------------------------------------- */
/* Pauses                                                                     */
/* -------------------------------------------------------------------------- */

export function getOpenPause(workout: WorkoutSession): WorkoutPause | undefined {
  return workout.pauses?.find((pause) => pause.endedAt === undefined);
}

export function isWorkoutPaused(workout: WorkoutSession): boolean {
  return getOpenPause(workout) !== undefined;
}

/**
 * Somme des pauses, la pause en cours comptée jusqu'à `now`.
 */
export function totalPausedSec(workout: WorkoutSession, now: string): number {
  return (workout.pauses ?? []).reduce(
    (total, pause) =>
      total + secondsBetween(pause.startedAt, pause.endedAt ?? now),
    0,
  );
}

/**
 * Règle qui donne la durée active d'une séance (décision du 24/09/2026) :
 * - `corrected` : corrigée à la main avant l'enregistrement ;
 * - `cardio_steps` : séance terminée entièrement cardio, somme des
 *   durées des paliers validés — l'horloge compterait aussi un palier
 *   oublié ouvert pendant des heures ;
 * - `clock` : amplitude − pauses explicites (§12).
 */
export type DurationRule = "corrected" | "cardio_steps" | "clock";

/**
 * Somme des paliers validés d'une séance terminée **entièrement cardio**
 * — seules des briques à paliers portent des validations, les briques
 * sautées ne comptent pas — ou `undefined` si la séance ne l'est pas.
 */
export function validatedCardioStepsSec(workout: WorkoutSession): number | undefined {
  if (workout.completedAt === undefined && workout.endedAt === undefined) return undefined;

  let total = 0;
  let steps = 0;

  for (const block of workout.blocks) {
    if (block.kind === "note" || block.status === "skipped") continue;

    if (block.kind === "group") {
      if (block.rounds.some((round) => round.status === "completed" || round.children.some((child) => child.completedAt !== undefined))) {
        return undefined;
      }
      continue;
    }

    if (block.kind === "test") {
      if (block.status === "performed" || block.draft !== undefined) return undefined;
      continue;
    }

    if (block.series?.some((series) => series.status === "completed")) return undefined;

    for (const step of block.cardioSteps ?? []) {
      if (step.status !== "completed") continue;
      total += step.settings.durationSec;
      steps += 1;
    }
  }

  return steps > 0 ? total : undefined;
}

/**
 * Règle appliquée à la durée active **enregistrée** : une séance close
 * avant la règle (antérieure au 24/09/2026) garde sa durée à l'horloge.
 */
export function durationRuleOf(workout: WorkoutSession): DurationRule {
  if (workout.correctedDurationSec !== undefined) return "corrected";
  const cardioSec = validatedCardioStepsSec(workout);
  return cardioSec !== undefined && cardioSec === workout.activeDurationSec ? "cardio_steps" : "clock";
}

/**
 * Durée active : la correction manuelle, sinon la somme des paliers d'une
 * séance terminée entièrement cardio, sinon amplitude − pauses explicites
 * (§12). Pour une séance terminée, l'amplitude s'arrête à `completedAt`.
 */
export function calculateActiveDurationSec(
  workout: WorkoutSession,
  now: string,
): number {
  if (workout.correctedDurationSec !== undefined) return workout.correctedDurationSec;

  const cardioSec = validatedCardioStepsSec(workout);
  if (cardioSec !== undefined) return cardioSec;

  /* Terminée (D20) : la durée s'arrête à `endedAt`, même avant l'enregistrement. */
  const end = workout.completedAt ?? workout.endedAt ?? now;

  return Math.max(
    0,
    secondsBetween(workout.startedAt, end) - totalPausedSec(workout, end),
  );
}

/* -------------------------------------------------------------------------- */
/* Absence                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Secondes écoulées depuis la dernière présence enregistrée. Sans
 * battement connu, l'absence se mesure depuis la dernière action.
 */
export function absenceSec(workout: WorkoutSession, now: string): number {
  return secondsBetween(workout.lastSeenAt ?? workout.lastActionAt, now);
}

/**
 * La feuille de reprise s'affiche après 60 s d'absence — jamais sur une
 * séance en pause, qui montre directement son état `En pause` (§15).
 */
export function shouldShowResumeSheet(
  workout: WorkoutSession,
  now: string,
): boolean {
  return (
    workout.status === "in_progress" &&
    workout.endedAt === undefined &&
    !isWorkoutPaused(workout) &&
    absenceSec(workout, now) >= ABSENCE_SHEET_THRESHOLD_SEC
  );
}

/* -------------------------------------------------------------------------- */
/* Repos                                                                      */
/* -------------------------------------------------------------------------- */

export type RestCountdown =
  | { phase: "running"; remainingSec: number; elapsedSec: number }
  | { phase: "done"; overrunSec: number; elapsedSec: number };

/**
 * État du compte à rebours à l'instant `now` : restant recalculé depuis
 * l'heure de fin cible, ou terminé avec le dépassement — jamais négatif.
 * La fin du compte à rebours n'est pas la fin du repos (§12).
 */
export function getRestCountdown(rest: ActiveRest, now: string): RestCountdown {
  const elapsedSec = secondsBetween(rest.startedAt, now);
  const targetMs = new Date(rest.targetEndAt).getTime();
  const nowMs = new Date(now).getTime();

  if (nowMs < targetMs) {
    return {
      phase: "running",
      remainingSec: Math.round((targetMs - nowMs) / 1000),
      elapsedSec,
    };
  }

  return {
    phase: "done",
    overrunSec: Math.round((nowMs - targetMs) / 1000),
    elapsedSec,
  };
}

/**
 * Repos réel = fin réelle − début, quelle que soit l'heure cible.
 */
export function actualRestSec(rest: ActiveRest, endedAt: string): number {
  return secondsBetween(rest.startedAt, endedAt);
}

/* -------------------------------------------------------------------------- */
/* Repos moyen                                                                */
/* -------------------------------------------------------------------------- */

export interface RestSummary {
  /**
   * Moyenne des seuls repos comparables, absente s'il n'y en a aucun.
   */
  averageSec?: number;
  comparableCount: number;
  /**
   * Tous les repos enregistrés, comparables ou non : le dénominateur
   * de la couverture (`11 sur 12 repos`).
   */
  totalCount: number;
  plannedAverageSec?: number;
}

/**
 * Repos moyen (§12) sur les repos entre séries et entre tours. Un repos
 * clôturé par la fin de séance ou chevauché par une pause est compté
 * dans le total, jamais dans la moyenne. Les `Repos avant cet exercice`
 * n'en font pas partie : autre position, autre nature.
 */
export function summarizeRests(blocks: PerformedBlock[]): RestSummary {
  const comparable: number[] = [];
  const planned: number[] = [];
  let totalCount = 0;

  for (const block of blocks) {
    if (block.kind === "exercise") {
      /* Le repos d'un exercice ajouté pendant la séance est un défaut de
         l'app, pas une consigne du modèle : ses repos réels comptent, son
         « prévu » n'entre pas dans le repos prévu (décision du 17/09/2026). */
      const plannedRest =
        !block.addedDuringWorkout &&
        (block.snapshotInstructions.shape === "reps" ||
          block.snapshotInstructions.shape === "duration")
          ? block.snapshotInstructions.restBetweenSetsSec
          : undefined;

      for (const series of block.series ?? []) {
        if (series.actualRestAfterSec === undefined) continue;

        totalCount += 1;

        if (series.restComparable !== false) {
          comparable.push(series.actualRestAfterSec);
          if (plannedRest !== undefined) planned.push(plannedRest);
        }
      }

      continue;
    }

    if (block.kind === "group") {
      for (const round of block.rounds) {
        if (round.actualRestAfterSec === undefined) continue;

        totalCount += 1;

        if (round.restComparable !== false) {
          comparable.push(round.actualRestAfterSec);
          if (!block.addedDuringWorkout) planned.push(block.plannedRestBetweenRoundsSec);
        }
      }
    }
  }

  const average = (values: number[]) =>
    values.length === 0
      ? undefined
      : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  const averageSec = average(comparable);
  const plannedAverageSec = average(planned);

  return {
    ...(averageSec !== undefined ? { averageSec } : {}),
    comparableCount: comparable.length,
    totalCount,
    ...(plannedAverageSec !== undefined ? { plannedAverageSec } : {}),
  };
}
