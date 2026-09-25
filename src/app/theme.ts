import type { PreferenceSettings } from "../domain";

/**
 * Thème (lot L.3) : « Auto » suit le système. Le thème appliqué est posé
 * sur `<html data-theme>` (les jetons de tokens.css en dépendent), dans
 * `color-scheme` et dans `<meta name="theme-color">` ; il est aussi gardé
 * dans le stockage local pour être posé avant le premier rendu.
 */
export type AppliedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "coach-jm-theme";

/** Couleur de la barre du navigateur, celle du fond de chaque thème. */
export const THEME_COLORS: Record<AppliedTheme, string> = { light: "#f7f8fa", dark: "#0f1115" };

export function resolveTheme(theme: PreferenceSettings["theme"], systemDark: boolean): AppliedTheme {
  if (theme === "auto") return systemDark ? "dark" : "light";
  return theme;
}

export function applyTheme(theme: AppliedTheme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Stockage indisponible (navigation privée) : le thème s'appliquera au chargement des réglages. */
  }
}
