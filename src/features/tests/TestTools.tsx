import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { usePreferences } from "../plus/usePreferences";
import { playEndSignal, primeTestAudio, startMetronome } from "./testAudio";
import { stageClock, testStagesOf, type TestStage } from "./testStages";
import "./TestTools.css";

/** L'heure réelle, lue seulement dans les gestes et le tic de l'horloge. */
const wallClock = () => Date.now();

/**
 * Métronome et chronos du test jambes V2 (lot 2, 13/11/2026) : une épreuve
 * à la fois, démarrage et arrêt manuels, jamais d'enchaînement automatique.
 * Le temps se calcule sur l'heure réelle : après une mise en veille,
 * l'horloge reprend juste (le son, lui, s'arrête quand iOS met la page en
 * pause). Suit le réglage « Son » ; pas de vibration.
 */
export function TestTools({ settings }: { settings: Record<string, number | string> | undefined }) {
  const stages = testStagesOf(settings);
  const preferences = usePreferences();
  const sound = preferences?.timerSound !== false;
  const [running, setRunning] = useState<{ stage: TestStage; startedAt: number } | undefined>();
  const [finished, setFinished] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);
  const stopBeats = useRef<() => void>(() => undefined);

  /* Le tic de l'horloge : affichage, et fin d'un compte à rebours ou plafond de la chaise (signal, arrêt du métronome). */
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const at = wallClock();
      const clock = stageClock(running.stage, at - running.startedAt);
      if (clock.done) {
        stopBeats.current();
        stopBeats.current = () => undefined;
        if (sound) playEndSignal();
        setFinished((current) => ({ ...current, [running.stage.id]: clock.display }));
        setRunning(undefined);
        return;
      }
      setNow(at);
    }, 250);
    return () => window.clearInterval(timer);
  }, [running, sound]);

  useEffect(() => () => stopBeats.current(), []);

  if (stages.length === 0) return null;

  function start(item: TestStage) {
    stopBeats.current();
    if (sound) primeTestAudio();
    if (sound && item.bpm !== undefined) stopBeats.current = startMetronome(item.bpm, item.accentEvery);
    else stopBeats.current = () => undefined;
    const at = wallClock();
    setNow(at);
    setRunning({ stage: item, startedAt: at });
    setFinished((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  }

  function stop(item: TestStage) {
    stopBeats.current();
    stopBeats.current = () => undefined;
    if (running?.stage.id === item.id) setFinished((current) => ({ ...current, [item.id]: stageClock(item, wallClock() - running.startedAt).display }));
    setRunning(undefined);
  }

  return (
    <section className="test-tools" aria-label="Métronome et chronos">
      <h3>Métronome et chronos</h3>
      {!sound && <p className="test-tools__muted">Son coupé dans Plus › Réglages : les chronos tournent sans bip.</p>}
      <ol>
        {stages.map((item) => {
          const active = running?.stage.id === item.id;
          const clock = active ? stageClock(item, now - running.startedAt).display : (finished[item.id] ?? stageClock(item, 0).display);
          const label = item.kind === "countdown" ? `Démarrer ${clock}` : item.kind === "metronome_countdown" ? `Démarrer : ${item.bpm}/min et ${clock}` : item.kind === "metronome" ? `Démarrer : ${item.bpm}/min` : "Démarrer le chrono";
          return (
            <li key={item.id} className={active ? "test-tools__stage is-running" : "test-tools__stage"}>
              <div className="test-tools__head">
                <strong>{item.title}</strong>
                <span className="test-tools__clock" aria-live={active ? "polite" : "off"}>
                  {clock}
                </span>
              </div>
              <p className="test-tools__hint">{item.hint}</p>
              {active ? (
                <button type="button" className="test-tools__stop" onClick={() => stop(item)}>
                  <Square size={18} aria-hidden="true" /> Arrêter
                </button>
              ) : (
                <button type="button" className="test-tools__start" onClick={() => start(item)} aria-label={`${item.title} : ${label}`}>
                  <Play size={18} aria-hidden="true" /> {label}
                </button>
              )}
              {!active && finished[item.id] !== undefined && <p className="test-tools__done">Arrêté à {finished[item.id]}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
