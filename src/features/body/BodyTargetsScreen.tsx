import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { paths } from "../../app/paths";
import { getSetting, saveSetting } from "../../db/repositories/settingsRepository";
import {
  BODY_TARGET_KEYS,
  BODY_TARGET_SPECS,
  bodyTargetsFormOf,
  parseBodyTargetsForm,
  type BodyTargetKey,
  type BodyTargetsFormValues,
} from "../../domain/rules/bodyTargetRules";
import { BodyNav } from "./BodyNav";
import "./body.css";

/** Libellé accessible d'une borne : « Poids minimum en kg », « % graisse maximum ». */
function boundLabel(key: BodyTargetKey, bound: "min" | "max"): string {
  const spec = BODY_TARGET_SPECS[key];
  const unit = spec.unit === "%" ? "" : ` en ${spec.unit}`;
  return `${spec.name} ${bound === "min" ? "minimum" : "maximum"}${unit}${bound === "max" && spec.maxOptional ? " (facultatif)" : ""}`;
}

/**
 * Modifier la cible personnelle indicative de composition (phase 2.1) :
 * un minimum et un maximum par indicateur ; pour le muscle squelettique,
 * « au moins », le maximum est facultatif. Ne touche jamais l'objectif
 * Poids.
 */
export function BodyTargetsScreen() {
  const navigate = useNavigate();
  const [form, setForm] = useState<BodyTargetsFormValues>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getSetting("bodyCompositionTargets").then((targets) => {
      if (!cancelled) setForm(bodyTargetsFormOf(targets));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!form) return <section className="body-screen"><p>Chargement…</p></section>;

  async function save() {
    if (!form) return;
    const parsed = parseBodyTargetsForm(form, new Date().toISOString());
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    setError(undefined);
    await saveSetting({ key: "bodyCompositionTargets", value: parsed.targets });
    navigate(paths.goal("weight"), { replace: true });
  }

  const bound = (key: BodyTargetKey, which: "min" | "max") => {
    const field = `${key}${which === "min" ? "Min" : "Max"}` as const;
    return (
      <span className="body-form__input body-form__input--small">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={boundLabel(key, which)}
          placeholder={which === "max" && BODY_TARGET_SPECS[key].maxOptional ? "—" : ""}
          value={form[field]}
          onChange={(event) => setForm({ ...form, [field]: event.target.value })}
        />
        <span className="body-form__unit">{BODY_TARGET_SPECS[key].unit}</span>
      </span>
    );
  };

  return (
    <section className="body-screen">
      <BodyNav back={paths.goal("weight")} backLabel="Poids" title="Cible de composition" />
      <p className="body-screen__note">
        Cible personnelle indicative, pas une norme médicale. Elle sert à lire tes mesures ; l'objectif Poids se règle à part.
      </p>
      <form
        className="body-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void save();
        }}
      >
        <div className="body-targets">
          <span />
          <span className="body-targets__head">Minimum</span>
          <span className="body-targets__head">Maximum</span>
          {BODY_TARGET_KEYS.map((key) => (
            <div key={key} className="body-targets__row">
              <span className="body-targets__label">
                {BODY_TARGET_SPECS[key].name}
                {BODY_TARGET_SPECS[key].maxOptional && <small>au moins</small>}
              </span>
              {bound(key, "min")}
              {bound(key, "max")}
            </div>
          ))}
        </div>
        {error && (
          <p className="body-form__error" role="alert">
            {error}
          </p>
        )}
        <div className="body-form__actions">
          <Link to={paths.goal("weight")} className="body-form__button">
            Annuler
          </Link>
          <button type="submit" className="body-form__button body-form__button--primary" disabled={busy}>
            Enregistrer la cible
          </button>
        </div>
      </form>
    </section>
  );
}
