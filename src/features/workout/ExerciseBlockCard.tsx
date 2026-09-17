import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import type {
  Exercise,
  Id,
  PerformedExerciseBlock,
  PerformedSeries,
} from "../../domain";
import type { SeriesValues } from "./engine/workoutEngine";
import { proposeSeriesValues } from "./engine/workoutBlocks";
import type { LastPerformance } from "./lastPerformance";
import { SeriesForm } from "./SeriesForm";
import {
  formatBlockStatus,
  formatExerciseSubtitle,
  formatPlannedLine,
  formatSeriesTarget,
  formatShortDate,
  seriesFieldLayout,
} from "./workoutDisplay";
import { formatSeriesLine, formatStepSettings } from "./workoutRecap";

interface ExerciseBlockCardProps {
  block: PerformedExerciseBlock;
  number: number | undefined;
  exercise: Exercise | undefined;
  lastTime: LastPerformance | undefined;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onValidateSeries: (seriesId: Id, values: SeriesValues) => void;
  onEditSeries: (seriesId: Id, values: SeriesValues) => void;
  onAddSeries: () => void;
}

/**
 * Carte d'un exercice autonome pendant la séance (§11, mockup 15) :
 * repliée sur son résumé, dépliée avec le bloc de lecture (`Prévu`,
 * `Dernière fois`) puis les séries empilées — terminée, active, à venir —
 * et `Ajouter une série`.
 */
