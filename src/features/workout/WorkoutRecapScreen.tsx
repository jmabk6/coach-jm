import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  Annoyed,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Dumbbell,
  EllipsisVertical,
  Frown,
  HeartPulse,
  Hourglass,
  Info,
  Laugh,
  Meh,
  MinusCircle,
  PauseCircle,
  Smile,
  Target,
  Timer,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { addDays, parseISO } from "date-fns";
import type {
  Exercise,
  Goal,
  Id,
  PerformedBlock,
  PlannedSession,
  SessionTemplate,
  WorkoutSession,
  StrengthFrameVersion,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getAllGoals } from "../../db/repositories/goalRepository";
import { getPlannedSessionsBetween } from "../../db/repositories/programRepository";
import { getSessionTemplate } from "../../db/repositories/sessionTemplateRepository";
import { getCompletedWorkouts, getWorkout } from "../../db/repositories/workoutRepository";
import { formatFullDate, formatLocalDate } from "../../domain/rules/programRules";
import { calculateSessionTemplateDuration } from "../../domain/rules/sessionTemplateRules";
import { formatSeriesRoleSummary, type FrameValidationResult } from "../../domain/rules/strengthRules";
import { listNextPlannedSessions } from "../../domain/rules/todayRules";
import { loadActiveFrameVersions } from "../strength/activeFrameVersions";
import { frameOutcomesOf } from "../strength/frameReadings";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { deleteWorkout } from "./deleteWorkout";
import { confirmWorkout, isAwaitingConfirmation, saveWorkoutFeedback } from "./finishWorkout";
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
import {
  FEELING_LEVELS,
  assistedExerciseNames,
  formatAssistanceNotIncluded,
  formatHoursMinutes,
  recordCards,
  workedGoals,
  workoutEndOf,
  type RecordCard,
  type WorkoutFeeling,
} from "./workoutEndSummary";
import { computeWorkoutRecords } from "./workoutRecords";
import "./WorkoutRecapScreen.css";
import { paths } from "../../app/paths";

/** Horizon de « Prochaine séance » (M10.3) : les deux semaines qui suivent la séance. */
const NEXT_SESSION_HORIZON_DAYS = 14;

interface NextSession {
  planned: PlannedSession;
  template: SessionTemplate | undefined;
  minutes: number | undefined;
}

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
      versionById: Map<Id, StrengthFrameVersion>;
      records: RecordCard[];
      referenceCount: number;
      goals: Goal[];
      next: NextSession | undefined;
    };

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDelta(deltaPercent: number): string {
  if (deltaPercent === 0) return "= dernière fois";
  return `${deltaPercent > 0 ? "+" : "−"}${Math.abs(deltaPercent)} % vs dernière fois`;
}

function shiftDate(date: string, days: number): string {
  return formatLocalDate(addDays(parseISO(date), days));
}

const FEELING_ICONS: Record<WorkoutFeeling, LucideIcon> = { 1: Frown, 2: Annoyed, 3: Meh, 4: Smile, 5: Laugh };

type View = 1 | 2 | 3;

function viewOf(value: string | null): View {
  return value === "2" ? 2 : value === "3" ? 3 : 1;
}

/**
 * Fin de séance (M10, conception V2 § 2.6), trois vues sur la même
 * adresse (`?vue=`) : 1 — terminée et records ; 2 — détail, une ligne par
 * brique qui ouvre sa page dédiée ; 3 — prochaine séance, ressenti,
 * notes, Enregistrer. En attente (D21) : ressenti, notes et corrections
 * restent possibles ; une séance enregistrée s'affiche en lecture.
 */
interface WorkoutRecapScreenProps {
  /** Séance à afficher ; par défaut, celle de l'adresse `/workouts/:workoutId`. */
  workoutId?: string;
}

