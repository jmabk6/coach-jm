import { ChevronLeft, Info, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { getSetting, saveSetting } from "../../db/repositories/settingsRepository";
import type { ProfileSettings } from "../../domain";
import { formatHeight, isProfileEmpty, parseProfileInput, profileSummary } from "../../domain/rules/profileRules";
import { todayLocalDate } from "../today/useTodayData";
import "./PlusScreen.css";

/**
 * Plus > Mon profil (M11, lot L.1) : prénom, date de naissance complète
 * facultative (âge calculé, D24), taille. Pas de photo.
 */
export function ProfileScreen() {
  const [today] = useState(todayLocalDate);
  const [profile, setProfile] = useState<ProfileSettings | null>();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [height, setHeight] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void getSetting("profile").then((value) => {
      if (!cancelled) setProfile(value ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function startEditing() {
    setFirstName(profile?.firstName ?? "");
    setBirthDate(profile?.birthDate ?? "");
    setHeight(profile?.heightCm ? formatHeight(profile.heightCm).replace(" m", "") : "");
    setError(undefined);
    setEditing(true);
  }

  async function save() {
    const parsed = parseProfileInput({ firstName, birthDate, height }, today);
    if (!parsed.ok) return setError(parsed.message);
    await saveSetting({ key: "profile", value: parsed.profile });
    setProfile(parsed.profile);
    setEditing(false);
  }

  if (profile === undefined) return <section className="plus-screen"><p>Chargement…</p></section>;

  const empty = isProfileEmpty(profile ?? undefined);
  const summary = profileSummary(profile ?? undefined, today);

  return (
    <section className="plus-screen">
      <header className="plus-subscreen__nav">
        <Link to={paths.plus()} className="plus-subscreen__back">
          <ChevronLeft size={18} aria-hidden="true" /> Plus
        </Link>
        <h1>Mon profil</h1>
        <span />
      </header>

      {editing ? (
        <form
          className="plus-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            <span>Prénom</span>
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
          </label>
          <label>
            <span>Date de naissance (facultative)</span>
            <input type="date" value={birthDate} max={today} onChange={(event) => setBirthDate(event.target.value)} />
          </label>
          <label>
            <span>Taille (m ou cm)</span>
            <input inputMode="decimal" value={height} placeholder="1,77" onChange={(event) => setHeight(event.target.value)} />
          </label>
          {error && <p className="plus-form__error" role="alert">{error}</p>}
          <div className="plus-form__actions">
            <button type="button" className="plus-form__button" onClick={() => setEditing(false)}>
              Annuler
            </button>
            <button type="submit" className="plus-form__button plus-form__button--primary">
              Enregistrer
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="plus-profile" onClick={startEditing}>
          <span className="plus-profile__avatar" aria-hidden="true">
            <UserRound size={30} strokeWidth={1.8} />
          </span>
          <span className="plus-profile__body">
            <strong>{empty ? "Ajouter mes informations" : profile?.firstName || "Mon profil"}</strong>
            {!empty && summary && <span>{summary}</span>}
            {!empty && !summary && <span>Modifier mes informations</span>}
          </span>
          <span className="plus-list__chevron" aria-hidden="true">›</span>
        </button>
      )}

      <p className="plus-note">
        <Info size={18} aria-hidden="true" />
        <span>
          Le poids se suit dans l'objectif Poids (pesée quotidienne). Les mensurations (épaules et taille) se font dans
          l'objectif Haut du corps.
        </span>
      </p>
    </section>
  );
}