export function ExerciseBlockCard({
  block,
  number,
  exercise,
  lastTime,
  expanded,
  busy,
  onToggle,
  onValidateSeries,
  onEditSeries,
  onAddSeries,
}: ExerciseBlockCardProps) {
  const [editingId, setEditingId] = useState<Id>();
  const name = exercise?.name ?? "Exercice supprimé";
  const status = formatBlockStatus(block);
  const performed = block.status === "performed";
  const url = exercise?.media?.thumbnailUrl ?? exercise?.media?.photoUrl;

  return (
    <li
      className={`wblock ${expanded ? "wblock--open" : ""} ${
        performed ? "wblock--done" : ""
      } ${block.status === "skipped" ? "wblock--skipped" : ""}`}
    >
      <button type="button" className="wblock__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="wblock__thumb" aria-hidden="true">
          {url ? <img src={url} alt="" loading="lazy" /> : null}
        </span>
        <span className="wblock__body">
          <span className="wblock__name">
            {number !== undefined ? `${number}. ` : ""}
            {name}
          </span>
          <span className="wblock__meta">
            {formatExerciseSubtitle(block)}
            {block.addedDuringWorkout && (
              <span className="wblock__added">Ajouté pendant la séance</span>
            )}
          </span>
        </span>
        <span className="wblock__aside">
          {performed ? (
            <span className="wblock__check" aria-label="Terminé">
              <Check size={16} strokeWidth={3} aria-hidden="true" />
            </span>
          ) : (
            <span className="wblock__status">{status}</span>
          )}
          {expanded ? (
            <ChevronUp size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && block.series && (
        <div className="wblock__content">
          <ReferenceBlock block={block} lastTime={lastTime} />

          <ol className="wseries">
            {[...block.series]
              .sort((a, b) => a.position - b.position)
              .map((series, index) => (
                <SeriesRow
                  key={series.id}
                  block={block}
                  series={series}
                  index={index}
                  exercise={exercise}
                  lastTime={lastTime}
                  editing={editingId === series.id}
                  busy={busy}
                  onEdit={() => setEditingId(series.id)}
                  onCancelEdit={() => setEditingId(undefined)}
                  onValidate={(values) => onValidateSeries(series.id, values)}
                  onSaveEdit={(values) => {
                    setEditingId(undefined);
                    onEditSeries(series.id, values);
                  }}
                />
              ))}
          </ol>

          <button type="button" className="wblock__add-series" onClick={onAddSeries} disabled={busy}>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            Ajouter une série
          </button>
        </div>
      )}

      {expanded && block.cardioSteps && (
        <div className="wblock__content">
          <ol className="wseries">
            {block.cardioSteps.map((step, index) => {
              const settings = formatStepSettings(step);

              return (
                <li key={step.id} className="wseries__row wseries__row--upcoming">
                  <span className="wseries__bullet">{index + 1}</span>
                  <span className="wseries__body">
                    <span className="wseries__title">Palier {index + 1}</span>
                    <span className="wseries__meta">
                      {settings.duration} · {settings.first} · {settings.second}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="wblock__soon">
            La saisie des paliers arrive à l'étape 6.4. Les paliers sont notés ici en lecture.
          </p>
        </div>
      )}

      {expanded && block.simpleMeasurement && !block.series && !block.cardioSteps && (
        <div className="wblock__content">
          <p className="wblock__soon">La saisie d'une mesure simple arrive à l'étape 6.4.</p>
        </div>
      )}
    </li>
  );
}

function ReferenceBlock({
  block,
  lastTime,
}: {
  block: PerformedExerciseBlock;
  lastTime: LastPerformance | undefined;
}) {
  const planned = formatPlannedLine(block);

  if (!planned && !lastTime) return null;

  return (
    <dl className="wref">
      {planned && (
        <div>
          <dt>Prévu</dt>
          <dd>{planned}</dd>
        </div>
      )}
      {lastTime && (
        <div>
          <dt>Dernière fois</dt>
          <dd>
            {formatSeriesLine(lastTime.series)}
            <small>{formatShortDate(lastTime.date)}</small>
          </dd>
        </div>
      )}
    </dl>
  );
}

interface SeriesRowProps {
  block: PerformedExerciseBlock;
  series: PerformedSeries;
  index: number;
  exercise: Exercise | undefined;
  lastTime: LastPerformance | undefined;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onValidate: (values: SeriesValues) => void;
  onSaveEdit: (values: SeriesValues) => void;
}

function SeriesRow({
  block,
  series,
  index,
  exercise,
  lastTime,
  editing,
  busy,
  onEdit,
  onCancelEdit,
  onValidate,
  onSaveEdit,
}: SeriesRowProps) {
  const label = `Série ${index + 1}`;
  const layout = seriesFieldLayout(exercise);

  if (series.status === "completed") {
    return (
      <li className={`wseries__row wseries__row--done ${editing ? "wseries__row--editing" : ""}`}>
        <span className="wseries__bullet wseries__bullet--done" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="wseries__body">
          <span className="wseries__title">{label}</span>
          <span className="wseries__meta">{formatSeriesLine(series)}</span>
        </span>
        {!editing && (
          <button type="button" className="wseries__edit" onClick={onEdit}>
            Modifier
          </button>
        )}
        {editing && (
          <div className="wseries__form">
            <SeriesForm
              key={`edit-${series.id}`}
              layout={layout}
              initial={{
                ...(series.load ? { load: series.load } : {}),
                ...(series.reps !== undefined ? { reps: series.reps } : {}),
                ...(series.durationSec !== undefined ? { durationSec: series.durationSec } : {}),
                ...(series.sideValues ? { sideValues: series.sideValues } : {}),
                ...(series.rpe !== undefined ? { rpe: series.rpe } : {}),
                ...(series.note !== undefined ? { note: series.note } : {}),
              }}
              submitLabel="Enregistrer"
              onSubmit={onSaveEdit}
              onCancel={onCancelEdit}
              busy={busy}
            />
          </div>
        )}
      </li>
    );
  }

  if (series.status === "active") {
    const proposed = proposeSeriesValues(block, lastTime?.series);

    return (
      <li className="wseries__row wseries__row--active">
        <span className="wseries__bullet wseries__bullet--active">{index + 1}</span>
        <span className="wseries__body">
          <span className="wseries__title">{label}</span>
          <span className="wseries__meta">{formatSeriesTarget(block)}</span>
        </span>
        <div className="wseries__form">
          <SeriesForm
            key={`entry-${series.id}`}
            layout={layout}
            initial={proposed}
            submitLabel={`Valider la série ${index + 1}`}
            onSubmit={onValidate}
            busy={busy}
          />
        </div>
      </li>
    );
  }

  return (
    <li className="wseries__row wseries__row--upcoming">
      <span className="wseries__bullet">{index + 1}</span>
      <span className="wseries__body">
        <span className="wseries__title">{label}</span>
        <span className="wseries__meta">{formatSeriesTarget(block)}</span>
      </span>
      <span className="wseries__state">
        {series.status === "not_performed" ? "Non réalisée" : "À venir"}
      </span>
    </li>
  );
}
