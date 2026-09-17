/**
 * Signal de fin de repos au premier plan (§12, v2.9) : deux notes brèves
 * et une vibration si l'appareil le permet. Aucune notification différée
 * n'est promise ; ce signal ne joue que si l'app est visible au moment
 * où le compte à rebours atteint zéro.
 *
 * iOS n'autorise le son qu'après un geste de l'utilisateur : le contexte
 * audio est créé (« armé ») au premier geste de la séance.
 */

let audioContext: AudioContext | undefined;

function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;

  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * À appeler depuis un geste (tap sur Valider, Passer…) : crée ou
 * réveille le contexte audio pour que le signal puisse jouer plus tard.
 */
export function primeRestSignal(): void {
  const AudioContextClass = getAudioContextClass();

  if (!AudioContextClass) return;

  try {
    audioContext ??= new AudioContextClass();

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
  } catch {
    audioContext = undefined;
  }
}

function tone(context: AudioContext, at: number, frequency: number, durationSec: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + durationSec + 0.05);
}

export function playRestSignal(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      /* pas de vibration : rien à faire */
    }
  }

  if (!audioContext || audioContext.state !== "running") return;

  try {
    const now = audioContext.currentTime;
    tone(audioContext, now, 880, 0.18);
    tone(audioContext, now + 0.25, 1175, 0.28);
  } catch {
    /* le son est un confort, jamais une règle */
  }
}
