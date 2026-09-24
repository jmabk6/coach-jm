import { useState } from "react";
import type Dexie from "dexie";
import { MigrationGuardError } from "../db/database";
import { BackupSection } from "../features/backup/BackupSection";
import { STORE_LABELS } from "../features/backup/exportBackup";
import { openDatabaseAsIs } from "./openDatabaseAsIs";
import "../features/plus/PlusScreen.css";
import "./MigrationFailureScreen.css";

/**
 * Écran affiché hors du routeur quand la base ne s'ouvre pas au démarrage
 * (SCHEMA_DEXIE_V3_MIGRATION.md § 4.4) : migration refusée par la garde,
 * base bloquée par un autre onglet, ou autre échec. Rien n'a été modifié ;
 * l'écran propose d'exporter les données telles qu'elles sont.
 */
export interface MigrationFailureScreenProps {
  error?: unknown;
  /** Une autre connexion (onglet) empêche la mise à jour. */
  blocked?: boolean;
  /** Injectable pour les tests. */
  openAsIs?: () => Promise<Dexie>;
}

export function MigrationFailureScreen({ error, blocked = false, openAsIs = () => openDatabaseAsIs() }: MigrationFailureScreenProps) {
  const [legacy, setLegacy] = useState<Dexie>();
  const [openError, setOpenError] = useState<string>();

  const guard = error instanceof MigrationGuardError ? error : undefined;

  async function prepareExport() {
    try {
      setLegacy(await openAsIs());
    } catch (caught) {
      setOpenError(caught instanceof Error ? caught.message : "Lecture de la base impossible");
    }
  }

  return (
    <section className="migration-failure">
      <h1>Mise à jour des données arrêtée</h1>

      {blocked ? (
        <p>
          Une autre fenêtre de Coach JM est ouverte et empêche la mise à jour. Fermez les autres onglets ou
          fenêtres de Coach JM, puis rouvrez l'application.
        </p>
      ) : (
        <p>La mise à jour des données a été arrêtée pour protéger vos données. Rien n'a été modifié.</p>
      )}

      {guard && (
        <>
          <p>Ces données ne peuvent pas être reprises par cette version :</p>
          <ul className="migration-failure__stores">
            {Object.entries(guard.counts).map(([store, count]) => (
              <li key={store}>
                {STORE_LABELS[store] ?? store} — {count} enregistrement{count > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      {!guard && !blocked && error !== undefined && (
        <p className="migration-failure__detail">{error instanceof Error ? error.message : String(error)}</p>
      )}

      <h2>Exporter mes données</h2>
      <p>Faites une sauvegarde de vos données telles qu'elles sont, puis envoyez-la pour vérification.</p>

      {legacy ? (
        <div className="plus-list">
          <BackupSection database={legacy} formatVersion={1} />
        </div>
      ) : (
        <button type="button" className="migration-failure__primary" onClick={() => void prepareExport()}>
          Préparer l'export
        </button>
      )}

      {openError && <p className="migration-failure__detail">Lecture impossible : {openError}</p>}
    </section>
  );
}
