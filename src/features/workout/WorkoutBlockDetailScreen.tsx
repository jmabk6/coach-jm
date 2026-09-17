import { Fragment, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  Exercise,
  Id,
  PerformedBlock,
  PerformedExerciseBlock,
  PerformedGroupBlock,
  WorkoutSession,
} from "../../domain";
import { getAllExercises } from "../../db/repositories/exerciseRepository";
import { getWorkout } from "../../db/repositories/workoutRepository";
import { formatFullDate } from "../../domain/rules/programRules";
import {
  buildWorkoutRecapLines,
  formatCardioSettingsLine,
  formatDecimal,
  formatKg,
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
      exerciseById: Map<Id, Exercise>;
    };

/**
 * Détail d'une brique d'une réalisation (§14, décision Q3) : ce que la
 * ligne du récapitulatif dépliait autrefois — séries, paliers, mesure,
 * tours. La confrontation au prévu, l'historique et la navigation entre
 * briques arrivent en 7.2 et 7.3 ; rien de l'ancien dépliage n'est perdu.
 */
export function WorkoutBlockDetailScreen() {
  const { workoutId, blockId } = useParams<{ workoutId: string; blockId: string }>();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const returnTo = searchParams.get("returnTo") ?? "/programme";
  const backTo = workoutId
    ? `/workouts/${workoutId}?returnTo=${encodeURIComponent(returnTo)}`
    : returnTo;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workoutId || !blockId) {
        setState({ status: "missing" });
        return;
      }

      const [workout, exercises] = await Promise.all([getWorkout(workoutId), getAllExercises()]);

      if (cancelled) return;

      const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
      const lines = workout ? buildWorkoutRecapLines(workout, exerciseById) : [];
      const { planned, added } = splitRecapLines(lines, workout?.sessionTemplateId !== undefined);
      const line = [...planned, ...added].find((item) => item.block.id === blockId);

      if (!workout || !line) {
        setState({ status: "missing" });
        return;
      }

      setState({ status: "success", workout, line, exerciseById });
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

  const { workout, line, exerciseById } = state;
  const { block } = line;

  return (
    <section className="recap">
      <header className="recap__nav">
        <Link to={backTo} className="recap__back">‹ Récapitulatif</Link>
        <div className="recap__title">
          <h1>
            {line.number && `${line.number}. `}
            {line.name}
          </h1>
          <p>{formatFullDate(workout.date)}</p>
        </div>
        <span />
      </header>

      <p className="recap-detail__summary">
        <StatusLabel block={block} />
        {line.subtitle}
        {line.volumeKg !== undefined && ` · ${formatKg(line.volumeKg)}`}
        {line.rpe !== undefined && ` · RPE ${formatDecimal(line.rpe)}`}
      </p>

      {block.kind === "exercise" && <ExerciseDetail block={block} />}
      {block.kind === "group" && <GroupDetail block={block} exerciseById={exerciseById} />}

      {block.kind !== "note" && block.note && (
        <p className="recap-line__note recap-detail__note">{block.note}</p>
      )}
    </section>
  );
}

function StatusLabel({ block }: { block: PerformedBlock }) {
  if (block.kind === "note") return null;

  return (
    <span className={`recap-detail__status recap-detail__status--${block.status}`}>
      {recapStatusLabels[block.status]}
      {" · "}
    </span>
  );
}

/**
 * Détail série par série ou palier par palier (§14) : les notes se
 * lisent sur la ligne, jamais dans un bloc à part.
 */
function ExerciseDetail({ block }: { block: PerformedExerciseBlock }) {
  const steps = (block.cardioSteps ?? []).filter((step) => step.status === "completed");
  const series = (block.series ?? []).filter((item) => item.status === "completed");

  if (steps.length > 0) {
    const distanceBased = steps[0] && "distanceKm" in steps[0].settings;

    return (
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
    );
  }

  if (series.length > 0) {
    return (
      <ol className="recap-series recap-series--detail">
        {series.map((item, index) => (
          <li key={item.id}>
            <span className="recap-series__number">{index + 1}</span>
            <span>
              {formatSeriesLine(item)}
              {item.actualRestAfterSec !== undefined &&
                ` · repos ${formatSeconds(item.actualRestAfterSec)}`}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  if (block.simpleMeasurement?.note) {
    return <p className="recap-line__note recap-detail__note">{block.simpleMeasurement.note}</p>;
  }

  return null;
}

/**
 * Tour par tour, tel que réalisé : l'exercice de chaque ligne est celui
 * réellement fait dans ce tour (une substitution se lit ligne par ligne).
 */
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
