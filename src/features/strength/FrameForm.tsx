import { useState } from "react";
import type { Exercise, StrengthFrameVersion, StrengthProgressionType } from "../../domain";
import { formatStrengthValue, frameTypesFor, strengthProgressionTypeLabels } from "../../domain/rules/strengthRules";
import type { FrameVersionInput, StartingTarget } from "./frameActions";
import type { CurrentLoad } from "./frameReadings";

export type FrameFormMode = "create" | "edit" | "next";

interface FrameFormProps {
  exercise: Exercise;
  mode: FrameFormMode;
  /** Version de départ : celle que l'on modifie, ou la précédente pour une nouvelle version. */
  initial?: StrengthFrameVersion | undefined;
  /** Charge de départ proposée depuis l'historique (décision 2) — jamais imposée. */
  proposedStart?: CurrentLoad | undefined;
  /** La charge de départ se saisit à la création et pour une nouvelle version. */
  askStartingLoad: boolean;
  busy?: boolean;
  error?: string | undefined;
  onSubmit: (input: FrameVersionInput, startingTarget: StartingTarget | undefined) => void;
  onCancel: () => void;
}

function text(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parse(value: string): number | undefined {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Formulaire d'une version de cadre (conception v1.6, § 4.2) : type,
 * séries de travail, plage ou durée de départ, cible de RPE, repos,
 * incrément, poids de la barre ; charge de départ proposée, confirmée
 * seulement si le champ est rempli.
 */
export function FrameForm({
  exercise,
  mode,
  initial,
  proposedStart,
  askStartingLoad,
  busy = false,
  error,
  onSubmit,
  onCancel,
}: FrameFormProps) {
  const types = frameTypesFor(exercise);
  const [type, setType] = useState<StrengthProgressionType>(initial?.progressionType ?? types[0] ?? "charge_croissante");
  const duration = type === "duree_croissante";
  const [workSets, setWorkSets] = useState(text(initial?.workSets ?? 3));
  const [repMin, setRepMin] = useState(text(initial?.repRange?.min ?? 10));
  const [repMax, setRepMax] = useState(text(initial?.repRange?.max ?? 12));
  const [targetDuration, setTargetDuration] = useState(
    text(initial?.targetDurationSec ?? (proposedStart?.unit === "sec" ? proposedStart.value : 45)),
  );
  const [rpeTarget, setRpeTarget] = useState(text(initial?.rpeTarget ?? (initial ? undefined : duration ? undefined : 8)));
  const [rest, setRest] = useState(text(initial?.restSec ?? 90));
  /* Cran facultatif (D18) : une version sans cran reste sans cran à l'édition. */
  const [increment, setIncrement] = useState(text(initial ? initial.increment?.value : duration ? 5 : 2.5));
  const [barWeight, setBarWeight] = useState(text(initial?.barWeightKg));
  const [start, setStart] = useState(
    askStartingLoad && proposedStart && proposedStart.unit === "kg" ? text(proposedStart.value) : "",
  );

  function submit() {
    const input: FrameVersionInput = {
      progressionType: type,
      workSets: parse(workSets) ?? 0,
      restSec: parse(rest) ?? 0,
    };

    const incrementValue = parse(increment);
    if (incrementValue !== undefined) input.increment = { unit: duration ? "sec" : "kg", value: incrementValue };

    if (duration) {
      const parsed = parse(targetDuration);
      if (parsed !== undefined) input.targetDurationSec = parsed;
    } else {
      input.repRange = { min: parse(repMin) ?? 0, max: parse(repMax) ?? 0 };
      const bar = parse(barWeight);
      if (bar !== undefined) input.barWeightKg = bar;
    }

    const rpe = parse(rpeTarget);
    if (rpe !== undefined) input.rpeTarget = rpe;

    const startValue = askStartingLoad && !duration ? parse(start) : undefined;

    onSubmit(input, startValue !== undefined ? { value: startValue, unit: "kg" } : undefined);
  }

  const title = mode === "create" ? "Nouveau cadre" : mode === "edit" ? `Modifier la version ${initial?.number ?? ""}` : "Nouvelle version";

  return (
    <form
      className="frame-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) submit();
      }}
    >
      <h3>{title}</h3>

      {types.length > 1 && (
        <label className="frame-form__field">
          <span>Type de progression</span>
          <select value={type} onChange={(event) => setType(event.target.value as StrengthProgressionType)} disabled={mode === "edit" && initial !== undefined && initial.firstOfficialWorkoutId !== undefined}>
            {types.map((item) => (
              <option key={item} value={item}>
                {strengthProgressionTypeLabels[item]}
              </option>
            ))}
          </select>
        </label>
      )}
      {types.length === 1 && <p className="frame-form__type">{strengthProgressionTypeLabels[type]}</p>}

      <div className="frame-form__grid">
        <label className="frame-form__field">
          <span>Séries de travail</span>
          <input type="text" inputMode="numeric" value={workSets} onChange={(event) => setWorkSets(event.target.value)} />
        </label>

        {duration ? (
          <label className="frame-form__field">
            <span>Durée de départ (s)</span>
            <input type="text" inputMode="numeric" value={targetDuration} onChange={(event) => setTargetDuration(event.target.value)} />
          </label>
        ) : (
          <>
            <label className="frame-form__field">
              <span>Reps min</span>
              <input type="text" inputMode="numeric" value={repMin} onChange={(event) => setRepMin(event.target.value)} />
            </label>
            <label className="frame-form__field">
              <span>Reps max</span>
              <input type="text" inputMode="numeric" value={repMax} onChange={(event) => setRepMax(event.target.value)} />
            </label>
          </>
        )}

        <label className="frame-form__field">
          <span>{duration ? "RPE cible (facultatif)" : "RPE cible (≤)"}</span>
          <input type="text" inputMode="numeric" value={rpeTarget} onChange={(event) => setRpeTarget(event.target.value)} />
        </label>

        <label className="frame-form__field">
          <span>Repos entre séries (s)</span>
          <input type="text" inputMode="numeric" value={rest} onChange={(event) => setRest(event.target.value)} />
        </label>

        <label className="frame-form__field">
          <span>{duration ? "Incrément (s)" : "Incrément (kg, total)"}</span>
          {/* Facultatif (D18) : vide, aucune hausse n'est proposée. */}
          <input type="text" inputMode="decimal" placeholder="facultatif" value={increment} onChange={(event) => setIncrement(event.target.value)} />
        </label>

        {!duration && (
          <label className="frame-form__field">
            <span>Poids de la barre (kg, facultatif)</span>
            <input type="text" inputMode="decimal" value={barWeight} onChange={(event) => setBarWeight(event.target.value)} placeholder="saisie par côté si renseigné" />
          </label>
        )}

        {askStartingLoad && !duration && (
          <label className="frame-form__field frame-form__field--wide">
            <span>{type === "assistance_decroissante" ? "Assistance de départ" : "Charge de départ"} (kg, facultatif)</span>
            <input type="text" inputMode="decimal" value={start} onChange={(event) => setStart(event.target.value)} />
            <small>
              {proposedStart && proposedStart.unit === "kg"
                ? `Proposée d'après votre dernière séance (${formatStrengthValue(proposedStart.value, "kg")}) — à confirmer ou modifier ; vide = aucun objectif.`
                : "Aucune séance passée : à vous de choisir, ou laissez vide."}
            </small>
          </label>
        )}
      </div>

      {error && (
        <p className="frame-form__error" role="alert">
          {error}
        </p>
      )}

      <div className="frame-form__actions">
        <button type="submit" className="frame-form__submit" disabled={busy}>
          {mode === "create" ? "Créer le cadre" : mode === "edit" ? "Enregistrer" : "Créer la version"}
        </button>
        <button type="button" className="frame-form__cancel" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
      </div>
    </form>
  );
}
