import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Info,
  PersonStanding,
  Play,
  Plus,
} from "lucide-react";
import type { Id, PlannedSession, SessionTemplate, WorkoutKind } from "../../domain";
import { calculateExecutionProgress } from "../../domain/rules/workoutRules";
import { formatDayLabel } from "../../domain/rules/programRules";
import {
  formatSessionTemplateCardioLine,
  formatSessionTemplateDuration,
  formatSessionTemplateSummary,
  startBlockedReason,
  summarizeSessionTemplate,
} from "../../domain/rules/sessionTemplateRules";
import {
  formatDurationSource,
  formatTodayTitle,
  type TodayEntry,
} from "../../domain/rules/todayRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import { formatClock } from "../workout/workoutRecap";
import { currentActiveDurationSec } from "../workout/finishWorkout";
import { getOpenPause } from "../workout/engine/workoutTime";
import { startFreeWorkout } from "../workout/startFreeWorkout";
import { startWorkout } from "../workout/startWorkout";
import { categoryForWorkout } from "../program/freeWorkouts";
import { useTodayData, type TodayData } from "./useTodayData";
import "./TodayScreen.css";
import { paths } from "../../app/paths";
import { WeightCard } from "../weight/WeightCard";
import { MeasurementsCard } from "../weight/MeasurementsCard";

/**
 * Aujourd'hui (§10, mockups 21–22) : la journée telle qu'elle est
 * réellement — séance prévue, en cours, faite, ou repos — puis les
 * prochaines séances. Le Programme, lui, garde le prévu.
 */
export function TodayScreen() {
  const navigate = useNavigate();
  const { state, reload } = useTodayData();
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<unknown>, then?: () => void) {
    try {
      setError(undefined);
      await action();
      then?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Action impossible",
      );
      reload();
    }
  }

  if (state.status === "loading") {
    return (
      <section className="today">
        <TodayHeader />
        <p className="today__message">Chargement de la journée…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="today">
        <TodayHeader />
        <p className="today__message today__message--error">{state.message}</p>
      </section>
    );
  }

  const data = state;
  const inProgress = data.state.kind === "in_progress";
  const canChoose = !inProgress && data.state.kind !== "planned";

  const startPlanned = (session: PlannedSession) =>
    run(
      () => startWorkout(session.id),
      () => navigate(paths.workoutLive()),
    );

  const startFree = (template?: SessionTemplate, kind?: WorkoutKind) =>
    run(
      () => startFreeWorkout(data.today, new Date().toISOString(), template, kind ? { kind } : {}),
      () => navigate(paths.workoutLive()),
    );

  return (
    <section className="today">
      <TodayHeader date={data.today} />

      {error && <p className="today__message today__message--error">{error}</p>}

      {data.state.kind === "rest" && <RestCard />}

      {data.state.entries.map((entry) => (
        <TodayEntryCard
          key={entryKey(entry)}
          entry={entry}
          data={data}
          onStart={startPlanned}
        />
      ))}

      {/* Pesée du jour (lot I.1). */}
      <WeightCard today={data.today} />
      {/* Mensurations du matin, le lundi d'une semaine de tests (lot I.3). */}
      <MeasurementsCard today={data.today} />

      <NextSessions data={data} />

      {canChoose && (
        <section className="today-card today-card--soft">
          <h2 className="today-card__title">
            {data.state.kind === "rest"
              ? "Envie d'une séance supplémentaire ?"
              : "Une autre séance aujourd'hui ?"}
          </h2>
          <p className="today-card__text">
            Choisis un modèle de séance, ou pars d'une séance libre.
          </p>
          <button
            type="button"
            className="today__secondary"
            onClick={() => setChoosing(true)}
          >
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            Choisir une séance
          </button>
        </section>
      )}

      {choosing && (
        <ChooseSessionSheet
          data={data}
          onChoose={(template, kind) => {
            setChoosing(false);
            void startFree(template, kind);
          }}
          onDismiss={() => setChoosing(false)}
        />
      )}
    </section>
  );
}

function entryKey(entry: TodayEntry): string {
  return entry.kind === "planned"
    ? `planned-${entry.session.id}`
    : `${entry.kind}-${entry.workout.id}`;
}

