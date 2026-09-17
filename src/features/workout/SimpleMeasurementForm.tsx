import { useState } from "react";
import type { Exercise, PerformedSideValue, PerformedSimpleMeasurement } from "../../domain";
import type { SimpleMeasurementValues } from "./engine/workoutEngine";
import { NumberField } from "./NumberField";
import { formatNumberInput, parseNumber } from "./numberInput";

interface SimpleMeasurementFormProps {
  exercise: Exercise | undefined;
  /**
   * Valeurs déjà enregistrées, pour `Modifier` ; vides à la saisie.
   */
  initial: PerformedSimpleMeasurement;
  submitLabel: string;
  onSubmit: (values: SimpleMeasurementValues) => void;
  onCancel?: () => void;
  busy?: boolean;
}

function sideCm(values: PerformedSideValue[] | undefined, side: "left" | "right") {
  return values?.find((value) => value.side === side)?.distanceCm;
}

/**
 * Mesure simple (§11) : un seul jeu de champs, validé en une fois. Les
 * colonnes suivent le type de mesure de l'exercice — durée + distance
 * (BPM facultatif), distance seule, centimètres, centimètres par côté.
 */
export function SimpleMeasurementForm({
  exercise,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy = false,
}: SimpleMeasurementFormProps) {
  const type = exercise?.measurementType ?? "distance";
  const labels = exercise?.measurementLabels;
  const [minutes, setMinutes] = useState(
    formatNumberInput(initial.durationSec !== undefined ? initial.durationSec / 60 : undefined),
  );
  const [distance, setDistance] = useState(formatNumberInput(initial.distanceKm));
  const [cm, setCm] = useState(formatNumberInput(initial.distanceCm));
  const [left, setLeft] = useState(formatNumberInput(sideCm(initial.sideValues, "left")));
  const [right, setRight] = useState(formatNumberInput(sideCm(initial.sideValues, "right")));
  const [bpm, setBpm] = useState(formatNumberInput(initial.bpm));
  const [noteOpen, setNoteOpen] = useState(Boolean(initial.note));
  const [note, setNote] = useState(initial.note ?? "");

  function buildValues(): SimpleMeasurementValues | undefined {
    const values: SimpleMeasurementValues = {};

    if (type === "duration_distance") {
      const parsedMinutes = parseNumber(minutes);
      const parsedDistance = parseNumber(distance);

      if (parsedMinutes !== undefined && parsedMinutes > 0) {
        values.durationSec = Math.round(parsedMinutes * 60);
      }
      if (parsedDistance !== undefined) values.distanceKm = parsedDistance;

      const parsedBpm = parseNumber(bpm);
      if (parsedBpm !== undefined) values.bpm = parsedBpm;

      if (values.durationSec === undefined && values.distanceKm === undefined) return undefined;
    } else if (type === "distance") {
      const parsedDistance = parseNumber(distance);

      if (parsedDistance === undefined) return undefined;
      values.distanceKm = parsedDistance;
    } else if (type === "distance_cm") {
      const parsedCm = parseNumber(cm);

      if (parsedCm === undefined) return undefined;
      values.distanceCm = parsedCm;
    } else if (type === "distance_cm_per_side") {
      const sides: PerformedSideValue[] = [];
      const l = parseNumber(left);
      const r = parseNumber(right);

      if (l !== undefined) sides.push({ side: "left", distanceCm: l });
      if (r !== undefined) sides.push({ side: "right", distanceCm: r });
      if (sides.length === 0) return undefined;
      values.sideValues = sides;
    } else {
      return undefined;
    }

    const trimmed = note.trim();
    if (trimmed) values.note = trimmed;

    return values;
  }

  const values = buildValues();

  return (
    <form
      className="series-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!values || busy) return;
        onSubmit(values);
      }}
    >
      <div className="series-form__fields">
        {type === "duration_distance" && (
          <>
            <NumberField label="Durée" unit="min" value={minutes} onChange={setMinutes} step={1} min={0} decimal />
            <NumberField label="Distance" unit="km" value={distance} onChange={setDistance} step={0.5} min={0} decimal />
            <NumberField
              label="BPM moyen"
              unit="optionnel"
              value={bpm}
              onChange={setBpm}
              step={1}
              min={30}
              max={240}
              optional
            />
          </>
        )}

        {type === "distance" && (
          <NumberField label="Distance" unit="km" value={distance} onChange={setDistance} step={0.5} min={0} decimal />
        )}

        {type === "distance_cm" && (
          <NumberField
            label={labels?.value ?? "Mesure"}
            unit="cm · négatif si dépassement"
            value={cm}
            onChange={setCm}
            step={1}
            min={-100}
            decimal
          />
        )}

        {type === "distance_cm_per_side" && (
          <>
            <NumberField label={labels?.left ?? "Gauche"} unit="cm" value={left} onChange={setLeft} step={1} min={-100} decimal />
            <NumberField label={labels?.right ?? "Droite"} unit="cm" value={right} onChange={setRight} step={1} min={-100} decimal />
          </>
        )}
      </div>

      {noteOpen ? (
        <label className="series-form__note">
          <span>Note</span>
          <textarea
            value={note}
            rows={2}
            placeholder="conditions, ressenti…"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      ) : (
        <button type="button" className="series-form__note-toggle" onClick={() => setNoteOpen(true)}>
          + Ajouter une note
        </button>
      )}

      <div className="series-form__actions">
        <button type="submit" className="series-form__submit" disabled={!values || busy}>
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
