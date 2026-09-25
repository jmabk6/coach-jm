import { useEffect, useState } from "react";
import type { PreferenceSettings } from "../domain";
import { usePreferences } from "../features/plus/usePreferences";
import { applyTheme, resolveTheme } from "./theme";

/**
 * Applique le thème des Réglages (lot L.3) : au démarrage, à chaque
 * changement dans Plus > Réglages, et quand le système bascule alors que
 * le thème est « Auto ». Ne rend rien.
 */
export function ThemeController() {
  const loaded = usePreferences();
  const [changed, setChanged] = useState<PreferenceSettings["theme"]>();
  const theme = changed ?? loaded?.theme;

  useEffect(() => {
    const onChange = (event: Event) => setChanged((event as CustomEvent<PreferenceSettings>).detail.theme);
    window.addEventListener("coach-jm:preferences", onChange);
    return () => window.removeEventListener("coach-jm:preferences", onChange);
  }, []);

  useEffect(() => {
    if (!theme) return;
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;
    const apply = () => applyTheme(resolveTheme(theme, media?.matches ?? false));
    apply();
    if (theme !== "auto" || !media) return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return null;
}
