import { Minus, Plus } from "lucide-react";
import type { NumberRange, RangeOrValue, TargetRpe } from "../../domain";
import { formatDurationShort } from "../../domain/rules/blockInstructionRules";
import { isRange, lowOf, widenToRange } from "../../domain/rules/rangeRules";

/**
 * Champs partagés par les variantes de `Modifier l'exercice` (§8).
 * Toute fourchette s'affiche en deux champs reliés par un tiret,
 * partout et sans exception.
 */

interface FieldRowProps {
  label: string;
  hint?: string;
  optional?: boolean;
  tone?: "default" | "exception";
  children: React.ReactNode;
}

export function FieldRow({ label, hint, optional, tone = "default", children }: FieldRowProps) {
  return (
    <div className={`field-row field-row--${tone}`}>
      <div className="field-row__label">
        <span>
          {label}
          {optional && <small> (optionnel)</small>}
        </span>
        {hint && <small className="field-row__hint">{hint}</small>}
      </div>
      <div className="field-row__control">{children}</div>
    </div>
  );
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  label: string;
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
  label,
}: StepperProps) {
  const round = (next: number) => Math.round(next * 100) / 100;

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Diminuer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(round(Math.max(min, value - step)))}
      >
        <Minus size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <output>{format(value)}</output>
      <button
        type="button"
        aria-label={`Augmenter ${label}`}
        disabled={value >= max}
        onClick={() => onChange(round(Math.min(max, value + step)))}
      >
        <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}

interface RangeFieldsProps {
  value: NumberRange | TargetRpe;
  min: number;
  max: number;
  onChange: (value: NumberRange) => void;
  label: string;
}

/**
 * `8 – 12` : deux champs simples reliés par un tiret. Le max suit le min
 * s'il passe en dessous, et inversement : la fourchette reste ordonnée.
 */
export function RangeFields({ value, min, max, onChange, label }: RangeFieldsProps) {
  function clamp(next: number): number {
    return Math.min(max, Math.max(min, Math.round(next)));
  }

  return (
    <div className="range-fields">
      <input
        type="number"
        inputMode="numeric"
        aria-label={`${label}, minimum`}
        value={value.min}
        min={min}
        max={max}
        onChange={(event) => {
          const next = clamp(Number(event.target.value));
          onChange({ min: next, max: Math.max(next, value.max) });
        }}
      />
      <span aria-hidden="true">–</span>
      <input
        type="number"
        inputMode="numeric"
        aria-label={`${label}, maximum`}
        value={value.max}
        min={min}
        max={max}
        onChange={(event) => {
          const next = clamp(Number(event.target.value));
          onChange({ min: Math.min(next, value.min), max: next });
        }}
      />
    </div>
  );
}

interface OptionalRangeFieldsProps {
  value: TargetRpe | undefined;
  onChange: (value: TargetRpe | undefined) => void;
}

/**
 * RPE cible : facultatif. Une case l'active ; désactivé, rien n'est stocké,
 * on n'affiche jamais un zéro à la place d'une donnée absente (§18).
 */
export function RpeFields({ value, onChange }: OptionalRangeFieldsProps) {
  return (
    <div className="rpe-fields">
      <label className="rpe-fields__toggle">
        <input
          type="checkbox"
          checked={value !== undefined}
          onChange={(event) =>
            onChange(event.target.checked ? { min: 7, max: 8 } : undefined)
          }
        />
        <span>{value ? "" : "Sans cible"}</span>
      </label>
      {value && (
        <RangeFields value={value} min={1} max={10} onChange={onChange} label="RPE cible" />
      )}
    </div>
  );
}

/**
 * Repos : une liste fermée de durées usuelles, affichées comme partout
 * (`45 s`, `2 min`, `1 min 30`).
 */
const REST_OPTIONS_SEC = [0, 15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

interface RestSelectProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  allowNone?: boolean;
}

export function RestSelect({ value, onChange, label, allowNone }: RestSelectProps) {
  const options = REST_OPTIONS_SEC.filter((sec) => allowNone || sec > 0);
  const known = options.includes(value);

  return (
    <select
      className="rest-select"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {!known && <option value={value}>{formatDurationShort(value)}</option>}
      {options.map((sec) => (
        <option key={sec} value={sec}>
          {sec === 0 ? "Aucun" : formatDurationShort(sec)}
        </option>
      ))}
    </select>
  );
}

