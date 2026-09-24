import type {
  Id,
  PlannedSession,
  PlannedSessionStatus,
  WorkoutSession,
} from "../models";
import { formatFullDate, plannedSessionStatusLabels } from "./programRules";

/* -------------------------------------------------------------------------- */
/* Statut affiché d'une instance                                              */
/* -------------------------------------------------------------------------- */

/**
 * Statut tel qu'il s'affiche (§9, conception V2 § 2.7, D23), qui ajoute
 * deux cas au statut stocké : une séance `À venir` dont la date est passée
 * s'affiche `Non réalisée`, celle du jour `Aujourd'hui`.
 *
 * Décision du 17/09/2026 : elle n'est jamais marquée `Sautée` d'office —
 * elle a pu être faite sans être saisie sur le moment. Elle garde les
 * actions d'une séance à venir (démarrer, déplacer, marquer comme sautée…)
 * et `Sautée` reste une décision explicite.
 */
export type DisplayedPlannedSessionStatus =
  | PlannedSessionStatus
  | "not_performed"
  | "today";

export function getDisplayedPlannedSessionStatus(
  session: PlannedSession,
  today: string,
): DisplayedPlannedSessionStatus {
  if (session.status === "upcoming" && session.date < today) {
    return "not_performed";
  }

  if (session.status === "upcoming" && session.date === today) {
    return "today";
  }

  return session.status;
}

export const displayedPlannedSessionStatusLabels: Record<
  DisplayedPlannedSessionStatus,
  string
> = {
  ...plannedSessionStatusLabels,
  not_performed: "Non réalisée",
  today: "Aujourd'hui",
};

export function formatDisplayedPlannedSessionStatus(
  session: PlannedSession,
  today: string,
): string {
  return displayedPlannedSessionStatusLabels[
    getDisplayedPlannedSessionStatus(session, today)
  ];
}

/* -------------------------------------------------------------------------- */
/* État d'Aujourd'hui                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Ce qu'Aujourd'hui a à montrer, dans l'ordre d'affichage.
 *
 * `planned` : instance du jour non démarrée (`À venir` ou `Sautée`).
 * `in_progress` / `completed` : une réalisation, rattachée ou non à une
 * instance ; `supplementary` vaut vrai pour une réalisation libre (§10 :
 * Aujourd'hui reflète le réel, le Programme ne bouge pas).
 */
export type TodayEntry =
  | { kind: "planned"; session: PlannedSession }
  | {
      kind: "in_progress" | "completed";
      workout: WorkoutSession;
      session?: PlannedSession;
      supplementary: boolean;
    };

/**
 * L'état dominant de l'écran : une séance en cours prime sur tout,
 * puis une séance encore à faire, puis une séance faite, sinon le repos.
 */
export type TodayStateKind =
  | "rest"
  | "planned"
  | "in_progress"
  | "completed";

export interface TodayState {
  kind: TodayStateKind;
  entries: TodayEntry[];
}

export interface TodayStateInput {
  today: string;
  /**
   * Instances du jour, retirées exclues.
   */
  plannedSessions: PlannedSession[];
  /**
   * Réalisations datées du jour.
   */
  workouts: WorkoutSession[];
  /**
   * La séance en cours, quelle que soit sa date : une seule à la fois,
   * et elle doit rester joignable depuis Aujourd'hui.
   */
  inProgressWorkout?: WorkoutSession;
}

export function getTodayState({
  today,
  plannedSessions,
  workouts,
  inProgressWorkout,
}: TodayStateInput): TodayState {
  const entries: TodayEntry[] = [];
  const sessionById = new Map<Id, PlannedSession>(
    plannedSessions.map((session) => [session.id, session]),
  );
  const consumedWorkoutIds = new Set<Id>();

  const todayWorkouts = workouts.filter((workout) => workout.date === today);

  const inProgress =
    inProgressWorkout ??
    todayWorkouts.find((workout) => workout.status === "in_progress");

  if (inProgress) {
    consumedWorkoutIds.add(inProgress.id);

    const linkedSession = inProgress.plannedSessionId
      ? sessionById.get(inProgress.plannedSessionId)
      : undefined;

    entries.push({
      kind: "in_progress",
      workout: inProgress,
      ...(linkedSession ? { session: linkedSession } : {}),
      supplementary: !inProgress.plannedSessionId,
    });
  }

  const workoutById = new Map(
    todayWorkouts.map((workout) => [workout.id, workout]),
  );

  const orderedSessions = [...plannedSessions].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  for (const session of orderedSessions) {
    if (session.removedAt) continue;

    if (session.status === "upcoming" || session.status === "skipped") {
      entries.push({ kind: "planned", session });
      continue;
    }

    const workout = session.workoutId
      ? workoutById.get(session.workoutId)
      : undefined;

    if (!workout || consumedWorkoutIds.has(workout.id)) continue;

    consumedWorkoutIds.add(workout.id);

    if (workout.status === "completed") {
      entries.push({
        kind: "completed",
        workout,
        session,
        supplementary: false,
      });
    }
  }

  const freeCompleted = todayWorkouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        !consumedWorkoutIds.has(workout.id) &&
        (!workout.plannedSessionId ||
          !sessionById.has(workout.plannedSessionId)),
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  for (const workout of freeCompleted) {
    entries.push({
      kind: "completed",
      workout,
      supplementary: true,
    });
  }

  return { kind: dominantKind(entries), entries };
}

function dominantKind(entries: TodayEntry[]): TodayStateKind {
  if (entries.some((entry) => entry.kind === "in_progress")) return "in_progress";
  if (entries.some((entry) => entry.kind === "planned")) return "planned";
  if (entries.some((entry) => entry.kind === "completed")) return "completed";

  return "rest";
}

/* -------------------------------------------------------------------------- */
/* Prochaines séances                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Les prochaines instances à venir, strictement après aujourd'hui,
 * dans l'ordre des dates. Le passé non réalisé n'y figure pas :
 * il se règle dans le Programme.
 */
export function listNextPlannedSessions(
  sessions: PlannedSession[],
  today: string,
  limit = 3,
): PlannedSession[] {
  return sessions
    .filter(
      (session) =>
        !session.removedAt &&
        session.status === "upcoming" &&
        session.date > today,
    )
    .sort((a, b) =>
      a.date === b.date
        ? a.createdAt.localeCompare(b.createdAt)
        : a.date.localeCompare(b.date),
    )
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `Jeudi 10 septembre 2026` : la date du jour sous le titre.
 */
export function formatTodayTitle(date: string): string {
  const label = formatFullDate(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Sous-titre de la ligne de durée (mockup 21) : d'où vient le chiffre.
 */
export function formatDurationSource(
  kind: "estimated" | "average",
  completionCount: number,
): string {
  if (kind === "estimated") {
    return "Estimation d'après le contenu de la séance";
  }

  return completionCount === 1
    ? "Moyenne de ta séance réalisée"
    : `Moyenne de tes ${completionCount} séances réalisées`;
}
