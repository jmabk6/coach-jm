import { Minus, Plus } from "lucide-react";
import { formatNumberInput, parseNumber } from "./numberInput";

interface NumberFieldProps {
  label: string;
  unit?: string;
  /**
   * Texte tel que saisi : `42,5` reste `42,5` tant qu'on tape.
   */
  value: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  max?: number;
  decimal?: boolean;
  /**
   * Vide autorisé et affiché `—` : le RPE ne se préremplit jamais (§11).
   */
  optional?: boolean;
  disabled?: boolean;
}

/**
 * Champ numérique de saisie en salle : `−` / `+` larges, clavier
 * numérique sur iPhone (`inputmode`), virgule acceptée.
 */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  step,
  min = 0,
  max,
  decimal = false,
  optional = false,
  disabled = false,
}: NumberFieldProps) {
  const current = parseNumber(value);

  function shift(delta: number) {
    const base = current ?? (delta > 0 ? min - step : min + step);
    let next = Math.round((base + delta) * 100) / 100;

    if (next < min) next = optional ? min : min;
    if (max !== undefined && next > max) next = max;

    onChange(formatNumberInput(next));
  }

  return (
    <div className={`number-field ${disabled ? "number-field--disabled" : ""}`}>
      <span className="number-field__label">{label}</span>
      <div className="number-field__control">
        <button
          type="button"
          className="number-field__button"
          aria-label={`Diminuer ${label}`}
          disabled={disabled || (current !== undefined && current <= min && !optional)}
          onClick={() => {
            if (optional && current !== undefined && current <= min) {
              onChange("");
              return;
            }
            shift(-step);
          }}
        >
          <Minus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <input
          className="number-field__input"
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          pattern={decimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
          value={value}
          placeholder={optional ? "—" : ""}
          aria-label={label}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className="number-field__button"
          aria-label={`Augmenter ${label}`}
          disabled={disabled || (max !== undefined && current !== undefined && current >= max)}
          onClick={() => shift(step)}
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      {unit && <span className="number-field__unit">{unit}</span>}
    </div>
  );
}
