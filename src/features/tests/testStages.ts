/**
 * Test jambes V2, lot 2 (13/11/2026) : métronome et chronos de l'écran du
 * test. Commandes manuelles, une épreuve à la fois, jamais d'enchaînement
 * automatique. Les cadences et durées viennent des réglages de la version
 * du protocole.
 *
 * Partie pure (étapes, horloge) ici ; le son dans `testAudio.ts`.
 */

export type TestStageKind = "metronome_countdown" | "metronome" | "countdown" | "stopwatch";

export interface TestStage {
  id: string;
  title: string;
  kind: TestStageKind;
  /** Métronome : bips par minute ; un bip appuyé toutes les `accentEvery` frappes. */
  bpm?: number;
  accentEvery?: number;
  /** Compte à rebours, ou plafond du chrono montant (en secondes). */
  durationSec?: number;
  /** Une ligne d'aide sous le titre. */
  hint: string;
}

const num = (value: number | string | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);

/**
 * Les épreuves outillées d'une version de protocole, dans l'ordre du test,
 * ou une liste vide si la version n'a pas de réglages de métronome (les
 * autres tests ne changent pas).
 */
export function testStagesOf(settings: Record<string, number | string> | undefined): TestStage[] {
  const stepBpm = num(settings?.stepMetronomeBpm);
  const squatBpm = num(settings?.squatMetronomeBpm);
  if (!settings || (stepBpm === undefined && squatBpm === undefined)) return [];
  const stepSec = num(settings.stepDurationSec);
  const recoverySec = num(settings.recoverySec);
  const chairSec = num(settings.chairCapSec);
  const cadence = num(settings.stepCadencePerMin);
  const tempo = typeof settings.squatTempo === "string" ? settings.squatTempo.split("-").map(Number) : [];
  const beatsPerRep = tempo.length === 2 && tempo.every((value) => Number.isFinite(value) && value > 0) ? tempo[0]! + tempo[1]! : undefined;

  const stages: TestStage[] = [];
  if (stepBpm !== undefined) {
    stages.push({
      id: "montees",
      title: "1. Montées sur banc",
      kind: stepSec !== undefined ? "metronome_countdown" : "metronome",
      bpm: stepBpm,
      ...(cadence !== undefined ? { accentEvery: Math.round(stepBpm / cadence) } : {}),
      ...(stepSec !== undefined ? { durationSec: stepSec } : {}),
      hint: `${stepBpm} bips/min : 1 bip = 1 pas${cadence !== undefined ? `, bip appuyé = nouvelle montée (${cadence}/min)` : ""}.`,
    });
  }
  if (recoverySec !== undefined) stages.push({ id: "recup-1", title: "Récupération", kind: "countdown", durationSec: recoverySec, hint: "Relève la FC 1 min après la fin des montées." });
  if (squatBpm !== undefined) {
    stages.push({
      id: "squats",
      title: "2. Squats sur chaise",
      kind: "metronome",
      bpm: squatBpm,
      ...(beatsPerRep !== undefined ? { accentEvery: beatsPerRep } : {}),
      hint: `${squatBpm} bips/min${typeof settings.squatTempo === "string" ? ` : ${tempo[0]} temps de descente, ${tempo[1]} de montée ; bip appuyé = début de la répétition` : ""}.`,
    });
  }
  if (recoverySec !== undefined) stages.push({ id: "recup-2", title: "Récupération", kind: "countdown", durationSec: recoverySec, hint: "Prépare la distance talons-mur." });
  if (chairSec !== undefined) stages.push({ id: "chaise", title: "3. Chaise contre le mur", kind: "stopwatch", durationSec: chairSec, hint: `Chrono qui monte, signal et arrêt à ${chairSec} s.` });
  return stages;
}

/** « 2:00 », « 0:07 ». */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export interface StageClock {
  /** Ce que montre l'horloge. */
  display: string;
  /** Vrai quand le compte à rebours est fini, ou le plafond du chrono atteint. */
  done: boolean;
}

/** L'horloge d'une épreuve, `elapsedMs` après son démarrage (calcul sur l'heure réelle : juste même après une mise en veille). */
export function stageClock(stage: Pick<TestStage, "kind" | "durationSec">, elapsedMs: number): StageClock {
  const elapsed = Math.max(0, elapsedMs) / 1000;
  if (stage.kind === "metronome") return { display: formatClock(Math.floor(elapsed)), done: false };
  const limit = stage.durationSec ?? 0;
  if (stage.kind === "stopwatch") return { display: formatClock(Math.min(Math.floor(elapsed), limit)), done: limit > 0 && elapsed >= limit };
  return { display: formatClock(Math.ceil(Math.max(0, limit - elapsed))), done: elapsed >= limit };
}

/**
 * Les frappes à programmer entre `from` et `to` (secondes d'horloge audio),
 * pour un métronome parti à `start` : rang de la frappe et accent.
 */
export function beatsBetween(start: number, bpm: number, accentEvery: number | undefined, from: number, to: number): Array<{ at: number; accent: boolean }> {
  const interval = 60 / bpm;
  const first = Math.max(0, Math.ceil((from - start) / interval - 1e-9));
  const beats: Array<{ at: number; accent: boolean }> = [];
  for (let index = first; start + index * interval < to; index += 1) {
    beats.push({ at: start + index * interval, accent: accentEvery !== undefined && accentEvery > 1 ? index % accentEvery === 0 : false });
  }
  return beats;
}
