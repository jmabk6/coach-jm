import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, ClipboardCheck, X } from "lucide-react";
import type { PerformedTestBlock, TestMeasureSpec, TestProtocolVersion, TestResult } from "../../domain";
import { getTestResult } from "../../db/repositories/testRepository";
import {
  computeTestResult,
  draftFromResult,
  formatTestNumber,
  isTrialsTestFinished,
  measureUnit,
  primaryValue,
  type ComputedTestResult,
} from "../../domain/rules/testResultRules";
import { hasTestInput } from "../workout/engine/workoutBlocks";
import {
  addTestTrial,
  removeTestTrial,
  setTestNote,
  setTestSideValue,
  setTestValue,
} from "../workout/engine/workoutEngine";
import type { WorkoutAction } from "../workout/engine/persistWorkout";
import { NumberField } from "../workout/NumberField";
import { formatNumberInput, parseNumber } from "../workout/numberInput";
import { formatDecimal } from "../workout/workoutRecap";
import { fixSprintUnit, type SprintUnit } from "./fixSprintUnit";
import { useTestProtocolVersion } from "./useTestProtocolVersion";
import "./TestBlockCard.css";

interface TestBlockCardProps {
  block: PerformedTestBlock;
  number?: number | undefined;
  expanded: boolean;
  busy: boolean;
  /** Faux pour une séance enregistrée : lecture seule. */
  editable: boolean;
  onToggle?: (() => void) | undefined;
  apply: (action: WorkoutAction) => unknown;
  onFinish?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
  onUnskip?: (() => void) | undefined;
}

/** Le résultat enregistré d'une brique confirmée (D27). */
function useStoredResult(resultId: string | undefined): TestResult | undefined {
  const [result, setResult] = useState<TestResult>();
  useEffect(() => {
    if (!resultId) return;
    let cancelled = false;
    void getTestResult(resultId).then((found) => {
      if (!cancelled) setResult(found);
    });
    return () => {
      cancelled = true;
    };
  }, [resultId]);
  return resultId ? result : undefined;
}

/**
 * Brique test en séance (lot G.4, conception V2 § 3.5.2, M9) : consignes,
 * saisie selon la nature du protocole — essais dégressifs (traction,
 * repos de 3 min), relevés et mesures (cardio minute par minute, sprints
 * et chaise, souplesse signée, mensurations), essai unique (planche) —
 * et résultat calculé en direct (§ 5.3). Chaque saisie passe par le
 * moteur et s'enregistre aussitôt dans le brouillon (D27).
 */
