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
import type { SessionStepInstruction } from "../../domain";
import {
  formatDurationShort,
  formatNumberFr,
} from "../../domain/rules/blockInstructionRules";
import { Stepper } from "./instructionFields";

interface StepsEditorProps {
  steps: SessionStepInstruction[];
  onChange: (steps: SessionStepInstruction[]) => void;
}

/**
 * Structure des paliers (§8, mockup p. 11) : liste ordonnée, chaque palier
 * avec durée et, selon le type de mesure, vitesse + pente ou distance.
 * Réorganisation par poignées, `Ajouter un palier`, pas de champ « séries ».
 */
export function StepsEditor({ steps, onChange }: StepsEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const kind: "speed_incline" | "distance" =
    ordered[0] && "distanceKm" in ordered[0] ? "distance" : "speed_incline";
  const totalSec = ordered.reduce((sum, step) => sum + step.durationSec, 0);

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

  function add() {
    const last = ordered[ordered.length - 1];
    const base = { id: crypto.randomUUID(), position: ordered.length };

    commit([
      ...ordered,
      kind === "distance"
        ? {
            ...base,
            durationSec: last?.durationSec ?? 300,
            distanceKm: last && "distanceKm" in last ? last.distanceKm : 1,
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

      <p className="steps-editor__total">
        <strong>Total</strong>
        <span>{formatDurationShort(totalSec)}</span>
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
  onRemove: () => void;
}

function StepRow({ step, index, kind, canRemove, onChange, onRemove }: StepRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });
  const label = `palier ${index + 1}`;

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

      <span className="steps-editor__index">{index + 1}</span>

      <Stepper
        label={`durée du ${label}`}
        value={step.durationSec / 60}
        min={0.5}
        max={120}
        step={step.durationSec < 120 ? 0.5 : 1}
        format={(minutes) => formatNumberFr(minutes)}
        onChange={(minutes) => onChange({ durationSec: Math.round(minutes * 60) })}
      />

      {kind === "speed_incline" && "speedKmh" in step ? (
        <>
          <Stepper
            label={`vitesse du ${label}`}
            value={step.speedKmh}
            min={0.5}
            max={25}
            step={0.5}
            format={formatNumberFr}
            onChange={(speedKmh) => onChange({ speedKmh })}
          />
          <Stepper
            label={`pente du ${label}`}
            value={step.inclinePercent}
            min={0}
            max={15}
            step={1}
            onChange={(inclinePercent) => onChange({ inclinePercent })}
          />
        </>
      ) : "distanceKm" in step ? (
        <Stepper
          label={`distance du ${label}`}
          value={step.distanceKm}
          min={0.1}
          max={50}
          step={step.distanceKm < 2 ? 0.1 : 0.5}
          format={formatNumberFr}
          onChange={(distanceKm) => onChange({ distanceKm })}
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
    </li>
  );
}
