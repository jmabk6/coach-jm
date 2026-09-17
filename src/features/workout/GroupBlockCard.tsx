import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Hourglass, Plus } from "lucide-react";
import type {
  Exercise,
  Id,
  PerformedGroupBlock,
  PerformedGroupChild,
  PerformedGroupRoundChild,
  PerformedSeries,
} from "../../domain";
import {
  formatGroupChildInstructionsRow,
  formatDurationShort,
} from "../../domain/rules/blockInstructionRules";
import type { SeriesValues } from "./engine/workoutEngine";
import { proposeRoundChildValues } from "./engine/workoutBlocks";
import type { LastPerformance } from "./lastPerformance";
import { SeriesForm } from "./SeriesForm";
import { formatLoadSuggestion, suggestLoad } from "./suggestedLoad";
import { formatBlockStatus, formatMmSs, formatShortDate, seriesFieldLayout } from "./workoutDisplay";
import { formatSeriesLine } from "./workoutRecap";

interface GroupBlockCardProps {
  block: PerformedGroupBlock;
  number: number | undefined;
  exerciseById: Map<Id, Exercise>;
  lastByExercise: Map<Id, LastPerformance>;
  expanded: boolean;
  busy: boolean;
  /**
   * Carte de repos de fin de tour, à afficher en tête du contenu.
   */
  restCard?: ReactNode;
  /**
   * Bande `Repos avant cet exercice` (§12) : une ligne dans le tour,
   * sans ajustement ni barre basse.
   */
  restBand?: ReactNode;
  onToggle: () => void;
  onValidateChild: (roundId: Id, roundChildId: Id, values: SeriesValues) => void;
  onEditChild: (roundId: Id, roundChildId: Id, values: SeriesValues) => void;
  onAddRound: () => void;
}

/**
 * Groupe pendant la séance (§11) : l'affichage se fait par tour, pas par
 * exercice — une boucle. `Tour 1 ✓` / `Tour 2 en cours` / `Tour 3 à
 * venir` ; dans le tour, les enfants dans l'ordre `1a`, `1b`, avec le
 * bloc de lecture et la saisie sur l'enfant courant, puis
 * `Valider 1a → passer à 1b` ou `Valider — fin du tour N`.
 */
