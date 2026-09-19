import { useState } from "react";
import { HardDriveDownload } from "lucide-react";
import type Dexie from "dexie";
import {
  buildBackupFile,
  canShareFile,
  copyBackupText,
  downloadBackupFile,
  isStandaloneDisplay,
  shareBackupFile,
  type ShareOutcome,
} from "./deliverBackup";
import {
  backupFileName,
  formatBytes,
  readBackup,
  serializeBackup,
  storeLabel,
  type BackupEnvelope,
} from "./exportBackup";
import { describeIssue } from "./serializationAudit";
import "./BackupSection.css";

/**
 * « Sauvegarder mes données » (conception lot 0, § 2). Trois états :
 * lecture, résumé (comptes, taille, empreinte, actions), issue de la
 * remise. Aucune écriture : la base est lue en transaction de lecture
 * seule, le résumé vit dans l'état de l'écran et disparaît en le quittant.
 *
 * Le libellé final ne dit jamais « sauvegarde réussie » : un partage
 * lancé n'est pas un fichier conservé. La preuve vient de la
 * vérification de l'empreinte et de la restauration sur PC.
 */

type BackupState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; envelope: BackupEnvelope; text: string; file: File; delivery?: DeliveryMessage }
  | { status: "error"; message: string };

interface DeliveryMessage {
  tone: "info" | "warn";
  text: string;
}

const DELIVERY_MESSAGES: Record<ShareOutcome | "downloaded" | "copied" | "copy-failed", DeliveryMessage> = {
  launched: {
    tone: "info",
    text: "Partage lancé. Enregistrez le fichier (Fichiers, AirDrop…), puis faites vérifier son empreinte sur le PC : c'est cette vérification qui valide la sauvegarde.",
  },
  cancelled: { tone: "warn", text: "Partage refermé sans destination : rien n'a été enregistré." },
  unsupported: {
    tone: "info",
    text: "Cet appareil ne partage pas de fichier : le téléchargement a été proposé à la place. Vérifiez qu'un fichier a bien été enregistré.",
  },
  downloaded: {
    tone: "info",
    text: "Téléchargement proposé. Vérifiez qu'un fichier a bien été enregistré, puis faites vérifier son empreinte sur le PC.",
  },
  copied: { tone: "info", text: "JSON copié dans le presse-papiers. Collez-le dans une note ou un message, puis faites vérifier son empreinte sur le PC." },
  "copy-failed": { tone: "warn", text: "Copie impossible : sélectionnez le texte ci-dessous et copiez-le à la main." },
};

export interface BackupSectionProps {
  database: Dexie;
  /** Injectables pour les tests ; l'écran prend ceux du navigateur. */
  now?: () => Date;
  buildTime?: string;
  navigator?: Navigator;
  window?: Window;
}

export function BackupSection({
  database,
  now = () => new Date(),
  buildTime = __BUILD_TIME__,
  navigator: nav = window.navigator,
  window: win = window,
}: BackupSectionProps) {
  const [state, setState] = useState<BackupState>({ status: "idle" });
  const [showText, setShowText] = useState(false);

  async function read() {
    setState({ status: "reading" });

    try {
      const at = now();
      const envelope = await readBackup(database, {
        now: at,
        buildTime,
        userAgent: nav.userAgent,
        standalone: isStandaloneDisplay(win as Window & { navigator: Navigator & { standalone?: boolean } }),
      });
      const text = serializeBackup(envelope);
      const file = buildBackupFile(text, backupFileName(at));

      setState({ status: "ready", envelope, text, file });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Lecture de la base impossible" });
    }
  }

  function deliver(message: DeliveryMessage) {
    setState((current) => (current.status === "ready" ? { ...current, delivery: message } : current));
  }

  async function share() {
    if (state.status !== "ready") return;

    if (canShareFile(nav, state.file)) {
      const outcome = await shareBackupFile(nav, state.file);

      if (outcome !== "unsupported") {
        deliver(DELIVERY_MESSAGES[outcome]);
        return;
      }
    }

    downloadBackupFile(win.document, state.file);
    deliver(DELIVERY_MESSAGES[typeof nav.share === "function" ? "unsupported" : "downloaded"]);
  }

  async function copy() {
    if (state.status !== "ready") return;

    const ok = await copyBackupText(nav, state.text);
    setShowText(!ok);
    deliver(DELIVERY_MESSAGES[ok ? "copied" : "copy-failed"]);
  }

  return (
    <>
      <button
        type="button"
        className="plus-list__item plus-list__item--button"
        disabled={state.status === "reading"}
        onClick={() => void read()}
      >
        <span className="plus-list__icon" aria-hidden="true">
          <HardDriveDownload size={22} strokeWidth={2} />
        </span>
        <span className="plus-list__content">
          <span className="plus-list__title">Sauvegarder mes données</span>
          <span className="plus-list__meta">
            Copie complète de la base locale, à partager ou enregistrer dans Fichiers
          </span>
        </span>
        <span className="plus-list__chevron" aria-hidden="true">
          ›
        </span>
      </button>

      {state.status === "reading" && <p className="plus-screen__status">Lecture de la base…</p>}

      {state.status === "error" && (
        <p className="plus-screen__status plus-screen__status--error">{state.message}</p>
      )}

      {state.status === "ready" && (
        <section className="backup-card" aria-label="Sauvegarde prête">
          <h3 className="backup-card__title">Sauvegarde prête à partager</h3>
          <p className="backup-card__meta">
            {state.file.name} · {formatBytes(state.file.size)} · schéma version {state.envelope.database.version}
          </p>

          <dl className="backup-card__counts">
            {Object.entries(state.envelope.counts).map(([name, count]) => (
              <div key={name}>
                <dt>{storeLabel(name)}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>

          <p className="backup-card__hash">
            Empreinte <code>{state.envelope.integrity.hash.slice(0, 8)}</code>
            <small>Notez-la : elle permet de vérifier le fichier après transfert.</small>
          </p>

          {state.envelope.warnings.length > 0 && (
            <details className="backup-card__warnings">
              <summary>
                {state.envelope.warnings.length} valeur{state.envelope.warnings.length > 1 ? "s" : ""} écrite
                {state.envelope.warnings.length > 1 ? "s" : ""} sous une forme équivalente
              </summary>
              <ul>
                {state.envelope.warnings.map((issue, index) => (
                  <li key={index}>{describeIssue(issue)}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="backup-card__actions">
            <button type="button" className="backup-card__primary" onClick={() => void share()}>
              Partager
            </button>
            <button type="button" className="backup-card__secondary" onClick={() => void copy()}>
              Copier le JSON
            </button>
          </div>

          {state.delivery && (
            <p className={`backup-card__delivery backup-card__delivery--${state.delivery.tone}`}>
              {state.delivery.text}
            </p>
          )}

          {showText && (
            <textarea className="backup-card__text" readOnly value={state.text} aria-label="Contenu de la sauvegarde" />
          )}
        </section>
      )}
    </>
  );
}
