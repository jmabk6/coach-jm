import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { getAllTestProtocols, getAllTestResults } from "../../db/repositories/testRepository";
import { db } from "../../db/database";
import type { PerformedTestBlock, TestProtocol, TestProtocolVersion, TestResult, WorkoutSession } from "../../domain";
import { formatFullDate, formatLocalDate } from "../../domain/rules/programRules";
import { formatTestNumber, measureUnit, primaryValue } from "../../domain/rules/testResultRules";
import { BottomSheet } from "../../components/ui/BottomSheet";
import type { WorkoutAction } from "../workout/engine/persistWorkout";
import { deleteManualTestResult, saveManualTestResult } from "./manualTestResult";
import { TestBlockCard } from "./TestBlockCard";
import { TEST_PROTOCOLS_V1 } from "./testProtocolsV1";
import { paths } from "../../app/paths";
import "./TestProtocolsScreen.css";

const ORDER = TEST_PROTOCOLS_V1.map((content) => content.key);

interface Loaded {
  protocols: TestProtocol[];
  versionById: Map<string, TestProtocolVersion>;
  results: TestResult[];
}

function today(): string {
  return formatLocalDate(new Date());
}

/**
 * Plus > Protocoles de tests (M11, lot G.6) : chaque test, son dernier
 * résultat et son historique ; la **saisie d'un test passé**, geste
 * distinct et explicite (origine `manual`, date choisie) — le chemin des
 * tests du 27/09 notés sur papier ; la suppression d'un résultat saisi.
 */
