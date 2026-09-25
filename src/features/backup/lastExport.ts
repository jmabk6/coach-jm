/**
 * Dernier export de cet appareil (Plus > Sauvegarde, lot L.4) : gardé dans
 * le stockage local — un export concerne l'appareil qui l'a fait, pas les
 * données ; il n'entre donc ni dans la base ni dans les sauvegardes.
 * Posé quand le fichier est parti (partage lancé, téléchargement, copie),
 * jamais sur un partage annulé.
 */
export const LAST_EXPORT_KEY = "coach-jm-last-export";

export function recordExport(at: Date, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(LAST_EXPORT_KEY, at.toISOString());
  } catch {
    /* Stockage indisponible : le rappel manquera, l'export reste valable. */
  }
}

export function getLastExport(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): string | undefined {
  try {
    return storage?.getItem(LAST_EXPORT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
