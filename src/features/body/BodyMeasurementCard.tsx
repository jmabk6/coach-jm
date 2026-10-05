import { useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { getBodyMeasurements } from "../../db/repositories/bodyRepository";
import type { BodyMeasurement } from "../../domain";
import { bodyDeviceLabel, derivedComposition, formatBodyValue, lastBodyMeasurement, localTimeOf } from "../../domain/rules/bodyMeasurementForm";
import { shortDayOf } from "./bodyDisplay";
import "./body.css";

/**
 * Dernière mesure corporelle, sur l'Accueil (Corps, phase 2) : quatre
 * valeurs — poids, % de graisse, graisse en kg, muscle squelettique —,
 * le jour, l'heure et l'appareil. Compacte : la séance du jour reste la
 * priorité ; le reste se lit sur l'écran de la mesure.
 */
export function BodyMeasurementCard() {
  const [last, setLast] = useState<BodyMeasurement | null>();

  useEffect(() => {
    let cancelled = false;
    void getBodyMeasurements().then((measurements) => {
      if (!cancelled) setLast(lastBodyMeasurement(measurements) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (last === undefined) return null;

  if (last === null) {
    return (
      <section className="today-card body-card body-card--empty" aria-label="Dernière mesure corporelle">
        <span className="body-card__empty-label">Aucune mesure corporelle</span>
        <Link to={paths.bodyMeasurementNew()} className="body-card__add body-card__add--text">
          Ajouter une mesure
        </Link>
      </section>
    );
  }

  const { fatKg } = derivedComposition(last);
  const day = shortDayOf(last.date);
  const value = (number: number | undefined, unit: string) => (number === undefined ? "—" : formatBodyValue(number, unit, 1));

  return (
    <section className="today-card body-card" aria-label="Dernière mesure corporelle">
      <Link to={paths.bodyMeasurement(last.id)} className="body-card__summary" aria-label={`Voir la mesure du ${day}`}>
        <span className="body-card__meta">{`${day} · ${localTimeOf(last.takenAt)} · ${bodyDeviceLabel(last.device)}`}</span>
        <dl className="body-card__values">
          <div>
            <dt>Poids</dt>
            <dd>{value(last.weightKg, "kg")}</dd>
          </div>
          <div>
            <dt>% graisse</dt>
            <dd>{value(last.fatPct, "%")}</dd>
          </div>
          <div>
            <dt>Graisse</dt>
            <dd>{value(fatKg, "kg")}</dd>
          </div>
          <div>
            <dt>Muscle sq.</dt>
            <dd>{value(last.skeletalMuscleKg, "kg")}</dd>
          </div>
        </dl>
        <ChevronRight size={16} className="body-card__chevron" aria-hidden="true" />
      </Link>
      <Link to={paths.bodyMeasurementNew()} className="body-card__add" aria-label="Ajouter une mesure">
        <Plus size={20} aria-hidden="true" />
      </Link>
    </section>
  );
}
