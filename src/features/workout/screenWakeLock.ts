/**
 * Écran allumé pendant la séance (15/10/2026), par la Screen Wake Lock API.
 *
 * Un seul verrou à la fois, demandé seulement quand une séance est active
 * et que l'app est au premier plan. En arrière-plan, le système libère le
 * verrou ; au retour, il est redemandé si la séance est toujours active.
 * Une demande qui aboutit après la fin de la séance est libérée aussitôt.
 * Refus ou API absente : rien ne se passe, la séance continue.
 *
 * Ne touche ni au verrouillage automatique ni à la luminosité : une fois le
 * verrou libéré, le délai de veille habituel de l'iPhone reprend, et le
 * bouton latéral verrouille toujours l'écran.
 */

export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

export interface WakeLockEnv {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
  isVisible(): boolean;
  /** Abonne à `visibilitychange` ; retourne le désabonnement. */
  onVisibilityChange(listener: () => void): () => void;
}

export interface ScreenWakeLock {
  /** Séance active (true) ou non (false) ; idempotent. */
  setActive(active: boolean): void;
  /** Libère le verrou et cesse d'écouter la visibilité. */
  dispose(): void;
}

export function browserWakeLockEnv(): WakeLockEnv {
  /* Absente sur les anciens iOS (avant 16.4) et certains navigateurs. */
  const wakeLock = "wakeLock" in navigator ? (navigator.wakeLock as WakeLockEnv["wakeLock"]) : undefined;
  return {
    ...(wakeLock ? { wakeLock } : {}),
    isVisible: () => document.visibilityState === "visible",
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

export function createScreenWakeLock(env: WakeLockEnv = browserWakeLockEnv()): ScreenWakeLock {
  let wanted = false;
  let sentinel: WakeLockSentinelLike | undefined;
  let requesting = false;

  const quietRelease = (held: WakeLockSentinelLike) => {
    if (!held.released) held.release().catch(() => undefined);
  };

  const acquire = () => {
    if (sentinel?.released) sentinel = undefined;
    if (!wanted || sentinel || requesting || !env.wakeLock || !env.isVisible()) return;
    requesting = true;
    env.wakeLock.request("screen").then(
      (obtained) => {
        requesting = false;
        /* Séance finie ou app passée en arrière-plan pendant la demande : on rend aussitôt. */
        if (!wanted || !env.isVisible()) {
          quietRelease(obtained);
          return;
        }
        sentinel = obtained;
        obtained.addEventListener("release", () => {
          if (sentinel === obtained) sentinel = undefined;
        });
      },
      /* Refus (batterie faible, réglage, navigateur) : la séance continue sans verrou. */
      () => {
        requesting = false;
      },
    );
  };

  const release = () => {
    const held = sentinel;
    sentinel = undefined;
    if (held) quietRelease(held);
  };

  const stopListening = env.onVisibilityChange(() => {
    if (env.isVisible()) acquire();
  });

  return {
    setActive(active) {
      /* Chaque série enregistrée relit la séance : seul un changement d'état compte (pas de nouvel essai après un refus). */
      if (active === wanted) return;
      wanted = active;
      if (active) acquire();
      else release();
    },
    dispose() {
      wanted = false;
      release();
      stopListening();
    },
  };
}
