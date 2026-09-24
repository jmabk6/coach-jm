import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  CalendarCog,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  Plus,
} from "lucide-react";
import { addDays, addMonths, parseISO } from "date-fns";
import type { Id, PlannedSession, SessionBlock, SessionTemplate, WorkoutSession } from "../../domain";
import { estimateSessionTemplateDurationSec } from "../../domain/rules/sessionTemplateRules";
import { summarizeMonth } from "./monthSummary";
import {
  formatDayLabel,
  formatFullDate,
  formatLocalDate,
  formatMonthTitle,
  formatWeekRange,
  getWeekEndDate,
  getWeekStartDate,
  isFutureWeek,
  listWeekDates,
  weekdays,
  weekdayShortLabels,
  type MoveChoice,
  type PlannedSessionAction,
} from "../../domain/rules/programRules";
import { MoveSheet } from "./MoveSheet";
import { removePlannedSession } from "../../db/repositories/programRepository";
import {
  addPlannedSession,
  duplicatePlannedSession,
  moveWithChoice,
  replacePlannedSession,
  restorePlannedSession,
  skipPlannedSession,
} from "./plannedSessionActions";
import {
  getDisplayedPlannedSessionStatus,
  type DisplayedPlannedSessionStatus,
} from "../../domain/rules/todayRules";
import { startWorkout } from "../workout/startWorkout";
import { useProgramData, type ProgramData, type ProgramEntry } from "./useProgramData";
import { FreeWorkoutRow, PlannedSessionRow } from "./PlannedSessionRow";
import {
  DateSheet,
  FreeWorkoutMenu,
  PlannedSessionMenu,
  TemplateSheet,
} from "./ProgramSheets";
import "./ProgramScreen.css";
import { paths } from "../../app/paths";

type ProgramView = "week" | "month";

/**
 * Un seul flux modal à la fois : menu d'une occurrence, choix d'une date,
 * choix d'un modèle. L'ajout enchaîne date puis modèle.
 */
type Flow =
  | { kind: "menu"; session: PlannedSession }
  | { kind: "free-menu"; workout: WorkoutSession }
  | { kind: "move"; session: PlannedSession }
  | { kind: "replace"; session: PlannedSession }
  | { kind: "duplicate"; session: PlannedSession }
  | { kind: "add-date"; initialDate: string }
  | { kind: "add-template"; date: string };

