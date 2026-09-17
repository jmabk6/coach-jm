import { useState } from "react";
import { Info } from "lucide-react";
import type { CardioStepSettings, PerformedCardioStep } from "../../domain";
import type { StepValues } from "./engine/workoutEngine";
import { NumberField } from "./NumberField";
import { formatNumberInput, parseNumber } from "./numberInput";
import { formatCardioSettingsLine } from "./workoutRecap";

interface StepFormProps {
  step: PerformedCardioStep;
  /**
   * `execute` : palier actif — réglages préremplis, BPM vide, note au
   * tap, validation. `edit` : palier à venir — réglages seuls, `Valider
   * les nouvelles consignes`. `correct` : palier terminé — tout est
   * prérempli avec les valeurs réellement enregistrées.
   */
  mode: "execute" | "edit" | "correct";
  submitLabel: string;
  onSubmit: (values: StepValues) => void;
  onCancel?: () => void;
  busy?: boolean;
}

function sameSettings(a: CardioStepSettings, b: CardioStepSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Saisie d'un palier (§11, mockup 14) : le cardio s'adapte en direct —
 * les consignes affichées font foi, le BPM se relève en fin de palier,
 * pas de RPE. Dès que les réglages s'écartent de la consigne d'origine,
 * l'adaptation est annoncée avant même la validation.
 */
export function StepForm({ step, mode, submitLabel, onSubmit, onCancel, busy = false }: StepFormProps) {
  const initial = step.settings;
  const speedBased = "speedKmh" in initial;
  const [minutes, setMinutes] = useState(formatNumberInput(initial.durationSec / 60));
  const [speed, setSpeed] = useState(
    formatNumberInput("speedKmh" in initial ? initial.speedKmh : undefined),
  );
  const [incline, setIncline] = useState(
    formatNumberInput("inclinePercent" in initial ? initial.inclinePercent : undefined),
  );
  const [distance, setDistance] = useState(
    formatNumberInput("distanceKm" in initial ? initial.distanceKm : undefined),
  );
  const [bpm, setBpm] = useState(
    formatNumberInput(mode === "correct" ? step.bpm : undefined),
  );
  const [noteOpen, setNoteOpen] = useState(Boolean(step.note));
  const [note, setNote] = useState(step.note ?? "");

  const durationSec = Math.round((parseNumber(minutes) ?? 0) * 60);
  const measured = durationSec > 0;

  function buildSettings(): CardioStepSettings | undefined {
    if (!measured) return undefined;

    if (speedBased) {
      const speedKmh = parseNumber(speed);
      const inclinePercent = parseNumber(incline);

      if (speedKmh === undefined || inclinePercent === undefined) return undefined;

      return { durationSec, speedKmh, inclinePercent };
    }

    const distanceKm = parseNumber(distance);

    if (distanceKm === undefined) return undefined;

    return { durationSec, distanceKm };
  }

  const settings = buildSettings();
  const baseline = step.originalSettings ?? step.settings;
  const adapted = settings !== undefined && !sameSettings(settings, baseline);

  return (
    <form
      className="series-form step-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!settings || busy) return;

        const values: StepValues = { settings };
        const parsedBpm = parseNumber(bpm);

        if (mode !== "edit" && parsedBpm !== undefined) values.bpm = parsedBpm;

        const trimmed = note.trim();
        if (mode !== "edit" && trimmed) values.note = trimmed;

        onSubmit(values);
      }}
    >
      <div className="series-form__fields step-form__fields">
        <NumberField label="Durée" unit="min" value={minutes} onChange={setMinutes} step={1} min={0} decimal />
        {speedBased ? (
          <>
            <NumberField label="Vitesse" unit="km/h" value={speed} onChange={setSpeed} step={0.5} min={0} decimal />
            <NumberField label="Pente" unit="%" value={incline} onChange={setIncline} step={1} min={0} />
          </>
        ) : (
          <NumberField label="Distance" unit="km" value={distance} onChange={setDistance} step={0.1} min={0} decimal />
        )}
        {mode !== "edit" && (
          <NumberField
            label="BPM en fin de palier"
            unit="optionnel"
            value={bpm}
            onChange={setBpm}
            step={1}
            min={30}
            max={240}
            optional
          />
        )}
      </div>

      {adapted && (
        <p className="step-form__adapted">
          <Info size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>Adaptation pendant la séance</strong>
            <br />
            Initialement prévu : {formatCardioSettingsLine(baseline)}
          </span>
        </p>
      )}

      {mode !== "edit" && (
        <>
          {noteOpen ? (
            <label className="series-form__note">
              <span>Note</span>
              <textarea
                value={note}
                rows={2}
                placeholder="essoufflé, facile, arrêt 30 s…"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          ) : (
            <button type="button" className="series-form__note-toggle" onClick={() => setNoteOpen(true)}>
              + Ajouter une note
            </button>
          )}
        </>
      )}

      <div className="series-form__actions">
        <button type="submit" className="series-form__submit" disabled={!settings || busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="series-form__cancel" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
