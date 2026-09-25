import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameMonth,
  parseISO,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import type {
  Id,
  PlannedSession,
  PlannedSessionStatus,
  Weekday,
  WeeklyProgram,
} from "../models";
import { formatFr } from "./dateFr";

/* -------------------------------------------------------------------------- */
/* Jours et dates                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Premier jour de la semaine (lot B, conception V2 § 2.1.2) : le dimanche.
 * Seule source de toute notion de semaine — règle hebdomadaire,
 * génération, grilles, semaine en cours. Valeur de `date-fns` (0 = dimanche).
 */
export const WEEK_STARTS_ON = 0 as const;

/**
 * Dimanche → samedi : l'ordre de la règle et des grilles. Les journées
 * sont stockées par nom, jamais par position : changer cet ordre ne
 * réinterprète rien de ce qui est enregistré.
 */
export const weekdays: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Décalage de chaque journée depuis le début de semaine, dérivé de `weekdays`. */
const weekdayOffsets = Object.fromEntries(
  weekdays.map((weekday, offset) => [weekday, offset]),
) as Record<Weekday, number>;

/** Libellés courts, dans l'ordre de `weekdays` (en-tête de la grille Mois). */
export const weekdayShortLabels: Record<Weekday, string> = {
  sunday: "Dim",
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Jeu",
  friday: "Ven",
  saturday: "Sam",
};

export const weekdayLabels: Record<Weekday, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

/**
 * Date locale ISO `YYYY-MM-DD`, jamais UTC : une séance du soir
 * ne doit pas glisser au lendemain.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Premier jour (dimanche) de la semaine contenant la date.
 */
export function getWeekStartDate(date: string): string {
  return formatLocalDate(startOfWeek(parseISO(date), { weekStartsOn: WEEK_STARTS_ON }));
}

export function getWeekdayOf(date: string): Weekday {
  const offset = differenceInCalendarDays(
    parseISO(date),
    parseISO(getWeekStartDate(date)),
  );
  const weekday = weekdays[offset];

  /* L'écart est toujours de 0 à 6 : un repli silencieux masquerait un défaut. */
  if (!weekday) {
    throw new Error(`Jour de semaine introuvable pour ${date} (écart ${offset})`);
  }

  return weekday;
}

export function getWeekEndDate(weekStartDate: string): string {
  return formatLocalDate(addDays(parseISO(weekStartDate), 6));
}

export function listWeekDates(weekStartDate: string): string[] {
  const weekStart = parseISO(weekStartDate);

  return weekdays.map((_, offset) =>
    formatLocalDate(addDays(weekStart, offset)),
  );
}

/**
 * Une semaine est « future » quand elle commence après la semaine
 * en cours : c'est la seule zone que la programmation a le droit
 * de toucher (§9).
 */