export function TestBlockCard({
  block: rawBlock,
  number,
  expanded,
  busy,
  editable,
  onToggle,
  apply,
  onFinish,
  onSkip,
  onUnskip,
}: TestBlockCardProps) {
  const { protocol, version, reload } = useTestProtocolVersion(rawBlock.protocolId, rawBlock.protocolVersionId);
  /* Séance enregistrée : la saisie et les mesures viennent du résultat,
     jamais recalculées (§ 5.3). */
  const stored = useStoredResult(rawBlock.testResultId);
  const block: PerformedTestBlock = stored ? { ...rawBlock, draft: draftFromResult(stored) } : rawBlock;
  const name = protocol?.name ?? "Test";
  const skipped = block.status === "skipped";
  const performed = block.status === "performed";
  const started = hasTestInput(block);
  const result: ComputedTestResult | undefined = version
    ? stored
      ? {
          status: stored.status,
          measures: stored.measures,
          ...(stored.trials ? { trials: stored.trials } : {}),
          messages: computeTestResult(version, block.draft).messages,
        }
      : computeTestResult(version, block.draft)
    : undefined;
  const canEdit = editable && !stored && !skipped && !busy;

  return (
    <li className={`wblock test-card ${expanded ? "wblock--open" : ""} ${performed ? "wblock--done" : ""} ${skipped ? "wblock--skipped" : ""}`}>
      <div className="wblock__row">
        <button type="button" className="wblock__head" onClick={onToggle} aria-expanded={expanded}>
          <span className="wblock__thumb test-card__icon" aria-hidden="true">
            <ClipboardCheck size={22} strokeWidth={2} />
          </span>
          <span className="wblock__body">
            <span className="wblock__name">
              {number !== undefined ? `${number}. ` : ""}Test {name.toLocaleLowerCase("fr-FR")}
            </span>
            <span className="wblock__meta">
              <span className="wblock__role">Test</span>
              {result && version ? summarize(version, result) : "…"}
            </span>
          </span>
          <span className="wblock__aside">
            {performed ? (
              <span className="wblock__check" aria-label="Terminé">
                <Check size={16} strokeWidth={3} aria-hidden="true" />
              </span>
            ) : skipped ? (
              <span className="wblock__skipped">Sauté</span>
            ) : (
              <span className="wblock__status">{started ? "En cours" : "À faire"}</span>
            )}
            {!skipped && (expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />)}
          </span>
        </button>
        {skipped && editable && onUnskip && (
          <button type="button" className="wblock__unskip" onClick={onUnskip} disabled={busy}>
            Annuler
          </button>
        )}
      </div>

      {expanded && !skipped && version && result && (
        <div className="wblock__content test-card__content">
          <details className="test-card__instructions" open={!started}>
            <summary>Consignes</summary>
            <ul>
              {version.instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>

          {version.kind === "trials_descending" ? (
            <TrialsPanel block={block} version={version} canEdit={canEdit} apply={apply} />
          ) : (
            <MeasuresPanel
              block={block}
              version={version}
              canEdit={canEdit}
              apply={apply}
              onUnitFixed={reload}
            />
          )}

          <section className={`test-card__result test-card__result--${result.status}`} aria-label="Résultat">
            <h3>{result.status === "complete" ? "Résultat" : "Résultat incomplet"}</h3>
            <ResultLines version={version} measures={result.measures} />
            {result.messages.length > 0 && (
              <ul className="test-card__messages">
                {result.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </section>

          <NoteField block={block} canEdit={canEdit} apply={apply} />

          {editable && (
            <div className="test-card__actions">
              {onFinish && !performed && (
                <button type="button" className="test-card__finish" disabled={busy || !started} onClick={onFinish}>
                  Terminer le test
                </button>
              )}
              {onSkip && !performed && (
                <button type="button" className="test-card__skip" disabled={busy} onClick={onSkip}>
                  Sauter le test
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Résumé et résultat                                                         */
/* -------------------------------------------------------------------------- */

function formatValue(value: number, unit: string): string {
  if (unit === "kg") return `${formatTestNumber(value)} kg`;
  /* Unités comptées : « 1 essai », « 3 essais ». */
  if (unit === "essais" || unit === "reps") return `${formatTestNumber(value)} ${value > 1 ? unit : unit.slice(0, -1)}`;
  if (unit === "") return formatTestNumber(value);
  return `${formatTestNumber(value)} ${unit}`;
}

function summarize(version: TestProtocolVersion, result: ReturnType<typeof computeTestResult>): string {
  const primary = primaryValue(version, result.measures);
  const spec = version.measures.find((measure) => measure.key === version.primaryMeasureKey);
  if (primary !== undefined && spec) return `${spec.label} : ${formatValue(primary, measureUnit(spec, version))}`;
  if (result.measures.length > 0) return `${result.measures.length} mesure${result.measures.length > 1 ? "s" : ""} saisie${result.measures.length > 1 ? "s" : ""}`;
  return "Résultat : —";
}

function ResultLines({ version, measures }: { version: TestProtocolVersion; measures: ReturnType<typeof computeTestResult>["measures"] }) {
  const derived = version.measures.filter((spec) => spec.input === "derived" || spec.key === version.primaryMeasureKey);
  const lines = derived
    .map((spec) => {
      const found = measures.filter((measure) => measure.key === spec.key);
      if (found.length === 0) return { spec, text: "—" };
      return {
        spec,
        text: found
          .map((measure) => `${measure.side === "left" ? "G " : measure.side === "right" ? "D " : ""}${formatValue(measure.value, measure.unit)}`)
          .join(" · "),
      };
    });

  return (
    <dl className="test-card__lines">
      {lines.map(({ spec, text }) => (
        <div key={spec.key} className={spec.key === version.primaryMeasureKey ? "test-card__line test-card__line--primary" : "test-card__line"}>
          <dt>{spec.label}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Essais dégressifs (traction)                                               */
/* -------------------------------------------------------------------------- */

function useSecondsSince(iso: string | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [iso]);
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000)) : undefined;
}

function TrialsPanel({
  block,
  version,
  canEdit,
  apply,
}: {
  block: PerformedTestBlock;
  version: TestProtocolVersion;
  canEdit: boolean;
  apply: (action: WorkoutAction) => unknown;
}) {
  const trials = [...(block.draft?.trials ?? [])].sort((a, b) => a.order - b.order);
  const last = trials.at(-1);
  const firstKg = Number(version.settings?.firstTrialKg ?? 40);
  const stepKg = Number(version.settings?.stepMinKg ?? 2);
  const restSec = Number(version.settings?.restSec ?? 180);
  const proposal = last ? Math.max(0, last.value - (last.outcome === "success" ? stepKg : 0)) : firstKg;
  const [value, setValue] = useState(formatNumberInput(proposal));
  const [proposedFor, setProposedFor] = useState(trials.length);
  const [lowest, setLowest] = useState(false);
  const finished = isTrialsTestFinished(trials);
  const elapsed = useSecondsSince(last && !finished ? last.completedAt : undefined);

  /* Nouvelle proposition après chaque essai. */
  if (proposedFor !== trials.length) {
    setProposedFor(trials.length);
    setValue(formatNumberInput(proposal));
    setLowest(false);
  }

  const kg = parseNumber(value);

  function add(outcome: "success" | "failure") {
    if (kg === undefined) return;
    void apply((current, at) => addTestTrial(current, block.id, { value: kg, outcome, restSec, atLowestSetting: lowest }, at));
  }

  return (
    <div className="test-card__panel">
      {trials.length > 0 && (
        <table className="test-card__trials">
          <thead>
            <tr>
              <th scope="col">Essai</th>
              <th scope="col">Assistance</th>
              <th scope="col">Résultat</th>
              <th scope="col"><span className="visually-hidden">Retirer</span></th>
            </tr>
          </thead>
          <tbody>
            {trials.map((trial) => (
              <tr key={trial.order}>
                <td>{trial.order}</td>
                <td>{formatDecimal(trial.value)} kg</td>
                <td className={trial.outcome === "success" ? "test-card__ok" : "test-card__ko"}>
                  {trial.outcome === "success" ? "Réussi" : "Échec"}
                  {trial.atLowestSetting && <small className="test-card__lowest"> · réglage le plus bas</small>}
                </td>
                <td>
                  {canEdit && (
                    <button
                      type="button"
                      className="test-card__remove"
                      aria-label={`Retirer l'essai ${trial.order}`}
                      onClick={() => void apply((current, at) => removeTestTrial(current, block.id, trial.order, at))}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {elapsed !== undefined && (
        <p className={`test-card__rest ${elapsed >= restSec ? "test-card__rest--done" : ""}`} role="timer">
          {elapsed >= restSec
            ? "Repos terminé : essai suivant"
            : `Repos : ${formatClock(restSec - elapsed)} avant l'essai suivant`}
        </p>
      )}

      {canEdit && !finished && (
        <div className="test-card__trial-form">
          <NumberField
            label={`Essai ${trials.length + 1} — assistance (kg)`}
            unit="kg"
            value={value}
            onChange={setValue}
            step={0.5}
            decimal
          />
          <label className="test-card__lowest-check">
            <input type="checkbox" checked={lowest} onChange={(event) => setLowest(event.target.checked)} />
            <span>Réglage le plus bas de la machine</span>
          </label>
          <div className="test-card__outcomes">
            <button type="button" className="test-card__success" disabled={kg === undefined} onClick={() => add("success")}>
              Réussi
            </button>
            <button type="button" className="test-card__failure" disabled={kg === undefined} onClick={() => add("failure")}>
              Échec
            </button>
          </div>
        </div>
      )}
      {finished && (
        <p className="test-card__done">
          {last?.outcome === "failure"
            ? "Premier échec atteint : le test est fini."
            : "Réussi au réglage le plus bas de la machine : le test est fini."}
        </p>
      )}
    </div>
  );
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Mesures (cardio, jambes, souplesse, mensurations, tronc)                   */
/* -------------------------------------------------------------------------- */

function MeasuresPanel({
  block,
  version,
  canEdit,
  apply,
  onUnitFixed,
}: {
  block: PerformedTestBlock;
  version: TestProtocolVersion;
  canEdit: boolean;
  apply: (action: WorkoutAction) => unknown;
  onUnitFixed: () => void;
}) {
  const [unitError, setUnitError] = useState<string>();
  const entered = version.measures.filter((spec) => spec.input === "entered");
  const required = entered.filter((spec) => spec.required);
  const optional = entered.filter((spec) => !spec.required);
  const needsUnit = version.measures.some((spec) => spec.key.startsWith("sprint_")) && !version.settings?.unit;

  async function chooseUnit(unit: SprintUnit) {
    try {
      setUnitError(undefined);
      await fixSprintUnit(block.protocolId, block.protocolVersionId, unit);
      onUnitFixed();
    } catch (cause) {
      setUnitError(cause instanceof Error ? cause.message : "Unité non enregistrée");
    }
  }

  const field = (spec: TestMeasureSpec) =>
    spec.side ? (
      <SideField key={spec.key} block={block} spec={spec} version={version} canEdit={canEdit} apply={apply} />
    ) : (
      <ValueField
        key={spec.key}
        block={block}
        spec={spec}
        version={version}
        canEdit={canEdit && !(needsUnit && spec.key.startsWith("sprint_"))}
        apply={apply}
      />
    );

  return (
    <div className="test-card__panel">
      {needsUnit && (
        <div className="test-card__unit" role="group" aria-label="Unité des sprints">
          <p>Unité des sprints, fixée pour ce vélo et les tests suivants :</p>
          <div>
            <button type="button" disabled={!canEdit} onClick={() => void chooseUnit("watts")}>Watts</button>
            <button type="button" disabled={!canEdit} onClick={() => void chooseUnit("meters")}>Mètres</button>
          </div>
          {unitError && <p className="test-card__error">{unitError}</p>}
        </div>
      )}
      <div className="test-card__fields">{required.map(field)}</div>
      {optional.length > 0 && (
        <details className="test-card__optional">
          <summary>Facultatif ({optional.length})</summary>
          <div className="test-card__fields">{optional.map(field)}</div>
        </details>
      )}
    </div>
  );
}

function useCommittedText(value: number | undefined): [string, (text: string) => void] {
  const [text, setText] = useState(formatNumberInput(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(formatNumberInput(value));
  }
  return [text, setText];
}

function ValueField({
  block,
  spec,
  version,
  canEdit,
  apply,
}: {
  block: PerformedTestBlock;
  spec: TestMeasureSpec;
  version: TestProtocolVersion;
  canEdit: boolean;
  apply: (action: WorkoutAction) => unknown;
}) {
  const stored = block.draft?.values?.[spec.key];
  const [text, setText] = useCommittedText(stored);
  const unit = measureUnit(spec, version);

  function commit() {
    const parsed = parseNumber(text);
    if (parsed === stored) return;
    void apply((current, at) => setTestValue(current, block.id, spec, parsed, at));
  }

  return (
    <label className="test-card__field">
      <span>{spec.label}</span>
      <span className="test-card__input">
        <input
          type="text"
          inputMode={spec.signed ? "text" : "decimal"}
          aria-label={spec.label}
          value={text}
          placeholder="—"
          disabled={!canEdit}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
        />
        {unit && <span>{unit}</span>}
      </span>
      {spec.signed && <small>0 = niveau des pieds ; négatif = au-delà</small>}
    </label>
  );
}

function SideField({
  block,
  spec,
  version,
  canEdit,
  apply,
}: {
  block: PerformedTestBlock;
  spec: TestMeasureSpec;
  version: TestProtocolVersion;
  canEdit: boolean;
  apply: (action: WorkoutAction) => unknown;
}) {
  const stored = block.draft?.sideValues?.[spec.key] ?? {};
  const [left, setLeft] = useCommittedText(stored.left);
  const [right, setRight] = useCommittedText(stored.right);
  const unit = measureUnit(spec, version);

  function commit(side: "left" | "right", text: string) {
    const parsed = parseNumber(text);
    if (parsed === stored[side]) return;
    void apply((current, at) => setTestSideValue(current, block.id, spec, side, parsed, at));
  }

  return (
    <fieldset className="test-card__field test-card__field--sides">
      <legend>{spec.label}</legend>
      {(
        [
          ["left", "Gauche", left, setLeft],
          ["right", "Droite", right, setRight],
        ] as const
      ).map(([side, label, text, setText]) => (
        <label key={side} className="test-card__input">
          <span>{label}</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${spec.label} ${label.toLocaleLowerCase("fr-FR")}`}
            value={text}
            placeholder="—"
            disabled={!canEdit}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => commit(side, text)}
          />
          {unit && <span>{unit}</span>}
        </label>
      ))}
    </fieldset>
  );
}

function NoteField({ block, canEdit, apply }: { block: PerformedTestBlock; canEdit: boolean; apply: (action: WorkoutAction) => unknown }) {
  const stored = block.draft?.note ?? "";
  const [text, setText] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setText(stored);
  }

  if (!canEdit) return stored ? <p className="test-card__note-read">{stored}</p> : null;

  return (
    <label className="test-card__note">
      <span>Note du test (facultatif)</span>
      <textarea
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text.trim() !== stored) void apply((current, at) => setTestNote(current, block.id, text, at));
        }}
      />
    </label>
  );
}
