/**
 * Saisie d'une série terminée mais pas encore enregistrée (15/10/2026) :
 * gardée sur l'appareil (localStorage) pour survivre à un retour dans
 * l'app ou à un rechargement. Effacée à l'enregistrement. Jamais dans la
 * base ni dans la sauvegarde : ce n'est pas encore une donnée.
 */

const PREFIX = "coach-jm:series-draft:";

export type SeriesDraft = Record<string, string | boolean | string[]>;

export function seriesDraftKey(workoutId: string, seriesId: string): string {
  return `${PREFIX}${workoutId}:${seriesId}`;
}

export function readSeriesDraft(key: string): SeriesDraft | undefined {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SeriesDraft) : undefined;
  } catch {
    return undefined;
  }
}

export function writeSeriesDraft(key: string, draft: SeriesDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* Stockage indisponible (navigation privée, quota) : la saisie reste à l'écran. */
  }
}

export function clearSeriesDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* rien à effacer */
  }
}

/** Les brouillons d'une autre séance que celle en cours n'ont plus d'objet. */
export function pruneSeriesDrafts(activeWorkoutId: string | undefined): void {
  try {
    const keep = activeWorkoutId ? `${PREFIX}${activeWorkoutId}:` : undefined;
    const stale: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX) && (!keep || !key.startsWith(keep))) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* stockage indisponible */
  }
}
