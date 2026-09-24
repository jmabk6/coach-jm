import { useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { getSetting } from "../../db/repositories/settingsRepository";
import { getTestProtocolByKey, getTestProtocolVersion, getTestResultsForProtocol } from "../../db/repositories/testRepository";
import type { TestProtocol, TestProtocolVersion, TestResult } from "../../domain";
import { formatFullDate } from "../../domain/rules/programRules";
import { morningMeasurementFor, type MorningMeasurement } from "../../domain/rules/testCycleRules";
import { computeTestResult } from "../../domain/rules/testResultRules";
import { saveManualTestResult } from "../tests/manualTestResult";
import { parseNumber } from "../workout/numberInput";
import { formatDecimal } from "../workout/workoutRecap";
import "./WeightCard.css";

interface Loaded {
  protocol: TestProtocol;
  version: TestProtocolVersion;
  invitation: MorningMeasurement;
  result: TestResult | undefined;
}

const value = (result: TestResult | undefined, key: string) => result?.measures.find((measure) => measure.key === key)?.value;

/** Le rapport se lit au centième (§ 5.3 : arrondi à 0,01). */
const formatRatio = (ratio: number | undefined) =>
  ratio === undefined ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ratio);

/**
 * Mensurations du matin (lot I.3, conception V2 § 2.3, § 2.4) : à côté de
 * la pesée, le lundi d'une semaine de tests — puis, sans résultat, jusqu'à
 * la fin de la semaine. Épaules et taille forment un résultat du protocole
 * « mensurations » (origine `manual`, daté du jour), le rapport est dérivé
 * à 0,01 (§ 5.3) ; aucune table dédiée (D13). Hors semaine de tests, rien.
 */
export function MeasurementsCard({ today }: { today: string }) {
  const [data, setData] = useState<Loaded>();
  const [counter, setCounter] = useState(0);
  const [editing, setEditing] = useState(false);
  const [shoulders, setShoulders] = useState("");
  const [waist, setWaist] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [cycle, schedule, protocol] = await Promise.all([getSetting("testCycle"), getSetting("testSchedule"), getTestProtocolByKey("mensurations")]);
      if (!cycle || !schedule || !protocol) return setData(undefined);
      const [version, results] = await Promise.all([getTestProtocolVersion(protocol.activeVersionId), getTestResultsForProtocol(protocol.id)]);
      const invitation = morningMeasurementFor({ today, cycle, schedule, protocol, results });
      if (cancelled) return;
      if (!invitation || !version) return setData(undefined);
      setData({ protocol, version, invitation, result: results.find((item) => item.id === invitation.resultId) });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [today, counter]);

  if (!data) return null;

  const { invitation, result, version } = data;
  const formOpen = invitation.state !== "done" || editing;
  const draft = {
    values: {
      ...(parseNumber(shoulders) !== undefined ? { epaules_cm: parseNumber(shoulders)! } : {}),
      ...(parseNumber(waist) !== undefined ? { taille_cm: parseNumber(waist)! } : {}),
    },
  };
  const liveRatio = computeTestResult(version, draft).measures.find((measure) => measure.key === "ratio_epaules_taille")?.value;

  async function save() {
    try {
      setBusy(true);
      setError(undefined);
      if (draft.values.epaules_cm === undefined || draft.values.taille_cm === undefined) {
        throw new Error("Les deux tours sont nécessaires");
      }
      await saveManualTestResult(
        {
          protocolId: data!.protocol.id,
          date: today,
          draft,
          ...(editing && result?.origin === "manual" ? { replacesResultId: result.id } : {}),
        },
        today,
      );
      setEditing(false);
      setCounter((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="today-card weight-card" aria-labelledby="measurements-card-title">
      <div className="weight-card__head">
        <span className="weight-card__icon" aria-hidden="true">
          <Ruler size={22} strokeWidth={2} />
        </span>
        <h2 id="measurements-card-title" className="today-card__title">Mensurations du matin</h2>
      </div>

      {invitation.state === "late" && !result && (
        <p className="weight-card__hint">Prévues le {formatFullDate(invitation.scheduledDate)} : encore à faire cette semaine de tests.</p>
      )}

      {result && !editing && (
        <div className="weight-card__today">
          <span>
            Épaules {formatDecimal(value(result, "epaules_cm") ?? 0)} cm · taille {formatDecimal(value(result, "taille_cm") ?? 0)} cm
            <br />
            <strong className="weight-card__value">Rapport {formatRatio(value(result, "ratio_epaules_taille"))}</strong>
          </span>
          {result.origin === "manual" && result.date === today && (
            <span className="weight-card__today-actions">
              <button
                type="button"
                className="today__link weight-card__link"
                onClick={() => {
                  setEditing(true);
                  setShoulders(String(value(result, "epaules_cm") ?? "").replace(".", ","));
                  setWaist(String(value(result, "taille_cm") ?? "").replace(".", ","));
                }}
              >
                Modifier
              </button>
            </span>
          )}
        </div>
      )}

      {formOpen && (
        <form
          className="weight-card__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void save();
          }}
        >
          <p className="weight-card__hint">{version.instructions.join(" ")}</p>
          <label className="weight-card__field">
            <span>Tour d'épaules</span>
            <span className="weight-card__input">
              <input type="text" inputMode="decimal" autoComplete="off" aria-label="Tour d'épaules en cm" value={shoulders} onChange={(event) => setShoulders(event.target.value)} />
              <span>cm</span>
            </span>
          </label>
          <label className="weight-card__field">
            <span>Tour de taille</span>
            <span className="weight-card__input">
              <input type="text" inputMode="decimal" autoComplete="off" aria-label="Tour de taille en cm" value={waist} onChange={(event) => setWaist(event.target.value)} />
              <span>cm</span>
            </span>
          </label>
          <p className="weight-card__hint" aria-live="polite">
            Rapport épaules / taille : {formatRatio(liveRatio)}
          </p>
          {error && (
            <p className="weight-card__error" role="alert">
              {error}
            </p>
          )}
          <div className="weight-card__actions">
            {editing && (
              <button type="button" className="weight-card__cancel" onClick={() => { setEditing(false); setError(undefined); }}>
                Annuler
              </button>
            )}
            <button type="submit" className="weight-card__submit" disabled={busy}>
              Enregistrer
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
