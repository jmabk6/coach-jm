import { useCallback, useEffect, useState } from "react";
import { getSetting, saveSetting } from "../../db/repositories/settingsRepository";
import type { BackDayEntry, BackSitting, BackWalk } from "../../domain";
import { backWeeksAround, formatBackWeek, upsertBackDay, type BackDayPatch } from "../../domain/rules/backLogRules";
import "./BackDayCard.css";

/**
 * Carte « Dos du jour » de l'Accueil (programme V5, 07/11/2026) : douleur au
 * réveil, temps pour marcher normalement, décharge, position assise. Chaque
 * appui enregistre tout de suite ; un second appui sur le choix actif
 * l'efface. Rempli : un résumé, et « Modifier ». En bas, la semaine en cours
 * comparée à la précédente.
 */

const PAINS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WALKS: ReadonlyArray<{ value: BackWalk; label: string }> = [
  { value: "lt2", label: "< 2 min" },
  { value: "2to5", label: "2 à 5 min" },
  { value: "gt5", label: "> 5 min" },
];
const SITTINGS: ReadonlyArray<{ value: BackSitting; label: string }> = [
  { value: "ok", label: "Supportée" },
  { value: "painful", label: "Douloureuse" },
];

function isComplete(entry: BackDayEntry | undefined): boolean {
  return entry !== undefined && entry.morningPain !== undefined && entry.walk !== undefined && entry.discharge !== undefined && entry.sitting !== undefined;
}

function summaryOf(entry: BackDayEntry): string {
  const walk = WALKS.find((item) => item.value === entry.walk)?.label;
  return [
    `Réveil ${entry.morningPain}/10`,
    `marche normale ${walk}`,
    entry.discharge ? "décharge" : "pas de décharge",
    entry.sitting === "painful" ? "assis douloureux" : "assis supporté",
  ].join(" · ");
}

export function BackDayCard({ today }: { today: string }) {
  const [entries, setEntries] = useState<BackDayEntry[]>();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getSetting("backLog").then((value) => {
      if (!cancelled) setEntries(value ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (patch: BackDayPatch) => {
      const next = upsertBackDay(entries ?? [], today, patch, new Date().toISOString());
      setEntries(next);
      await saveSetting({ key: "backLog", value: next });
    },
    [entries, today],
  );

  if (entries === undefined) return null;

  const entry = entries.find((item) => item.date === today);
  const { current, previous } = backWeeksAround(entries, today);
  const week = formatBackWeek(current);
  const before = formatBackWeek(previous);
  const open = editing || !isComplete(entry);

  return (
    <section className="today-card back-card" aria-label="Dos du jour">
      <div className="back-card__top">
        <h2 className="back-card__title">Dos du jour</h2>
        {!open && (
          <button type="button" className="back-card__link" onClick={() => setEditing(true)}>
            Modifier
          </button>
        )}
        {open && isComplete(entry) && (
          <button type="button" className="back-card__link" onClick={() => setEditing(false)}>
            Fermer
          </button>
        )}
      </div>

      {!open && entry && <p className="back-card__summary">{summaryOf(entry)}</p>}

      {open && (
        <div className="back-card__form">
          <fieldset className="back-card__field">
            <legend>Douleur au réveil (0 à 10)</legend>
            <div className="back-card__chips back-card__chips--pain">
              {PAINS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="back-card__chip"
                  aria-pressed={entry?.morningPain === value}
                  onClick={() => void save({ morningPain: entry?.morningPain === value ? undefined : value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="back-card__field">
            <legend>Marche normale au lever après</legend>
            <div className="back-card__chips">
              {WALKS.map((item) => (
                <button key={item.value} type="button" className="back-card__chip" aria-pressed={entry?.walk === item.value} onClick={() => void save({ walk: entry?.walk === item.value ? undefined : item.value })}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="back-card__field">
            <legend>Décharge aujourd'hui</legend>
            <div className="back-card__chips">
              {[
                { value: false, label: "Non" },
                { value: true, label: "Oui" },
              ].map((item) => (
                <button key={item.label} type="button" className="back-card__chip" aria-pressed={entry?.discharge === item.value} onClick={() => void save({ discharge: entry?.discharge === item.value ? undefined : item.value })}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="back-card__field">
            <legend>Position assise prolongée</legend>
            <div className="back-card__chips">
              {SITTINGS.map((item) => (
                <button key={item.value} type="button" className="back-card__chip" aria-pressed={entry?.sitting === item.value} onClick={() => void save({ sitting: entry?.sitting === item.value ? undefined : item.value })}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {(week || before) && (
        <p className="back-card__week">
          {week ? `Cette semaine : ${week}` : "Rien de noté cette semaine"}
          {before ? <span className="back-card__previous"> — semaine d'avant : {before}</span> : null}
        </p>
      )}
    </section>
  );
}
