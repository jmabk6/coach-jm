import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { getBodyMeasurements, getWeightReferenceDevice } from "../../db/repositories/bodyRepository";
import { getSetting } from "../../db/repositories/settingsRepository";
import type { BodyCompositionTargets } from "../../domain";
import { bodyDeviceLabel } from "../../domain/rules/bodyMeasurementForm";
import {
  BODY_TARGET_KEYS,
  BODY_TARGET_SPECS,
  compositionComparison,
  formatBodyEvolution,
  formatCurrentValue,
  formatTargetRange,
  type BodyComparison,
} from "../../domain/rules/bodyTargetRules";
import { formatFr } from "../../domain/rules/dateFr";
import "./body.css";

interface Loaded {
  device: string;
  comparison?: BodyComparison;
  targets?: BodyCompositionTargets;
}

/**
 * Composition corporelle et cible personnelle indicative (phase 2.1) :
 * pour chacun des quatre indicateurs, la dernière mesure de l'appareil de
 * référence, la cible, l'évolution depuis la première mesure de ce même
 * appareil. Compact (un tableau de quatre lignes), autonome : il charge
 * ses données et pourra rejoindre l'onglet Progression tel quel.
 */
export function BodyCompositionPanel() {
  const [loaded, setLoaded] = useState<Loaded>();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getBodyMeasurements(), getWeightReferenceDevice(), getSetting("bodyCompositionTargets")]).then(([measurements, device, targets]) => {
      if (cancelled) return;
      const comparison = compositionComparison(measurements, device, targets);
      setLoaded({ device, ...(comparison ? { comparison } : {}), ...(targets ? { targets } : {}) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;
  const { device, comparison, targets } = loaded;
  const rows = BODY_TARGET_KEYS.map(
    (key) =>
      comparison?.rows.find((row) => row.key === key) ?? {
        key,
        label: BODY_TARGET_SPECS[key].label,
        unit: BODY_TARGET_SPECS[key].unit,
        target: targets?.[key],
        inTarget: false,
        current: undefined,
        evolution: undefined,
      },
  );

  return (
    <section className="goal-section body-panel">
      <div className="body-panel__head">
        <h2>Composition corporelle</h2>
        <span className="body-panel__meta">
          {comparison ? `${bodyDeviceLabel(device)} · depuis le ${formatFr(comparison.since, "d MMM")}` : `Aucune mesure ${bodyDeviceLabel(device)} pour l'instant.`}
        </span>
      </div>
      <table className="body-panel__table" aria-label="Composition corporelle et cible">
        <thead>
          <tr>
            <th scope="col">
              <span className="body-panel__sr">Indicateur</span>
            </th>
            <th scope="col">Actuel</th>
            <th scope="col">Cible</th>
            <th scope="col">Évolution</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td className="body-panel__current">
                {formatCurrentValue(row.current, row.unit)}
                {row.inTarget && <Check size={14} strokeWidth={3} className="body-panel__check" aria-label="dans la cible" />}
              </td>
              <td>{formatTargetRange(row.target, row.unit)}</td>
              <td>{formatBodyEvolution(row.evolution, row.key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="body-panel__foot">
        Cible personnelle indicative · <Link to={paths.bodyTargets()}>Modifier</Link>
      </p>
    </section>
  );
}
