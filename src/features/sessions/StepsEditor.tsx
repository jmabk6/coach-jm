import { CirclePlus, GripVertical, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { NumberRange, RangeOrValue, SessionStepInstruction } from "../../domain";
import {
  formatDurationRange,
  formatNumberFr,
} from "../../domain/rules/blockInstructionRules";
import { isRange, lowOf, sumRanges, widenToRange } from "../../domain/rules/rangeRules";
import { DecimalRangeFields, OptionalNumberInput, RangeToggle, RpeFields, Stepper } from "./instructionFields";

interface StepsEditorProps {
  steps: SessionStepInstruction[];
  onChange: (steps: SessionStepInstruction[]) => void;
  /**
   * Nature des paliers, lue sur l'exercice : une liste vide ou des paliers
   * sans distance (lot D.6 bis) ne suffisent plus à la deviner.
   */
  kind?: "speed_incline" | "distance";
}

/**
 * Structure des paliers (§8, mockup p. 11) : liste ordonnée, chaque palier
 * avec durée et, selon le type de mesure, vitesse + pente ou distance.
 * Réorganisation par poignées, `Ajouter un palier`, pas de champ « séries ».
 */
export function StepsEditor({ steps, onChange, kind: exerciseKind }: StepsEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const kind: "speed_incline" | "distance" =
    exerciseKind ?? (ordered[0] && !("speedKmh" in ordered[0]) ? "distance" : "speed_incline");
  const total = sumRanges(ordered.map((step) => step.durationSec));

  function commit(next: SessionStepInstruction[]) {
    onChange(next.map((step, index) => ({ ...step, position: index })));
  }

  function update(id: string, changes: Partial<SessionStepInstruction>) {
    commit(
      ordered.map((step) =>
        step.id === id ? ({ ...step, ...changes } as SessionStepInstruction) : step,
      ),
    );
  }

  /** Remplace le palier entier : seul moyen de retirer un champ facultatif (RPE, distance). */
  function replace(next: SessionStepInstruction) {
    commit(ordered.map((step) => (step.id === next.id ? next : step)));
  }

  function add() {
    const last = ordered[ordered.length - 1];
    const base = { id: crypto.randomUUID(), position: ordered.length };

    commit([
      ...ordered,
      kind === "distance"
        ? {
            ...base,
            durationSec: last ? lowOf(last.durationSec) : 300,
            /* Distance facultative : recopiée si le palier précédent en a une. */
            ...(!last
              ? { distanceKm: 1 }
              : !("speedKmh" in last) && last.distanceKm !== undefined
                ? { distanceKm: last.distanceKm }
                : {}),
          }
        : {
            ...base,
            durationSec: last?.durationSec ?? 300,
            speedKmh: last && "speedKmh" in last ? last.speedKmh : 5,
            inclinePercent: last && "inclinePercent" in last ? last.inclinePercent : 0,
          },
    ]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = ordered.findIndex((step) => step.id === active.id);
    const to = ordered.findIndex((step) => step.id === over.id);
    commit(arrayMove(ordered, from, to));
  }

  return (
    <div
      className="steps-editor"
      style={{ "--step-columns": kind === "speed_incline" ? 3 : 2 } as React.CSSProperties}
    >
      <div className="steps-editor__head" aria-hidden="true">
        <span />
        <span>#</span>
        <span>
          Durée
          <small>(min)</small>
        </span>
        {kind === "speed_incline" ? (
          <>
            <span>
              Vitesse
              <small>(km/h)</small>
            </span>
            <span>
              Pente
              <small>(%)</small>
            </span>
          </>
        ) : (
          <span>
            Distance
            <small>(km)</small>
          </span>
        )}
        <span />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={ordered.map((step) => step.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="steps-editor__list">
            {ordered.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                index={index}
                kind={kind}
                canRemove={ordered.length > 1}
                onChange={(changes) => update(step.id, changes)}
                onReplace={replace}
                onRemove={() => commit(ordered.filter((item) => item.id !== step.id))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <button type="button" className="steps-editor__add" onClick={add}>
        <CirclePlus size={18} strokeWidth={2} aria-hidden="true" />
        Ajouter un palier
      </button>

      <p className="steps-editor__hint">
        {kind === "speed_incline"
          ? "Touchez le numéro d'un palier pour saisir une plage (« pente 6–8 % ») ou un RPE cible."
          : "Touchez le numéro d'un palier pour saisir un RPE cible. La distance est facultative."}
      </p>

      <p className="steps-editor__total">
        <strong>Total</strong>
        <span>{formatDurationRange(total)}</span>
        <span>
          {ordered.length === 1 ? "1 palier" : `${ordered.length} paliers`}
        </span>
      </p>
    </div>
  );
}

interface StepRowProps {
  step: SessionStepInstruction;
  index: number;
  kind: "speed_incline" | "distance";
  canRemove: boolean;
  onChange: (changes: Partial<SessionStepInstruction>) => void;
  onReplace: (step: SessionStepInstruction) => void;
  onRemove: () => void;
}

/**
 * Une valeur de palier : le compteur habituel, ou sa plage affichée
 * « 6–8 » quand la consigne en est une (D16) ; la plage se règle dans le
 * panneau du palier.
 */
function StepValue({
  value,
  label,
  min,
  max,
  step,
  scale = 1,
  format = formatNumberFr,
  onChange,
}: {
  value: RangeOrValue;
  label: string;
  min: number;
  max: number;
  step: number;
  scale?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  if (isRange(value)) {
    return (
      <output className="steps-editor__range" aria-label={label}>
        {format(value.min / scale)}–{format(value.max / scale)}
      </output>
    );
  }

  return (
    <Stepper
      label={label}
      value={value / scale}
      min={min}
      max={max}
      step={step}
      format={format}
      onChange={(next) => onChange(Math.round(next * scale * 100) / 100)}
    />
  );
}

function RangeLine({
  name,
  value,
  gap,
  min,
  max,
  step,
  scale,
  onChange,
}: {
  name: string;
  value: RangeOrValue;
  gap: number;
  min: number;
  max: number;
  step: number;
  scale?: number;
  onChange: (value: RangeOrValue) => void;
}) {
  const range: NumberRange | undefined = isRange(value) ? value : undefined;

  return (
    <div className="steps-editor__range-line">
      <span className="steps-editor__range-name">{name}</span>
      {range ? (
        <DecimalRangeFields
          value={range}
          min={min}
          max={max}
          step={step}
          label={name}
          {...(scale !== undefined ? { scale } : {})}
          onChange={onChange}
        />
      ) : (
        <span className="steps-editor__range-single">valeur unique</span>
      )}
      <RangeToggle
        active={range !== undefined}
        label={name}
        onToggle={() => onChange(range ? range.min : widenToRange(lowOf(value), gap))}
      />
    </div>
  );
}

function StepRow({ step, index, kind, canRemove, onChange, onReplace, onRemove }: StepRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });
  const label = `palier ${index + 1}`;
  const [panelOpen, setPanelOpen] = useState(false);
  const hasRanges =
    isRange(step.durationSec) ||
    step.targetRpe !== undefined ||
    ("speedKmh" in step && (isRange(step.speedKmh) || isRange(step.inclinePercent)));
  const rpeLine = (
    <div className="steps-editor__range-line">
      <span className="steps-editor__range-name">RPE cible</span>
      <RpeFields
        value={step.targetRpe}
        onChange={(targetRpe) => {
          const next = { ...step };
          if (targetRpe) next.targetRpe = targetRpe;
          else delete next.targetRpe;
          onReplace(next);
        }}
      />
    </div>
  );

  return (
    <li
      ref={setNodeRef}
      className={`steps-editor__row ${isDragging ? "steps-editor__row--dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="steps-editor__handle"
        aria-label={`Déplacer le ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} strokeWidth={2} aria-hidden="true" />
      </button>

      <button
        type="button"
        className={`steps-editor__index steps-editor__index--button ${hasRanges ? "steps-editor__index--ranged" : ""}`}
        aria-label={`${kind === "speed_incline" ? "Plages et RPE" : "RPE"} du ${label}`}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((open) => !open)}
      >
        {index + 1}
      </button>

      <StepValue
        label={`durée du ${label}`}
        value={step.durationSec}
        min={0.5}
        max={120}
        step={lowOf(step.durationSec) < 120 ? 0.5 : 1}
        scale={60}
        onChange={(durationSec) => onChange({ durationSec: Math.round(durationSec) })}
      />

      {kind === "speed_incline" && "speedKmh" in step ? (
        <>
          <StepValue
            label={`vitesse du ${label}`}
            value={step.speedKmh}
            min={0.5}
            max={25}
            step={0.5}
            onChange={(speedKmh) => onChange({ speedKmh })}
          />
          <StepValue
            label={`pente du ${label}`}
            value={step.inclinePercent}
            min={0}
            max={15}
            step={1}
            onChange={(inclinePercent) => onChange({ inclinePercent })}
          />
        </>
      ) : !("speedKmh" in step) ? (
        /* Distance facultative (lot D.6 bis) : vide = « libre ». */
        <OptionalNumberInput
          label={`distance du ${label}`}
          unit="km"
          step={0.1}
          value={step.distanceKm}
          onChange={(distanceKm) => {
            const next = { ...step };
            if (distanceKm !== undefined) next.distanceKm = distanceKm;
            else delete next.distanceKm;
            onReplace(next);
          }}
        />
      ) : null}

      <button
        type="button"
        className="steps-editor__remove"
        aria-label={`Retirer le ${label}`}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <X size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {panelOpen && "speedKmh" in step && (
        <div className="steps-editor__panel" role="group" aria-label={`Plages et RPE du ${label}`}>
          <RangeLine
            name={`Durée du ${label} (min)`}
            value={step.durationSec}
            gap={120}
            min={30}
            max={7200}
            step={0.5}
            scale={60}
            onChange={(durationSec) => onChange({ durationSec })}
          />
          <RangeLine
            name={`Vitesse du ${label} (km/h)`}
            value={step.speedKmh}
            gap={0.5}
            min={0.5}
            max={25}
            step={0.5}
            onChange={(speedKmh) => onChange({ speedKmh })}
          />
          <RangeLine
            name={`Pente du ${label} (%)`}
            value={step.inclinePercent}
            gap={2}
            min={0}
            max={15}
            step={1}
            onChange={(inclinePercent) => onChange({ inclinePercent })}
          />
          {rpeLine}
        </div>
      )}

      {panelOpen && !("speedKmh" in step) && (
        <div className="steps-editor__panel" role="group" aria-label={`RPE du ${label}`}>
          {rpeLine}
        </div>
      )}
    </li>
  );
}
