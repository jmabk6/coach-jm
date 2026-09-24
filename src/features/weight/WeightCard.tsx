import { useCallback, useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { getWeightEntries } from "../../db/repositories/weightRepository";
import type { WeightEntry } from "../../domain";
import { formatDayLabel } from "../../domain/rules/programRules";
import { formatWeightKg } from "../../domain/rules/weightRules";
import { correctWeight, recordWeight, removeWeight, todayForWeight } from "./weightActions";
import "./WeightCard.css";

/**
 * Carte « Pesée du jour » de l'Accueil (lot I.1). Pas encore de pesée
 * aujourd'hui : le champ est ouvert. Déjà une pesée : la valeur s'affiche,
 * modifiable (remplacement, jamais de doublon). Un jour passé se choisit
 * pour une pesée oubliée ; jamais un jour futur. La liste des pesées
 * récentes permet de corriger et de supprimer.
 */

const RECENT_COUNT = 14;

function formatDay(date: string, today: string): string {
  if (date === today) return "Aujourd'hui";
  const { weekday, day } = formatDayLabel(date);
  return `${weekday} ${day}`;
}

function formatKgInput(kg: number | undefined): string {
  return kg === undefined ? "" : String(kg).replace(".", ",");
}

interface WeightCardProps {
  /** Jour local courant ; remplaçable pour les tests. */
  today?: string;
  /** Contenu ajouté sous la saisie (moyennes, lot I.2). */
  renderSummary?: (entries: WeightEntry[], today: string) => React.ReactNode;
}

export function WeightCard({ today = todayForWeight(), renderSummary }: WeightCardProps) {
  const [entries, setEntries] = useState<WeightEntry[] | undefined>();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(today);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [correcting, setCorrecting] = useState<WeightEntry>();
  const [deleting, setDeleting] = useState<WeightEntry>();

  const [version, setVersion] = useState(0);
  const load = useCallback(async () => {
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getWeightEntries().then((loaded) => {
      if (!cancelled) setEntries(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [version]);

  if (!entries) return null;

  const todayEntry = entries.find((entry) => entry.date === today);
  const formOpen = editing || todayEntry === undefined;
  const existingForDate = entries.find((entry) => entry.date === date);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await recordWeight(date, input);
      setInput("");
      setDate(today);
      setEditing(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_COUNT);

  return (
    <section className="today-card weight-card" aria-labelledby="weight-card-title">
      <div className="weight-card__head">
        <span className="weight-card__icon" aria-hidden="true">
          <Scale size={22} strokeWidth={2} />
        </span>
        <h2 id="weight-card-title" className="today-card__title">Pesée du jour</h2>
      </div>

      {todayEntry && !editing && (
        <div className="weight-card__today">
          <strong className="weight-card__value">{formatWeightKg(todayEntry.kg)}</strong>
          <button
            type="button"
            className="today__link weight-card__link"
            onClick={() => {
              setEditing(true);
              setDate(today);
              setInput(formatKgInput(todayEntry.kg));
            }}
          >
            Modifier
          </button>
        </div>
      )}

      {formOpen && (
        <form
          className="weight-card__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void submit();
          }}
        >
          <label className="weight-card__field">
            <span>Poids</span>
            <span className="weight-card__input">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="ex. 81,4"
                aria-label="Poids en kg"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <span>kg</span>
            </span>
          </label>
          <label className="weight-card__field">
            <span>Jour</span>
            <input
              type="date"
              aria-label="Jour de la pesée"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          {existingForDate && (
            <p className="weight-card__hint">
              {formatDay(date, today)} : {formatWeightKg(existingForDate.kg)} déjà noté, la nouvelle valeur le remplacera.
            </p>
          )}
          {error && (
            <p className="weight-card__error" role="alert">
              {error}
            </p>
          )}
          <div className="weight-card__actions">
            {todayEntry && (
              <button type="button" className="weight-card__cancel" onClick={() => { setEditing(false); setError(undefined); }}>
                Annuler
              </button>
            )}
            <button type="submit" className="weight-card__submit" disabled={busy}>
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {renderSummary?.(entries, today)}

      {entries.length > 0 && (
        <button
          type="button"
          className="today__link weight-card__link"
          aria-expanded={recentOpen}
          onClick={() => setRecentOpen((open) => !open)}
        >
          {recentOpen ? "Masquer les pesées récentes" : "Pesées récentes"}
        </button>
      )}

      {recentOpen && (
        <ul className="weight-card__recent" aria-label="Pesées récentes">
          {recent.map((entry) => (
            <li key={entry.id} className="weight-card__row">
              {correcting?.id === entry.id ? (
                <CorrectionForm
                  entry={entry}
                  today={today}
                  onCancel={() => setCorrecting(undefined)}
                  onSaved={async () => {
                    setCorrecting(undefined);
                    await load();
                  }}
                />
              ) : (
                <>
                  <span className="weight-card__day">{formatDay(entry.date, today)}</span>
                  <span className="weight-card__kg">{formatWeightKg(entry.kg)}</span>
                  <button type="button" className="weight-card__row-action" onClick={() => setCorrecting(entry)}>
                    Corriger
                  </button>
                  <button
                    type="button"
                    className="weight-card__row-action weight-card__row-action--danger"
                    onClick={() => setDeleting(entry)}
                  >
                    Supprimer
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <BottomSheet
          title={`Supprimer la pesée de ${formatDay(deleting.date, today).toLowerCase()} ?`}
          message={`${formatWeightKg(deleting.kg)} sera retiré de l'historique.`}
          actions={[
            {
              label: "Supprimer",
              hint: "La pesée disparaît définitivement",
              tone: "danger",
              onSelect: () =>
                void (async () => {
                  const target = deleting;
                  setDeleting(undefined);
                  await removeWeight(target.id);
                  await load();
                })(),
            },
          ]}
          onDismiss={() => setDeleting(undefined)}
        />
      )}
    </section>
  );
}

function CorrectionForm({
  entry,
  today,
  onCancel,
  onSaved,
}: {
  entry: WeightEntry;
  today: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [date, setDate] = useState(entry.date);
  const [input, setInput] = useState(formatKgInput(entry.kg));
  const [error, setError] = useState<string>();

  return (
    <form
      className="weight-card__form weight-card__form--inline"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          try {
            await correctWeight(entry.id, date, input);
            await onSaved();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        })();
      }}
    >
      <span className="weight-card__input">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Poids corrigé du ${entry.date}`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <span>kg</span>
      </span>
      <input type="date" aria-label={`Jour corrigé du ${entry.date}`} max={today} value={date} onChange={(event) => setDate(event.target.value)} />
      {error && (
        <p className="weight-card__error" role="alert">
          {error}
        </p>
      )}
      <div className="weight-card__actions">
        <button type="button" className="weight-card__cancel" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="weight-card__submit">
          Enregistrer la correction
        </button>
      </div>
    </form>
  );
}
