import { useId, useState } from "react";
import type { Load, PerformedSeriesRole, PerformedSideValue, RpeScaleVersion } from "../../domain";
import {
  DEFAULT_SERIES_ROLE,
  formatRpeRowLabel,
  seriesRoleLabels,
} from "../../domain/rules/strengthRules";
import type { SeriesValues } from "./engine/workoutEngine";
import type { ProposedSeriesValues } from "./engine/workoutBlocks";
import { NumberField } from "./NumberField";
import { formatNumberInput, parseNumber } from "./numberInput";
import type { SeriesFieldLayout } from "./workoutDisplay";

type LoadKind = Load["kind"];

interface SeriesFormProps {
  layout: SeriesFieldLayout;
  /**
   * Valeurs proposées (série précédente, dernière fois) ou valeurs de la
   * série que l'on modifie. RPE et note ne sont proposés que pour une
   * modification : jamais préremplis à la saisie (§11). Rôle et drapeau
   * viennent de la série modifiée ; à la saisie, une série est de
   * travail, non limitée (décision 7).
   */
  initial: ProposedSeriesValues & {
    rpe?: number;
    note?: string;
    role?: PerformedSeriesRole;
    sideLimited?: boolean;
  };
  /**
   * Rôle « travail / échauffement » et drapeau « limitée par un côté »
   * (v1.6, § 4.4) : séries de musculation seulement ; les enfants de tour
   * et les autres catégories n'en ont pas.
   */
  strengthFields?: boolean;
  /**
   * Table de l'échelle de RPE en vigueur, pour l'aide dépliable à côté
   * du champ (spec Musculation § 6). Sans table, pas d'aide.
   */
  rpeTable?: RpeScaleVersion["table"] | undefined;
  submitLabel: string;
  onSubmit: (values: SeriesValues) => void;
  onCancel?: () => void;
  busy?: boolean;
}

const SERIES_ROLES: PerformedSeriesRole[] = ["travail", "echauffement"];

const LOAD_KIND_LABELS: Record<LoadKind, string> = {
  total: "Total",
  per_side: "Par côté",
  empty: "À vide",
};

function sideValue(
  values: PerformedSideValue[] | undefined,
  side: "left" | "right",
  key: "reps" | "durationSec",
): number | undefined {
  return values?.find((value) => value.side === side)?.[key];
}

/**
 * Saisie d'une série (§11) : les réglages d'abord, l'effort ensuite.
 * Une colonne par champ du type de mesure, puis RPE facultatif, puis la
 * note qui ne s'ouvre qu'au tap.
 */