export function GroupBlockCard({
  block,
  number,
  exerciseById,
  lastByExercise,
  expanded,
  busy,
  restCard,
  restBand,
  onToggle,
  onValidateChild,
  onEditChild,
  onAddRound,
}: GroupBlockCardProps) {
  const [openRoundId, setOpenRoundId] = useState<Id>();
  const [editingId, setEditingId] = useState<Id>();
  const performed = block.status === "performed";
  const children = [...block.children].sort((a, b) => a.position - b.position);
  const rounds = [...block.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const activeRound = rounds.find((round) => round.status === "active") ?? rounds.find((round) => round.status !== "completed");
  const label = (child: PerformedGroupChild) =>
    `${number ?? ""}${String.fromCharCode(97 + children.indexOf(child))}`;
  const nameOf = (exerciseId: Id) => exerciseById.get(exerciseId)?.name ?? "Exercice";

  return (
    <li
      className={`wblock ${expanded ? "wblock--open" : ""} ${performed ? "wblock--done" : ""} ${
        block.status === "skipped" ? "wblock--skipped" : ""
      }`}
    >
      <button type="button" className="wblock__head wblock__head--static" onClick={onToggle} aria-expanded={expanded}>
        <span className="wblock__body">
          <span className="wblock__name">
            {number !== undefined ? `${number}. ` : ""}
            {block.name?.trim() || `Groupe ${number ?? ""}`}
          </span>
          <span className="wblock__meta">
            {rounds.length} tours · {children.length} exercices · repos{" "}
            {formatDurationShort(block.plannedRestBetweenRoundsSec)} entre les tours
          </span>
        </span>
        <span className="wblock__aside">
          {performed ? (
            <span className="wblock__check" aria-label="Terminé">
              <Check size={16} strokeWidth={3} aria-hidden="true" />
            </span>
          ) : (
            <span className="wblock__status">{formatBlockStatus(block)}</span>
          )}
          {expanded ? (
            <ChevronUp size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="wblock__content">
          {restCard}

          <ol className="wrounds">
            {rounds.map((round) => {
              const isActive = round.id === activeRound?.id && round.status !== "completed";
              const isOpen = isActive || openRoundId === round.id;

              return (
                <li
                  key={round.id}
                  className={`wround ${round.status === "completed" ? "wround--done" : ""} ${
                    isActive ? "wround--active" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="wround__head"
                    onClick={() =>
                      !isActive && setOpenRoundId((value) => (value === round.id ? undefined : round.id))
                    }
                    aria-expanded={isOpen}
                  >
                    <span className={`wseries__bullet ${round.status === "completed" ? "wseries__bullet--done" : isActive ? "wseries__bullet--active" : ""}`}>
                      {round.status === "completed" ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : round.roundNumber}
                    </span>
                    <span className="wround__title">
                      Tour {round.roundNumber}
                      <small>
                        {round.status === "completed"
                          ? "terminé"
                          : isActive
                            ? "en cours"
                            : round.status === "not_performed"
                              ? "non réalisé"
                              : "à venir"}
                      </small>
                    </span>
                    {round.actualRestAfterSec !== undefined && (
                      <span className="wround__rest">
                        <Hourglass size={14} strokeWidth={2} aria-hidden="true" />
                        {formatMmSs(round.actualRestAfterSec)}
                        {round.restComparable === false ? " · hors moyenne" : ""}
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <ol className="wround__children">
                      {children.map((child, index) => {
                        const roundChild = round.children.find((item) => item.groupChildId === child.id);

                        if (!roundChild) return null;

                        const done = roundChild.completedAt !== undefined;
                        const isCurrent =
                          isActive &&
                          !done &&
                          children.slice(0, index).every(
                            (previous) =>
                              round.children.find((item) => item.groupChildId === previous.id)?.completedAt !== undefined,
                          );
                        const nextChild = children[index + 1];
                        const editing = editingId === roundChild.id;

                        return (
                          <li
                            key={roundChild.id}
                            className={`wseries__row ${done ? "wseries__row--done" : isCurrent ? "wseries__row--active" : "wseries__row--upcoming"} ${editing ? "wseries__row--editing" : ""}`}
                          >
                            <span className={`wseries__bullet ${done ? "wseries__bullet--done" : isCurrent ? "wseries__bullet--active" : ""}`}>
                              {done ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : label(child)}
                            </span>
                            <span className="wseries__body">
                              <span className="wseries__title">
                                {label(child)} {nameOf(roundChild.exerciseId)}
                              </span>
                              <span className="wseries__meta">
                                {done
                                  ? formatSeriesLine(roundChildAsSeries(roundChild))
                                  : formatGroupChildInstructionsRow(child.snapshotInstructions)}
                              </span>
                              {roundChild.actualRestBeforeSec !== undefined && (
                                <span className="wseries__rest">
                                  Repos avant : {formatMmSs(roundChild.actualRestBeforeSec)} (prévu{" "}
                                  {formatDurationShort(child.snapshotRestBeforeSec ?? 0)})
                                </span>
                              )}
                            </span>

                            {done && !editing && (
                              <button type="button" className="wseries__edit" onClick={() => setEditingId(roundChild.id)}>
                                Modifier
                              </button>
                            )}

                            {done && editing && (
                              <div className="wseries__form">
                                <SeriesForm
                                  key={`edit-${roundChild.id}`}
                                  layout={seriesFieldLayout(exerciseById.get(roundChild.exerciseId))}
                                  initial={roundChildAsSeries(roundChild)}
                                  submitLabel="Enregistrer"
                                  onSubmit={(values) => {
                                    setEditingId(undefined);
                                    onEditChild(round.id, roundChild.id, values);
                                  }}
                                  onCancel={() => setEditingId(undefined)}
                                  busy={busy}
                                />
                              </div>
                            )}

                            {isCurrent && (
                              <div className="wseries__form">
                                {restBand}
                                <ChildReference
                                  child={child}
                                  lastTime={lastByExercise.get(roundChild.exerciseId)}
                                />
                                <SeriesForm
                                  key={`entry-${roundChild.id}`}
                                  layout={seriesFieldLayout(exerciseById.get(roundChild.exerciseId))}
                                  initial={proposeRoundChildValues(
                                    block,
                                    child.id,
                                    lastByExercise.get(roundChild.exerciseId)?.series,
                                  )}
                                  submitLabel={
                                    nextChild
                                      ? `Valider ${label(child)} → passer à ${label(nextChild)}`
                                      : `Valider — fin du tour ${round.roundNumber}`
                                  }
                                  onSubmit={(values) => onValidateChild(round.id, roundChild.id, values)}
                                  busy={busy}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>

          <button type="button" className="wblock__add-series" onClick={onAddRound} disabled={busy}>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            Ajouter un tour
          </button>
        </div>
      )}
    </li>
  );
}

function roundChildAsSeries(child: PerformedGroupRoundChild): PerformedSeries {
  return {
    id: child.id,
    position: 0,
    status: "completed",
    ...(child.load !== undefined ? { load: child.load } : {}),
    ...(child.reps !== undefined ? { reps: child.reps } : {}),
    ...(child.durationSec !== undefined ? { durationSec: child.durationSec } : {}),
    ...(child.sideValues !== undefined ? { sideValues: child.sideValues } : {}),
    ...(child.rpe !== undefined ? { rpe: child.rpe } : {}),
    ...(child.note !== undefined ? { note: child.note } : {}),
    ...(child.completedAt !== undefined ? { completedAt: child.completedAt } : {}),
  };
}

/**
 * Bloc de lecture d'un enfant : `Prévu` (cibles, jamais le nombre de
 * tours déjà visible), `Dernière fois`, `Conseillé`.
 */
function ChildReference({
  child,
  lastTime,
}: {
  child: PerformedGroupChild;
  lastTime: LastPerformance | undefined;
}) {
  const instructions = child.snapshotInstructions;
  const suggestion =
    instructions.shape === "reps"
      ? suggestLoad(lastTime, instructions.reps, instructions.targetRpe)
      : undefined;

  return (
    <dl className="wref">
      <div>
        <dt>Prévu</dt>
        <dd>{formatGroupChildInstructionsRow(instructions)}</dd>
      </div>
      {lastTime && (
        <div>
          <dt>Dernière fois</dt>
          <dd>
            {formatSeriesLine(lastTime.series)}
            <small>{formatShortDate(lastTime.date)}</small>
          </dd>
        </div>
      )}
      {suggestion && (
        <div>
          <dt>Conseillé</dt>
          <dd>{formatLoadSuggestion(suggestion)}</dd>
        </div>
      )}
    </dl>
  );
}

