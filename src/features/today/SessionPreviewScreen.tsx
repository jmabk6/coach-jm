import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight,
  Clock,
  FileText,
  Info,
  Layers,
  Play,
} from "lucide-react";
import type {
  Exercise,
  Id,
  PlannedSession,
  SessionBlock,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getPlannedSession } from "../../db/repositories/programRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts } from "../../db/repositories/workoutRepository";
import {
  formatExerciseInstructionsRow,
  formatGroupChildInstructionsRow,
  formatGroupName,
  formatGroupRow,
} from "../../domain/rules/blockInstructionRules";
import { formatFullDate } from "../../domain/rules/programRules";
import {
  calculateBlockNumbering,
  calculateSessionTemplateDuration,
  formatSessionTemplateCardioLine,
  formatSessionTemplateDuration,
  formatSessionTemplateSummary,
  summarizeSessionTemplate,
} from "../../domain/rules/sessionTemplateRules";
import {
  formatDisplayedPlannedSessionStatus,
  formatDurationSource,
} from "../../domain/rules/todayRules";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import { startWorkout } from "../workout/startWorkout";
import { todayLocalDate } from "./useTodayData";
import "./TodayScreen.css";
import { paths } from "../../app/paths";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "success";
      session: PlannedSession;
      template: SessionTemplate;
      exerciseById: Map<Id, Exercise>;
      completedWorkouts: WorkoutSession[];
    };

/**
 * Aperçu d'une séance planifiée (mockup 21.2) : le contenu du modèle en
 * lecture seule, avant de démarrer. Distinct de l'écran d'édition du
 * modèle (§18 : Plus = gestion, Aujourd'hui = utilisation).
 */