export function SeriesForm({
  layout,
  initial,
  strengthFields = false,
  rpeTable,
  submitLabel,
  onSubmit,
  onCancel,
  busy = false,
}: SeriesFormProps) {
  const helpId = useId();
  const [loadKind, setLoadKind] = useState<LoadKind>(initial.load?.kind ?? "total");
  const [load, setLoad] = useState(
    formatNumberInput(
      initial.load?.kind === "total"
        ? initial.load.kg
        : initial.load?.kind === "per_side"
          ? initial.load.kgPerSide
          : undefined,
    ),
  );
  const [reps, setReps] = useState(formatNumberInput(initial.reps));
  const [duration, setDuration] = useState(formatNumberInput(initial.durationSec));
  const [left, setLeft] = useState(
    formatNumberInput(
      layout === "reps_per_side"
        ? sideValue(initial.sideValues, "left", "reps")
        : sideValue(initial.sideValues, "left", "durationSec"),
    ),
  );
  const [right, setRight] = useState(
    formatNumberInput(
      layout === "reps_per_side"
        ? sideValue(initial.sideValues, "right", "reps")
        : sideValue(initial.sideValues, "right", "durationSec"),
    ),
  );
  const [rpe, setRpe] = useState(formatNumberInput(initial.rpe));
  const [rpeHelpOpen, setRpeHelpOpen] = useState(false);
  const [role, setRole] = useState<PerformedSeriesRole>(initial.role ?? DEFAULT_SERIES_ROLE);
  const [sideLimited, setSideLimited] = useState(initial.sideLimited === true);
  const [noteOpen, setNoteOpen] = useState(Boolean(initial.note));
  const [note, setNote] = useState(initial.note ?? "");
  /* Le drapeau ne se pose que sur une série de travail bilatérale : un
     exercice mesuré par côté a déjà ses deux valeurs. */
  const sideLimitedAvailable =
    strengthFields && role === "travail" && layout !== "reps_per_side" && layout !== "duration_per_side";

  const measured =
    layout === "load_reps" || layout === "reps"
      ? parseNumber(reps) !== undefined
      : layout === "duration"
        ? parseNumber(duration) !== undefined
        : parseNumber(left) !== undefined || parseNumber(right) !== undefined;

  function buildLoad(): Load | undefined {
    if (layout !== "load_reps") return undefined;

    if (loadKind === "empty") return { kind: "empty" };

    const kg = parseNumber(load);

    if (kg === undefined) return undefined;

    return loadKind === "total" ? { kind: "total", kg } : { kind: "per_side", kgPerSide: kg };
  }

  function buildValues(): SeriesValues {
    const values: SeriesValues = {};
    const builtLoad = buildLoad();

    if (builtLoad) values.load = builtLoad;

    if (layout === "load_reps" || layout === "reps") {
      const parsed = parseNumber(reps);
      if (parsed !== undefined) values.reps = parsed;
    }

    if (layout === "duration") {
      const parsed = parseNumber(duration);
      if (parsed !== undefined) values.durationSec = parsed;
    }

    if (layout === "reps_per_side" || layout === "duration_per_side") {
      const key = layout === "reps_per_side" ? "reps" : "durationSec";
      const sides: PerformedSideValue[] = [];
      const l = parseNumber(left);
      const r = parseNumber(right);

      if (l !== undefined) sides.push({ side: "left", [key]: l });
      if (r !== undefined) sides.push({ side: "right", [key]: r });
      if (sides.length > 0) values.sideValues = sides;
    }

    const parsedRpe = parseNumber(rpe);
    if (parsedRpe !== undefined) values.rpe = parsedRpe;

    if (strengthFields) {
      values.role = role;
      /* Présent, à faux par défaut, sur chaque série de travail (§ 4.4) ;
         jamais sur un échauffement. */
      if (role === "travail") values.sideLimited = sideLimitedAvailable && sideLimited;
    }

    const trimmedNote = note.trim();
    if (trimmedNote) values.note = trimmedNote;

    return values;
  }

  return (
    <form
      className="series-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!measured || busy) return;
        onSubmit(buildValues());
      }}
    >
      <div className="series-form__fields">
        {layout === "load_reps" && (
          <div className="series-form__load">
            <NumberField
              label="Charge"
              unit={loadKind === "per_side" ? "kg / côté" : "kg"}
              value={load}
              onChange={setLoad}
              step={2.5}
              decimal
              disabled={loadKind === "empty"}
            />
            <div className="series-form__load-kinds" role="group" aria-label="Forme de la charge">
              {(Object.keys(LOAD_KIND_LABELS) as LoadKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`series-form__kind ${
                    loadKind === kind ? "series-form__kind--active" : ""
                  }`}
                  aria-pressed={loadKind === kind}
                  onClick={() => setLoadKind(kind)}
                >
                  {LOAD_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>
        )}

        {(layout === "load_reps" || layout === "reps") && (
          <NumberField label="Reps" value={reps} onChange={setReps} step={1} min={0} />
        )}

        {layout === "duration" && (
          <NumberField label="Durée" unit="s" value={duration} onChange={setDuration} step={5} min={0} />
        )}

        {(layout === "reps_per_side" || layout === "duration_per_side") && (
          <>
            <NumberField
              label="Gauche"
              unit={layout === "reps_per_side" ? "reps" : "s"}
              value={left}
              onChange={setLeft}
              step={layout === "reps_per_side" ? 1 : 5}
              min={0}
            />
            <NumberField
              label="Droite"
              unit={layout === "reps_per_side" ? "reps" : "s"}
              value={right}
              onChange={setRight}
              step={layout === "reps_per_side" ? 1 : 5}
              min={0}
            />
          </>
        )}

        <div className="series-form__rpe">
          <NumberField
            label="RPE (optionnel)"
            value={rpe}
            onChange={setRpe}
            step={1}
            min={1}
            max={10}
            optional
          />
          {rpeTable && (
            <button
              type="button"
              className="series-form__rpe-help-toggle"
              aria-label="Échelle de RPE"
              aria-expanded={rpeHelpOpen}
              aria-controls={helpId}
              onClick={() => setRpeHelpOpen((open) => !open)}
            >
              ?
            </button>
          )}
        </div>
      </div>

      {rpeTable && rpeHelpOpen && (
        <table id={helpId} className="series-form__rpe-help" aria-label="Échelle de RPE : répétitions en réserve">
          <thead>
            <tr>
              <th scope="col">RPE</th>
              <th scope="col">Répétitions en réserve</th>
            </tr>
          </thead>
          <tbody>
            {rpeTable.map((row) => (
              <tr key={row.rpe}>
                <th scope="row">{formatRpeRowLabel(row.rpe, rpeTable)}</th>
                <td>{row.repsInReserveLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {strengthFields && (
        <div className="series-form__strength">
          <div className="series-form__load-kinds" role="group" aria-label="Rôle de la série">
            {SERIES_ROLES.map((item) => (
              <button
                key={item}
                type="button"
                className={`series-form__kind ${role === item ? "series-form__kind--active" : ""}`}
                aria-pressed={role === item}
                onClick={() => setRole(item)}
              >
                {seriesRoleLabels[item]}
              </button>
            ))}
          </div>
          {sideLimitedAvailable && (
            <label className="series-form__flag">
              <input
                type="checkbox"
                checked={sideLimited}
                onChange={(event) => setSideLimited(event.target.checked)}
              />
              <span>Limitée par un côté</span>
            </label>
          )}
        </div>
      )}

      {noteOpen ? (
        <label className="series-form__note">
          <span>Note</span>
          <textarea
            value={note}
            rows={2}
            placeholder="tremblements, encore 10 s possible, max…"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      ) : (
        <button
          type="button"
          className="series-form__note-toggle"
          onClick={() => setNoteOpen(true)}
        >
          + Ajouter une note
        </button>
      )}

      <div className="series-form__actions">
        <button
          type="submit"
          className="series-form__submit"
          disabled={!measured || busy}
        >
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
