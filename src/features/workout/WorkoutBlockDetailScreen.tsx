import { Fragment, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  HeartPulse,
  Info,
  Layers,
  NotebookPen,
  Repeat,
  Timer,
  Wrench,
} from "lucide-react";
import type {
  Exercise,
  Id,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getCompletedWorkouts, getWorkout } from "../../db/repositories/workoutRepository";
import { formatFullDate } from "../../domain/rules/programRules";
import { formatSeriesRoleSummary } from "../../domain/rules/strengthRules";
import { formatRange } from "../../domain/rules/blockInstructionRules";
import {
  buildExerciseHistory,
  findBlockNeighbours,
  formatRpePosition,
  formatSignedPercent,
  formatSignedSeconds,
  summarizeExerciseBlock,
  type BlockNeighbours,
  type ExerciseDetailSummary,
  type ExerciseHistoryEntry,
} from "./workoutBlockDetail";
import { formatShortDate } from "./workoutDisplay";
import {
  compareGroupVolumeToPrevious,
  describeGroupRounds,
  describeGroupStructure,
  exerciseName,
  listGroupSubstitutions,
  summarizeGroupBlock,
  type GroupRoundView,
  type GroupVolumeVsLast,
  type RoundRestView,
} from "./workoutGroupDetail";
import {
  buildWorkoutRecapLines,
  formatCardioSettingsLine,
  formatDecimal,
  formatKg,
  formatMinutes,
  formatSeconds,
  formatSeriesLine,
  formatStepSettings,
  recapStatusLabels,
  splitRecapLines,
  type WorkoutRecapLine,
} from "./workoutRecap";
import "./WorkoutRecapScreen.css";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "success";
      workout: WorkoutSession;
      line: WorkoutRecapLine;
      lines: WorkoutRecapLine[];
      exerciseById: Map<Id, Exercise>;
      history: ExerciseHistoryEntry[];
      groupVolumeVsLast: GroupVolumeVsLast | undefined;
      neighbours: BlockNeighbours;
    };

/**
 * Détail d'une brique d'une réalisation (§14, mockup 19.3, décisions Q3
 * et Q4) : résumé confronté au prévu quand la comparaison s'applique,
 * données enregistrées série par série ou palier par palier, ligne
 * `Prévu (par série)`, notes et adaptations, cinq dernières réalisations
 * de l'exercice réellement effectué, navigation précédent / suivant.
 * Pour un groupe (mockup 19.2) : structure prévue, substitutions
 * explicites, réalisation tour par tour, repos entre tours et avant un
 * enfant, prévu et réel.
 */
