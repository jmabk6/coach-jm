import { ChevronLeft, SunMoon, Timer, Volume2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { saveSetting } from "../../db/repositories/settingsRepository";
import type { PreferenceSettings } from "../../domain";
import { formatDurationShort } from "../../domain/rules/blockInstructionRules";
import { usePreferences } from "./usePreferences";
import "./PlusScreen.css";

/** Repos proposés pour la séance libre. */
const FREE_REST_CHOICES = [30, 45, 60, 75, 90, 120, 150, 180];

const THEMES: ReadonlyArray<{ value: PreferenceSettings["theme"]; label: string }> = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "auto", label: "Auto" },
];

/**
 * Plus > Réglages (M11, lot L.2) : thème, son du minuteur, repos de la
 * séance libre (90 s par défaut). Pas de Vibration.
 */
export function SettingsScreen() {
  const loaded = usePreferences();
  const [edited, setPreferences] = useState<PreferenceSettings>();
  const preferences = edited ?? loaded;

  async function update(changes: Partial<PreferenceSettings>) {
    if (!preferences) return;
    const next = { ...preferences, ...changes };
    setPreferences(next);
    await saveSetting({ key: "preferences", value: next });
    /* Le thème s'applique tout de suite (lot L.3). */
    window.dispatchEvent(new CustomEvent("coach-jm:preferences", { detail: next }));
  }

  if (!preferences) return <section className="plus-screen"><p>Chargement…</p></section>;

  const choices = FREE_REST_CHOICES.includes(preferences.freeWorkoutRestSec)
    ? FREE_REST_CHOICES
    : [...FREE_REST_CHOICES, preferences.freeWorkoutRestSec].sort((a, b) => a - b);

  return (
    <section className="plus-screen">
      <header className="plus-subscreen__nav">
        <Link to={paths.plus()} className="plus-subscreen__back">
          <ChevronLeft size={18} aria-hidden="true" /> Plus
        </Link>
        <h1>Réglages</h1>
        <span />
      </header>

      <h2 className="plus-screen__section">Affichage</h2>
      <div className="plus-setting">
        <span className="plus-list__icon" aria-hidden="true">
          <SunMoon size={22} strokeWidth={2} />
        </span>
        <span className="plus-setting__label">Thème</span>
        <span className="plus-segmented" role="radiogroup" aria-label="Thème">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              type="button"
              role="radio"
              aria-checked={preferences.theme === theme.value}
              className={`plus-segmented__option${preferences.theme === theme.value ? " plus-segmented__option--active" : ""}`}
              onClick={() => void update({ theme: theme.value })}
            >
              {theme.label}
            </button>
          ))}
        </span>
      </div>

      <h2 className="plus-screen__section">Minuteur</h2>
      <label className="plus-setting">
        <span className="plus-list__icon" aria-hidden="true">
          <Volume2 size={22} strokeWidth={2} />
        </span>
        <span className="plus-setting__label">Son du minuteur</span>
        <input
          type="checkbox"
          role="switch"
          className="plus-switch"
          checked={preferences.timerSound}
          onChange={(event) => void update({ timerSound: event.target.checked })}
        />
      </label>
      <label className="plus-setting">
        <span className="plus-list__icon" aria-hidden="true">
          <Timer size={22} strokeWidth={2} />
        </span>
        <span className="plus-setting__label">
          Repos par défaut (séance libre)
          <small>Proposé à l'ajout d'un exercice en séance libre uniquement.</small>
        </span>
        <select
          aria-label="Repos par défaut (séance libre)"
          value={preferences.freeWorkoutRestSec}
          onChange={(event) => void update({ freeWorkoutRestSec: Number(event.target.value) })}
        >
          {choices.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatDurationShort(seconds)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
