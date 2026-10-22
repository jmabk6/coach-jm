/**
 * Retour à la séance après une consultation (« Voir ma perspective », P3,
 * 22/10/2026) : on retient l'exercice d'où l'on part et sa place à l'écran,
 * puis on l'y remet au retour. La saisie et le chrono, eux, sont déjà
 * enregistrés (brouillon de série, repos en base).
 *
 * Le contenu défile dans `.app-content`, pas le document (27/09/2026).
 */
const KEY = "coach-jm:position-seance";

export interface WorkoutPosition {
  blockId: string;
  /** Distance entre le haut de la carte et le haut de la zone qui défile, en px. */
  offset: number;
}

function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".app-content");
}

/** À appeler au clic sur le lien qui quitte la séance. */
export function rememberWorkoutPosition(from: Element): void {
  const card = from.closest<HTMLElement>("[data-block-id]");
  const content = scroller();
  if (!card?.dataset.blockId || !content) return;
  const position: WorkoutPosition = { blockId: card.dataset.blockId, offset: card.getBoundingClientRect().top - content.getBoundingClientRect().top };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(position));
  } catch {
    /* Stockage indisponible : le retour se fera simplement en haut de la séance. */
  }
}

/** La position retenue (effacée au premier réalignement, voir plus bas). */
export function readWorkoutPosition(): WorkoutPosition | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<WorkoutPosition>) : undefined;
    return typeof parsed?.blockId === "string" && typeof parsed.offset === "number" ? { blockId: parsed.blockId, offset: parsed.offset } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remet la carte à sa place. Les cartes finissent de se remplir (dernière
 * fois, objectif) juste après l'affichage : on réaligne quelques fois, et on
 * s'arrête dès que tu touches l'écran. Renvoie de quoi tout annuler.
 */
export function restoreWorkoutPosition(position: WorkoutPosition): () => void {
  let stopped = false;
  const align = () => {
    /* Effacée ici, pas à la lecture : un effet annulé aussitôt (mode strict) la retrouve. */
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* rien à effacer */
    }
    const content = scroller();
    const card = content?.querySelector<HTMLElement>(`[data-block-id="${position.blockId}"]`);
    if (stopped || !content || !card) return;
    content.scrollTop += card.getBoundingClientRect().top - content.getBoundingClientRect().top - position.offset;
  };
  const stop = () => {
    stopped = true;
  };
  const timers = [0, 120, 300, 600].map((delay) => window.setTimeout(() => requestAnimationFrame(align), delay));
  const content = scroller();
  content?.addEventListener("touchstart", stop, { once: true, passive: true });
  content?.addEventListener("wheel", stop, { once: true, passive: true });
  return () => {
    stop();
    timers.forEach((timer) => window.clearTimeout(timer));
    content?.removeEventListener("touchstart", stop);
    content?.removeEventListener("wheel", stop);
  };
}
