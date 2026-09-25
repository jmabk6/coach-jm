import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, BarChart3, ClipboardCheck, Dumbbell, Info, Moon, Settings, UserRound } from "lucide-react";
import "./PlusScreen.css";
import { paths } from "../../app/paths";

interface Entry {
  to: string;
  icon: ReactNode;
  title: string;
  meta: string;
}

/**
 * Écran Plus (M11, lot L) : profil, bibliothèque d'exercices, routines du
 * soir, protocoles de tests ; puis réglages, sauvegarde, à propos.
 * « Statistiques » ouvre l'ancien écran Progression, provisoire jusqu'au
 * lot N (conception V2 § 2.1.3, D6). L'import des séances de septembre
 * n'est plus proposé (D3).
 */
const TOOLS: Entry[] = [
  { to: paths.plusProfile(), icon: <UserRound size={22} strokeWidth={2} />, title: "Mon profil", meta: "Mes informations personnelles" },
  { to: "/exercises", icon: <Dumbbell size={22} strokeWidth={2} />, title: "Exercices", meta: "Bibliothèque, fiches et création d'exercices" },
  { to: paths.plusRoutines(), icon: <Moon size={22} strokeWidth={2} />, title: "Routines du soir", meta: "Tronc et souplesse, chaque soir" },
  { to: paths.plusTests(), icon: <ClipboardCheck size={22} strokeWidth={2} />, title: "Protocoles de tests", meta: "Résultats, saisie d'un test passé, tests à replanifier" },
  { to: paths.progression(), icon: <BarChart3 size={22} strokeWidth={2} />, title: "Statistiques", meta: "Ancien écran Progression, provisoire" },
];

const APP: Entry[] = [
  { to: paths.plusSettings(), icon: <Settings size={22} strokeWidth={2} />, title: "Réglages", meta: "Thème, son du minuteur, repos de la séance libre" },
  { to: paths.plusBackup(), icon: <ArrowUpDown size={22} strokeWidth={2} />, title: "Sauvegarde", meta: "Exporter, importer, effacer mes données" },
  { to: paths.plusAbout(), icon: <Info size={22} strokeWidth={2} />, title: "À propos", meta: `Version ${__APP_VERSION__}` },
];

function EntryList({ entries, label }: { entries: Entry[]; label: string }) {
  return (
    <nav className="plus-list" aria-label={label}>
      {entries.map((entry) => (
        <Link key={entry.to} to={entry.to} className="plus-list__item">
          <span className="plus-list__icon" aria-hidden="true">
            {entry.icon}
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">{entry.title}</span>
            <span className="plus-list__meta">{entry.meta}</span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">
            ›
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function PlusScreen() {
  return (
    <section className="plus-screen">
      <header className="plus-screen__header">
        <h1>Plus</h1>
        <p>Outils et réglages de Coach JM.</p>
      </header>

      <EntryList entries={TOOLS} label="Outils" />
      <EntryList entries={APP} label="Application" />
    </section>
  );
}
