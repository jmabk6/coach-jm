import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  HeartPulse,
  Info,
  MinusCircle,
} from "lucide-react";
import type {
  Exercise,
  Id,
  PerformedBlock,
  PerformedExerciseBlock,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getWorkout } from "../../db/repositories/workoutRepository";
import { formatFullDate } from "../../domain/rules/programRules";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import {
  buildWorkoutRecapLines,
  formatClock,
  formatDecimal,
  formatKg,
  formatMinutes,
  formatSeriesLine,
  formatStepSettings,
  summarizeWorkout,
  type WorkoutRecapLine,
} from "./workoutRecap";
import "./WorkoutRecapScreen.css";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "success";
      workout: WorkoutSession;
      template: SessionTemplate | undefined;
      exerciseById: Map<Id, Exercise>;
    };

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Récapitulatif d'une réalisation (§14, mockup p. 19) en lecture :
 * cartes de tête, puis chaque brique avec son détail série par série ou
 * palier par palier, notes sur la ligne. Sert aux séances importées et
 * aux séances faites ; l'Étape 7 y ajoutera la confrontation au prévu.
 */
export function WorkoutRecapScreen() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [openBlockId, setOpenBlockId] = useState<Id>();

  const returnTo = searchParams.get("returnTo") ?? "/programme";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workoutId) {
        setState({ status: "missing" });
        return;
      }

      const [workout, exercises] = await Promise.all([
        getWorkout(workoutId),
        getAllExercises(),
      ]);

      if (cancelled) return;

      if (!workout) {
        setState({ status: "missing" });
        return;
      }

      const template = workout.sessionTemplateId
        ? await getSessionTemplate(workout.sessionTemplateId)
        : undefined;

      if (cancelled) return;

      setState({
        status: "success",
        workout,
        template,
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [workoutId]);

  if (state.status === "loading") {
    return (
      <section className="recap">
        <p className="recap__message">Chargement de la séance…</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="recap">
        <Link to={returnTo} className="recap__back">‹ Retour</Link>
        <p className="recap__message">Cette séance est introuvable.</p>
      </section>
    );
  }

  const { workout, template, exerciseById } = state;
  const head = summarizeWorkout(workout);
  const lines = buildWorkoutRecapLines(workout, exerciseById);
  const title = template?.name ?? "Séance libre";

  return (
    <section className="recap">
      <header className="recap__nav">
        <Link to={returnTo} className="recap__back">‹ Retour</Link>
        <div className="recap__title">
          <h1>{title}</h1>
          <p>{capitalize(formatFullDate(workout.date))}</p>
        </div>
        <span />
      </header>

      <div className="recap__cards">
        <div className="recap__card">
          <Clock size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Durée active</span>
          <strong>{formatMinutes(head.activeDurationSec)}</strong>
          {head.completedAt && (
            <span className="recap__card-meta">
              {formatClock(head.startedAt)} – {formatClock(head.completedAt)}
            </span>
          )}
        </div>

        {head.bpm ? (
          <div className="recap__card">
            <HeartPulse size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Fréquence cardiaque</span>
            <strong>
              {head.bpm.min} – {head.bpm.max} bpm
            </strong>
            <span className="recap__card-meta">
              moy. {Math.round(head.bpm.average.value)} ({head.bpm.average.count} sur{" "}
              {head.bpm.average.total} paliers)
            </span>
          </div>
        ) : head.cardioSteps > 0 ? (
          <div className="recap__card">
            <Activity size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Paliers cardio</span>
            <strong>{head.cardioSteps}</strong>
            <span className="recap__card-meta">{formatMinutes(head.cardioDurationSec)}</span>
          </div>
        ) : null}

        {head.volumeKg > 0 && (
          <div className="recap__card">
            <BarChart3 size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Volume total</span>
            <strong>{formatKg(head.volumeKg)}</strong>
            <span className="recap__card-meta">
              {head.seriesDone} série{head.seriesDone > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {head.rpe && (
          <div className="recap__card">
            <Activity size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">RPE moyen</span>
            <strong>{formatDecimal(head.rpe.value)}</strong>
            <span className="recap__card-meta">
              ({head.rpe.count} sur {head.rpe.total} séries)
            </span>
          </div>
        )}
      </div>

      <h2 className="recap__section">
        Réalisation de la séance
        <span className="recap__section-meta">
          {head.performed} réalisé{head.performed > 1 ? "s" : ""}
          {head.skipped > 0 && ` · ${head.skipped} sauté${head.skipped > 1 ? "s" : ""}`}
          {head.notPerformed > 0 &&
            ` · ${head.notPerformed} non réalisé${head.notPerformed > 1 ? "s" : ""}`}
        </span>
      </h2>

      <ol className="recap__lines">
        {lines.map((line) => (
          <RecapLine
            key={line.block.id}
            line={line}
            open={openBlockId === line.block.id}
            onToggle={() =>
              setOpenBlockId((current) =>
                current === line.block.id ? undefined : line.block.id,
              )
            }
          />
        ))}
      </ol>

      {!workout.plannedSessionId && (
        <p className="recap__notice">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            Séance libre : réalisée hors Programme, sans modèle rattaché.
            La règle hebdomadaire n'est pas concernée.
          </span>
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Une brique                                                                 */
/* -------------------------------------------------------------------------- */

function StatusIcon({ block }: { block: PerformedBlock }) {
  if (block.kind === "note") return null;

  if (block.status === "performed") {
    return (
      <CheckCircle2
        className="recap__status recap__status--performed"
        size={22}
        strokeWidth={2}
        aria-label="Réalisé"
      />
    );
  }

  if (block.status === "skipped") {
    return (
      <MinusCircle
        className="recap__status recap__status--skipped"
        size={22}
        strokeWidth={2}
        aria-label="Sauté"
      />
    );
  }

  return (
    <Circle
      className="recap__status recap__status--not-performed"
      size={22}
      strokeWidth={2}
      aria-label="Non réalisé"
    />
  );
}

function RecapLine({
  line,
  open,
  onToggle,
}: {
  line: WorkoutRecapLine;
  open: boolean;
  onToggle: () => void;
}) {
  const { block } = line;

  if (block.kind === "note") {
    return (
      <li className="recap-line recap-line--note">
        <span className="recap-line__number" />
        <span className="recap-line__body">
          <span className="recap-line__name">{line.name}</span>
          <span className="recap-line__meta">{line.subtitle}</span>
        </span>
      </li>
    );
  }

  const expandable = block.kind === "exercise" && block.status === "performed";
  const category =
    line.category === "Cardio" || line.category === "Mobilité"
      ? line.category
      : "Musculation";

  return (
    <li className={`recap-line ${open ? "recap-line--open" : ""}`}>
      <button
        type="button"
        className="recap-line__main"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={onToggle}
      >
        <span className="recap-line__number">{line.number}</span>
        <span
          className={`recap-line__icon session-card__icon--${category}`}
          aria-hidden="true"
        >
          <SessionCategoryIcon category={category} size={20} />
        </span>
        <span className="recap-line__body">
          <span className="recap-line__name">{line.name}</span>
          <span className="recap-line__meta">
            {line.subtitle}
            {line.volumeKg !== undefined && ` · ${formatKg(line.volumeKg)}`}
            {line.rpe !== undefined && ` · RPE ${formatDecimal(line.rpe)}`}
          </span>
          {block.note && <span className="recap-line__note">{block.note}</span>}
        </span>
        <StatusIcon block={block} />
        {expandable &&
          (open ? (
            <ChevronUp size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
          ))}
      </button>

      {open && block.kind === "exercise" && <BlockDetail block={block} />}
    </li>
  );
}

/**
 * Détail série par série ou palier par palier (§14) : les notes se
 * lisent sur la ligne, jamais dans un bloc à part.
 */
function BlockDetail({ block }: { block: PerformedExerciseBlock }) {
  const steps = (block.cardioSteps ?? []).filter((step) => step.status === "completed");
  const series = (block.series ?? []).filter((item) => item.status === "completed");

  if (steps.length > 0) {
    const distanceBased = steps[0] && "distanceKm" in steps[0].settings;

    return (
      <table className="recap-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Durée</th>
            <th>{distanceBased ? "Distance" : "Vitesse"}</th>
            {!distanceBased && <th>Pente</th>}
            <th>BPM</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => {
            const settings = formatStepSettings(step);

            return (
              <tr key={step.id}>
                <td>{index + 1}</td>
                <td>{settings.duration}</td>
                <td>{settings.first}</td>
                {!distanceBased && <td>{settings.second}</td>}
                <td>
                  {step.bpm ?? "—"}
                  {step.note && <span className="recap-table__note"> · {step.note}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (series.length > 0) {
    return (
      <ol className="recap-series">
        {series.map((item, index) => (
          <li key={item.id}>
            <span className="recap-series__number">{index + 1}</span>
            <span>{formatSeriesLine(item)}</span>
          </li>
        ))}
      </ol>
    );
  }

  if (block.simpleMeasurement?.note) {
    return <p className="recap-line__note">{block.simpleMeasurement.note}</p>;
  }

  return null;
}