function today(): string {
  return formatLocalDate(new Date());
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Écran Programme (§9, mockups p. 23 et 33–34) : deux vues du même
 * planning, `Semaine` et `Mois`, même source, mêmes instances, mêmes
 * statuts, mêmes actions. La date de référence vit dans l'URL (`date`),
 * le mois affiché aussi (`month`) : un retour revient au même endroit.
 */
export function ProgramScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flow, setFlow] = useState<Flow>();
  const [actionError, setActionError] = useState<string>();

  const openRecap = (workoutId: string) =>
    navigate(
      `/workouts/${workoutId}?returnTo=${encodeURIComponent(
        `${location.pathname}${location.search}`,
      )}`,
    );

  const view: ProgramView = searchParams.get("view") === "mois" ? "month" : "week";
  const focusDate = searchParams.get("date") ?? today();
  const monthStart =
    searchParams.get("month") ?? `${focusDate.slice(0, 7)}-01`;

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  }

  /* Plage chargée et semaines à générer, selon la vue. */
  const range = useMemo(() => {
    if (view === "week") {
      const weekStart = getWeekStartDate(focusDate);

      return {
        start: weekStart,
        end: getWeekEndDate(weekStart),
        weeks: [weekStart],
      };
    }

    const gridStart = getWeekStartDate(monthStart);
    const monthEnd = formatLocalDate(
      addDays(addMonths(parseISO(monthStart), 1), -1),
    );
    const weeks: string[] = [];
    let lastWeek = gridStart;

    for (
      let week = gridStart;
      week <= monthEnd;
      week = formatLocalDate(addDays(parseISO(week), 7))
    ) {
      weeks.push(week);
      lastWeek = week;
    }

    return {
      start: gridStart,
      end: getWeekEndDate(lastWeek),
      weeks,
    };
  }, [view, focusDate, monthStart]);

  const now = today();
  const { state, reload } = useProgramData(
    range.start,
    range.end,
    range.weeks.filter((week) => isFutureWeek(week, now)),
  );

  const activeTemplates = useMemo(
    () =>
      state.status === "success"
        ? [...state.templateById.values()]
            .filter((template) => template.status === "active")
            .sort((a, b) => a.position - b.position)
        : [],
    [state],
  );

  async function run(action: () => Promise<unknown>) {
    setFlow(undefined);
    setActionError(undefined);

    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Action impossible",
      );
    }

    reload();
  }

  function handleMenuAction(session: PlannedSession, action: PlannedSessionAction) {
    switch (action) {
      case "detail":
        navigate(paths.session(session.sessionTemplateId));
        return;
      case "move":
        setFlow({ kind: "move", session });
        return;
      case "replace":
        setFlow({ kind: "replace", session });
        return;
      case "duplicate":
        setFlow({ kind: "duplicate", session });
        return;
      case "skip":
        void run(() => skipPlannedSession(session.id));
        return;
      case "restore":
        void run(() => restorePlannedSession(session.id));
        return;
      case "remove":
        void run(() => removePlannedSession(session.id));
        return;
      case "recap":
        if (session.workoutId) openRecap(session.workoutId);
        return;
      case "start":
        if (session.status === "in_progress") {
          navigate(paths.workoutLive());
          return;
        }

        void run(async () => {
          await startWorkout(session.id);
          navigate(paths.workoutLive());
        });
        return;
    }
  }

  const openMenu = (session: PlannedSession) => {
    setActionError(undefined);
    setFlow({ kind: "menu", session });
  };
  const openFreeMenu = (workout: WorkoutSession) =>
    setFlow({ kind: "free-menu", workout });
  const addOn = (date: string) => setFlow({ kind: "add-template", date });

  return (
    <section className="program-screen">
      <header className="program-screen__header">
        <h1>Planning</h1>
        <div
          role="group"
          aria-label="Vue"
          className="program-screen__views"
        >
          {(["week", "month"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`program-screen__view ${
                view === item ? "program-screen__view--active" : ""
              }`}
              aria-pressed={view === item}
              onClick={() =>
                updateParams((params) => {
                  if (item === "month") params.set("view", "mois");
                  else params.delete("view");
                  params.delete("month");
                })
              }
            >
              {item === "week" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>
      </header>

      {actionError && (
        <p className="program-screen__message program-screen__message--error">
          {actionError}
        </p>
      )}

      {state.status === "loading" && (
        <p className="program-screen__message">Chargement du Planning…</p>
      )}

      {state.status === "error" && (
        <p className="program-screen__message program-screen__message--error">
          {state.message}
        </p>
      )}

      {state.status === "success" && view === "week" && (
        <WeekView
          data={state}
          weekStart={range.start}
          today={now}
          onChangeWeek={(weekStart) =>
            updateParams((params) =>
              params.set(
                "date",
                weekStart === getWeekStartDate(now) ? now : weekStart,
              ),
            )
          }
          onOpenMenu={openMenu}
          onOpenFreeMenu={openFreeMenu}
          onAddOn={addOn}
          onAdd={() =>
            setFlow({
              kind: "add-date",
              initialDate:
                getWeekStartDate(now) === range.start ? now : range.start,
            })
          }
        />
      )}

      {state.status === "success" && view === "month" && (
        <MonthView
          data={state}
          monthStart={monthStart}
          gridStart={range.start}
          gridEnd={range.end}
          selectedDate={focusDate}
          today={now}
          onChangeMonth={(month) =>
            updateParams((params) => params.set("month", month))
          }
          onSelectDate={(date) =>
            updateParams((params) => {
              params.set("date", date);
              params.delete("month");
              if (date.slice(0, 7) !== monthStart.slice(0, 7)) {
                params.set("month", `${date.slice(0, 7)}-01`);
              }
            })
          }
          onToday={() =>
            updateParams((params) => {
              params.set("date", now);
              params.delete("month");
            })
          }
          onOpenMenu={openMenu}
          onOpenFreeMenu={openFreeMenu}
          onAddOn={addOn}
        />
      )}

      {state.status === "success" && flow && (
        <ProgramFlow
          flow={flow}
          data={state}
          activeTemplates={activeTemplates}
          onMenuAction={handleMenuAction}
          onMove={(session, date, choice) =>
            void run(() => moveWithChoice(session.id, date, choice))
          }
          onSkip={(session) => void run(() => skipPlannedSession(session.id))}
          onReplace={(session, templateId) =>
            void run(() => replacePlannedSession(session.id, templateId))
          }
          onDuplicate={(session, date) =>
            void run(() => duplicatePlannedSession(session.id, date))
          }
          onAddDate={(date) => setFlow({ kind: "add-template", date })}
          onAdd={(date, templateId) =>
            void run(() => addPlannedSession(date, templateId))
          }
          onOpenRecap={openRecap}
          onDismiss={() => setFlow(undefined)}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Vue Semaine                                                                */
/* -------------------------------------------------------------------------- */

interface WeekViewProps {
  data: ProgramData;
  weekStart: string;
  today: string;
  onChangeWeek: (weekStart: string) => void;
  onOpenMenu: (session: PlannedSession) => void;
  onOpenFreeMenu: (workout: WorkoutSession) => void;
  onAddOn: (date: string) => void;
  onAdd: () => void;
}

/**
 * Ligne d'une entrée du planning, identique en Semaine et sous la grille
 * du Mois.
 */
function EntryRow({
  entry,
  data,
  onOpenMenu,
  onOpenFreeMenu,
}: {
  entry: ProgramEntry;
  data: ProgramData;
  onOpenMenu: (session: PlannedSession) => void;
  onOpenFreeMenu: (workout: WorkoutSession) => void;
}) {
  if (entry.kind === "free") {
    return (
      <FreeWorkoutRow
        workout={entry.workout}
        exerciseById={data.exerciseById}
        onOpenMenu={onOpenFreeMenu}
      />
    );
  }

  return (
    <PlannedSessionRow
      session={entry.session}
      template={data.templateById.get(entry.session.sessionTemplateId)}
      durationLabel={data.durationLabel(entry.session.sessionTemplateId)}
      onOpenMenu={onOpenMenu}
    />
  );
}

function entryKey(entry: ProgramEntry): string {
  return entry.kind === "free" ? `free-${entry.workout.id}` : entry.session.id;
}

function isEvening(entry: ProgramEntry): boolean {
  return entry.kind === "planned" && entry.session.slot === "evening";
}

function entryStatus(entry: ProgramEntry): DisplayedPlannedSessionStatus {
  return entry.kind === "free"
    ? "done"
    : getDisplayedPlannedSessionStatus(entry.session, today());
}

function describeWeek(weekStart: string, today: string): string {
  const currentWeekStart = getWeekStartDate(today);
  const offset = Math.round(
    (parseISO(weekStart).getTime() - parseISO(currentWeekStart).getTime()) /
      (7 * 24 * 3600 * 1000),
  );

  if (offset === 0) return "Semaine actuelle";
  if (offset === 1) return "Semaine suivante";
  if (offset === -1) return "Semaine précédente";
  if (offset > 1) return `Dans ${offset} semaines`;

  return `Il y a ${-offset} semaines`;
}

/**
 * Une liste de jours datés, jamais une grille abstraite (§9). Une semaine
 * future porte le bandeau de génération automatique.
 */
function WeekView({
  data,
  weekStart,
  today,
  onChangeWeek,
  onOpenMenu,
  onOpenFreeMenu,
  onAddOn,
  onAdd,
}: WeekViewProps) {
  const dates = listWeekDates(weekStart);
  const isCurrentWeek = getWeekStartDate(today) === weekStart;
  const futureWeek = isFutureWeek(weekStart, today);

  return (
    <>
      <p className="program-screen__subtitle">{formatWeekRange(weekStart)}</p>

      <nav className="program-nav" aria-label="Semaine">
        <button
          type="button"
          className="program-nav__arrow"
          aria-label="Semaine précédente"
          onClick={() =>
            onChangeWeek(formatLocalDate(addDays(parseISO(weekStart), -7)))
          }
        >
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="program-nav__current"
          disabled={isCurrentWeek}
          title={isCurrentWeek ? undefined : "Revenir à la semaine actuelle"}
          onClick={() => onChangeWeek(getWeekStartDate(today))}
        >
          {describeWeek(weekStart, today)}
        </button>

        <button
          type="button"
          className="program-nav__arrow"
          aria-label="Semaine suivante"
          onClick={() =>
            onChangeWeek(formatLocalDate(addDays(parseISO(weekStart), 7)))
          }
        >
          <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </nav>

      {futureWeek && (
        <p className="program-banner">
          <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>Semaine générée automatiquement</strong>
            <br />
            Selon votre programmation hebdomadaire.
          </span>
        </p>
      )}

      <ol className="program-week">
        {dates.map((date) => {
          const entries = data.entries.filter((entry) => entry.date === date);
          /* Créneau Soir (conception V2 § 2.7) : la routine du soir sous la journée. */
          const evening = entries.filter(isEvening);
          const daytime = entries.filter((entry) => !isEvening(entry));
          const label = formatDayLabel(date);

          return (
            <li
              key={date}
              className={`program-day ${
                date === today ? "program-day--today" : ""
              }`}
            >
              <span className="program-day__label">
                <span className="program-day__weekday">{label.weekday}</span>
                <span className="program-day__date">{label.day}</span>
              </span>

              <div className="program-day__content">
                {daytime.length === 0 ? (
                  <div className="program-day__empty">
                    <span>Repos</span>
                    <button
                      type="button"
                      className="program-day__add"
                      aria-label={`Ajouter une séance le ${formatFullDate(date)}`}
                      onClick={() => onAddOn(date)}
                    >
                      <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  daytime.map((entry) => (
                    <EntryRow
                      key={entryKey(entry)}
                      entry={entry}
                      data={data}
                      onOpenMenu={onOpenMenu}
                      onOpenFreeMenu={onOpenFreeMenu}
                    />
                  ))
                )}

                {evening.length > 0 && (
                  <>
                    <span className="program-day__slot">Soir</span>
                    {evening.map((entry) => (
                      <EntryRow
                        key={entryKey(entry)}
                        entry={entry}
                        data={data}
                        onOpenMenu={onOpenMenu}
                        onOpenFreeMenu={onOpenFreeMenu}
                      />
                    ))}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <button type="button" className="program-screen__primary" onClick={onAdd}>
        <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
        Ajouter une séance
      </button>

      <Link to={paths.weeklyProgram()} className="program-screen__rule-link">
        <CalendarCog size={22} strokeWidth={2} aria-hidden="true" />
        <span>
          <span className="program-screen__rule-title">
            Modifier la programmation
          </span>
          <span className="program-screen__rule-meta">
            Règle hebdomadaire · semaines futures
          </span>
        </span>
      </Link>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Vue Mois                                                                   */
/* -------------------------------------------------------------------------- */

interface MonthViewProps {
  data: ProgramData;
  monthStart: string;
  gridStart: string;
  gridEnd: string;
  selectedDate: string;
  today: string;
  onChangeMonth: (monthStart: string) => void;
  onSelectDate: (date: string) => void;
  onToday: () => void;
  onOpenMenu: (session: PlannedSession) => void;
  onOpenFreeMenu: (workout: WorkoutSession) => void;
  onAddOn: (date: string) => void;
}

const legend: { status: DisplayedPlannedSessionStatus; label: string }[] = [
  { status: "done", label: "Faite" },
  { status: "in_progress", label: "En cours" },
  { status: "today", label: "Aujourd'hui" },
  { status: "upcoming", label: "À venir" },
  { status: "skipped", label: "Sautée" },
];

/**
 * Grille dimanche → samedi (lot B) : un marqueur neutre par séance, une seule
 * famille de formes, aucun agrégat. Aujourd'hui garde son contour quel
 * que soit son statut, même sélectionné.
 */
function MonthView({
  data,
  monthStart,
  gridStart,
  gridEnd,
  selectedDate,
  today,
  onChangeMonth,
  onSelectDate,
  onToday,
  onOpenMenu,
  onOpenFreeMenu,
  onAddOn,
}: MonthViewProps) {
  const month = monthStart.slice(0, 7);
  const dates: string[] = [];

  for (
    let date = gridStart;
    date <= gridEnd;
    date = formatLocalDate(addDays(parseISO(date), 1))
  ) {
    dates.push(date);
  }

  const entriesByDate = new Map<string, ProgramEntry[]>();

  /* M3 : le passé montre les séances réalisées, le futur les planifiées,
     aujourd'hui les deux. */
  for (const entry of data.entries.filter((item) => isVisibleInMonth(item, today))) {
    const list = entriesByDate.get(entry.date) ?? [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
  }

  const selectedEntries = entriesByDate.get(selectedDate) ?? [];

  return (
    <>
      <nav className="program-nav program-nav--month" aria-label="Mois">
        <button
          type="button"
          className="program-nav__arrow"
          aria-label="Mois précédent"
          onClick={() =>
            onChangeMonth(formatLocalDate(addMonths(parseISO(monthStart), -1)))
          }
        >
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>

        <h2 className="program-nav__title">{formatMonthTitle(monthStart)}</h2>

        <button
          type="button"
          className="program-nav__arrow"
          aria-label="Mois suivant"
          onClick={() =>
            onChangeMonth(formatLocalDate(addMonths(parseISO(monthStart), 1)))
          }
        >
          <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="program-nav__today"
          onClick={onToday}
        >
          Aujourd'hui
        </button>
      </nav>

      <div className="program-month" role="grid" aria-label={formatMonthTitle(monthStart)}>
        <div className="program-month__weekdays" role="row">
          {weekdays.map((weekday) => (
            <span key={weekday} role="columnheader">
              {weekdayShortLabels[weekday]}
            </span>
          ))}
        </div>

        <div className="program-month__grid">
          {dates.map((date) => {
            const sessions = entriesByDate.get(date) ?? [];
            const outside = date.slice(0, 7) !== month;
            const classes = [
              "program-month__day",
              outside ? "program-month__day--outside" : "",
              date === today ? "program-month__day--today" : "",
              date === selectedDate ? "program-month__day--selected" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                className={classes}
                aria-selected={date === selectedDate}
                aria-label={`${formatFullDate(date)}${
                  sessions.length > 0
                    ? `, ${sessions.length} séance${sessions.length > 1 ? "s" : ""}`
                    : ""
                }`}
                onClick={() => onSelectDate(date)}
              >
                <span className="program-month__number">
                  {Number(date.slice(8, 10))}
                </span>
                <span className="program-month__markers">
                  {sessions.map((entry) => (
                    <span
                      key={entryKey(entry)}
                      className={`program-marker program-marker--${entryStatus(entry)}`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="program-legend" aria-label="Légende">
        {legend.map((item) => (
          <li key={item.status}>
            <span className={`program-marker program-marker--${item.status}`} />
            {item.label}
          </li>
        ))}
      </ul>

      <section className="program-selected" aria-live="polite">
        <h2>{capitalize(formatFullDate(selectedDate))}</h2>

        {selectedEntries.map((entry) => (
          <div key={entryKey(entry)} className="program-selected__entry">
            <EntryRow
              entry={entry}
              data={data}
              onOpenMenu={onOpenMenu}
              onOpenFreeMenu={onOpenFreeMenu}
            />
            <DayCard entry={entry} data={data} />
          </div>
        ))}

        {selectedEntries.length === 0 && (
          <p className="program-selected__empty">Repos</p>
        )}

        <button
          type="button"
          className="program-selected__add"
          onClick={() => onAddOn(selectedDate)}
        >
          <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>Ajouter une séance ce jour</span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </section>

      <MonthSummaryCard data={data} monthStart={monthStart} today={today} />
    </>
  );
}

/** M3 : passé = réalisées (confirmées), futur = planifiées, aujourd'hui les deux. */
function isVisibleInMonth(entry: ProgramEntry, today: string): boolean {
  if (entry.date >= today) return true;
  return entry.kind === "free" || entry.session.status === "done";
}

function blockName(block: SessionBlock, data: ProgramData, index: number): string {
  if (block.kind === "exercise") return data.exerciseById.get(block.exerciseId)?.name ?? "Exercice";
  if (block.kind === "group") return block.name || `Groupe ${index + 1}`;
  return "Note";
}

/**
 * Fiche d'un jour (M3) : une séance à faire montre ses blocs avec leur
 * durée estimée et « Voir le détail » ; une séance faite, son récapitulatif.
 */
function DayCard({ entry, data }: { entry: ProgramEntry; data: ProgramData }) {
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;

  if (entry.kind === "free" || entry.session.status === "done" || entry.session.status === "in_progress") {
    const workoutId = entry.kind === "free" ? entry.workout.id : entry.session.workoutId;
    return workoutId ? (
      <Link className="program-day-card__link" to={`/workouts/${workoutId}?returnTo=${encodeURIComponent(here)}`}>
        <span>Voir le récapitulatif</span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    ) : null;
  }

  const template = data.templateById.get(entry.session.sessionTemplateId);
  if (!template) return null;
  const blocks = [...template.blocks].sort((a, b) => a.position - b.position).filter((block) => block.kind !== "note");

  return (
    <div className="program-day-card">
      {blocks.length > 0 ? (
        <ol className="program-day-card__blocks" aria-label="Blocs de la séance">
          {blocks.map((block, index) => (
            <li key={block.id}>
              <span className="program-day-card__number">{index + 1}</span>
              <span className="program-day-card__name">{blockName(block, data, index)}</span>
              <span className="program-day-card__duration">
                ≈ {Math.max(1, Math.round(estimateSessionTemplateDurationSec([block]) / 60))} min
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="program-selected__empty">Contenu à définir.</p>
      )}
      <Link className="program-day-card__link" to={paths.session(template.id)}>
        <span>Voir le détail de cette séance</span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Résumé du mois (§ 5.8, N8) et accès à l'historique. */
function MonthSummaryCard({ data, monthStart, today }: { data: ProgramData; monthStart: string; today: string }) {
  const summary = summarizeMonth(data.completedWorkouts, monthStart, today, data.templateById, data.exerciseById);
  const plural = (count: number) => (count > 1 ? "s" : "");

  return (
    <section className="program-summary" aria-label="Résumé du mois">
      <h2 className="program-summary__title">
        <BarChart3 size={20} strokeWidth={2} aria-hidden="true" />
        Résumé de {formatMonthTitle(monthStart).toLocaleLowerCase("fr-FR")}
      </h2>
      <div className="program-summary__grid">
        <p className="program-summary__figure">
          <strong>{summary.total}</strong>
          <span>séance{plural(summary.total)} réalisée{plural(summary.total)}</span>
        </p>
        <p className="program-summary__figure">
          <strong>{summary.daysWithoutSession}</strong>
          <span>jour{plural(summary.daysWithoutSession)} sans séance</span>
        </p>
        <ul className="program-summary__lines" aria-label="Types de séances">
          <li>
            <span className="program-summary__dot program-summary__dot--musculation" />
            Musculation <strong>{summary.musculation}</strong>
          </li>
          <li>
            <span className="program-summary__dot program-summary__dot--cardio" />
            Cardio <strong>{summary.cardio}</strong>
          </li>
          <li>
            <span className="program-summary__dot program-summary__dot--routine" />
            Routine <strong>{summary.routine}</strong>
          </li>
        </ul>
      </div>
      {summary.mobility > 0 && (
        <p className="program-summary__note">
          Dont {summary.mobility} séance{plural(summary.mobility)} de mobilité, comptée{plural(summary.mobility)} au total seulement.
        </p>
      )}
      <Link to={paths.history()} className="program-summary__history">
        <History size={18} strokeWidth={2} aria-hidden="true" />
        <span>Voir l'historique</span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Flux modaux                                                                */
/* -------------------------------------------------------------------------- */

interface ProgramFlowProps {
  flow: Flow;
  data: ProgramData;
  activeTemplates: SessionTemplate[];
  onMenuAction: (session: PlannedSession, action: PlannedSessionAction) => void;
  onMove: (session: PlannedSession, date: string, choice: MoveChoice | undefined) => void;
  onSkip: (session: PlannedSession) => void;
  onReplace: (session: PlannedSession, templateId: Id) => void;
  onDuplicate: (session: PlannedSession, date: string) => void;
  onAddDate: (date: string) => void;
  onAdd: (date: string, templateId: Id) => void;
  onOpenRecap: (workoutId: string) => void;
  onDismiss: () => void;
}

function ProgramFlow({
  flow,
  data,
  activeTemplates,
  onMenuAction,
  onMove,
  onSkip,
  onReplace,
  onDuplicate,
  onAddDate,
  onAdd,
  onOpenRecap,
  onDismiss,
}: ProgramFlowProps) {
  const templateName = (session: PlannedSession) =>
    data.templateById.get(session.sessionTemplateId)?.name ?? "Séance";

  switch (flow.kind) {
    case "menu":
      return (
        <PlannedSessionMenu
          session={flow.session}
          templateName={templateName(flow.session)}
          onAction={(action) => onMenuAction(flow.session, action)}
          onDismiss={onDismiss}
        />
      );

    case "free-menu":
      return (
        <FreeWorkoutMenu
          workout={flow.workout}
          onOpenRecap={(workout) => onOpenRecap(workout.id)}
          onDismiss={onDismiss}
        />
      );

    case "move":
      return (
        <MoveSheet
          session={flow.session}
          templateById={data.templateById}
          today={today()}
          onConfirm={(date, choice) => onMove(flow.session, date, choice)}
          onSkip={flow.session.status === "upcoming" ? () => onSkip(flow.session) : undefined}
          onDismiss={onDismiss}
        />
      );

    case "duplicate":
      return (
        <DateSheet
          title="Dupliquer cette séance"
          message={`Une nouvelle séance ${templateName(flow.session)}, la séance d'origine reste inchangée.`}
          initialDate={flow.session.date}
          confirmLabel={() => "Ajouter la séance"}
          onConfirm={(date) => onDuplicate(flow.session, date)}
          onDismiss={onDismiss}
        />
      );

    case "replace":
      return (
        <TemplateSheet
          title="Remplacer par une autre séance"
          message={`Le ${formatFullDate(flow.session.date)}, à la place de ${templateName(flow.session)}. La règle hebdomadaire n'est pas modifiée.`}
          templates={activeTemplates.filter(
            (template) => template.id !== flow.session.sessionTemplateId,
          )}
          durationLabel={data.durationLabel}
          onPick={(templateId) => {
            if (templateId) onReplace(flow.session, templateId);
          }}
          onDismiss={onDismiss}
        />
      );

    case "add-date":
      return (
        <DateSheet
          title="Ajouter une séance"
          message="Une séance ponctuelle, sans toucher à la règle hebdomadaire."
          initialDate={flow.initialDate}
          confirmLabel={() => "Choisir la séance"}
          onConfirm={onAddDate}
          onDismiss={onDismiss}
        />
      );

    case "add-template":
      return (
        <TemplateSheet
          title="Ajouter une séance"
          message={`Le ${formatFullDate(flow.date)}, sans toucher à la règle hebdomadaire.`}
          templates={activeTemplates}
          durationLabel={data.durationLabel}
          onPick={(templateId) => {
            if (templateId) onAdd(flow.date, templateId);
          }}
          onDismiss={onDismiss}
        />
      );
  }
}
