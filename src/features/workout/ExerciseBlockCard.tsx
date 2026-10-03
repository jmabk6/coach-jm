import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, EllipsisVertical, Plus, Target } from "lucide-react";
import { advisedLoadOf, formatAdvisedLoad } from "./advisedLoad";
import type {
  CardioStepSettings,
  Exercise,
  Id,
  PerformedCardioStep,
  PerformedExerciseBlock,
  PerformedSeries,
  RpeScaleVersion,
  SessionStepInstruction,
  StrengthFrameVersion,
} from "../../domain";
import { formatRange, formatStepPrescription } from "../../domain/rules/blockInstructionRules";
import { getLoadKg } from "../../domain/rules/workoutRules";
import { formatFrameVersionSummary, formatStrengthValue } from "../../domain/rules/strengthRules";
import { loadSemanticsOf } from "../../domain/rules/loadSemanticsRules";
import { effectivePowerUnit } from "../../domain/rules/powerRules";
import type {
  SeriesValues,
  SimpleMeasurementValues,
  StepValues,
} from "./engine/workoutEngine";
import {
  hasCompletedEntries,
  isOpenEndedBlock,
  proposeSeriesValues,
} from "./engine/workoutBlocks";
import type { LastComparableStep, LastPerformance } from "./lastPerformance";
import { SeriesForm } from "./SeriesForm";
import type { BetSet } from "../goals/tractionBet";
import { formatDecimal } from "./workoutRecap";
import { SimpleMeasurementForm } from "./SimpleMeasurementForm";
import { StepForm } from "./StepForm";
import { formatFrameLoadSuggestion, formatLoadSuggestion, suggestFrameLoad, suggestLoad } from "./suggestedLoad";
import {
  formatBlockStatus,
  formatExerciseSubtitle,
  formatMmSs,
  formatPlannedLine,
  formatSeriesTarget,
  formatShortDate,
  seriesFieldLayout,
} from "./workoutDisplay";
import {
  formatCardioSettingsLine,
  formatSeriesLine,
  formatSimpleMeasurement,
} from "./workoutRecap";