interface SecondsInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
}

export function SecondsInput({ value, onChange, label }: SecondsInputProps) {
  return (
    <label className="unit-input">
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        min={5}
        max={3600}
        step={5}
        onChange={(event) =>
          onChange(Math.max(5, Math.round(Number(event.target.value)) || 5))
        }
      />
      <span>s</span>
    </label>
  );
}

interface RangeToggleProps {
  active: boolean;
  onToggle: () => void;
  label: string;
}

/** « Plage » : passe d'une valeur unique à une plage min–max, et retour (D16). */
export function RangeToggle({ active, onToggle, label }: RangeToggleProps) {
  return (
    <button
      type="button"
      className={`range-toggle ${active ? "range-toggle--active" : ""}`}
      aria-pressed={active}
      aria-label={`${label} en plage`}
      onClick={onToggle}
    >
      Plage
    </button>
  );
}

interface SecondsRangeInputProps {
  value: RangeOrValue;
  onChange: (value: RangeOrValue) => void;
  label: string;
}

/**
 * Durée d'une consigne, valeur ou plage (D16) : le champ habituel, plus
 * un second « à … » quand la prescription est une plage (« 20–30 s »).
 */
export function SecondsRangeInput({ value, onChange, label }: SecondsRangeInputProps) {
  const range = isRange(value) ? value : undefined;

  return (
    <div className="seconds-range">
      <SecondsInput
        label={label}
        value={lowOf(value)}
        onChange={(min) => onChange(range ? { min, max: Math.max(min, range.max) } : min)}
      />
      {range && (
        <>
          <span aria-hidden="true">–</span>
          <SecondsInput
            label={`${label}, maximum`}
            value={range.max}
            onChange={(max) => onChange({ min: Math.min(range.min, max), max })}
          />
        </>
      )}
      <RangeToggle
        active={range !== undefined}
        label={label}
        onToggle={() => onChange(range ? range.min : widenToRange(lowOf(value), 10))}
      />
    </div>
  );
}

interface DecimalRangeFieldsProps {
  value: NumberRange;
  min: number;
  max: number;
  step: number;
  label: string;
  /** Affichage dans une autre unité que le stockage (minutes pour des secondes). */
  scale?: number;
  onChange: (value: NumberRange) => void;
}

/** Deux bornes décimales reliées par un tiret, comme toute fourchette (§8). */
export function DecimalRangeFields({ value, min, max, step, label, scale = 1, onChange }: DecimalRangeFieldsProps) {
  function read(text: string): number | undefined {
    const parsed = Number(text.replace(",", "."));
    if (!Number.isFinite(parsed) || text.trim() === "") return undefined;
    return Math.min(max, Math.max(min, Math.round(parsed * scale * 100) / 100));
  }

  const shown = (stored: number) => Math.round((stored / scale) * 100) / 100;

  return (
    <div className="range-fields">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        aria-label={`${label}, minimum`}
        value={shown(value.min)}
        onChange={(event) => {
          const next = read(event.target.value);
          if (next !== undefined) onChange({ min: next, max: Math.max(next, value.max) });
        }}
      />
      <span aria-hidden="true">–</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        aria-label={`${label}, maximum`}
        value={shown(value.max)}
        onChange={(event) => {
          const next = read(event.target.value);
          if (next !== undefined) onChange({ min: Math.min(next, value.min), max: next });
        }}
      />
    </div>
  );
}

interface OptionalNumberInputProps {
  value: number | undefined;
  unit: string;
  step?: number;
  label: string;
  placeholder?: string;
  onChange: (value: number | undefined) => void;
}

/**
 * Mesure simple : un champ que l'on peut laisser vide (« libre »).
 */
export function OptionalNumberInput({
  value,
  unit,
  step = 1,
  label,
  placeholder = "libre",
  onChange,
}: OptionalNumberInputProps) {
  return (
    <label className="unit-input">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={value ?? ""}
        min={0}
        step={step}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? undefined : Math.max(0, Number(raw)));
        }}
      />
      <span>{unit}</span>
    </label>
  );
}
