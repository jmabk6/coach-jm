import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { getBodyMeasurement, getWeightReferenceDevice, saveBodyMeasurement } from "../../db/repositories/bodyRepository";
import { getSetting } from "../../db/repositories/settingsRepository";
import type { BodyMeasurement } from "../../domain";
import {
  BODY_FIELD_SPECS,
  BODY_SEGMENTS,
  bmiOf,
  bodyDeviceLabel,
  derivedComposition,
  deviceOfForm,
  DETAIL_BODY_FIELDS,
  emptyBodyMeasurementForm,
  formatBodyValue,
  formOfBodyMeasurement,
  localTimeOf,
  MAIN_BODY_FIELDS,
  parseBodyMeasurementForm,
  weightReferenceForForm,
  type BodyDeviceChoice,
  type BodyFieldKey,
  type BodyMeasurementFormValues,
} from "../../domain/rules/bodyMeasurementForm";
import { todayLocalDate } from "../today/useTodayData";
import { BodyNav as Nav } from "./BodyNav";
import "./body.css";

interface Loaded {
  form: BodyMeasurementFormValues;
  existing?: BodyMeasurement;
  referenceDevice: string;
  heightCm?: number;
}

/** Le nombre d'un champ, tel que tapé (pour les valeurs calculées en direct). */
function numberOf(text: string): number | undefined {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? undefined : value;
}

/**
 * Saisie et modification d'une mesure corporelle (Corps, phase 2). En
 * haut, ce que la balance affiche en premier — poids, % de graisse,
 * masse musculaire, muscle squelettique — et ce qui s'en calcule avec
 * certitude (graisse en kg, masse sans graisse, IMC avec la taille du
 * profil), jamais redemandé. Le reste est replié dans « Détails ».
 * RENPHO par défaut ; l'éligibilité au poids du jour se lit avant
 * d'enregistrer.
 */
