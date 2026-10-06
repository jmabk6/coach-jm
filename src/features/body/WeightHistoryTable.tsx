import { useEffect, useState } from "react";
import { getBodyMeasurements, getWeightReferenceDevice } from "../../db/repositories/bodyRepository";
import { getWeightEntries } from "../../db/repositories/weightRepository";
import { formatWeightHistoryRow, weightHistoryRows, type WeightHistoryRow } from "../../domain/rules/weightHistoryRules";
import "./body.css";

/**
 * Objectif Poids — l'historique jour par jour (06/10/2026) : une ligne par
 * pesée, la plus récente en haut — date, poids, % de
 * graisse, masse grasse, muscle squelettique (balance de référence).
 * Autonome : il charge ses données. Rien sans pesée.
 */
export function WeightHistoryTable() {
  const [rows, setRows] = useState<WeightHistoryRow[]>();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getWeightEntries(), getBodyMeasurements(), getWeightReferenceDevice()]).then(([entries, measurements, device]) => {
      if (!cancelled) setRows(weightHistoryRows(entries, measurements, device));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="goal-section body-panel weight-history">
      <h2>Historique des pesées</h2>
      <table className="body-panel__table weight-history__table" aria-label="Historique des pesées">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Poids</th>
            <th scope="col">% graisse</th>
            <th scope="col">M. grasse</th>
            <th scope="col">Muscle sq.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const text = formatWeightHistoryRow(row);
            return (
              <tr key={row.date}>
                <th scope="row">{text.date}</th>
                <td className="body-panel__current">{text.weight}</td>
                <td>{text.fatPct}</td>
                <td>{text.fatKg}</td>
                <td>{text.muscle}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
