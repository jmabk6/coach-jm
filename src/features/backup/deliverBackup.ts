/**
 * Remise du fichier de sauvegarde à l'utilisateur (conception lot 0, § 6) :
 * trois voies, par détection de capacité, jamais par agent utilisateur.
 * Aucune n'est une preuve de sauvegarde : « partage lancé » n'est pas
 * « fichier conservé ». La preuve vient de la vérification de l'empreinte
 * et de la restauration sur PC.
 */

export type ShareOutcome =
  /** La feuille de partage s'est ouverte et s'est refermée sans erreur. */
  | "launched"
  /** L'utilisateur a refermé la feuille sans choisir de destination. */
  | "cancelled"
  /** Cet environnement ne partage pas de fichiers. */
  | "unsupported";

export interface ShareCapableNavigator {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
}

export interface ClipboardCapableNavigator {
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export function buildBackupFile(text: string, name: string): File {
  return new File([text], name, { type: "application/json" });
}

export function canShareFile(navigator: ShareCapableNavigator, file: File): boolean {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }

  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Voie 1. À appeler **dans le gestionnaire du geste** (Safari exige une
 * activation utilisateur encore valide) : la base a donc été lue avant.
 */
export async function shareBackupFile(navigator: ShareCapableNavigator, file: File): Promise<ShareOutcome> {
  if (!canShareFile(navigator, file)) {
    return "unsupported";
  }

  try {
    await navigator.share!({ files: [file], title: file.name });
    return "launched";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "cancelled";
    }
    /* Certains Safari répondent NotAllowedError quand l'activation a
       expiré ou que le type n'est pas partageable : on retombe sur le
       téléchargement plutôt que d'échouer. */
    return "unsupported";
  }
}

/**
 * Voie 2. Lien de téléchargement éphémère ; l'URL d'objet est révoquée.
 */
export function downloadBackupFile(document: Document, file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  /* Safari a besoin que l'URL survive au clic. */
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Voie 3. Presse-papiers ; `false` si indisponible ou refusé. */
export async function copyBackupText(navigator: ClipboardCapableNavigator, text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** L'application tourne-t-elle depuis l'écran d'accueil (PWA plein écran) ? */
export function isStandaloneDisplay(window: Window & { navigator: Navigator & { standalone?: boolean } }): boolean {
  return (
    window.navigator.standalone === true ||
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
  );
}