export function BodyMeasurementFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>();
  const [form, setForm] = useState<BodyMeasurementFormValues>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [existing, referenceDevice, profile] = await Promise.all([
        id ? getBodyMeasurement(id) : Promise.resolve(undefined),
        getWeightReferenceDevice(),
        getSetting("profile"),
      ]);
      if (cancelled) return;
      if (id && (!existing || existing.originWeightEntry !== undefined)) return setLoaded(null);
      const now = new Date();
      const initial = existing ? formOfBodyMeasurement(existing) : emptyBodyMeasurementForm(todayLocalDate(), localTimeOf(now.toISOString()));
      setLoaded({ form: initial, ...(existing ? { existing } : {}), referenceDevice, ...(profile?.heightCm ? { heightCm: profile.heightCm } : {}) });
      setForm(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const back = id ? paths.bodyMeasurement(id) : paths.home();

  if (loaded === undefined || (loaded && !form)) return <section className="body-screen"><p>Chargement…</p></section>;
  if (loaded === null || !form) {
    return (
      <section className="body-screen">
        <Nav back={paths.home()} backLabel="Accueil" title="Mesure introuvable" />
        <p className="body-screen__note">Cette mesure n'existe pas ou ne se modifie pas.</p>
      </section>
    );
  }

  const { existing, referenceDevice, heightCm } = loaded;
  const set = (changes: Partial<BodyMeasurementFormValues>) => setForm({ ...form, ...changes });
  const device = deviceOfForm(form);
  const eligible = device !== "" && weightReferenceForForm(device, existing, referenceDevice);

  const weightKg = numberOf(form.weightKg);
  const fatPct = numberOf(form.fatPct);
  const computed = weightKg === undefined ? {} : derivedComposition({ weightKg, ...(fatPct !== undefined ? { fatPct } : {}) });
  const computedBmi = weightKg === undefined ? undefined : bmiOf({ weightKg }, heightCm);
  /* L'IMC ne se saisit que si la taille du profil manque. */
  const detailFields = heightCm ? DETAIL_BODY_FIELDS.filter((key) => key !== "bmi") : DETAIL_BODY_FIELDS;

  async function save() {
    if (!form || !loaded) return;
    const measurementId = existing?.id ?? `body-${crypto.randomUUID()}`;
    const parsed = parseBodyMeasurementForm(form, {
      id: measurementId,
      now: new Date().toISOString(),
      today: todayLocalDate(),
      referenceDevice,
      ...(existing ? { existing } : {}),
    });
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    setError(undefined);
    try {
      await saveBodyMeasurement(parsed.measurement);
      navigate(paths.bodyMeasurement(measurementId), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  const field = (key: BodyFieldKey) => {
    const spec = BODY_FIELD_SPECS[key];
    return (
      <label key={key} className="body-form__field">
        <span>{spec.label}</span>
        <span className="body-form__input">
          <input
            type="text"
            inputMode={spec.integer ? "numeric" : "decimal"}
            autoComplete="off"
            placeholder={spec.placeholder}
            aria-label={spec.ariaLabel}
            value={form[key]}
            onChange={(event) => set({ [key]: event.target.value })}
          />
          <span className="body-form__unit">{spec.unit}</span>
        </span>
      </label>
    );
  };

  return (
    <section className="body-screen">
      <Nav back={back} backLabel={id ? "Mesure" : "Accueil"} title={id ? "Modifier la mesure" : "Nouvelle mesure"} />

      <form
        className="body-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void save();
        }}
      >
        <div className="body-form__when">
          <label className="body-form__field body-form__field--stack">
            <span>Jour</span>
            <input type="date" aria-label="Jour de la mesure" max={todayLocalDate()} value={form.date} onChange={(event) => set({ date: event.target.value })} />
          </label>
          <label className="body-form__field body-form__field--stack">
            <span>Heure</span>
            <input type="time" aria-label="Heure de la mesure" value={form.time} onChange={(event) => set({ time: event.target.value })} />
          </label>
        </div>

        <label className="body-form__field">
          <span>Appareil</span>
          <select aria-label="Appareil" value={form.device} onChange={(event) => set({ device: event.target.value as BodyDeviceChoice })}>
            <option value="renpho">RENPHO</option>
            <option value="withings">Withings</option>
            <option value="other">Autre appareil</option>
          </select>
        </label>
        {form.device === "other" && (
          <label className="body-form__field">
            <span>Nom</span>
            <input type="text" aria-label="Nom de l'appareil" autoComplete="off" value={form.otherDevice} onChange={(event) => set({ otherDevice: event.target.value })} />
          </label>
        )}
        {device !== "" && (
          <p className="body-form__hint">
            {eligible
              ? `${bodyDeviceLabel(device)} : la première mesure de la journée donne le poids du jour.`
              : `${bodyDeviceLabel(device)} : cette mesure ne donne pas le poids du jour (appareil de référence : ${bodyDeviceLabel(referenceDevice)}).`}
          </p>
        )}

        {MAIN_BODY_FIELDS.map(field)}

        <div className="body-form__computed" role="group" aria-label="Valeurs calculées">
          <div>
            <span>Graisse</span>
            <strong>{computed.fatKg === undefined ? "—" : formatBodyValue(computed.fatKg, "kg")}</strong>
          </div>
          <div>
            <span>Masse sans graisse</span>
            <strong>{computed.fatFreeKg === undefined ? "—" : formatBodyValue(computed.fatFreeKg, "kg")}</strong>
          </div>
          {heightCm !== undefined && (
            <div>
              <span>IMC</span>
              <strong>{computedBmi === undefined ? "—" : formatBodyValue(computedBmi, "", 1)}</strong>
            </div>
          )}
          <small>calculées à partir du poids{heightCm !== undefined ? ", du % de graisse et de la taille" : " et du % de graisse"}</small>
        </div>

        <details className="body-form__details">
          <summary>Détails</summary>
          {detailFields.map(field)}
          <details className="body-form__details body-form__details--nested">
            <summary>Segments</summary>
            <div className="body-form__segments">
              <span />
              <span>Graisse</span>
              <span>Muscle</span>
              {BODY_SEGMENTS.map(({ key, label }) => (
                <SegmentRow
                  key={key}
                  label={label}
                  value={form.segments[key]}
                  onChange={(value) => set({ segments: { ...form.segments, [key]: value } })}
                />
              ))}
            </div>
          </details>
        </details>

        {error && (
          <p className="body-form__error" role="alert">
            {error}
          </p>
        )}
        <div className="body-form__actions">
          <Link to={back} className="body-form__button">
            Annuler
          </Link>
          <button type="submit" className="body-form__button body-form__button--primary" disabled={busy}>
            Enregistrer la mesure
          </button>
        </div>
      </form>
    </section>
  );
}

function SegmentRow({ label, value, onChange }: { label: string; value: { fatKg: string; muscleKg: string }; onChange: (value: { fatKg: string; muscleKg: string }) => void }) {
  return (
    <>
      <span className="body-form__segment-label">{label}</span>
      {(["fatKg", "muscleKg"] as const).map((part) => (
        <span key={part} className="body-form__input body-form__input--small">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${label} : ${part === "fatKg" ? "graisse" : "muscle"} en kg`}
            value={value[part]}
            onChange={(event) => onChange({ ...value, [part]: event.target.value })}
          />
          <span className="body-form__unit">kg</span>
        </span>
      ))}
    </>
  );
}
