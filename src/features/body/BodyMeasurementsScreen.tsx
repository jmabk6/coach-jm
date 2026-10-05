import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { getBodyMeasurements } from "../../db/repositories/bodyRepository";
import type { BodyMeasurement } from "../../domain";
import { bodyDeviceLabel, formatBodyValue, localTimeOf } from "../../domain/rules/bodyMeasurementForm";
import { shortDayOf } from "./bodyDisplay";
import { BodyNav } from "./BodyNav";
import "./body.css";

/**
 * Toutes les mesures corporelles (Corps, phase 2), de la plus récente à
 * la plus ancienne, avec l'appareil : pour retrouver, corriger ou
 * supprimer une mesure qui n'est plus la dernière. Les courbes viendront
 * avec la progression du corps.
 */
export function BodyMeasurementsScreen() {
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>();

  useEffect(() => {
    let cancelled = false;
    void getBodyMeasurements().then((loaded) => {
      if (!cancelled) setMeasurements([...loaded].reverse());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="body-screen">
      <BodyNav back={paths.home()} backLabel="Accueil" title="Mesures corporelles" />
      {!measurements ? (
        <p>Chargement…</p>
      ) : measurements.length === 0 ? (
        <p className="body-screen__note">Aucune mesure corporelle.</p>
      ) : (
        <ul className="body-list" aria-label="Mesures corporelles">
          {measurements.map((measurement) => (
            <li key={measurement.id}>
              <Link to={paths.bodyMeasurement(measurement.id)} className="body-list__row">
                <span>
                  <strong>{shortDayOf(measurement.date)}</strong> · {localTimeOf(measurement.takenAt)} · {bodyDeviceLabel(measurement.device)}
                </span>
                <span className="body-list__value">{formatBodyValue(measurement.weightKg, "kg", 1)}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to={paths.bodyMeasurementNew()} className="body-form__button body-form__button--primary body-screen__cta">
        Ajouter une mesure
      </Link>
    </section>
  );
}
