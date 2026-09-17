import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarCog,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { addDays, addMonths, parseISO } from "date-fns";
import type { Id, PlannedSession, SessionTemplate, WorkoutSession } from "../../domain";
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
  type PlannedSessionAction,
} from "../../domain/rules/programRules";
import { removePlannedSession } from "../../db/repositories/programRepository";
import {
  addPlannedSession,
  duplicatePlannedSession,
  movePlannedSession,
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
        navigate(`/sessions/${session.sessionTemplateId}`);
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
          navigate("/seance");
          return;
        }

        void run(async () => {
          await startWorkout(session.id);
          navigate("/seance");
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
        <h1>Programme</h1>
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
        <p className="program-screen__message">Chargement du Programme…</p>
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
          onMove={(session, date) =>
            void run(() => movePlannedSession(session.id, date))
          }
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
                {entries.length === 0 ? (
                  <div className="program-day__empty">
                    <span>Aucune séance</span>
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
                  entries.map((entry) => (
                    <EntryRow
                      key={entryKey(entry)}
                      entry={entry}
                      data={data}
                      onOpenMenu={onOpenMenu}
                      onOpenFreeMenu={onOpenFreeMenu}
                    />
                  ))
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

      <Link to="/programme/programmation" className="program-screen__rule-link">
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
  { status: "upcoming", label: "À venir" },
  { status: "not_performed", label: "Non réalisée" },
  { status: "skipped", label: "Sautée" },
];

/**
 * Grille lundi → dimanche (§9) : un marqueur neutre par séance, une seule
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

  for (const entry of data.entries) {
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
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
            <span key={label} role="columnheader">
              {label}
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
          <EntryRow
            key={entryKey(entry)}
            entry={entry}
            data={data}
            onOpenMenu={onOpenMenu}
            onOpenFreeMenu={onOpenFreeMenu}
          />
        ))}

        {selectedEntries.length === 0 && (
          <p className="program-selected__empty">Aucune séance</p>
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
    </>
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
  onMove: (session: PlannedSession, date: string) => void;
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
        <DateSheet
          title="Déplacer à un autre jour"
          message={`${templateName(flow.session)} — ${formatFullDate(flow.session.date)}. La règle hebdomadaire n'est pas modifiée.`}
          initialDate={flow.session.date}
          confirmLabel={() => "Déplacer la séance"}
          onConfirm={(date) => onMove(flow.session, date)}
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
