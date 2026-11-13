import { beatsBetween } from "./testStages";

/**
 * Son du métronome et des chronos du test jambes V2 (13/11/2026).
 *
 * - iOS n'autorise le son qu'après un geste : le contexte audio est créé ou
 *   réveillé dans l'appui sur « Démarrer ».
 * - Mode silencieux : depuis iOS 17, Safari permet de demander une session
 *   audio « lecture » (`navigator.audioSession.type = "playback"`), qui joue
 *   malgré le bouton silencieux. À vérifier sur l'iPhone ; sans cette API,
 *   le silencieux coupe le son.
 * - Écran verrouillé ou application en arrière-plan : iOS met la page en
 *   pause, plus de son ; les chronos recalculent sur l'heure réelle au retour.
 * - Pas de vibration (décision V2). Le son est un confort : aucune erreur ne
 *   remonte.
 */

let context: AudioContext | undefined;

function contextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** À appeler dans l'appui sur « Démarrer ». Rend le contexte audio prêt, ou `undefined` sans son possible. */
export function primeTestAudio(): AudioContext | undefined {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
  } catch {
    /* pas de session audio : le silencieux coupera le son */
  }
  const Class = contextClass();
  if (!Class) return undefined;
  try {
    context ??= new Class();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    context = undefined;
    return undefined;
  }
}

function click(ctx: AudioContext, at: number, accent: boolean): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = accent ? 1568 : 988;
  const peak = accent ? 0.5 : 0.28;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + 0.08);
}

/** Signal de fin (compte à rebours, plafond de la chaise) : trois notes montantes, sans vibration. */
export function playEndSignal(): void {
  const ctx = context;
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;
    [784, 988, 1319].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const at = now + index * 0.22;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.45, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.25);
    });
  } catch {
    /* le son est un confort */
  }
}

/**
 * Métronome réglé sur l'horloge audio (pas de dérive sur 2 min) : toutes
 * les 25 ms, les frappes des 150 ms à venir sont programmées. Rend la
 * fonction d'arrêt.
 */
export function startMetronome(bpm: number, accentEvery?: number): () => void {
  const ctx = context;
  if (!ctx) return () => undefined;
  const start = ctx.currentTime + 0.1;
  let scheduledUntil = start;
  const timer = window.setInterval(() => {
    if (ctx.state !== "running") return;
    const horizon = ctx.currentTime + 0.15;
    for (const beat of beatsBetween(start, bpm, accentEvery, Math.max(scheduledUntil, ctx.currentTime), horizon)) click(ctx, beat.at, beat.accent);
    scheduledUntil = horizon;
  }, 25);
  return () => window.clearInterval(timer);
}
