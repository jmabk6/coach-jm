/* « Rester sur le palier » n'écrit rien dans le modèle (spec § 7) : la
   proposition s'éteint d'elle-même à la séance suivante. Pour ne pas la
   remontrer à chaque ouverture d'ici là, le refus est mémorisé dans le
   navigateur seulement — jamais dans la base ni la sauvegarde. */
const DISMISSED_KEY = "coach-jm:hausse-refusee";

export function readDismissedRaises(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberDismissedRaise(milestoneId: string): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissedRaises(), milestoneId]));
  } catch {
    /* stockage indisponible : l'encart réapparaîtra, sans conséquence */
  }
}
