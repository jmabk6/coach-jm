import { CalendarDays, Ellipsis, House, NotebookPen, Target, type LucideIcon } from "lucide-react";
import { isUnder, paths, ROUTES } from "./paths";

/**
 * Barre d'onglets (lot B, conception V2 § 2.1.1, D4) : cinq onglets, icônes
 * Lucide. L'onglet actif et la visibilité de la barre sont des règles
 * pures, testées à part du composant.
 */

export type TabKey = "home" | "planning" | "goals" | "journal" | "plus";

export interface Tab {
  key: TabKey;
  to: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: readonly Tab[] = [
  { key: "home", to: paths.home(), label: "Accueil", icon: House },
  { key: "planning", to: paths.planning(), label: "Planning", icon: CalendarDays },
  { key: "goals", to: paths.goals(), label: "Objectifs", icon: Target },
  /* Phase 3A.2 : Journal remplace Séances, désormais dans Plus › Modèles de séances (adresses inchangées). */
  { key: "journal", to: paths.journal(), label: "Journal", icon: NotebookPen },
  { key: "plus", to: paths.plus(), label: "Plus", icon: Ellipsis },
];

/**
 * L'onglet allumé pour une adresse. La bibliothèque d'exercices et les
 * modèles de séances (phase 3A.2) relèvent de Plus ; un récapitulatif de séance n'allume aucun onglet, puisqu'on y
 * arrive de partout.
 */
export function activeTabFor(pathname: string): TabKey | undefined {
  if (pathname === ROUTES.home || isUnder(pathname, "/aujourdhui") || isUnder(pathname, "/corps")) return "home";
  if (isUnder(pathname, ROUTES.planning)) return "planning";
  if (isUnder(pathname, ROUTES.goals)) return "goals";
  if (isUnder(pathname, ROUTES.journal)) return "journal";
  if (isUnder(pathname, ROUTES.plus) || isUnder(pathname, "/exercises") || isUnder(pathname, ROUTES.sessions)) return "plus";

  return undefined;
}

/**
 * La barre est masquée pendant la séance en cours (plein écran, D5) et
 * dans les flux modaux de sélection (bibliothèque, sélection de briques).
 */
export function isTabBarHidden(pathname: string, search: string): boolean {
  if (isUnder(pathname, ROUTES.workoutLive)) return true;

  const params = new URLSearchParams(search);

  return (
    (isUnder(pathname, "/exercises") && params.get("mode") === "select") ||
    (pathname.startsWith(`${ROUTES.sessions}/`) && params.get("select") === "1")
  );
}