export function WorkoutRecapScreen({ workoutId: forcedId }: WorkoutRecapScreenProps = {}) {
  const params = useParams<{ workoutId: string }>();
  const workoutId = forcedId ?? params.workoutId;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  /* Suppression d'une séance réalisée (§14) : menu, puis confirmation. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [feeling, setFeeling] = useState<WorkoutFeeling>();
  const [note, setNote] = useState("");

  const returnTo = searchParams.get("returnTo") ?? paths.planning();
  const view = viewOf(searchParams.get("vue"));

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

      const pending = isAwaitingConfirmation(workout);
      const [template, completed, frames, goals, ahead] = await Promise.all([
        workout.sessionTemplateId
          ? getSessionTemplate(workout.sessionTemplateId)
          : Promise.resolve(undefined),
        getCompletedWorkouts(),
        loadActiveFrameVersions(),
        getAllGoals(),
        pending
          ? getPlannedSessionsBetween(shiftDate(workout.date, 1), shiftDate(workout.date, NEXT_SESSION_HORIZON_DAYS))
          : Promise.resolve([]),
      ]);

      const nextPlanned = listNextPlannedSessions(ahead, workout.date, 1)[0];
      const nextTemplate = nextPlanned ? await getSessionTemplate(nextPlanned.sessionTemplateId) : undefined;

      if (cancelled) return;

      const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const { records, references } = computeWorkoutRecords(workout, completed, exerciseById);

      setFeeling(workout.feeling);
      setNote(workout.note ?? "");
      setState({
        status: "success",
        workout,
        template,
        exerciseById,
        volumeComparison: workout.sessionTemplateId
          ? compareVolumeToPrevious(workout, completed, exerciseById)
          : undefined,
        frameOutcomes: frameOutcomesOf(workout, frames.versionById),
        versionById: frames.versionById,
        records: recordCards(records, exerciseById),
        referenceCount: references.length,
        goals: workedGoals(workout, goals),
        next: nextPlanned
          ? {
              planned: nextPlanned,
              template: nextTemplate,
              minutes: nextTemplate
                ? calculateSessionTemplateDuration(
                    nextTemplate,
                    completed.filter((item) => item.sessionTemplateId === nextTemplate.id),
                  ).minutes
                : undefined,
            }
          : undefined,
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

  const { workout, template } = state;
  const title = template?.name ?? "Séance libre";
  /* Terminée, en attente d'enregistrement (D20, D21). */
  const pending = isAwaitingConfirmation(workout);

  function goTo(next: View) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 1) params.delete("vue");
        else params.set("vue", String(next));
        return params;
      },
      { replace: false },
    );
    window.scrollTo?.(0, 0);
  }

  async function chooseFeeling(value: WorkoutFeeling) {
    setFeeling(value);
    try {
      await saveWorkoutFeedback(workout.id, { feeling: value });
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Ressenti non enregistré");
    }
  }

  async function keepNote() {
    try {
      await saveWorkoutFeedback(workout.id, { note });
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Note non enregistrée");
    }
  }

  async function save() {
    try {
      setSaving(true);
      setSaveError(undefined);
      await confirmWorkout(workout.id, { ...(feeling !== undefined ? { feeling } : {}), note });
      navigate(paths.home(), { replace: true });
    } catch (cause) {
      setSaving(false);
      setSaveError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    }
  }

  async function confirmDelete() {
    try {
      setDeleteError(undefined);
      await deleteWorkout(workout.id);
      setConfirmingDelete(false);
      navigate(pending ? paths.home() : returnTo, { replace: true });
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Suppression impossible");
    }
  }

  const menuButton =
    workout.status === "completed" || pending ? (
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
    );

  const back =
    view === 1 ? (
      pending ? (
        <Link to={paths.home()} className="recap__back">‹ Accueil</Link>
      ) : (
        <Link to={returnTo} className="recap__back">‹ Retour</Link>
      )
    ) : (
      <button type="button" className="recap__back recap__back--button" onClick={() => goTo(view === 3 ? 2 : 1)}>
        ‹ Retour
      </button>
    );

  const subtitle =
    view === 1
      ? capitalize(formatFullDate(workout.date))
      : view === 2
        ? "Détail de la séance"
        : pending
          ? "Bilan et prochaine séance"
          : "Ressenti et notes";

  return (
    <section className="recap">
      <header className="recap__nav">
        {back}
        <div className="recap__title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {menuButton}
      </header>

      {menuOpen && (
        <BottomSheet
          title={`${title} — ${formatFullDate(workout.date)}`}
          message={pending ? "Séance terminée, pas encore enregistrée" : "Séance réalisée"}
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
            <li>La séance disparaît de l'historique et du Planning.</li>
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

      {view === 1 && (
        <SummaryView state={state} pending={pending}>
          <NextButton onClick={() => goTo(2)}>Voir le détail de la séance</NextButton>
        </SummaryView>
      )}

      {view === 2 && (
        <DetailView state={state} returnTo={returnTo}>
          <NextButton onClick={() => goTo(3)}>
            {pending ? "Bilan et prochaine séance" : "Ressenti et notes"}
          </NextButton>
        </DetailView>
      )}

      {view === 3 && (
        <section className="end-closing">
          {pending && <NextSessionCard next={state.next} />}

          <h2 className="end-closing__title">Comment s'est passée la séance ?</h2>
          {pending || feeling !== undefined ? (
            <div className="end-feeling" role="group" aria-label="Ressenti">
              {FEELING_LEVELS.map((level) => {
                const Icon = FEELING_ICONS[level.value];
                return (
                  <button
                    key={level.value}
                    type="button"
                    className="end-feeling__choice"
                    aria-pressed={feeling === level.value}
                    disabled={!pending}
                    onClick={() => void chooseFeeling(level.value)}
                  >
                    <Icon size={26} strokeWidth={1.8} aria-hidden="true" />
                    <span>{level.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="end-closing__empty">Ressenti non noté.</p>
          )}

          <h2 className="end-closing__title">Notes {pending && <span>(facultatif)</span>}</h2>
          {pending ? (
            <textarea
              className="end-closing__note"
              aria-label="Notes"
              rows={4}
              maxLength={2000}
              placeholder="Écris ici tes sensations, ce qui a bien ou moins bien fonctionné, etc."
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => void keepNote()}
            />
          ) : (
            <p className={workout.note ? "end-closing__note-read" : "end-closing__empty"}>
              {workout.note ?? "Aucune note."}
            </p>
          )}

          {pending && (
            <div className="recap__save">
              {saveError && <p className="recap__message recap__message--error">{saveError}</p>}
              <button type="button" className="recap__save-button" disabled={saving} onClick={() => void save()}>
                Enregistrer et revenir à l'accueil
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

type Loaded = Extract<LoadState, { status: "success" }>;

function NextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="end-next" onClick={onClick}>
      <span>{children}</span>
      <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Vue 1 — terminée et records                                                */
/* -------------------------------------------------------------------------- */

function SummaryView({ state, pending, children }: { state: Loaded; pending: boolean; children: ReactNode }) {
  const { workout, template, exerciseById, records, referenceCount, goals } = state;
  const head = summarizeWorkout(workout, template, exerciseById);
  const end = workoutEndOf(workout);
  const totalSec = end
    ? Math.max(0, Math.round((new Date(end).getTime() - new Date(workout.startedAt).getTime()) / 1000))
    : undefined;
  const assistance = formatAssistanceNotIncluded(assistedExerciseNames(workout, exerciseById));
  const showTonnage = head.volumeKg > 0 || assistance !== undefined;

  return (
    <>
      <div className="end-hero">
        <CheckCircle2 className="end-hero__check" size={56} strokeWidth={2} aria-hidden="true" />
        <h2>{pending ? "Séance terminée !" : "Séance enregistrée"}</h2>
        <p>
          {head.performed} exercice{head.performed > 1 ? "s" : ""} réalisé{head.performed > 1 ? "s" : ""}
        </p>
        {totalSec !== undefined && <p>Durée totale : {formatHoursMinutes(totalSec)}</p>}
        <p className="end-hero__when">
          {capitalize(formatFullDate(workout.date))} · {formatClock(workout.startedAt)}
          {end && ` – ${formatClock(end)}`}
        </p>
      </div>

      <div className="end-stats">
        {showTonnage && (
          <div className="end-stats__cell">
            <Dumbbell size={20} strokeWidth={2} aria-hidden="true" />
            <span className="end-stats__label">Tonnage total</span>
            <strong>{formatKg(head.volumeKg)}</strong>
            {assistance && <span className="end-stats__meta">({assistance})</span>}
          </div>
        )}
        <div className="end-stats__cell">
          <Clock size={20} strokeWidth={2} aria-hidden="true" />
          <span className="end-stats__label">Durée active</span>
          <strong>{formatHoursMinutes(head.activeDurationSec)}</strong>
        </div>
        {totalSec !== undefined && (
          <div className="end-stats__cell">
            <Timer size={20} strokeWidth={2} aria-hidden="true" />
            <span className="end-stats__label">Durée totale</span>
            <strong>{formatHoursMinutes(totalSec)}</strong>
          </div>
        )}
      </div>

      {goals.length > 0 && (
        <section className="end-section">
          <h2 className="end-section__title">
            <Target size={20} strokeWidth={2} aria-hidden="true" /> Objectifs travaillés
          </h2>
          <ul className="end-goals">
            {goals.map((goal) => (
              <li key={goal.id}>
                <Link to={paths.goals()} className="end-goals__item">
                  <span>{goal.title}</span>
                  <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {records.length > 0 && (
        <section className="end-section">
          <h2 className="end-section__title">
            <Trophy size={20} strokeWidth={2} aria-hidden="true" /> Records de la séance
          </h2>
          <ul className="end-records">
            {records.map((record) => (
              <li key={record.exerciseId} className="end-records__card">
                <span className="end-records__name">{record.name}</span>
                <strong>{record.value}</strong>
                <span className="end-records__meta">Meilleure série</span>
                {record.previous && <span className="end-records__meta">(précédent : {record.previous})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {referenceCount > 0 && (
        <p className="end-references">Références posées : {referenceCount}</p>
      )}

      {children}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Vue 2 — détail : une ligne par brique, vers sa page dédiée                  */
/* -------------------------------------------------------------------------- */

function DetailView({ state, returnTo, children }: { state: Loaded; returnTo: string; children: ReactNode }) {
  const { workout, template, exerciseById, volumeComparison, frameOutcomes, versionById } = state;
  const head = summarizeWorkout(workout, template, exerciseById);
  /* `dont 4 comptées · 2 éch.` : rien quand toutes les séries comptent (v1.6). */
  const rolesLine = formatSeriesRoleSummary(head.roles);
  const { planned, added } = splitRecapLines(
    withFrameLines(buildWorkoutRecapLines(workout, exerciseById), frameOutcomes, exerciseById, versionById),
    workout.sessionTemplateId !== undefined,
  );
  const detailBase = `/workouts/${workout.id}/blocks`;
  const detailSearch = `?returnTo=${encodeURIComponent(returnTo)}`;
  const end = workoutEndOf(workout);
  const amplitudeSec = end
    ? Math.max(0, Math.round((new Date(end).getTime() - new Date(head.startedAt).getTime()) / 1000))
    : undefined;

  return (
    <>
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
            {end && ` – ${formatClock(end)}`}
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
                <span className="recap__card-label">Tonnage total</span>
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
              ? `Séance supplémentaire : réalisée hors programme à partir du modèle ${template.name}, qui n'est pas modifié. La règle hebdomadaire n'est pas concernée.`
              : "Séance libre : réalisée hors programme, sans modèle rattaché. La règle hebdomadaire n'est pas concernée."}
          </span>
        </p>
      )}

      {children}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Vue 3 — prochaine séance                                                    */
/* -------------------------------------------------------------------------- */

function NextSessionCard({ next }: { next: NextSession | undefined }) {
  return (
    <section className="end-section">
      <h2 className="end-section__title">Prochaine séance</h2>
      {next ? (
        <div className="end-next-session">
          <CalendarDays size={24} strokeWidth={2} aria-hidden="true" />
          <span className="end-next-session__body">
            <strong>{capitalize(formatFullDate(next.planned.date))}</strong>
            <span>{next.template?.name ?? "Séance"}</span>
            {next.minutes !== undefined && <span>Durée : {next.minutes} min</span>}
          </span>
        </div>
      ) : (
        <p className="end-closing__empty">Aucune séance planifiée dans les deux semaines qui viennent.</p>
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
            <span className={`recap-line__frame ${line.frameLine.startsWith("Non validé") ? "" : "recap-line__frame--ok"}`}>
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