export function WorkoutBlockDetailScreen() {
  const { workoutId, blockId } = useParams<{ workoutId: string; blockId: string }>();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const returnTo = searchParams.get("returnTo") ?? "/programme";
  const search = `?returnTo=${encodeURIComponent(returnTo)}`;
  const backTo = workoutId ? `/workouts/${workoutId}${search}` : returnTo;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workoutId || !blockId) {
        setState({ status: "missing" });
        return;
      }

      const [workout, exercises, completed] = await Promise.all([
        getWorkout(workoutId),
        getAllExercises(),
        getCompletedWorkouts(),
      ]);

      if (cancelled) return;

      const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const { planned, added } = workout
        ? splitRecapLines(buildWorkoutRecapLines(workout, exerciseById), workout.sessionTemplateId !== undefined)
        : { planned: [], added: [] };
      const lines = [...planned, ...added];
      const line = lines.find((item) => item.block.id === blockId);

      if (!workout || !line) {
        setState({ status: "missing" });
        return;
      }

      const history =
        line.block.kind === "exercise"
          ? buildExerciseHistory(
              line.block.exerciseId,
              completed,
              workout,
              exerciseById.get(line.block.exerciseId),
            )
          : [];

      setState({
        status: "success",
        workout,
        line,
        lines,
        exerciseById,
        history,
        groupVolumeVsLast:
          line.block.kind === "group"
            ? compareGroupVolumeToPrevious(workout, line.block, completed, exerciseById)
            : undefined,
        neighbours: findBlockNeighbours(lines.map((item) => item.block), blockId),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [workoutId, blockId]);

  if (state.status === "loading") {
    return (
      <section className="recap">
        <p className="recap__message">Chargement…</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="recap">
        <Link to={backTo} className="recap__back">‹ Récapitulatif</Link>
        <p className="recap__message">Cette brique est introuvable.</p>
      </section>
    );
  }

  const { workout, line, lines, exerciseById, history, groupVolumeVsLast, neighbours } = state;
  const { block } = line;
  const exercise = block.kind === "exercise" ? exerciseById.get(block.exerciseId) : undefined;
  const original =
    block.kind === "exercise" && block.originalExerciseId
      ? exerciseById.get(block.originalExerciseId)
      : undefined;
  const nameOf = (item: PerformedBlock): string =>
    lines.find((candidate) => candidate.block.id === item.id)?.name ?? "";
  const numberOf = (item: PerformedBlock): string =>
    lines.find((candidate) => candidate.block.id === item.id)?.number ?? "";

  return (
    <section className="recap recap-detail">
      <header className="recap__nav">
        <Link to={backTo} className="recap__back">‹ Récap</Link>
        <div className="recap__title">
          <h1>
            {line.number && `${line.number}. `}
            {exercise?.name ?? line.name}
          </h1>
          <p>{formatFullDate(workout.date)}</p>
        </div>
        <span />
      </header>

      <p className="recap-detail__summary">
        {block.kind !== "note" && (
          <span className={`recap-detail__status recap-detail__status--${block.status}`}>
            {recapStatusLabels[block.status]}
          </span>
        )}
        {block.kind === "exercise" && original && original.id !== block.exerciseId && (
          <span className="recap-detail__substitution">
            {" · "}remplace <strong>{original.name}</strong> (prévu)
          </span>
        )}
        {block.kind !== "note" && block.addedDuringWorkout && workout.sessionTemplateId && (
          <span>{" · "}ajouté pendant la séance</span>
        )}
      </p>

      {block.kind === "exercise" && (
        <ExerciseDetail
          block={block}
          exercise={exercise}
          history={history}
          workoutId={workout.id}
          search={search}
        />
      )}
      {block.kind === "group" && (
        <GroupDetail
          block={block}
          blockNumber={line.number}
          exerciseById={exerciseById}
          volumeVsLast={groupVolumeVsLast}
        />
      )}

      {block.kind === "group" && block.note && <NoteCard note={block.note} />}

      <nav className="recap-detail__nav" aria-label="Brique précédente ou suivante">
        {neighbours.previous ? (
          <Link
            to={`/workouts/${workout.id}/blocks/${neighbours.previous.id}${search}`}
            className="recap-detail__nav-link"
          >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              <small>Précédent</small>
              {numberOf(neighbours.previous) && `${numberOf(neighbours.previous)}. `}
              {nameOf(neighbours.previous)}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {neighbours.next ? (
          <Link
            to={`/workouts/${workout.id}/blocks/${neighbours.next.id}${search}`}
            className="recap-detail__nav-link recap-detail__nav-link--next"
          >
            <span>
              <small>Suivant</small>
              {numberOf(neighbours.next) && `${numberOf(neighbours.next)}. `}
              {nameOf(neighbours.next)}
            </span>
            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Exercice                                                                   */
/* -------------------------------------------------------------------------- */

function ExerciseDetail({
  block,
  exercise,
  history,
  workoutId,
  search,
}: {
  block: PerformedExerciseBlock;
  exercise: Exercise | undefined;
  history: ExerciseHistoryEntry[];
  workoutId: Id;
  search: string;
}) {
  const summary = summarizeExerciseBlock(block, exercise, history);

  return (
    <>
      <SummaryCards summary={summary} />

      {summary.kind === "series" && <SeriesTable block={block} plannedLine={summary.plannedLine} />}
      {summary.kind === "steps" && <StepsTable block={block} />}
      {summary.kind === "simple" && (
        <dl className="recap-detail__planned">
          {summary.plannedLine && (
            <div>
              <dt>Prévu</dt>
              <dd>{summary.plannedLine}</dd>
            </div>
          )}
          <div>
            <dt>Enregistré</dt>
            <dd>
              {summary.label}
              {summary.speed && ` · ${summary.speed}`}
            </dd>
          </div>
          {block.simpleMeasurement?.note && (
            <div>
              <dt>Note</dt>
              <dd>{block.simpleMeasurement.note}</dd>
            </div>
          )}
        </dl>
      )}
      {summary.kind === "none" && (
        <p className="recap__message">Aucune donnée enregistrée pour cet exercice.</p>
      )}

      {block.note && <NoteCard note={block.note} />}

      <ExerciseHistory
        exercise={exercise}
        exerciseId={block.exerciseId}
        history={history}
        workoutId={workoutId}
        blockId={block.id}
        search={search}
      />
    </>
  );
}

function NoteCard({ note }: { note: string }) {
  return (
    <section className="recap-detail__block recap-detail__note-card">
      <NotebookPen size={20} strokeWidth={2} aria-hidden="true" />
      <div>
        <h2>Contexte / Ressenti</h2>
        <p>{note}</p>
      </div>
    </section>
  );
}

/**
 * Les cartes de résumé : chaque valeur avec son prévu et son écart quand
 * la comparaison s'applique, sinon la valeur seule.
 */
function SummaryCards({ summary }: { summary: ExerciseDetailSummary }) {
  if (summary.kind === "series") {
    const missing = summary.seriesPlanned !== undefined ? summary.seriesPlanned - summary.seriesDone : 0;
    const rolesLine = formatSeriesRoleSummary(summary.roles);

    return (
      <div className="recap__cards">
        <div className="recap__card">
          <Layers size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Séries</span>
          <strong>
            {summary.seriesDone}
            {summary.seriesPlanned !== undefined && ` / ${summary.seriesPlanned}`}
          </strong>
          <span className="recap__card-meta">
            {missing > 0
              ? `${missing} non réalisée${missing > 1 ? "s" : ""}`
              : summary.seriesPlanned !== undefined
                ? "toutes réalisées"
                : "sans prévu"}
          </span>
          {rolesLine && <span className="recap__card-meta">{rolesLine}</span>}
        </div>

        {summary.volumeKg !== undefined && (
          <div className="recap__card">
            <BarChart3 size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Volume</span>
            <strong>{formatKg(summary.volumeKg)}</strong>
            {summary.volumeVsLast ? (
              <span className="recap__card-meta recap__card-meta--compare">
                {formatSignedPercent(summary.volumeVsLast.deltaPercent)} vs dernière fois (
                {formatShortDate(summary.volumeVsLast.previousDate)})
              </span>
            ) : (
              <span className="recap__card-meta">sans référence comparable</span>
            )}
          </div>
        )}

        {summary.rpe && (
          <div className="recap__card">
            <Activity size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">RPE moyen</span>
            <strong>{formatDecimal(summary.rpe.value)}</strong>
            <span className="recap__card-meta">
              ({summary.rpe.count} sur {summary.rpe.total} séries)
            </span>
            {formatRpePosition(summary.rpe) && (
              <span className="recap__card-meta recap__card-meta--compare">
                {formatRpePosition(summary.rpe)}
              </span>
            )}
          </div>
        )}

        {summary.rest && (
          <div className="recap__card">
            <Timer size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Repos moyen</span>
            <strong>{formatSeconds(summary.rest.averageSec)}</strong>
            <span className="recap__card-meta">
              {summary.rest.comparableCount} sur {summary.rest.totalCount} repos
            </span>
            {summary.rest.plannedSec !== undefined && summary.rest.deltaSec !== undefined && (
              <span className="recap__card-meta recap__card-meta--compare">
                prévu {formatSeconds(summary.rest.plannedSec)} · {formatSignedSeconds(summary.rest.deltaSec)}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (summary.kind === "steps") {
    return (
      <div className="recap__cards">
        <div className="recap__card">
          <Clock size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Durée totale</span>
          <strong>{formatMinutes(summary.durationSec)}</strong>
          <span className="recap__card-meta">
            {summary.stepsDone} / {summary.stepsPlanned} palier{summary.stepsPlanned > 1 ? "s" : ""}
          </span>
        </div>

        <div className="recap__card">
          <HeartPulse size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Fréquence cardiaque</span>
          {summary.bpm ? (
            <>
              <strong>
                {summary.bpm.min} – {summary.bpm.max} bpm
              </strong>
              <span className="recap__card-meta">
                moy. {Math.round(summary.bpm.average)} · {summary.bpm.count} sur {summary.bpm.total} paliers
              </span>
            </>
          ) : (
            <>
              <strong>—</strong>
              <span className="recap__card-meta">BPM non relevé</span>
            </>
          )}
        </div>

        {summary.ranges && (
          <div className="recap__card">
            <Gauge size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Réglages</span>
            <strong className="recap__card-value--small">{summary.ranges}</strong>
            <span className="recap__card-meta">plages, sans moyenne</span>
          </div>
        )}

        <div className="recap__card">
          <Wrench size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Adaptations</span>
          <strong>{summary.adaptations}</strong>
          <span className="recap__card-meta">
            sur {summary.stepsDone} palier{summary.stepsDone > 1 ? "s" : ""}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Série par série : `# / Réalisé / RPE / Repos`, la note sous sa ligne ;
 * la ligne `Prévu (par série)` reste une consigne, jamais une donnée.
 */
function SeriesTable({
  block,
  plannedLine,
}: {
  block: PerformedExerciseBlock;
  plannedLine: string | undefined;
}) {
  const series = block.series ?? [];
  const target =
    block.snapshotInstructions.shape === "reps" || block.snapshotInstructions.shape === "duration"
      ? block.snapshotInstructions.targetRpe
      : undefined;

  return (
    <>
      {plannedLine && (
        <dl className="recap-detail__planned">
          <div>
            <dt>Prévu (par série)</dt>
            <dd>{plannedLine}</dd>
          </div>
        </dl>
      )}

      <table className="recap-table recap-table--detail">
        <thead>
          <tr>
            <th>#</th>
            <th>Réalisé</th>
            <th>RPE</th>
            <th>Repos</th>
          </tr>
        </thead>
        <tbody>
          {series.map((item, index) => {
            if (item.status !== "completed") {
              return (
                <tr key={item.id} className="recap-table__missing">
                  <td>{index + 1}</td>
                  <td colSpan={3}>{item.status === "not_performed" ? "Non réalisée" : "—"}</td>
                </tr>
              );
            }

            const bare = { ...item };
            delete bare.rpe;
            delete bare.note;
            const line = formatSeriesLine(bare);
            const outOfTarget =
              target !== undefined &&
              item.rpe !== undefined &&
              (item.rpe < target.min || item.rpe > target.max);

            return (
              <Fragment key={item.id}>
                <tr>
                  <td>{index + 1}</td>
                  <td>{line}</td>
                  <td className={outOfTarget ? "recap-table__off-target" : undefined}>
                    {item.rpe ?? "—"}
                  </td>
                  <td>
                    {item.actualRestAfterSec !== undefined ? formatSeconds(item.actualRestAfterSec) : "—"}
                    {item.restComparable === false && (
                      <span className="recap-table__note" title="Repos non comparable"> *</span>
                    )}
                  </td>
                </tr>
                {item.note && (
                  <tr className="recap-table__adapted">
                    <td />
                    <td colSpan={3}>{item.note}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {series.some((item) => item.restComparable === false) && (
        <p className="recap-table__legend">* repos coupé par une pause ou par la fin de séance : non comparable</p>
      )}
      {target && (
        <p className="recap-table__legend">RPE cible {formatRange(target)} ; en orange, hors cible</p>
      )}
    </>
  );
}

/**
 * Palier par palier (§14) : ni RPE ni prévu, l'adaptation sous sa ligne.
 */
function StepsTable({ block }: { block: PerformedExerciseBlock }) {
  const steps = block.cardioSteps ?? [];
  const first = steps.find((step) => step.status === "completed") ?? steps[0];
  const distanceBased = first !== undefined && "distanceKm" in first.settings;

  return (
    <>
      <h2 className="recap-detail__heading">Détail des paliers</h2>
      <table className="recap-table recap-table--detail">
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
            if (step.status !== "completed") {
              return (
                <tr key={step.id} className="recap-table__missing">
                  <td>{index + 1}</td>
                  <td colSpan={distanceBased ? 3 : 4}>
                    {step.status === "not_performed" ? "Non réalisé" : "—"} · prévu{" "}
                    {formatCardioSettingsLine(step.settings)}
                  </td>
                </tr>
              );
            }

            const settings = formatStepSettings(step);

            return (
              <Fragment key={step.id}>
                <tr>
                  <td>{index + 1}</td>
                  <td>{settings.duration}</td>
                  <td>{settings.first}</td>
                  {!distanceBased && <td>{settings.second}</td>}
                  <td>
                    {step.bpm ?? "—"}
                    {step.note && <span className="recap-table__note"> · {step.note}</span>}
                  </td>
                </tr>
                {step.originalSettings && (
                  <tr className="recap-table__adapted">
                    <td />
                    <td colSpan={distanceBased ? 3 : 4}>
                      Adapté pendant la séance · initialement{" "}
                      {formatCardioSettingsLine(step.originalSettings)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="recap__notice recap__notice--tight">
        <Info size={18} strokeWidth={2} aria-hidden="true" />
        <span>
          Le BPM est facultatif : la plage et la moyenne ne portent que sur les paliers où il a été
          relevé.
        </span>
      </p>
    </>
  );
}

/**
 * Les cinq dernières réalisations de l'exercice réellement effectué
 * (Q4) : date, meilleure série, volume ; chacune ouvre son récapitulatif.
 */
function ExerciseHistory({
  exercise,
  exerciseId,
  history,
  workoutId,
  blockId,
  search,
}: {
  exercise: Exercise | undefined;
  exerciseId: Id;
  history: ExerciseHistoryEntry[];
  workoutId: Id;
  blockId: Id;
  search: string;
}) {
  const here = `/workouts/${workoutId}/blocks/${blockId}${search}`;

  return (
    <section className="recap-detail__block">
      <h2 className="recap__section">
        Historique
        {exercise && (
          <Link to={`/exercises/${exerciseId}`} className="recap__section-link">
            Fiche {exercise.name} ›
          </Link>
        )}
      </h2>
      {history.length === 0 ? (
        <p className="recap-detail__empty">
          Première réalisation enregistrée de cet exercice : pas encore d'historique.
        </p>
      ) : (
        <ol className="recap-detail__history">
          {history.map((entry) => (
            <li key={entry.workoutId}>
              <Link to={`/workouts/${entry.workoutId}?returnTo=${encodeURIComponent(here)}`}>
                <span className="recap-detail__history-date">{formatShortDate(entry.date)}</span>
                <span className="recap-detail__history-body">
                  <span>{entry.label}</span>
                  <small>
                    {entry.seriesCount > 0 &&
                      `${entry.seriesCount} série${entry.seriesCount > 1 ? "s" : ""}`}
                    {entry.volumeKg !== undefined && ` · ${formatKg(entry.volumeKg)}`}
                    {!entry.complete && " · partielle"}
                  </small>
                </span>
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Groupe (§14, mockup 19.2)                                                  */
/* -------------------------------------------------------------------------- */

function GroupDetail({
  block,
  blockNumber,
  exerciseById,
  volumeVsLast,
}: {
  block: PerformedGroupBlock;
  blockNumber: string;
  exerciseById: Map<Id, Exercise>;
  volumeVsLast: GroupVolumeVsLast | undefined;
}) {
  const summary = summarizeGroupBlock(block, volumeVsLast, exerciseById);
  const structure = describeGroupStructure(block, blockNumber);
  const substitutions = listGroupSubstitutions(block);
  const rounds = describeGroupRounds(block);
  const missingRounds = summary.roundsPlanned - summary.roundsDone;
  const name = (exerciseId: Id) => exerciseName(exerciseById, exerciseId);
  const labelOf = (groupChildId: Id) =>
    structure.find((child) => child.groupChildId === groupChildId)?.label ?? "";

  return (
    <>
      <div className="recap__cards">
        <div className="recap__card">
          <Layers size={20} strokeWidth={2} aria-hidden="true" />
          <span className="recap__card-label">Tours</span>
          <strong>
            {summary.roundsDone} / {summary.roundsPlanned}
          </strong>
          <span className="recap__card-meta">
            {missingRounds > 0
              ? `${missingRounds} non réalisé${missingRounds > 1 ? "s" : ""} ou partiel${missingRounds > 1 ? "s" : ""}`
              : `${summary.childrenCount} exercices`}
          </span>
        </div>

        {summary.volumeKg !== undefined && (
          <div className="recap__card">
            <BarChart3 size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Volume total</span>
            <strong>{formatKg(summary.volumeKg)}</strong>
            {summary.volumeVsLast ? (
              <span className="recap__card-meta recap__card-meta--compare">
                {formatSignedPercent(summary.volumeVsLast.deltaPercent)} vs dernière fois (
                {formatShortDate(summary.volumeVsLast.previousDate)})
              </span>
            ) : (
              <span className="recap__card-meta">sans référence comparable</span>
            )}
          </div>
        )}

        {summary.rpe && (
          <div className="recap__card">
            <Activity size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">RPE moyen</span>
            <strong>{formatDecimal(summary.rpe.value)}</strong>
            <span className="recap__card-meta">
              ({summary.rpe.count} sur {summary.rpe.total} séries)
            </span>
          </div>
        )}

        {summary.restBetweenRounds && (
          <div className="recap__card">
            <Timer size={20} strokeWidth={2} aria-hidden="true" />
            <span className="recap__card-label">Repos entre tours</span>
            <strong>{formatSeconds(summary.restBetweenRounds.averageSec)}</strong>
            <span className="recap__card-meta">
              {summary.restBetweenRounds.comparableCount} sur {summary.restBetweenRounds.totalCount} repos
            </span>
            <span className="recap__card-meta recap__card-meta--compare">
              prévu {formatSeconds(summary.restBetweenRounds.plannedSec)} ·{" "}
              {formatSignedSeconds(summary.restBetweenRounds.deltaSec)}
            </span>
          </div>
        )}
      </div>

      {summary.restBeforeChildren && (
        <p className="recap-table__legend recap-detail__aside">
          Repos avant un exercice : {summary.restBeforeChildren.count},{" "}
          {formatSeconds(summary.restBeforeChildren.totalSec)} au total — conservés ci-dessous, hors du
          repos moyen.
        </p>
      )}

      {substitutions.length > 0 && (
        <section className="recap-detail__block">
          <h2 className="recap-detail__heading">Substitutions</h2>
          <ul className="recap-detail__substitutions">
            {substitutions.map((item) => (
              <li key={`${item.groupChildId}-${item.fromRound}`}>
                <Repeat size={16} strokeWidth={2} aria-hidden="true" />
                <span>
                  <strong>{labelOf(item.groupChildId)}.</strong> {name(item.fromExerciseId)} →{" "}
                  <strong>{name(item.toExerciseId)}</strong> · à partir du tour {item.fromRound}
                  {item.roundsDone === 0
                    ? " · aucun tour réalisé"
                    : ` · ${item.roundsDone} tour${item.roundsDone > 1 ? "s" : ""} réalisé${item.roundsDone > 1 ? "s" : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="recap-detail__block">
        <h2 className="recap__section">
          Structure prévue
          <span className="recap__section-meta">
            {block.plannedRounds} tour{block.plannedRounds > 1 ? "s" : ""}
          </span>
        </h2>
        <ol className="recap-detail__structure">
          {structure.map((child) => (
            <li key={child.groupChildId}>
              <span className="recap-detail__structure-label">{child.label}</span>
              <span className="recap-detail__structure-body">
                <strong>{name(child.exerciseId)}</strong>
                <small>
                  {child.instructions}
                  {child.restBeforeSec !== undefined &&
                    ` · repos avant : ${formatSeconds(child.restBeforeSec)}`}
                </small>
              </span>
            </li>
          ))}
          <li className="recap-detail__structure-rest">
            <Timer size={16} strokeWidth={2} aria-hidden="true" />
            <span>Repos entre tours : {formatSeconds(block.plannedRestBetweenRoundsSec)}</span>
          </li>
        </ol>
      </section>

      <section className="recap-detail__block">
        <h2 className="recap__section">
          Réalisation
          <span className="recap__section-meta">
            {summary.roundsDone} tour{summary.roundsDone > 1 ? "s" : ""} sur {summary.roundsPlanned}
          </span>
        </h2>
        <div className="recap-detail__rounds">
          {rounds.map((round) => (
            <RoundCard key={round.roundNumber} round={round} name={name} labelOf={labelOf} />
          ))}
        </div>
      </section>

      {rounds.some((round) => round.restAfter) && (
        <section className="recap-detail__block">
          <h2 className="recap-detail__heading">Repos réels entre tours</h2>
          <ul className="recap-detail__rests">
            {rounds
              .flatMap((round) => (round.restAfter ? [round.restAfter] : []))
              .map((rest) => (
                <li key={rest.fromRound}>
                  <span>
                    Tour {rest.fromRound} → {rest.toRound}
                  </span>
                  <span>{describeRoundRest(rest)}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * `100 s (prévu 90 s) · ajusté +30 s · hors moyenne` — ou `non pris`.
 */
function describeRoundRest(rest: RoundRestView) {
  if (rest.actualSec === undefined) {
    return <em>non pris (prévu {formatSeconds(rest.plannedSec)})</em>;
  }

  return (
    <>
      <strong>{formatSeconds(rest.actualSec)}</strong> (prévu {formatSeconds(rest.plannedSec)})
      {rest.adjustmentSec !== undefined &&
        ` · ajusté ${rest.adjustmentSec > 0 ? "+" : "−"}${formatSeconds(Math.abs(rest.adjustmentSec))}`}
      {!rest.comparable && <em> · hors moyenne (pause ou fin de séance)</em>}
    </>
  );
}

const roundStatusLabel = {
  completed: "complet",
  partial: "partiel",
  not_performed: "non réalisé",
} as const;

/**
 * Un tour : chaque enfant avec l'exercice réellement fait, ses valeurs,
 * son repos avant s'il a eu lieu ; le repos qui a suivi le tour.
 */
function RoundCard({
  round,
  name,
  labelOf,
}: {
  round: GroupRoundView;
  name: (exerciseId: Id) => string;
  labelOf: (groupChildId: Id) => string;
}) {
  return (
    <section className={`recap-detail__round recap-detail__round--${round.status}`}>
      <h3>
        Tour {round.roundNumber}
        <span className={`recap-detail__round-status recap-detail__round-status--${round.status}`}>
          {round.status === "partial"
            ? `${roundStatusLabel.partial} · ${round.doneCount} sur ${round.children.length}`
            : roundStatusLabel[round.status]}
        </span>
      </h3>
      <table className="recap-table recap-table--detail">
        <thead>
          <tr>
            <th>#</th>
            <th>Exercice</th>
            <th>Réalisé</th>
            <th>RPE</th>
          </tr>
        </thead>
        <tbody>
          {round.children.map((child) => {
            const bare = child.series ? { ...child.series } : undefined;
            if (bare) {
              delete bare.rpe;
              delete bare.note;
            }
            const showRestBefore =
              child.restBefore && (child.restBefore.actualSec !== undefined || child.series);

            return (
              <Fragment key={child.groupChildId}>
                {showRestBefore && child.restBefore && (
                  <tr className="recap-table__adapted">
                    <td />
                    <td colSpan={3}>
                      Repos avant :{" "}
                      {child.restBefore.actualSec !== undefined
                        ? formatSeconds(child.restBefore.actualSec)
                        : "non pris"}
                      {child.restBefore.plannedSec !== undefined &&
                        ` (prévu ${formatSeconds(child.restBefore.plannedSec)})`}
                      {" · hors repos moyen"}
                    </td>
                  </tr>
                )}
                <tr className={child.series ? undefined : "recap-table__missing"}>
                  <td>{labelOf(child.groupChildId)}</td>
                  <td>
                    {name(child.exerciseId)}
                    {child.substituted && (
                      <span className="recap-table__note" title="Remplaçant">
                        {" "}
                        ↺
                      </span>
                    )}
                  </td>
                  {bare ? (
                    <>
                      <td>{formatSeriesLine(bare)}</td>
                      <td>{child.series?.rpe ?? "—"}</td>
                    </>
                  ) : (
                    <td colSpan={2}>Non réalisé</td>
                  )}
                </tr>
                {child.series?.note && (
                  <tr className="recap-table__adapted">
                    <td />
                    <td colSpan={3}>{child.series.note}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {round.restAfter && (
        <p className="recap-detail__round-rest">
          <Timer size={14} strokeWidth={2} aria-hidden="true" />
          <span>Repos après le tour : {describeRoundRest(round.restAfter)}</span>
        </p>
      )}
    </section>
  );
}
