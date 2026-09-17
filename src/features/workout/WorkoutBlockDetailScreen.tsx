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
      neighbours: BlockNeighbours;
    };

/**
 * Détail d'une brique d'une réalisation (§14, mockup 19.3, décisions Q3
 * et Q4) : résumé confronté au prévu quand la comparaison s'applique,
 * données enregistrées série par série ou palier par palier, ligne
 * `Prévu (par série)`, notes et adaptations, cinq dernières réalisations
 * de l'exercice réellement effectué, navigation précédent / suivant.
 * Le détail d'un groupe reste minimal jusqu'en 7.3.
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
              workout.id,
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

  const { workout, line, lines, exerciseById, history, neighbours } = state;
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
      {block.kind === "group" && <GroupDetail block={block} exerciseById={exerciseById} />}

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
/* Groupe (minimal jusqu'en 7.3)                                              */
/* -------------------------------------------------------------------------- */

function GroupDetail({
  block,
  exerciseById,
}: {
  block: PerformedGroupBlock;
  exerciseById: Map<Id, Exercise>;
}) {
  const rounds = [...block.rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  return (
    <div className="recap-detail__rounds">
      {rounds.map((round) => {
        const done = round.children.filter((child) => child.completedAt !== undefined);

        if (done.length === 0) return null;

        return (
          <section key={round.id} className="recap-detail__round">
            <h2>
              Tour {round.roundNumber}
              {round.actualRestAfterSec !== undefined &&
                ` · repos ${formatSeconds(round.actualRestAfterSec)}`}
            </h2>
            <ol className="recap-series recap-series--detail">
              {done.map((child, index) => (
                <li key={child.id}>
                  <span className="recap-series__number">{index + 1}</span>
                  <span>
                    <strong>{exerciseById.get(child.exerciseId)?.name ?? "Exercice supprimé"}</strong>
                    {" · "}
                    {formatSeriesLine({
                      id: child.id,
                      position: index,
                      status: "completed",
                      ...(child.load !== undefined ? { load: child.load } : {}),
                      ...(child.reps !== undefined ? { reps: child.reps } : {}),
                      ...(child.durationSec !== undefined ? { durationSec: child.durationSec } : {}),
                      ...(child.sideValues !== undefined ? { sideValues: child.sideValues } : {}),
                      ...(child.rpe !== undefined ? { rpe: child.rpe } : {}),
                      ...(child.note !== undefined ? { note: child.note } : {}),
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
