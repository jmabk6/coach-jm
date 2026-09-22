import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  EllipsisVertical,
  HeartPulse,
  Hourglass,
  Info,
  MinusCircle,
  PauseCircle,
  Timer,
} from "lucide-react";
import type {
  Exercise,
  Id,
  PerformedBlock,
  SessionTemplate,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts, getWorkout } from "../../db/repositories/workoutRepository";
import { formatFullDate } from "../../domain/rules/programRules";
import { formatSeriesRoleSummary, type FrameValidationResult } from "../../domain/rules/strengthRules";
import { loadActiveFrameVersions } from "../strength/activeFrameVersions";
import { frameOutcomesOf } from "../strength/frameReadings";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { deleteWorkout } from "./deleteWorkout";
import { SessionCategoryIcon } from "../sessions/sessionCategory";
import { categoryClassName } from "../sessions/sessionCategoryClass";
import {
  buildWorkoutRecapLines,
  compareVolumeToPrevious,
  formatClock,
  formatDecimal,
  formatKg,
  formatMinutes,
  formatPause,
  formatSeconds,
  recapStatusLabels,
  splitRecapLines,
  summarizeWorkout,
  withFrameLines,
  type VolumeComparison,
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
      volumeComparison: VolumeComparison | undefined;
      /** Sort de chaque version de cadre exécutée (v1.6, § 4.4), recalculé. */
      frameOutcomes: Map<Id, FrameValidationResult>;
    };

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDelta(deltaPercent: number): string {
  if (deltaPercent === 0) return "= dernière fois";
  return `${deltaPercent > 0 ? "+" : "−"}${Math.abs(deltaPercent)} % vs dernière fois`;
}

/**
 * Récapitulatif global d'une réalisation (§14, mockup 19.1) : cartes de
 * tête confrontées au prévu, puis une ligne par brique — les ajouts
 * pendant la séance dans leur propre section, numérotés à la suite.
 * Chaque ligne ouvre son écran de détail ; rien ne se déplie ici.
 */
