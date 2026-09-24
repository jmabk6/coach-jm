import { useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ClipboardCheck, DatabaseBackup, Dumbbell } from "lucide-react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { db } from "../../db/database";
import { BackupSection } from "../backup/BackupSection";
import { DataResetSection } from "../backup/DataResetSection";
import {
  importSeptember2026History,
  type ImportHistoryResult,
} from "../history/importHistory";
import "./PlusScreen.css";
import { paths } from "../../app/paths";

type ImportState =
  | { status: "idle" }
  | { status: "confirm" }
  | { status: "running" }
  | { status: "done"; result: ImportHistoryResult }
  | { status: "error"; message: string };

/**
 * Écran Plus : réglages et outils secondaires. La bibliothèque d'exercices
 * s'ouvre d'ici (§18 : Plus = gestion) ; Séances est un onglet depuis le
 * lot B. « Statistiques » ouvre l'ancien écran Progression, provisoire
 * jusqu'au lot N (conception V2 § 2.1.3, D6).
 */
export function PlusScreen() {
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });

  async function runImport() {
    setImportState({ status: "running" });

    try {
      const result = await importSeptember2026History();
      setImportState({ status: "done", result });
    } catch (error) {
      setImportState({
        status: "error",
        message:
          error instanceof Error ? error.message : "L'import a échoué",
      });
    }
  }

  return (
    <section className="plus-screen">
      <header className="plus-screen__header">
        <h1>Plus</h1>
        <p>Outils et réglages de Coach JM.</p>
      </header>

      <nav className="plus-list" aria-label="Outils">
        <Link to="/exercises" className="plus-list__item">
          <span className="plus-list__icon" aria-hidden="true">
            <Dumbbell size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">Exercices</span>
            <span className="plus-list__meta">
              Bibliothèque, fiches et création d'exercices
            </span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">
            ›
          </span>
        </Link>

        <Link to={paths.plusTests()} className="plus-list__item">
          <span className="plus-list__icon" aria-hidden="true">
            <ClipboardCheck size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">Protocoles de tests</span>
            <span className="plus-list__meta">
              Résultats, et saisie d'un test passé
            </span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">
            ›
          </span>
        </Link>

        <Link to={paths.progression()} className="plus-list__item">
          <span className="plus-list__icon" aria-hidden="true">
            <BarChart3 size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">Statistiques</span>
            <span className="plus-list__meta">
              Ancien écran Progression, provisoire
            </span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">
            ›
          </span>
        </Link>
      </nav>

      <h2 className="plus-screen__section">Données</h2>

      <div className="plus-list">
        <button
          type="button"
          className="plus-list__item plus-list__item--button"
          disabled={importState.status === "running"}
          onClick={() => setImportState({ status: "confirm" })}
        >
          <span className="plus-list__icon" aria-hidden="true">
            <DatabaseBackup size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">
              Importer mes séances de septembre 2026
            </span>
            <span className="plus-list__meta">
              10 séances des feuilles SEMAINE_1 à 3, du 1er au 16 septembre
            </span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">
            ›
          </span>
        </button>
        <p className="plus-list__hint">Sauvegardez avant d'importer.</p>
      </div>

      {importState.status === "running" && (
        <p className="plus-screen__status">Import en cours…</p>
      )}

      {importState.status === "done" && (
        <p className="plus-screen__status plus-screen__status--ok">
          {formatResult(importState.result)}
        </p>
      )}

      {importState.status === "error" && (
        <p className="plus-screen__status plus-screen__status--error">
          {importState.message}
        </p>
      )}

      <div className="plus-list">
        <BackupSection database={db} />
      </div>

      <DataResetSection database={db} />

      <p className="plus-screen__version">
        Version du{" "}
        {new Date(__BUILD_TIME__).toLocaleString("fr-FR", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>

      {importState.status === "confirm" && (
        <BottomSheet
          title="Importer mes séances de septembre 2026 ?"
          message="10 séances réalisées (tapis, musculation, gainage, mobilité, marche) rejoignent l'historique et alimentent les fiches exercices. Sauvegardez vos données avant d'importer."
          actions={[
            {
              label: "Importer",
              hint: "Relancer l'import ne crée pas de doublon et ne supprime rien",
              tone: "primary",
              onSelect: () => void runImport(),
            },
          ]}
          onDismiss={() => setImportState({ status: "idle" })}
        />
      )}
    </section>
  );
}

function formatResult(result: ImportHistoryResult): string {
  const parts: string[] = [];

  if (result.workoutsCreated > 0) {
    parts.push(`${result.workoutsCreated} séance${result.workoutsCreated > 1 ? "s" : ""} ajoutée${result.workoutsCreated > 1 ? "s" : ""}`);
  }

  if (result.workoutsUpdated > 0) {
    parts.push(`${result.workoutsUpdated} séance${result.workoutsUpdated > 1 ? "s" : ""} déjà présente${result.workoutsUpdated > 1 ? "s" : ""}, réécrite${result.workoutsUpdated > 1 ? "s" : ""} à l'identique`);
  }

  return `Import terminé : ${parts.join(", ")}.`;
}