interface ExerciseBlockCardProps {
  block: PerformedExerciseBlock;
  number: number | undefined;
  exercise: Exercise | undefined;
  lastTime: LastPerformance | undefined;
  expanded: boolean;
  busy: boolean;
  /**
   * Carte de repos à afficher en tête du contenu quand cette brique est
   * la brique courante (§12).
   */
  restCard?: ReactNode;
  /**
   * Nom de l'exercice prévu à l'origine quand la brique a été remplacée
   * (§13) : la ligne `Prévu : <origine>`.
   */
  originalName?: string | undefined;
  /**
   * Table de l'échelle de RPE en vigueur pour cette séance (v1.6, § 4.5),
   * affichée par l'aide dépliable du formulaire de série.
   */
  rpeTable?: RpeScaleVersion["table"] | undefined;
  /**
   * Version de cadre portée par la brique (v1.6, § 4.3), pour la ligne
   * « Cadre : 3 × 10–12 · RPE ≤ 8 · charge à travailler 100 kg » et la
   * saisie par côté quand la barre est connue.
   */
  frameVersion?: StrengthFrameVersion | undefined;
  /** Encarts de progression du cadre (lot M.1) : hausse proposée, stagnation à examiner. */
  insets?: ReactNode;
  /**
   * Pari traction (03/10/2026) : ce que cette séance doit faire, d'après la
   * dernière Muscu A. Remplace « Pour valider » et préremplit chaque série.
   */
  bet?: BetBanner | undefined;
  onToggle: () => void;
  onOpenMenu: () => void;
  onUnskip: () => void;
  onValidateSeries: (seriesId: Id, values: SeriesValues) => void;
  onEditSeries: (seriesId: Id, values: SeriesValues) => void;
  onAddSeries: () => void;
  onFinishBlock: () => void;
  onValidateStep: (stepId: Id, values: StepValues) => void;
  onUpdateStep: (stepId: Id, settings: CardioStepSettings) => void;
  onEditStep: (stepId: Id, values: StepValues) => void;
  onAddStep: () => void;
  onValidateSimple: (values: SimpleMeasurementValues) => void;
  onEditSimple: (values: SimpleMeasurementValues) => void;
  /**
   * `Dernière fois comparable` d'un palier : mêmes réglages, pas même rang (§11).
   */
  lastComparableStep: (settings: CardioStepSettings) => LastComparableStep | undefined;
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
  restCard,
  originalName,
  rpeTable,
  frameVersion,
  insets,
  bet,
  onToggle,
  onOpenMenu,
  onUnskip,
  onValidateSeries,
  onEditSeries,
  onAddSeries,
  onFinishBlock,
  onValidateStep,
  onUpdateStep,
  onEditStep,
  onAddStep,
  onValidateSimple,
  onEditSimple,
  lastComparableStep,
}: ExerciseBlockCardProps) {
  const [editingId, setEditingId] = useState<Id>();
  const [editingSimple, setEditingSimple] = useState(false);
  /* Sans nombre prévu, c'est l'utilisateur qui clôt l'exercice (§11). */
  const canFinish =
    !performedOrSkipped(block) && isOpenEndedBlock(block) && hasCompletedEntries(block);
  const awaitingChoice =
    canFinish &&
    !(block.series ?? []).some((series) => series.status === "active") &&
    !(block.cardioSteps ?? []).some((step) => step.status === "active");
  const name = exercise?.name ?? "Exercice supprimé";
  const status = formatBlockStatus(block);
  const performed = block.status === "performed";
  const skipped = block.status === "skipped";
  const url = exercise?.media?.thumbnailUrl ?? exercise?.media?.photoUrl;
  /* Tableau des séries (M9, lot M.3) : charge et répétitions en colonnes. */
  const tabular = seriesFieldLayout(exercise) === "load_reps";
  const assistance = loadSemanticsOf(exercise) === "assistance";
  /* Lot M.2 : un exercice à venir annonce sa charge conseillée, chiffrée ;
     la traction du pari, celle du moteur V6. */
  const advised =
    !expanded && !performedOrSkipped(block) && !hasCompletedEntries(block) && block.series
      ? bet?.sets[0]
        ? { value: bet.sets[0].assistKg, unit: "kg" as const, assistance: true }
        : advisedLoadOf(exercise, frameVersion, lastTime?.allSeries)
      : undefined;

  return (
    <li
      data-block-id={block.id}
      className={`wblock ${expanded ? "wblock--open" : ""} ${
        performed ? "wblock--done" : ""
      } ${block.status === "skipped" ? "wblock--skipped" : ""}`}
    >
      <div className="wblock__row">
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
              {block.role === "warmup" && <span className="wblock__role">Échauffement</span>}
              {formatExerciseSubtitle(block)}
              {block.addedDuringWorkout && (
                <span className="wblock__added">Ajouté pendant la séance</span>
              )}
              {originalName && (
                <span className="wblock__added">Prévu : {originalName}</span>
              )}
            </span>
            {advised && <span className="wblock__advice">Charge conseillée : {formatAdvisedLoad(advised)}</span>}
          </span>
          <span className="wblock__aside">
            {performed ? (
              <span className="wblock__check" aria-label="Terminé">
                <Check size={16} strokeWidth={3} aria-hidden="true" />
              </span>
            ) : skipped ? (
              <span className="wblock__skipped">Sauté</span>
            ) : (
              <span className="wblock__status">{status}</span>
            )}
            {!skipped &&
              (expanded ? (
                <ChevronUp size={18} strokeWidth={2} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
              ))}
          </span>
        </button>
        {skipped ? (
          <button type="button" className="wblock__unskip" onClick={onUnskip} disabled={busy}>
            Annuler
          </button>
        ) : (
          <button
            type="button"
            className="wblock__menu"
            aria-label={`Actions pour ${name}`}
            onClick={onOpenMenu}
          >
            <EllipsisVertical size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Consigne du modèle (« +5 s de maintien par semaine… », « Même vélo… ») : lisible pendant la séance. */}
      {expanded && !skipped && block.note && <p className="wblock__note">{block.note}</p>}
      {expanded && !skipped && insets && <div className="wblock__insets">{insets}</div>}

      {expanded && !skipped && block.series && (
        <div className="wblock__content">
          {restCard}
          {bet ? <BetGoal bet={bet} /> : frameVersion && <FrameGoal block={block} frameVersion={frameVersion} lastTime={lastTime} />}
          {/* Avec le bandeau du pari, la ligne « Conseillé » du cadre ferait doublon. */}
          <ReferenceBlock block={block} exercise={exercise} lastTime={lastTime} frameVersion={frameVersion} hideSuggestion={bet !== undefined} />

          <ol className={`wseries${tabular ? " wseries--table" : ""}`}>
            {tabular && (
              <li className="wseries__row wseries__head" aria-hidden="true">
                <span className="wseries__bullet">Série</span>
                <span className="wseries__body">
                  <span className="wseries__cells">
                    <span>{assistance ? "Assistance (kg)" : "Charge (kg)"}</span>
                    <span>Répétitions</span>
                    <span>RPE</span>
                  </span>
                </span>
                <span />
              </li>
            )}
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
                  rpeTable={rpeTable}
                  barWeightKg={frameVersion?.barWeightKg}
                  plannedSet={bet?.sets[index]}
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

          <div className={`wblock__actions ${awaitingChoice ? "wblock__actions--choice" : ""}`}>
            <button type="button" className="wblock__add-series" onClick={onAddSeries} disabled={busy}>
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
              Ajouter une série
            </button>
            {canFinish && (
              <button
                type="button"
                className={`wblock__finish ${awaitingChoice ? "wblock__finish--primary" : ""}`}
                onClick={onFinishBlock}
                disabled={busy}
              >
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                Terminer l'exercice
              </button>
            )}
          </div>
        </div>
      )}

      {expanded && !skipped && block.cardioSteps && (
        <div className="wblock__content">
          {restCard}
          <StepReference block={block} lastComparableStep={lastComparableStep} />

          <ol className="wseries">
            {[...block.cardioSteps]
              .sort((a, b) => a.position - b.position)
              .map((step, index) => (
                <StepRow
                  key={step.id}
                  step={step}
                  prescription={
                    block.snapshotInstructions.shape === "steps"
                      ? formatPlannedStep(block.snapshotInstructions.steps, step.id)
                      : undefined
                  }
                  index={index}
                  editing={editingId === step.id}
                  busy={busy}
                  onEdit={() => setEditingId(step.id)}
                  onCancelEdit={() => setEditingId(undefined)}
                  onValidate={(values) => onValidateStep(step.id, values)}
                  onSaveEdit={(settings) => {
                    setEditingId(undefined);
                    onUpdateStep(step.id, settings);
                  }}
                  onSaveCorrection={(values) => {
                    setEditingId(undefined);
                    onEditStep(step.id, values);
                  }}
                />
              ))}
          </ol>

          <p className="wblock__soon">Aucun repos entre les paliers : valider ouvre le suivant.</p>

          <div className={`wblock__actions ${awaitingChoice ? "wblock__actions--choice" : ""}`}>
            <button type="button" className="wblock__add-series" onClick={onAddStep} disabled={busy}>
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
              Ajouter un palier
            </button>
            {canFinish && (
              <button
                type="button"
                className={`wblock__finish ${awaitingChoice ? "wblock__finish--primary" : ""}`}
                onClick={onFinishBlock}
                disabled={busy}
              >
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                Terminer l'exercice
              </button>
            )}
          </div>
        </div>
      )}

      {expanded && !skipped && block.simpleMeasurement && !block.series && !block.cardioSteps && (
        <div className="wblock__content">
          {restCard}
          {block.simpleMeasurement.completedAt === undefined ? (
            <SimpleMeasurementForm
              key={`measure-${block.id}`}
              exercise={exercise}
              initial={block.simpleMeasurement}
              submitLabel="Valider la mesure"
              onSubmit={onValidateSimple}
              busy={busy}
            />
          ) : (
            <div className={`wseries__row wseries__row--done ${editingSimple ? "wseries__row--editing" : ""}`}>
              <span className="wseries__bullet wseries__bullet--done" aria-hidden="true">
                <Check size={14} strokeWidth={3} />
              </span>
              <span className="wseries__body">
                <span className="wseries__title">Mesure</span>
                <span className="wseries__meta">{formatSimpleMeasurement(block.simpleMeasurement, exercise)}</span>
              </span>
              {!editingSimple && (
                <button type="button" className="wseries__edit" onClick={() => setEditingSimple(true)}>
                  Modifier
                </button>
              )}
              {editingSimple && (
                <div className="wseries__form">
                  <SimpleMeasurementForm
                    key={`measure-edit-${block.id}`}
                    exercise={exercise}
                    initial={block.simpleMeasurement}
                    submitLabel="Enregistrer"
                    onSubmit={(values) => {
                      setEditingSimple(false);
                      onEditSimple(values);
                    }}
                    onCancel={() => setEditingSimple(false)}
                    busy={busy}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function performedOrSkipped(block: PerformedExerciseBlock): boolean {
  return block.status === "performed" || block.status === "skipped";
}

/**
 * Ce qu'il faut tenir pour valider le palier (27/09/2026), en évidence en
 * tête de l'exercice : « Pour valider : 3 × 12 · RPE ≤ 8 · à 40 kg ». Un
 * jour à prescription réduite (N5) ne valide jamais : il le dit.
 */
/** Le bandeau du pari traction : des lignes « libellé : valeur », un statut. */
export interface BetBanner {
  title: string;
  status?: { label: string; tone: string };
  lines: Array<{ label: string; value: string }>;
  note?: string;
  /** Séries prévues, dans l'ordre : préremplissage. */
  sets: BetSet[];
}

function BetGoal({ bet }: { bet: BetBanner }) {
  return (
    <div className="wblock__bet">
      <p className="wblock__bet-head">
        <Target size={16} strokeWidth={2.2} aria-hidden="true" />
        <strong>{bet.title}</strong>
        {bet.status && <span className={`wblock__bet-status wblock__bet-status--${bet.status.tone}`}>{bet.status.label}</span>}
      </p>
      <dl>
        {bet.lines.map((line) => (
          <div key={line.label}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
      {bet.note && <p className="wblock__bet-note">{bet.note}</p>}
    </div>
  );
}

function FrameGoal({
  block,
  frameVersion,
  lastTime,
}: {
  block: PerformedExerciseBlock;
  frameVersion: StrengthFrameVersion;
  lastTime: LastPerformance | undefined;
}) {
  if (block.reducedPrescription) {
    return (
      <p className="wblock__goal wblock__goal--reduced">
        <Target size={16} strokeWidth={2.2} aria-hidden="true" />
        <span>Séance réduite : ne valide pas le palier, ne compte pas en stagnation.</span>
      </p>
    );
  }
  const suggestion = suggestFrameLoad(frameVersion, lastTime?.allSeries);
  const load = suggestion.toWork ? ` · à ${formatStrengthValue(suggestion.toWork.value, suggestion.toWork.unit)}` : "";

  return (
    <p className="wblock__goal">
      <Target size={16} strokeWidth={2.2} aria-hidden="true" />
      <span>
        <strong>Pour valider :</strong> {suggestion.goal}
        {load}
      </span>
    </p>
  );
}

function ReferenceBlock({
  block,
  exercise,
  lastTime,
  frameVersion,
  hideSuggestion = false,
}: {
  block: PerformedExerciseBlock;
  exercise: Exercise | undefined;
  lastTime: LastPerformance | undefined;
  frameVersion: StrengthFrameVersion | undefined;
  hideSuggestion?: boolean;
}) {
  const planned = formatPlannedLine(block);
  const instructions = block.snapshotInstructions;
  /* Exercice cadré (v1.6, § 4.2 bis, lot 4C) : le conseil vient du cadre
     — charge à travailler et objectif pour valider ; sinon l'heuristique
     existante sur la dernière fois. */
  const frameSuggestion = frameVersion && !hideSuggestion ? suggestFrameLoad(frameVersion, lastTime?.allSeries) : undefined;
  const suggestion =
    !frameVersion && instructions.shape === "reps"
      ? suggestLoad(lastTime, instructions.reps, instructions.targetRpe)
      : undefined;

  if (!planned && !lastTime && !frameVersion) return null;

  return (
    <dl className="wref">
      {frameVersion && (
        <div className="wref__frame">
          <dt>Cadre</dt>
          <dd>{formatFrameVersionSummary(frameVersion)}</dd>
        </div>
      )}
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
      {frameSuggestion && (
        <div className="wref__frame">
          <dt>Conseillé</dt>
          <dd>{formatFrameLoadSuggestion(frameSuggestion)}</dd>
        </div>
      )}
      {suggestion && (
        <div>
          <dt>Conseillé</dt>
          <dd>{formatLoadSuggestion(suggestion, loadSemanticsOf(exercise))}</dd>
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
  rpeTable: RpeScaleVersion["table"] | undefined;
  barWeightKg: number | undefined;
  /** Pari traction : l'aide et les répétitions prévues pour cette série. */
  plannedSet?: BetSet | undefined;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onValidate: (values: SeriesValues) => void;
  onSaveEdit: (values: SeriesValues) => void;
}

/** Une ligne du tableau des séries : charge, répétitions, RPE ; le libellé reste lu par les lecteurs d'écran. */
function SeriesCells({ load, reps, rpe, label }: { load: string; reps: string; rpe: string; label: string }) {
  return (
    <span className="wseries__cells" aria-label={`${label} : ${load} kg, ${reps} répétitions, RPE ${rpe}`}>
      <span>{load}</span>
      <span>{reps}</span>
      <span>{rpe}</span>
    </span>
  );
}

function loadCell(series: PerformedSeries): string {
  const kg = getLoadKg(series.load);
  return kg !== undefined ? formatDecimal(kg) : "—";
}

/** « 6–8 » : les répétitions prévues d'une série à venir. */
function targetReps(block: PerformedExerciseBlock): string {
  const instructions = block.snapshotInstructions;
  return !block.addedDuringWorkout && instructions.shape === "reps" ? formatRange(instructions.reps) : "—";
}

function SeriesRow({
  block,
  series,
  index,
  exercise,
  lastTime,
  rpeTable,
  barWeightKg,
  plannedSet,
  editing,
  busy,
  onEdit,
  onCancelEdit,
  onValidate,
  onSaveEdit,
}: SeriesRowProps) {
  const label = `Série ${index + 1}`;
  const layout = seriesFieldLayout(exercise);
  const tabular = layout === "load_reps";
  /* Rôle et drapeau : séries de musculation seulement (v1.6, § 4.4). */
  const strengthFields = exercise?.category === "Musculation";
  /* Effort en puissance (D17) : l'unité déjà saisie est imposée. */
  const powerUnit = effectivePowerUnit(exercise, [...(block.series ?? []), ...(lastTime?.allSeries ?? [])]);

  if (series.status === "completed") {
    return (
      <li className={`wseries__row wseries__row--done ${editing ? "wseries__row--editing" : ""}`}>
        <span className="wseries__bullet wseries__bullet--done" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="wseries__body">
          {tabular ? (
            <SeriesCells load={loadCell(series)} reps={series.reps !== undefined ? String(series.reps) : "—"} rpe={series.rpe !== undefined ? String(series.rpe) : "—"} label={label} />
          ) : (
            <>
              <span className="wseries__title">{label}</span>
              <span className="wseries__meta">{formatSeriesLine(series)}</span>
            </>
          )}
          {series.actualRestAfterSec !== undefined && (
            <span className="wseries__rest">
              Repos réel {formatMmSs(series.actualRestAfterSec)}
              {series.restComparable === false ? " · hors moyenne" : ""}
            </span>
          )}
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
                ...(series.repDurationsSec ? { repDurationsSec: series.repDurationsSec } : {}),
                ...(series.result ? { result: series.result } : {}),
                ...(series.resistance !== undefined ? { resistance: series.resistance } : {}),
                ...(series.rpe !== undefined ? { rpe: series.rpe } : {}),
                ...(series.note !== undefined ? { note: series.note } : {}),
                ...(series.role !== undefined ? { role: series.role } : {}),
                ...(series.sideLimited !== undefined ? { sideLimited: series.sideLimited } : {}),
              }}
              strengthFields={strengthFields}
              rpeTable={rpeTable}
              barWeightKg={barWeightKg}
              loadSemantics={loadSemanticsOf(exercise)}
              powerUnit={powerUnit}
              sideRepsUnit={exercise?.measurementLabels?.value}
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
    /* Pari traction : la série prévue (aide, répétitions) l'emporte. */
    const proposed = plannedSet
      ? { ...proposeSeriesValues(block, lastTime?.series), load: { kind: "total" as const, kg: plannedSet.assistKg }, reps: plannedSet.reps }
      : proposeSeriesValues(block, lastTime?.series);

    return (
      <li className="wseries__row wseries__row--active">
        <span className="wseries__bullet wseries__bullet--active">{index + 1}</span>
        <span className="wseries__body">
          {tabular ? (
            /* Ligne du tableau : les valeurs proposées, à ajuster juste dessous. */
            <SeriesCells
              load={proposed.load ? loadCell({ load: proposed.load } as PerformedSeries) : "—"}
              reps={proposed.reps !== undefined ? String(proposed.reps) : targetReps(block)}
              rpe="—"
              label={`${label}, en cours`}
            />
          ) : (
            <>
              <span className="wseries__title">{label}</span>
              <span className="wseries__meta">{formatSeriesTarget(block)}</span>
            </>
          )}
        </span>
        <div className="wseries__form">
          <SeriesForm
            key={`entry-${series.id}`}
            layout={layout}
            initial={{ ...proposed, ...(series.role !== undefined ? { role: series.role } : {}) }}
            strengthFields={strengthFields}
            rpeTable={rpeTable}
            barWeightKg={barWeightKg}
            loadSemantics={loadSemanticsOf(exercise)}
            powerUnit={powerUnit}
            sideRepsUnit={exercise?.measurementLabels?.value}
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
        {tabular ? (
          /* Pari traction : la série à venir affiche ce qui est prévu pour elle. */
          <SeriesCells
            load={plannedSet ? formatDecimal(plannedSet.assistKg) : "—"}
            reps={plannedSet ? String(plannedSet.reps) : targetReps(block)}
            rpe="—"
            label={label}
          />
        ) : (
          <>
            <span className="wseries__title">{label}</span>
            <span className="wseries__meta">{formatSeriesTarget(block)}</span>
          </>
        )}
      </span>
      <span className="wseries__state">
        {series.status === "not_performed" ? "Non réalisée" : "À venir"}
      </span>
    </li>
  );
}

/**
 * Bloc de lecture d'un palier : ni `Prévu` ni `Conseillé` (§11), une
 * seule ligne `Dernière fois comparable` — et rien si elle n'existe pas.
 */
function StepReference({
  block,
  lastComparableStep,
}: {
  block: PerformedExerciseBlock;
  lastComparableStep: (settings: CardioStepSettings) => LastComparableStep | undefined;
}) {
  const active = block.cardioSteps?.find((step) => step.status === "active");

  if (!active) return null;

  const last = lastComparableStep(active.settings);

  if (!last) return null;

  return (
    <dl className="wref">
      <div>
        <dt>Dernière fois comparable</dt>
        <dd>
          {formatCardioSettingsLine(last.step.settings)}
          {last.step.bpm !== undefined ? ` · ${last.step.bpm} bpm` : " · BPM non relevé"}
          <small>{formatShortDate(last.date)}</small>
        </dd>
      </div>
    </dl>
  );
}

/** La consigne prévue d'un palier réalisé : son id porte celui du palier du modèle. */
function formatPlannedStep(steps: SessionStepInstruction[], performedStepId: string): string | undefined {
  const planned = steps.find((item) => performedStepId.endsWith(`-step-${item.id}`));

  return planned ? formatStepPrescription(planned) : undefined;
}

interface StepRowProps {
  step: PerformedCardioStep;
  /** Consigne en plage ou avec RPE cible (D16), lue sous le palier. */
  prescription: string | undefined;
  index: number;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onValidate: (values: StepValues) => void;
  onSaveEdit: (settings: CardioStepSettings) => void;
  onSaveCorrection: (values: StepValues) => void;
}

/**
 * Un palier : terminé (réglages réels, BPM, trace d'adaptation), actif
 * (saisie), à venir (modifiable avant d'être commencé). Aucun `Prévu /
 * Réalisé` à l'intérieur : la consigne courante fait foi (§11).
 */
function StepRow({
  step,
  prescription,
  index,
  editing,
  busy,
  onEdit,
  onCancelEdit,
  onValidate,
  onSaveEdit,
  onSaveCorrection,
}: StepRowProps) {
  const label = `Palier ${index + 1}`;
  const line = formatCardioSettingsLine(step.settings);
  const planned = prescription ? <span className="wseries__rest">Consigne : {prescription}</span> : null;
  const adapted = step.originalSettings ? (
    <span className="wseries__rest">
      Adapté pendant la séance · initialement {formatCardioSettingsLine(step.originalSettings)}
    </span>
  ) : null;

  if (step.status === "completed") {
    return (
      <li className={`wseries__row wseries__row--done ${editing ? "wseries__row--editing" : ""}`}>
        <span className="wseries__bullet wseries__bullet--done" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="wseries__body">
          <span className="wseries__title">{label}</span>
          <span className="wseries__meta">
            {line}
            {step.bpm !== undefined ? ` · ${step.bpm} bpm` : " · BPM non relevé"}
            {step.note ? ` · ${step.note}` : ""}
          </span>
          {adapted}
        </span>
        {!editing && (
          <button type="button" className="wseries__edit" onClick={onEdit}>
            Modifier
          </button>
        )}
        {editing && (
          <div className="wseries__form">
            <StepForm
              key={`correct-${step.id}`}
              step={step}
              mode="correct"
              submitLabel="Enregistrer"
              onSubmit={onSaveCorrection}
              onCancel={onCancelEdit}
              busy={busy}
            />
          </div>
        )}
      </li>
    );
  }

  if (step.status === "active") {
    return (
      <li className="wseries__row wseries__row--active">
        <span className="wseries__bullet wseries__bullet--active">{index + 1}</span>
        <span className="wseries__body">
          <span className="wseries__title">{label}</span>
          <span className="wseries__meta">En cours · {line}</span>
          {planned}
          {adapted}
        </span>
        <div className="wseries__form">
          <StepForm
            key={`exec-${step.id}-${line}`}
            step={step}
            mode="execute"
            submitLabel={`Valider le palier ${index + 1}`}
            onSubmit={onValidate}
            busy={busy}
          />
        </div>
      </li>
    );
  }

  return (
    <li className={`wseries__row wseries__row--upcoming ${editing ? "wseries__row--editing" : ""}`}>
      <span className="wseries__bullet">{index + 1}</span>
      <span className="wseries__body">
        <span className="wseries__title">{label}</span>
        <span className="wseries__meta">{line}</span>
        {planned}
        {adapted}
      </span>
      {!editing && step.status !== "not_performed" && (
        <button type="button" className="wseries__edit" onClick={onEdit}>
          Modifier
        </button>
      )}
      {step.status === "not_performed" && <span className="wseries__state">Non réalisé</span>}
      {editing && (
        <div className="wseries__form">
          <StepForm
            key={`edit-${step.id}`}
            step={step}
            mode="edit"
            submitLabel="Valider les nouvelles consignes"
            onSubmit={(values) => {
              if (values.settings) onSaveEdit(values.settings);
            }}
            onCancel={onCancelEdit}
            busy={busy}
          />
        </div>
      )}
    </li>
  );
}