function TodayHeader({ date }: { date?: string }) {
  return (
    <header className="today__header">
      <div>
        <h1>Accueil</h1>
        {date && <p className="today__date">{formatTodayTitle(date)}</p>}
      </div>
      <Link
        to={paths.planning()}
        className="today__calendar"
        aria-label="Voir le planning"
      >
        <CalendarDays size={24} strokeWidth={2} aria-hidden="true" />
      </Link>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Cartes du jour                                                             */
/* -------------------------------------------------------------------------- */

function RestCard() {
  return (
    <section className="today-card">
      <div className="today-card__head">
        <span
          className="today-card__icon session-card__icon session-card__icon--Mobilité"
          aria-hidden="true"
        >
          <PersonStanding size={26} strokeWidth={2} />
        </span>
        <div className="today-card__body">
          <h2 className="today-card__name">Jour de repos</h2>
          <p className="today-card__text">Aucune séance prévue aujourd'hui</p>
        </div>
      </div>
      <p className="today-notice">
        <Info size={18} strokeWidth={2} aria-hidden="true" />
        <span>
          Le repos fait partie de ton programme. Tu peux bien sûr faire une
          séance supplémentaire si tu le souhaites.
        </span>
      </p>
    </section>
  );
}

interface TodayEntryCardProps {
  entry: TodayEntry;
  data: TodayData;
  onStart: (session: PlannedSession) => void;
}

function TodayEntryCard({ entry, data, onStart }: TodayEntryCardProps) {
  if (entry.kind === "planned") {
    return <PlannedCard session={entry.session} data={data} onStart={onStart} />;
  }

  return <WorkoutCard entry={entry} data={data} />;
}

interface PlannedCardProps {
  session: PlannedSession;
  data: TodayData;
  onStart: (session: PlannedSession) => void;
}

function PlannedCard({ session, data, onStart }: PlannedCardProps) {
  const template = data.templateById.get(session.sessionTemplateId);
  const skipped = session.status === "skipped";

  if (!template) {
    return (
      <section className="today-card">
        <p className="today-card__text">Séance supprimée</p>
      </section>
    );
  }

  const summary = summarizeSessionTemplate(template.blocks, data.exerciseById);
  const cardioLine = formatSessionTemplateCardioLine(summary);
  const durationInfo = data.durationOf(template.id);

  return (
    <section className="today-card">
      <Link
        to={`/aujourdhui/apercu/${session.id}`}
        className="today-card__head today-card__head--link"
      >
        <TemplateIcon template={template} />
        <span className="today-card__body">
          <span className="today-card__name">{template.name}</span>
          <span
            className={`today-badge ${
              skipped ? "today-badge--skipped" : "today-badge--planned"
            }`}
          >
            {skipped ? "Sautée" : "Prévue aujourd'hui"}
          </span>
          <span className="today-card__text">
            {formatSessionTemplateSummary(summary, template.description)}
          </span>
          {cardioLine && <span className="today-card__text">{cardioLine}</span>}
        </span>
        <ChevronRight
          className="today-card__chevron"
          size={20}
          strokeWidth={2}
          aria-hidden="true"
        />
      </Link>

      {durationInfo && (
        <p className="today-card__duration">
          <Clock size={20} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>{formatSessionTemplateDuration(durationInfo.duration)}</strong>
            <br />
            <small>
              {formatDurationSource(
                durationInfo.duration.kind,
                durationInfo.completionCount,
              )}
            </small>
          </span>
        </p>
      )}

      <button
        type="button"
        className="today__primary"
        onClick={() => onStart(session)}
      >
        <Play size={18} strokeWidth={2.2} aria-hidden="true" />
        Démarrer la séance
      </button>
    </section>
  );
}

interface WorkoutCardProps {
  entry: Extract<TodayEntry, { kind: "in_progress" | "completed" }>;
  data: TodayData;
}

function WorkoutCard({ entry, data }: WorkoutCardProps) {
  const { workout } = entry;
  const template = workout.sessionTemplateId
    ? data.templateById.get(workout.sessionTemplateId)
    : undefined;
  const name = template?.name ?? "Séance libre";
  const category = categoryForWorkout(workout, template, data.exerciseById);
  const running = entry.kind === "in_progress";
  const openPause = running ? getOpenPause(workout) : undefined;
  const badge = `${
    openPause
      ? `En pause depuis ${formatClock(openPause.startedAt)}`
      : running && workout.endedAt !== undefined
        ? "Terminée, à enregistrer"
        : running
          ? "En cours"
          : "Faite"
  }${entry.supplementary ? " · Supplémentaire" : ""}`;
  const progress = calculateExecutionProgress(workout.blocks);
  const activeSec = currentActiveDurationSec(workout, new Date().toISOString());

  return (
    <section className="today-card">
      <div className="today-card__head">
        <span
          className={`today-card__icon session-card__icon ${categoryClassName("session-card__icon", category)}`}
          aria-hidden="true"
        >
          <SessionCategoryIcon category={category} size={26} />
        </span>
        <div className="today-card__body">
          <h2 className="today-card__name">{name}</h2>
          <span
            className={`today-badge ${
              running ? "today-badge--running" : "today-badge--done"
            }`}
          >
            {badge}
          </span>
          {template && (
            <span className="today-card__text">
              {formatSessionTemplateSummary(
                summarizeSessionTemplate(template.blocks, data.exerciseById),
                template.description,
              )}
            </span>
          )}
        </div>
      </div>

      <dl className="today-stats">
        <div>
          <dt>Débutée à</dt>
          <dd>{formatClock(workout.startedAt)}</dd>
        </div>
        <div>
          <dt>Durée active</dt>
          <dd>{Math.round(activeSec / 60)} min</dd>
        </div>
        <div>
          <dt>Exercices réalisés</dt>
          <dd>
            {progress.completed} sur {progress.total}
          </dd>
        </div>
      </dl>

      {running && (
        <div
          className="today-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
        >
          <span
            style={{
              width:
                progress.total === 0
                  ? "0%"
                  : `${Math.round((progress.completed / progress.total) * 100)}%`,
            }}
          />
        </div>
      )}

      {running && workout.endedAt !== undefined ? (
        <Link to={paths.workoutEnd()} className="today__primary">
          <Play size={18} strokeWidth={2.2} aria-hidden="true" />
          Enregistrer la séance
        </Link>
      ) : running ? (
        <Link to={paths.workoutLive()} className="today__primary">
          <Play size={18} strokeWidth={2.2} aria-hidden="true" />
          {openPause ? "Ouvrir la séance" : "Reprendre la séance"}
        </Link>
      ) : (
        <Link
          to={`/workouts/${workout.id}?returnTo=/`}
          className="today__secondary"
        >
          Voir le récapitulatif
        </Link>
      )}
    </section>
  );
}

function TemplateIcon({ template }: { template: SessionTemplate }) {
  return (
    <span
      className={`today-card__icon session-card__icon ${categoryClassName("session-card__icon", template.category)}`}
      aria-hidden="true"
    >
      <SessionCategoryIcon category={template.category} size={26} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Prochaines séances                                                         */
/* -------------------------------------------------------------------------- */

function NextSessions({ data }: { data: TodayData }) {
  return (
    <section className="today-card">
      <div className="today-card__row">
        <h2 className="today-card__title">Prochaines séances</h2>
        <Link to={paths.planning()} className="today__link">
          Voir le planning
        </Link>
      </div>

      {data.nextSessions.length === 0 ? (
        <p className="today-card__text">
          Aucune séance prévue dans les deux prochaines semaines.
        </p>
      ) : (
        <ul className="today-next">
          {data.nextSessions.map((session) => {
            const template = data.templateById.get(session.sessionTemplateId);
            const day = formatDayLabel(session.date);
            const durationInfo = data.durationOf(session.sessionTemplateId);

            return (
              <li key={session.id}>
                <Link
                  to={paths.planning({ date: session.date })}
                  className="today-next__row"
                >
                  <span className="today-next__day">
                    {day.weekday} {day.day}
                  </span>
                  <span
                    className={`today-next__icon ${
                      template ? categoryClassName("session-card__icon", template.category) : ""
                    }`}
                    aria-hidden="true"
                  >
                    {template && (
                      <SessionCategoryIcon category={template.category} size={18} />
                    )}
                  </span>
                  <span className="today-next__name">
                    {template?.name ?? "Séance supprimée"}
                  </span>
                  <span className="today-next__meta">
                    {durationInfo
                      ? formatSessionTemplateDuration(durationInfo.duration)
                      : ""}
                  </span>
                  <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Choisir une séance                                                         */
/* -------------------------------------------------------------------------- */

interface ChooseSessionSheetProps {
  data: TodayData;
  onChoose: (template?: SessionTemplate, kind?: WorkoutKind) => void;
  onDismiss: () => void;
}

/**
 * Feuille `Choisir une séance` (§10, décision du 17/09/2026) : les modèles
 * actifs — la réalisation copie leurs consignes sans créer d'instance —
 * puis le bilan de mobilité libre (v1.5, § 2.2 : seul endroit où un bilan
 * sans modèle peut naître) et la séance libre sans modèle, qui part vide.
 */
function ChooseSessionSheet({ data, onChoose, onDismiss }: ChooseSessionSheetProps) {
  const durationLabel = (templateId: Id) => {
    const info = data.durationOf(templateId);

    return info ? formatSessionTemplateDuration(info.duration) : "";
  };

  return (
    <BottomSheet
      title="Choisir une séance"
      message="La séance démarre tout de suite. Le planning n'est pas modifié."
      actions={[
        ...data.activeTemplates.map((template) => {
          /* Routine vide : proposée, grisée, avec sa raison (jamais masquée, §9). */
          const blocked = template.category === "Routine" ? startBlockedReason(template) : undefined;

          return {
            label: template.name,
            hint: blocked ?? `${template.category} · ${durationLabel(template.id)}`,
            ...(blocked ? { disabled: true } : {}),
            onSelect: () => onChoose(template),
          };
        }),
        {
          label: "Bilan de mobilité (séance libre)",
          hint: "Part vide ; n'entre pas dans les statistiques d'entraînement",
          onSelect: () => onChoose(undefined, "mobility_assessment"),
        },
        {
          label: "Séance libre sans modèle",
          hint: "Part vide : ajoute les exercices au fil de la séance",
          tone: "primary" as const,
          onSelect: () => onChoose(undefined),
        },
      ]}
      onDismiss={onDismiss}
    />
  );
}