export function WorkoutRecapScreen() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  /* Suppression d'une séance réalisée (§14) : menu, puis confirmation. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

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

      const [template, completed, frames] = await Promise.all([
        workout.sessionTemplateId
          ? getSessionTemplate(workout.sessionTemplateId)
          : Promise.resolve(undefined),
        workout.sessionTemplateId ? getCompletedWorkouts() : Promise.resolve([]),
        loadActiveFrameVersions(),
      ]);

      if (cancelled) return;

      setState({
        status: "success",
        workout,
        template,
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
        volumeComparison: compareVolumeToPrevious(workout, completed),
        frameOutcomes: frameOutcomesOf(workout, frames.versionById),
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

  const { workout, template, exerciseById, volumeComparison, frameOutcomes } = state;
  const head = summarizeWorkout(workout, template);
  /* `dont 4 comptées · 2 éch.` : rien quand toutes les séries comptent (v1.6). */
  const rolesLine = formatSeriesRoleSummary(head.roles);
  const { planned, added } = splitRecapLines(
    withFrameLines(buildWorkoutRecapLines(workout, exerciseById), frameOutcomes, exerciseById),
    workout.sessionTemplateId !== undefined,
  );
  const title = template?.name ?? "Séance libre";
  const detailBase = `/workouts/${workout.id}/blocks`;
  const detailSearch = `?returnTo=${encodeURIComponent(returnTo)}`;
  const amplitudeSec = head.completedAt
    ? Math.max(
        0,
        Math.round(
          (new Date(head.completedAt).getTime() - new Date(head.startedAt).getTime()) / 1000,
        ),
      )
    : undefined;

  async function confirmDelete() {
    try {
      setDeleteError(undefined);
      await deleteWorkout(workout.id);
      setConfirmingDelete(false);
      navigate(returnTo, { replace: true });
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Suppression impossible");
    }
  }

  return (
    <section className="recap">
      <header className="recap__nav">
        <Link to={returnTo} className="recap__back">‹ Retour</Link>
        <div className="recap__title">
          <h1>{title}</h1>
          <p>{capitalize(formatFullDate(workout.date))}</p>
        </div>
        {workout.status === "completed" ? (
          <button
            type="button"
            className="recap__menu"
            aria-label="Actions sur cette séance"
            onClick={() => setMenuOpen(true)}
          >
            <EllipsisVertical size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <span />
        )}
      </header>

      {menuOpen && (
        <BottomSheet
          title={`${title} — ${formatFullDate(workout.date)}`}
          message="Séance réalisée"
          actions={[
            {
              label: "Supprimer cette séance",
              hint: "Disparaît de l'historique, de la progression et de « Dernière fois »",
              tone: "danger",
              onSelect: () => {
                setMenuOpen(false);
                setConfirmingDelete(true);
              },
            },
          ]}
          dismissLabel="Fermer"
          onDismiss={() => setMenuOpen(false)}
        />
      )}

      {confirmingDelete && (
        <BottomSheet
          title="Supprimer cette séance ?"
          message="Cette suppression est définitive."
          actions={[
            {
              label: "Supprimer définitivement",
              hint: "Rien n'est supprimé tant que vous n'avez pas appuyé ici",
              tone: "danger",
              onSelect: () => void confirmDelete(),
            },
          ]}
          dismissLabel="Annuler"
          onDismiss={() => setConfirmingDelete(false)}
        >
          <ul className="recap__consequences">
            <li>La séance disparaît de l'historique et du Programme.</li>
            <li>La progression, les moyennes de durée et « Dernière fois » sont recalculées sur ce qui reste.</li>
            {workout.plannedSessionId && (
              <li>
                La séance planifiée repasse « À venir », sauf si une autre réalisation lui reste rattachée.
              </li>
            )}
            <li>Le modèle{template ? ` ${template.name}` : ""} et les autres séances ne sont pas touchés.</li>
          </ul>
          {deleteError && <p className="recap__message recap__message--error">{deleteError}</p>}
        </BottomSheet>
      )}

      <div className="recap__cards">
        <div className="recap__card">
          <Clock size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Durée active</span>
          <strong>{formatMinutes(head.activeDurationSec)}</strong>
          <span className="recap__card-meta">
            {head.plannedDurationSec !== undefined
              ? `prévu ${formatMinutes(head.plannedDurationSec)}`
              : "sans durée prévue"}
          </span>
        </div>

        <div className="recap__card">
          <Hourglass size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Amplitude horaire</span>
          <strong>
            {formatClock(head.startedAt)}
            {head.completedAt && ` – ${formatClock(head.completedAt)}`}
          </strong>
          <span className="recap__card-meta">
            {amplitudeSec !== undefined ? formatMinutes(amplitudeSec) : "en cours"}
            {head.pauses.length > 0 &&
              ` · ${head.pauses.length} pause${head.pauses.length > 1 ? "s" : ""}`}
          </span>
        </div>

        {(head.volumeKg > 0 || head.seriesPlanned > 0) && (
          <div className="recap__card">
            <BarChart3 size={20} strokeWidth={2} aria-hidden="true" />
            {head.volumeKg > 0 ? (
              <>
                <span className="recap__card-label">Volume total</span>
                <strong>{formatKg(head.volumeKg)}</strong>
                <span className="recap__card-meta">
                  {head.seriesDone} série{head.seriesDone > 1 ? "s" : ""} réalisée
                  {head.seriesDone > 1 ? "s" : ""} sur {head.seriesPlanned}
                </span>
              </>
            ) : (
              <>
                <span className="recap__card-label">Séries réalisées</span>
                <strong>
                  {head.seriesDone} / {head.seriesPlanned}
                </strong>
                <span className="recap__card-meta">sans charge</span>
              </>
            )}
            {rolesLine && <span className="recap__card-meta">{rolesLine}</span>}
            {volumeComparison && head.volumeKg > 0 && (
              <span className="recap__card-meta recap__card-meta--compare">
                {formatDelta(volumeComparison.deltaPercent)}
              </span>
            )}
          </div>
        )}

        {head.rest.averageSec !== undefined && (
          <div className="recap__card">
            <Timer size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Repos moyen</span>
            <strong>{formatSeconds(head.rest.averageSec)}</strong>
            <span className="recap__card-meta">
              {head.rest.plannedAverageSec !== undefined &&
                `prévu ${formatSeconds(head.rest.plannedAverageSec)} · `}
              {head.rest.comparableCount} sur {head.rest.totalCount} repos
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
            <strong>
              {head.cardioSteps}
              {head.cardioStepsPlanned > head.cardioSteps && ` / ${head.cardioStepsPlanned}`}
            </strong>
            <span className="recap__card-meta">
              {formatMinutes(head.cardioDurationSec)}
              {head.bpmKnown > 0 && ` · BPM sur ${head.bpmKnown}`}
            </span>
          </div>
        ) : null}
      </div>

      {head.pauses.length > 0 && (
        <ul className="recap__pauses">
          {head.pauses.map((pause) => (
            <li key={pause.id}>
              <PauseCircle size={16} strokeWidth={2} aria-hidden="true" />
              <span>{formatPause(pause)}</span>
            </li>
          ))}
        </ul>
      )}

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
        {planned.map((line) => (
          <RecapLine
            key={line.block.id}
            line={line}
            to={`${detailBase}/${line.block.id}${detailSearch}`}
          />
        ))}
      </ol>

      {added.length > 0 && (
        <>
          <h2 className="recap__section recap__section--added">
            Ajouts pendant la séance
            <span className="recap__section-meta">+{added.length}</span>
          </h2>
          <ol className="recap__lines">
            {added.map((line) => (
              <RecapLine
                key={line.block.id}
                line={line}
                to={`${detailBase}/${line.block.id}${detailSearch}`}
              />
            ))}
          </ol>
        </>
      )}

      {!workout.plannedSessionId && (
        <p className="recap__notice">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <span>
            {template
              ? `Séance supplémentaire : réalisée hors Programme à partir du modèle ${template.name}, qui n'est pas modifié. La règle hebdomadaire n'est pas concernée.`
              : "Séance libre : réalisée hors Programme, sans modèle rattaché. La règle hebdomadaire n'est pas concernée."}
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
        aria-label={recapStatusLabels.performed}
      />
    );
  }

  if (block.status === "skipped") {
    return (
      <MinusCircle
        className="recap__status recap__status--skipped"
        size={22}
        strokeWidth={2}
        aria-label={recapStatusLabels.skipped}
      />
    );
  }

  return (
    <Circle
      className="recap__status recap__status--not-performed"
      size={22}
      strokeWidth={2}
      aria-label={recapStatusLabels.not_performed}
    />
  );
}

/**
 * Une ligne du tableau (§14) : `# / Exercice / Statut / Séries / Volume /
 * RPE moyen`, qui ouvre l'écran de détail de la brique (décision Q3).
 */
function RecapLine({ line, to }: { line: WorkoutRecapLine; to: string }) {
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

  const category =
    line.category === "Cardio" || line.category === "Mobilité"
      ? line.category
      : "Musculation";

  return (
    <li className="recap-line">
      <Link to={to} className="recap-line__main">
        <span className="recap-line__number">{line.number}</span>
        <span
          className={`recap-line__icon ${categoryClassName("session-card__icon", category)}`}
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
          {line.frameLine && (
            <span className={`recap-line__frame ${line.frameLine.startsWith("Validé") ? "recap-line__frame--ok" : ""}`}>
              {line.frameLine}
            </span>
          )}
          {block.note && <span className="recap-line__note">{block.note}</span>}
        </span>
        <StatusIcon block={block} />
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    </li>
  );
}