export function isFutureWeek(weekStartDate: string, now: string): boolean {
  return weekStartDate > getWeekStartDate(now.slice(0, 10));
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * `Jeu.` + `10 sept.` — l'étiquette d'une ligne de la vue Semaine.
 */
export function formatDayLabel(date: string): {
  weekday: string;
  day: string;
} {
  const parsed = parseISO(date);

  return {
    weekday: capitalize(format(parsed, "EEE", { locale: fr })),
    day: formatFr(parsed, "d MMM"),
  };
}

/**
 * `jeudi 10 septembre 2026` — la date complète d'une instance.
 */
export function formatFullDate(date: string): string {
  return formatFr(date, "EEEE d MMMM yyyy");
}

/**
 * `10 septembre` — pour `Retirer du 10 septembre`.
 */
export function formatDayAndMonth(date: string): string {
  return formatFr(date, "d MMMM");
}

/**
 * `Du 7 au 13 septembre 2026`, ou `Du 28 septembre au 4 octobre 2026`
 * quand la semaine chevauche deux mois.
 */
export function formatWeekRange(weekStartDate: string): string {
  const start = parseISO(weekStartDate);
  const end = addDays(start, 6);

  if (isSameMonth(start, end)) {
    return `Du ${formatFr(start, "d")} au ${formatFr(end, "d MMMM yyyy")}`;
  }

  return `Du ${formatFr(start, "d MMMM")} au ${formatFr(end, "d MMMM yyyy")}`;
}

/**
 * `Septembre 2026`.
 */
export function formatMonthTitle(monthStartDate: string): string {
  return capitalize(
    format(parseISO(monthStartDate), "MMMM yyyy", { locale: fr }),
  );
}

/**
 * Titre du menu d'une occurrence : l'instance, jamais le seul modèle (§9).
 */
export function formatPlannedSessionTitle(
  templateName: string,
  date: string,
): string {
  return `${templateName} — ${formatFullDate(date)}`;
}

export const plannedSessionStatusLabels: Record<PlannedSessionStatus, string> =
  {
    upcoming: "À venir",
    in_progress: "En cours",
    done: "Faite",
    skipped: "Sautée",
  };

/* -------------------------------------------------------------------------- */
/* Génération                                                                 */
/* -------------------------------------------------------------------------- */

export interface GeneratePlannedSessionsForWeekInput {
  program: WeeklyProgram;
  weekStartDate: string;
  existingSessions: PlannedSession[];
  now: string;
}

/**
 * Date d'origine d'une instance issue de la règle. Les instances créées
 * avant l'existence de `sourceDate` n'ont jamais été déplacées :
 * leur date courante fait foi.
 */
export function getSourceDate(session: PlannedSession): string {
  return session.sourceDate ?? session.date;
}

/**
 * Instances que la règle crée pour une semaine future.
 *
 * Une date d'origine déjà couverte par une instance hebdomadaire —
 * déplacée, remplacée ou retirée — n'est jamais recréée : l'instance
 * porte les décisions de l'utilisateur, la règle ne les écrase pas.
 */
export function generatePlannedSessionsForWeek({
  program,
  weekStartDate,
  existingSessions,
  now,
}: GeneratePlannedSessionsForWeekInput): PlannedSession[] {
  if (!isFutureWeek(weekStartDate, now)) {
    return [];
  }

  const weekStart = parseISO(weekStartDate);

  return program.days.flatMap((day) => {
    if (!day.sessionTemplateId) {
      return [];
    }

    const date = formatLocalDate(
      addDays(weekStart, weekdayOffsets[day.weekday]),
    );

    /* Le créneau du soir (routine, test) ne compte pas : une journée seulement. */
    const alreadyExists = existingSessions.some(
      (session) =>
        session.source === "weekly_program" &&
        slotOf(session) === "day" &&
        getSourceDate(session) === date,
    );

    if (alreadyExists) {
      return [];
    }

    return [
      {
        id: `weekly-${date}`,
        date,
        sessionTemplateId: day.sessionTemplateId,
        status: "upcoming",
        sourceWeekday: day.weekday,
        sourceDate: date,
        source: "weekly_program",
        createdAt: now,
        updatedAt: now,
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* Modification de la règle                                                   */
/* -------------------------------------------------------------------------- */

function getProgramTemplateFor(
  program: Pick<WeeklyProgram, "days">,
  weekday: Weekday,
): Id | undefined {
  return program.days.find((day) => day.weekday === weekday)
    ?.sessionTemplateId;
}

/**
 * Une instance est « intacte » tant qu'elle est exactement ce que la
 * règle a créé : même date, même modèle, à venir, jamais démarrée ni
 * retirée. Dès que l'utilisateur y touche, elle lui appartient et la
 * règle ne la modifie plus (§9 : l'instance seule, jamais la règle,
 * et réciproquement).
 */
export function isPlannedSessionPristine(
  session: PlannedSession,
  program: Pick<WeeklyProgram, "days">,
): boolean {
  /* Une instance du soir ne suit pas la règle de journée ; une instance
     qui porte des tests appartient à la semaine de tests (lot G) : la
     règle ne la supprime ni ne la change, pour ne jamais perdre un test. */
  if (slotOf(session) !== "day" || (session.tests?.length ?? 0) > 0) {
    return false;
  }

  if (
    session.source !== "weekly_program" ||
    !session.sourceWeekday ||
    session.status !== "upcoming" ||
    session.workoutId ||
    session.removedAt ||
    getSourceDate(session) !== session.date
  ) {
    return false;
  }

  return (
    getProgramTemplateFor(program, session.sourceWeekday) ===
    session.sessionTemplateId
  );
}

export interface ProgramResync {
  deleteIds: Id[];
  updates: PlannedSession[];
}

export interface ResyncPlannedSessionsInput {
  previous: Pick<WeeklyProgram, "days"> | undefined;
  next: Pick<WeeklyProgram, "days">;
  sessions: PlannedSession[];
  now: string;
}

/**
 * Répercute une nouvelle règle sur les semaines futures déjà générées.
 *
 * Seules les instances intactes suivent la règle : un jour vidé les
 * supprime physiquement (pour qu'une règle ultérieure puisse recréer
 * la date), un modèle changé les met à jour. Les semaines passées et
 * la semaine en cours ne sont jamais concernées.
 */
export function resyncPlannedSessionsToProgram({
  previous,
  next,
  sessions,
  now,
}: ResyncPlannedSessionsInput): ProgramResync {
  const resync: ProgramResync = { deleteIds: [], updates: [] };

  if (!previous) {
    return resync;
  }

  for (const session of sessions) {
    if (
      !isFutureWeek(getWeekStartDate(session.date), now) ||
      !isPlannedSessionPristine(session, previous)
    ) {
      continue;
    }

    const nextTemplateId = getProgramTemplateFor(
      next,
      session.sourceWeekday as Weekday,
    );

    if (!nextTemplateId) {
      resync.deleteIds.push(session.id);
      continue;
    }

    if (nextTemplateId !== session.sessionTemplateId) {
      resync.updates.push({
        ...session,
        sessionTemplateId: nextTemplateId,
        updatedAt: now,
      });
    }
  }

  return resync;
}

/**
 * Règle vide : sept journées sur `Aucune séance`.
 */
export function createEmptyWeeklyProgram(
  now: string,
): Omit<WeeklyProgram, "id"> {
  return {
    name: "Programme principal",
    days: weekdays.map((weekday) => ({ weekday })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Affecte un modèle (ou aucun) à une journée de la règle, en gardant
 * toujours les sept journées dans l'ordre dimanche → samedi.
 */
export function setWeeklyProgramDay(
  program: Omit<WeeklyProgram, "id">,
  weekday: Weekday,
  sessionTemplateId: Id | undefined,
  now: string,
): Omit<WeeklyProgram, "id"> {
  const days = weekdays.map((day) => {
    const templateId =
      day === weekday
        ? sessionTemplateId
        : getProgramTemplateFor(program, day);

    return templateId
      ? { weekday: day, sessionTemplateId: templateId }
      : { weekday: day };
  });

  return { ...program, days, updatedAt: now };
}

/**
 * Retire un modèle de toutes les journées où il figure.
 * Sert à l'archivage : un modèle archivé ne peut plus générer de séances.
 */
export function removeTemplateFromWeeklyProgram(
  program: Omit<WeeklyProgram, "id">,
  sessionTemplateId: Id,
  now: string,
): Omit<WeeklyProgram, "id"> {
  return {
    ...program,
    days: program.days.map((day) =>
      day.sessionTemplateId === sessionTemplateId
        ? { weekday: day.weekday }
        : day,
    ),
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Actions par statut                                                         */
/* -------------------------------------------------------------------------- */

export type PlannedSessionAction =
  | "start"
  | "recap"
  | "detail"
  | "move"
  | "replace"
  | "skip"
  | "restore"
  | "duplicate"
  | "remove";

export interface PlannedSessionActionEntry {
  action: PlannedSessionAction;
  label: string;
  /**
   * Raison d'une action indisponible : elle est grisée, jamais masquée (§9).
   */
  unavailableReason?: string;
}

/**
 * Menu d'une occurrence, dans l'ordre du mockup (p. 23) : sur une séance
 * sautée, `Démarrer` vient en premier ; sur une séance faite ou en cours,
 * `Retirer` reste visible avec sa raison.
 */
export function listPlannedSessionActions(
  session: PlannedSession,
): PlannedSessionActionEntry[] {
  const remove: PlannedSessionActionEntry = {
    action: "remove",
    label: `Retirer du ${formatDayAndMonth(session.date)}`,
  };
  const detail: PlannedSessionActionEntry = {
    action: "detail",
    label: "Voir le détail de la séance",
  };
  const duplicate: PlannedSessionActionEntry = {
    action: "duplicate",
    label: "Dupliquer cette séance",
  };

  switch (session.status) {
    case "upcoming":
      return [
        { action: "start", label: "Démarrer la séance" },
        detail,
        { action: "move", label: "Déplacer à un autre jour" },
        { action: "replace", label: "Remplacer par une autre séance" },
        { action: "skip", label: "Marquer comme sautée" },
        duplicate,
        remove,
      ];

    case "in_progress":
      return [
        { action: "start", label: "Reprendre la séance" },
        detail,
        duplicate,
        {
          ...remove,
          unavailableReason: "Non disponible (séance en cours)",
        },
      ];

    case "done":
      return [
        { action: "recap", label: "Voir le récapitulatif" },
        detail,
        duplicate,
        {
          ...remove,
          unavailableReason: "Non disponible (séance déjà réalisée)",
        },
      ];

    case "skipped":
      return [
        { action: "start", label: "Démarrer la séance" },
        detail,
        { action: "move", label: "Déplacer à un autre jour" },
        { action: "replace", label: "Remplacer par une autre séance" },
        { action: "restore", label: "Remettre en À venir" },
        duplicate,
        remove,
      ];
  }
}

/* -------------------------------------------------------------------------- */
/* Déplacer avec conflit (conception V2 § 2.7, lot F.2)                        */
/* -------------------------------------------------------------------------- */

/**
 * `Échanger` : les deux instances échangent leurs dates, avec leurs tests ;
 * `Faire les deux` : elles coexistent ; `Remplacer` : l'instance visée est
 * retirée, ses tests restent attachés (« à replanifier », état dérivé, D26).
 */
export type MoveChoice = "swap" | "both" | "replace";

/** Créneau d'une instance ; absent = la journée. */
export function slotOf(session: Pick<PlannedSession, "slot">): NonNullable<PlannedSession["slot"]> {
  return session.slot ?? "day";
}

/**
 * L'instance du jour visé qui entre en conflit : visible, autre que celle
 * qu'on déplace, du **même créneau**. La plus ancienne si plusieurs.
 */
export function findMoveConflict(
  moving: PlannedSession,
  date: string,
  sessions: ReadonlyArray<PlannedSession>,
): PlannedSession | undefined {
  return sessions
    .filter(
      (session) =>
        !session.removedAt &&
        session.id !== moving.id &&
        session.date === date &&
        slotOf(session) === slotOf(moving),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

/** Une instance faite ou en cours n'est jamais échangée ni remplacée. */
export function isLockedPlannedSession(session: Pick<PlannedSession, "status">): boolean {
  return session.status === "done" || session.status === "in_progress";
}

export function allowedMoveChoices(target: PlannedSession): MoveChoice[] {
  return isLockedPlannedSession(target) ? ["both"] : ["swap", "both", "replace"];
}

/** `jeu. 24 sept.` — un jour de la feuille Déplacer. */
export function formatShortDay(date: string): string {
  return formatFr(date, "EEE d MMM");
}

/**
 * Le bouton du bas reprend le choix fait : `Déplacer sur jeu. 24 sept.`,
 * `Échanger avec Muscu C`, `Faire les deux le jeu. 24 sept.`,
 * `Remplacer Muscu C`.
 */
export function formatMoveConfirmLabel(
  date: string,
  conflictName: string | undefined,
  choice: MoveChoice | undefined,
): string {
  if (conflictName === undefined) return `Déplacer sur ${formatShortDay(date)}`;

  switch (choice) {
    case "swap":
      return `Échanger avec ${conflictName}`;
    case "both":
      return `Faire les deux le ${formatShortDay(date)}`;
    case "replace":
      return `Remplacer ${conflictName}`;
    default:
      return "Choisissez que faire";
  }
}