export function TestProtocolsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const entryFor = searchParams.get("saisie");
  const [data, setData] = useState<Loaded>();
  const [counter, setCounter] = useState(0);
  const [message, setMessage] = useState<string>();
  const [deleting, setDeleting] = useState<TestResult>();
  const [deleteError, setDeleteError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getAllTestProtocols(), db.testProtocolVersions.toArray(), getAllTestResults()]).then(([protocols, versions, results]) => {
      if (cancelled) return;
      setData({
        protocols: [...protocols].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)),
        versionById: new Map(versions.map((version) => [version.id, version])),
        results: [...results].sort((a, b) => b.date.localeCompare(a.date)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [counter]);

  if (!data) return <section className="tests-screen"><p>Chargement…</p></section>;

  const entryProtocol = entryFor ? data.protocols.find((protocol) => protocol.id === entryFor) : undefined;
  if (entryProtocol) {
    return (
      <ManualEntry
        protocol={entryProtocol}
        onDone={(saved) => {
          setMessage(`${entryProtocol.name} du ${formatFullDate(saved.date)} enregistré.`);
          setCounter((value) => value + 1);
          setSearchParams(new URLSearchParams(), { replace: true });
        }}
        onCancel={() => setSearchParams(new URLSearchParams(), { replace: true })}
      />
    );
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      setDeleteError(undefined);
      await deleteManualTestResult(deleting.id);
      setDeleting(undefined);
      setCounter((value) => value + 1);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Suppression impossible");
    }
  }

  return (
    <section className="tests-screen">
      <header className="tests-screen__nav">
        <Link to={paths.plus()} className="tests-screen__back">‹ Plus</Link>
        <h1>Protocoles de tests</h1>
      </header>
      {message && <p className="tests-screen__message">{message}</p>}

      <ul className="tests-screen__list">
        {data.protocols.map((protocol) => {
          const results = data.results.filter((result) => result.protocolId === protocol.id);
          return (
            <li key={protocol.id} className="tests-screen__protocol">
              <div className="tests-screen__head">
                <span className="tests-screen__icon" aria-hidden="true">
                  <ClipboardCheck size={20} />
                </span>
                <span className="tests-screen__name">
                  {protocol.name}
                  {protocol.status === "paused" && <span className="tests-screen__paused">En pause</span>}
                </span>
              </div>
              <p className="tests-screen__last">
                {results[0]
                  ? `Dernier : ${formatFullDate(results[0].date)} · ${describe(results[0], data.versionById.get(results[0].versionId))}`
                  : "Aucun résultat"}
              </p>
              {protocol.status === "active" && (
                <button
                  type="button"
                  className="tests-screen__enter"
                  onClick={() => {
                    setMessage(undefined);
                    setSearchParams(new URLSearchParams({ saisie: protocol.id }));
                  }}
                >
                  <Plus size={18} aria-hidden="true" /> Saisir un test passé
                </button>
              )}
              {results.length > 0 && (
                <details className="tests-screen__history">
                  <summary>Historique ({results.length})</summary>
                  <ul>
                    {results.map((result) => (
                      <li key={result.id}>
                        <span>
                          {formatFullDate(result.date)} · {describe(result, data.versionById.get(result.versionId))}
                          <small>{result.origin === "manual" ? " · saisi" : " · en séance"}{result.status === "incomplete" ? " · incomplet" : ""}</small>
                        </span>
                        {result.origin === "manual" && (
                          <button type="button" aria-label={`Supprimer le résultat du ${formatFullDate(result.date)}`} onClick={() => setDeleting(result)}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {deleting && (
        <BottomSheet
          title="Supprimer ce résultat ?"
          message={`Saisi pour le ${formatFullDate(deleting.date)}. Cette suppression est définitive.`}
          actions={[{ label: "Supprimer définitivement", tone: "danger", onSelect: () => void confirmDelete() }]}
          onDismiss={() => setDeleting(undefined)}
        >
          {deleteError && <p className="tests-screen__error">{deleteError}</p>}
        </BottomSheet>
      )}
    </section>
  );
}

function describe(result: TestResult, version: TestProtocolVersion | undefined): string {
  if (!version) return `${result.measures.length} mesure(s)`;
  const value = primaryValue(version, result.measures);
  const spec = version.measures.find((measure) => measure.key === version.primaryMeasureKey);
  if (value === undefined || !spec) return `${result.measures.length} mesure${result.measures.length > 1 ? "s" : ""}`;
  const unit = measureUnit(spec, version);
  return `${spec.label} ${formatTestNumber(value)}${unit ? ` ${unit}` : ""}`;
}

/* -------------------------------------------------------------------------- */
/* Saisie d'un test passé                                                     */
/* -------------------------------------------------------------------------- */

function ManualEntry({
  protocol,
  onDone,
  onCancel,
}: {
  protocol: TestProtocol;
  onDone: (result: TestResult) => void;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const max = today();
  const [date, setDate] = useState(max);
  const [conditions, setConditions] = useState(true);
  const [conditionsNote, setConditionsNote] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  /* Une séance fictive, en mémoire, pour réutiliser la saisie et le calcul
     de la brique test ; rien n'est écrit avant « Enregistrer ». */
  const [draftSession, setDraftSession] = useState<WorkoutSession>(() => ({
    id: "saisie", source: "free", kind: "training", status: "in_progress", date: max, startedAt: new Date().toISOString(),
    lastActionAt: new Date().toISOString(), activeDurationSec: 0, createdAt: "", updatedAt: "",
    blocks: [{
      id: "saisie-test", kind: "test", position: 0, addedDuringWorkout: false, status: "not_performed",
      protocolId: protocol.id, protocolVersionId: protocol.activeVersionId,
    }],
  }));
  const block = draftSession.blocks[0] as PerformedTestBlock;

  function apply(action: WorkoutAction) {
    try {
      setError(undefined);
      setDraftSession((current) => action(current, new Date().toISOString()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saisie refusée");
    }
  }

  async function save() {
    try {
      setSaving(true);
      setError(undefined);
      const result = await saveManualTestResult(
        {
          protocolId: protocol.id,
          date,
          draft: block.draft ?? {},
          conditionsRespected: conditions,
          ...(conditions ? {} : { conditionsNote }),
        },
        max,
      );
      onDone(result);
    } catch (cause) {
      setSaving(false);
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    }
  }

  return (
    <section className="tests-screen">
      <header className="tests-screen__nav">
        <button type="button" className="tests-screen__back" onClick={onCancel}>‹ Protocoles</button>
        <h1>Saisir un test passé</h1>
      </header>
      <p className="tests-screen__intro">
        Pour un test fait hors de l'application, par exemple noté sur papier. Il est enregistré à la date choisie.
      </p>

      <label className="tests-screen__field">
        <span>Date du test</span>
        <input type="date" value={date} max={max} onChange={(event) => event.target.value && setDate(event.target.value)} />
      </label>

      <ul className="tests-screen__card">
        <TestBlockCard block={block} expanded busy={saving} editable apply={apply} />
      </ul>

      <label className="tests-screen__check">
        <input type="checkbox" checked={conditions} onChange={(event) => setConditions(event.target.checked)} />
        <span>Conditions du protocole respectées</span>
      </label>
      {!conditions && (
        <label className="tests-screen__field">
          <span>Qu'est-ce qui a changé ?</span>
          <textarea rows={2} value={conditionsNote} onChange={(event) => setConditionsNote(event.target.value)} />
        </label>
      )}

      {error && <p className="tests-screen__error">{error}</p>}
      <button type="button" className="tests-screen__save" disabled={saving} onClick={() => void save()}>
        Enregistrer le test du {formatFullDate(date)}
      </button>
      <button type="button" className="tests-screen__cancel" onClick={() => (window.history.length > 1 ? onCancel() : navigate(paths.plus()))}>
        Annuler
      </button>
    </section>
  );
}
