import { useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import type { CoachJmDatabase } from "../../db/database";
import { seedsSuspended } from "../seed/runSeeds";
import { BackupSection } from "./BackupSection";
import type { BackupEnvelope } from "./exportBackup";
import { eraseDatabase, resetAndRestore } from "./resetAndRestore";
import { parseBackup, validateBackupForRestore } from "./restoreBackup";
import "./DataResetSection.css";

/**
 * Point d'entrée minimal du lot C (SCHEMA_DEXIE_V3_MIGRATION.md § 7.4) :
 * « Importer une sauvegarde » et « Effacer toutes les données ». C'est
 * le chemin de retour arrière sur l'iPhone ; l'écran complet de
 * sauvegarde viendra au lot L.
 *
 * Ordre imposé : le fichier est validé **avant** toute question (un
 * refus ne touche à rien) ; puis l'export de sécurité est proposé ; puis
 * deux confirmations ; puis l'effacement, l'écriture et le rechargement.
 */

type Action = { kind: "import"; envelope: BackupEnvelope; fileName: string } | { kind: "erase" };

type ResetState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "invalid"; message: string }
  | { status: "review"; action: Action }
  | { status: "confirm"; action: Action }
  | { status: "running"; action: Action }
  | { status: "failed"; message: string; emptied: boolean };

interface DataResetSectionProps {
  database: CoachJmDatabase;
  /** Rechargement final (étape 6) ; remplaçable pour les tests. */
  reload?: () => void;
}

export function DataResetSection({ database, reload = () => window.location.reload() }: DataResetSectionProps) {
  const [state, setState] = useState<ResetState>({ status: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const busy = state.status === "reading" || state.status === "running";

  async function onFile(file: File) {
    setState({ status: "reading" });
    try {
      const envelope = parseBackup(await file.text());
      await validateBackupForRestore(envelope, database);
      setState({ status: "review", action: { kind: "import", envelope, fileName: file.name } });
    } catch (error) {
      setState({ status: "invalid", message: messageOf(error) });
    }
  }

  async function run(action: Action) {
    setState({ status: "running", action });
    try {
      if (action.kind === "import") await resetAndRestore(action.envelope, database);
      else await eraseDatabase(database);
      reload();
    } catch (error) {
      setState({ status: "failed", message: messageOf(error), emptied: seedsSuspended() });
    }
  }

  return (
    <>
      <div className="plus-list">
        <button type="button" className="plus-list__item plus-list__item--button" disabled={busy} onClick={() => input.current?.click()}>
          <span className="plus-list__icon" aria-hidden="true">
            <FileUp size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">Importer une sauvegarde</span>
            <span className="plus-list__meta">Remplace toutes les données par celles d'un fichier</span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">›</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label="Fichier de sauvegarde"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />

        <button
          type="button"
          className="plus-list__item plus-list__item--button"
          disabled={busy}
          onClick={() => setState({ status: "review", action: { kind: "erase" } })}
        >
          <span className="plus-list__icon plus-list__icon--danger" aria-hidden="true">
            <Trash2 size={22} strokeWidth={2} />
          </span>
          <span className="plus-list__content">
            <span className="plus-list__title">Effacer toutes les données</span>
            <span className="plus-list__meta">Séances, réglages, historique : tout disparaît</span>
          </span>
          <span className="plus-list__chevron" aria-hidden="true">›</span>
        </button>
      </div>

      {state.status === "reading" && <p className="plus-screen__status">Vérification du fichier…</p>}
      {state.status === "running" && (
        <p className="plus-screen__status">{state.action.kind === "import" ? "Restauration en cours…" : "Effacement en cours…"}</p>
      )}
      {state.status === "invalid" && (
        <p className="plus-screen__status plus-screen__status--error" role="alert">
          Fichier refusé, rien n'a été modifié. {state.message}
        </p>
      )}
      {state.status === "failed" && (
        <p className="plus-screen__status plus-screen__status--error" role="alert">
          Échec : {state.message}
          {state.emptied
            ? " La base est maintenant vide. Réimportez votre export de sécurité avec « Importer une sauvegarde »."
            : " Rien n'a été modifié."}
        </p>
      )}

      {state.status === "review" && (
        <div className="data-reset__review">
          <p className="data-reset__lead">
            {state.action.kind === "import"
              ? `Le fichier « ${state.action.fileName} » est valide : ${describeFile(state.action.envelope)} Toutes les données actuelles seront remplacées.`
              : "Toutes les données de Coach JM seront effacées."}
          </p>
          <p className="data-reset__lead">Faites d'abord un export de sécurité des données actuelles, puis conservez le fichier.</p>
          <BackupSection database={database} />
          <div className="data-reset__actions">
            <button type="button" className="data-reset__button" onClick={() => setState({ status: "idle" })}>
              Annuler
            </button>
            <button
              type="button"
              className="data-reset__button data-reset__button--danger"
              onClick={() => setState({ status: "confirm", action: state.action })}
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {state.status === "confirm" && (
        <BottomSheet
          title={state.action.kind === "import" ? "Remplacer toutes les données ?" : "Effacer toutes les données ?"}
          message="Cette action est définitive. Sans export de sécurité, les données actuelles seront perdues."
          actions={[
            {
              label: state.action.kind === "import" ? "Remplacer" : "Effacer",
              hint:
                state.action.kind === "import"
                  ? "La base est effacée puis remplie avec le fichier ; l'application redémarre"
                  : "La base est effacée ; l'application redémarre sur une base neuve",
              tone: "danger",
              onSelect: () => void run(state.action),
            },
          ]}
          onDismiss={() => setState({ status: "idle" })}
        />
      )}
    </>
  );
}

function describeFile(envelope: BackupEnvelope): string {
  const sessions = envelope.counts.workouts ?? 0;
  const date = new Date(envelope.exportedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

  return `export du ${date}, ${sessions} séance${sessions > 1 ? "s" : ""}.`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
