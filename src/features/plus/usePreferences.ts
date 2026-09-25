import { useEffect, useState } from "react";
import { getSetting } from "../../db/repositories/settingsRepository";
import type { PreferenceSettings } from "../../domain";
import { DEFAULT_PREFERENCES } from "../seed/seedSettingsDefaults";

/**
 * Réglages de l'utilisateur (Plus > Réglages, lot L.2) : `undefined` le
 * temps de la lecture, puis les valeurs enregistrées complétées par les
 * valeurs par défaut.
 */
export function usePreferences(): PreferenceSettings | undefined {
  const [preferences, setPreferences] = useState<PreferenceSettings>();

  useEffect(() => {
    let cancelled = false;
    void getSetting("preferences").then((value) => {
      if (!cancelled) setPreferences({ ...DEFAULT_PREFERENCES, ...value });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return preferences;
}