export function SessionPreviewScreen() {
  const { plannedSessionId } = useParams<{ plannedSessionId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!plannedSessionId) {
        setState({ status: "missing" });
        return;
      }

      const session = await getPlannedSession(plannedSessionId);

      if (cancelled) return;

      if (!session || session.removedAt) {
        setState({ status: "missing" });
        return;
      }

      const [template, exercises, completedWorkouts] = await Promise.all([
        getSessionTemplate(session.sessionTemplateId),
        getAllExercises(),
        getCompletedWorkouts(),
      ]);

      if (cancelled) return;

      if (!template) {
        setState({ status: "missing" });
        return;
      }

      setState({
        status: "success",
        session,
        template,
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
        completedWorkouts: completedWorkouts.filter(
          (workout) => workout.sessionTemplateId === template.id,
        ),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [plannedSessionId]);

  if (state.status === "loading") {
    return (
      <section className="today preview">
        <Link to="/" className="preview__back">‹ Aujourd'hui</Link>
        <p className="today__message">Chargement…</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="today preview">
        <Link to="/" className="preview__back">‹ Aujourd'hui</Link>
        <p className="today__message">Séance introuvable.</p>
      </section>
    );
  }

  const { session, template, exerciseById, completedWorkouts } = state;
  const today = todayLocalDate();
  const summary = summarizeSessionTemplate(template.blocks, exerciseById);
  const cardioLine = formatSessionTemplateCardioLine(summary);
  const duration = calculateSessionTemplateDuration(template, completedWorkouts);
  const blocks = [...template.blocks].sort((a, b) => a.position - b.position);
  const numbering = calculateBlockNumbering(blocks);
  const canStart = session.status === "upcoming" || session.status === "skipped";

  const badge =
    session.date === today && session.status === "upcoming"
      ? "Prévue aujourd'hui"
      : session.date > today && session.status === "upcoming"
        ? `Prévue le ${formatFullDate(session.date)}`
        : formatDisplayedPlannedSessionStatus(session, today);

  async function start() {
    try {
      setError(undefined);
      await startWorkout(session.id);
      navigate(paths.workoutLive(), { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Démarrage impossible");
    }
  }

  return (
    <section className="today preview">
      <Link to="/" className="preview__back">‹ Aujourd'hui</Link>

      <header className="today-card__head preview__head">
        <span
          className={`today-card__icon session-card__icon ${categoryClassName("session-card__icon", template.category)}`}
          aria-hidden="true"
        >
          <SessionCategoryIcon category={template.category} size={26} />
        </span>
        <div className="today-card__body">
          <h1 className="preview__title">{template.name}</h1>
          <span className="today-badge today-badge--planned">{badge}</span>
          <span className="today-card__text">
            {formatSessionTemplateSummary(summary, template.description)}
          </span>
          {cardioLine && <span className="today-card__text">{cardioLine}</span>}
          <span className="preview__duration">
            <Clock size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>{formatSessionTemplateDuration(duration)}</strong>
              <br />
              <small>
                {formatDurationSource(duration.kind, completedWorkouts.length)}
              </small>
            </span>
          </span>
        </div>
      </header>

      <p className="today-notice">
        <Info size={18} strokeWidth={2} aria-hidden="true" />
        <span>
          Voici le contenu du modèle {template.name}. Les consignes seront
          copiées au démarrage de la séance ; les charges conseillées sont
          calculées depuis ton historique.
        </span>
      </p>

      <h2 className="preview__section">Contenu de la séance</h2>

      {blocks.length === 0 ? (
        <p className="today-card__text">Ce modèle n'a pas encore de brique.</p>
      ) : (
        <ol className="preview__list">
          {blocks.map((block) => (
            <PreviewRow
              key={block.id}
              block={block}
              number={numbering[block.id]}
              numbering={numbering}
              exerciseById={exerciseById}
            />
          ))}
        </ol>
      )}

      {error && <p className="today__message today__message--error">{error}</p>}

      <div className="preview__actions">
        {canStart ? (
          <button type="button" className="today__primary" onClick={() => void start()}>
            <Play size={18} strokeWidth={2.2} aria-hidden="true" />
            Démarrer la séance
          </button>
        ) : (
          <p className="today-card__text">
            Cette séance est {formatDisplayedPlannedSessionStatus(session, today).toLowerCase()}.
          </p>
        )}
        <Link to="/" className="today__secondary">
          Retour
        </Link>
      </div>
    </section>
  );
}

interface PreviewRowProps {
  block: SessionBlock;
  number: string | undefined;
  numbering: Partial<Record<Id, string>>;
  exerciseById: Map<Id, Exercise>;
}

function PreviewRow({ block, number, numbering, exerciseById }: PreviewRowProps) {
  if (block.kind === "note") {
    return (
      <li className="preview__row">
        <span className="preview__number" />
        <span className="preview__thumb preview__thumb--note" aria-hidden="true">
          <FileText size={20} strokeWidth={2} />
        </span>
        <span className="preview__body">
          <span className="preview__name">{block.title?.trim() || "Note"}</span>
          <span className="preview__meta">{block.text}</span>
        </span>
      </li>
    );
  }

  if (block.kind === "group") {
    const children = [...block.children].sort((a, b) => a.position - b.position);

    return (
      <li className="preview__row preview__row--group">
        <span className="preview__number">{number}</span>
        <span className="preview__thumb preview__thumb--group" aria-hidden="true">
          <Layers size={20} strokeWidth={2} />
        </span>
        <span className="preview__body">
          <span className="preview__name">
            {formatGroupName(block, number ?? "")}
          </span>
          <span className="preview__meta">{formatGroupRow(block)}</span>
          <ul className="preview__children">
            {children.map((child) => {
              const exercise = exerciseById.get(child.exerciseId);

              return (
                <li key={child.id}>
                  <span className="preview__child-number">{numbering[child.id]}</span>
                  <span>
                    {exercise?.name ?? "Exercice supprimé"}
                    <span className="preview__meta">
                      {" · "}
                      {formatGroupChildInstructionsRow(child.instructions)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </span>
      </li>
    );
  }

  const exercise = exerciseById.get(block.exerciseId);
  const url = exercise?.media?.thumbnailUrl ?? exercise?.media?.photoUrl;

  return (
    <li className="preview__row preview__row--exercise">
      <span className="preview__number">{number}</span>
      <Link
        to={`/exercises/${block.exerciseId}`}
        state={{ from: window.location.hash.slice(1) }}
        className="preview__link"
      >
        <span className="preview__thumb" aria-hidden="true">
          {url ? <img src={url} alt="" loading="lazy" /> : null}
        </span>
        <span className="preview__body">
          <span className="preview__name">{exercise?.name ?? "Exercice supprimé"}</span>
          <span className="preview__meta">
            {formatExerciseInstructionsRow(block.instructions)}
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    </li>
  );
}
