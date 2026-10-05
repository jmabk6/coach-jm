import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { deleteBodyMeasurement, getBodyMeasurement } from "../../db/repositories/bodyRepository";
import { getSetting } from "../../db/repositories/settingsRepository";
import type { BodyMeasurement } from "../../domain";
import {
  BODY_FIELD_SPECS,
  BODY_SEGMENTS,
  bmiOf,
  bodyDeviceLabel,
  bodySourceLabel,
  derivedComposition,
  formatBodyValue,
  localTimeOf,
  type BodyFieldKey,
} from "../../domain/rules/bodyMeasurementForm";
import { formatFullDate } from "../../domain/rules/programRules";
import { BodyNav } from "./BodyNav";
import "./body.css";

interface Row {
  label: string;
  value: string;
  computed?: boolean;
}

/** Toutes les valeurs d'une mesure, dans l'ordre de l'écran de la balance ; les absentes ne s'affichent pas. */
function rowsOf(measurement: BodyMeasurement, heightCm: number | undefined): Row[] {
  const rows: Row[] = [];
  const derived = derivedComposition(measurement);
  const push = (key: BodyFieldKey) => {
    const value = measurement[key];
    if (value !== undefined) rows.push({ label: BODY_FIELD_SPECS[key].label, value: formatBodyValue(value, BODY_FIELD_SPECS[key].unit) });
  };

  push("weightKg");
  push("fatPct");
  if (derived.fatKg !== undefined) rows.push({ label: "Graisse", value: formatBodyValue(derived.fatKg, "kg"), computed: measurement.fatKg === undefined });
  if (derived.fatFreeKg !== undefined) rows.push({ label: "Masse sans graisse", value: formatBodyValue(derived.fatFreeKg, "kg"), computed: measurement.fatFreeKg === undefined });
  push("muscleKg");
  push("skeletalMuscleKg");
  const bmi = bmiOf(measurement, heightCm);
  if (bmi !== undefined) rows.push({ label: "IMC", value: formatBodyValue(bmi, ""), computed: measurement.bmi === undefined });
  for (const key of ["waterKg", "proteinKg", "boneKg", "visceralFat", "bmrKcal", "metabolicAge", "score"] as const) push(key);
  for (const [label, value] of Object.entries(measurement.extra ?? {})) rows.push({ label, value: typeof value === "number" ? formatBodyValue(value, "") : value });
  return rows;
}

/**
 * Une mesure corporelle (Corps, phase 2) : toutes ses valeurs, sa
 * provenance (appareil, saisie ou import, poids du jour ou non), les
 * segments. Modifier ; supprimer après confirmation. La copie d'une
 * pesée remplacée se lit seulement : elle revient d'elle-même.
 */
export function BodyMeasurementScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<{ measurement: BodyMeasurement | null; heightCm?: number }>();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getBodyMeasurement(id), getSetting("profile")]).then(([measurement, profile]) => {
      if (!cancelled) setState({ measurement: measurement ?? null, ...(profile?.heightCm ? { heightCm: profile.heightCm } : {}) });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!state) return <section className="body-screen"><p>Chargement…</p></section>;

  const { measurement, heightCm } = state;
  if (!measurement) {
    return (
      <section className="body-screen">
        <BodyNav back={paths.home()} backLabel="Accueil" title="Mesure introuvable" />
        <p className="body-screen__note">Cette mesure n'existe plus.</p>
      </section>
    );
  }

  const copy = measurement.originWeightEntry !== undefined;
  const segments = BODY_SEGMENTS.filter(({ key }) => measurement.segments?.[key] !== undefined);

  return (
    <section className="body-screen">
      <BodyNav back={paths.home()} backLabel="Accueil" title={`Mesure du ${formatFullDate(measurement.date)}`} />

      <div className="body-detail__provenance">
        <strong>{`${bodyDeviceLabel(measurement.device)} · ${bodySourceLabel(measurement)}`}</strong>
        <span>{localTimeOf(measurement.takenAt)}</span>
        <span className={measurement.weightReference ? "body-detail__badge body-detail__badge--on" : "body-detail__badge"}>
          {measurement.weightReference ? "Donne le poids du jour" : "Ne donne pas le poids du jour"}
        </span>
      </div>

      {copy && (
        <p className="body-screen__note">
          Copie de la pesée manuelle remplacée par la mesure de référence du jour : elle revient d'elle-même si cette mesure est retirée.
        </p>
      )}

      <dl className="body-detail__values">
        {rowsOf(measurement, heightCm).map((row) => (
          <div key={row.label}>
            <dt>
              {row.label}
              {row.computed && <small> calculé</small>}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      {segments.length > 0 && (
        <table className="body-detail__segments" aria-label="Segments">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Graisse</th>
              <th scope="col">Muscle</th>
            </tr>
          </thead>
          <tbody>
            {segments.map(({ key, label }) => {
              const segment = measurement.segments![key]!;
              return (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{segment.fatKg !== undefined ? formatBodyValue(segment.fatKg, "kg") : segment.fatPct !== undefined ? formatBodyValue(segment.fatPct, "%") : "—"}</td>
                  <td>{segment.muscleKg !== undefined ? formatBodyValue(segment.muscleKg, "kg") : segment.musclePct !== undefined ? formatBodyValue(segment.musclePct, "%") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {error && (
        <p className="body-form__error" role="alert">
          {error}
        </p>
      )}

      {!copy && (
        <div className="body-form__actions">
          <button type="button" className="body-form__button body-form__button--danger" onClick={() => setDeleting(true)}>
            Supprimer
          </button>
          <Link to={paths.bodyMeasurementEdit(measurement.id)} className="body-form__button body-form__button--primary">
            Modifier
          </Link>
        </div>
      )}

      <Link to={paths.bodyMeasurements()} className="body-screen__link">
        Toutes les mesures
      </Link>

      {deleting && (
        <BottomSheet
          title="Supprimer cette mesure ?"
          message={
            measurement.weightReference
              ? `${bodyDeviceLabel(measurement.device)} du ${formatFullDate(measurement.date)}, ${localTimeOf(measurement.takenAt)}. La pesée du jour qui en vient sera recalculée.`
              : `${bodyDeviceLabel(measurement.device)} du ${formatFullDate(measurement.date)}, ${localTimeOf(measurement.takenAt)}.`
          }
          actions={[
            {
              label: "Supprimer",
              hint: "La mesure disparaît définitivement",
              tone: "danger",
              onSelect: () =>
                void (async () => {
                  setDeleting(false);
                  try {
                    await deleteBodyMeasurement(measurement.id);
                    navigate(paths.home(), { replace: true });
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : String(caught));
                  }
                })(),
            },
          ]}
          onDismiss={() => setDeleting(false)}
        />
      )}
    </section>
  );
}
