import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Scale } from "lucide-react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { getWeightEntries } from "../../db/repositories/weightRepository";
import type { WeightEntry } from "../../domain";
import { addDays, parseISO } from "date-fns";
import { formatDayLabel, formatLocalDate } from "../../domain/rules/programRules";
import {
  formatWeekSpan,
  formatWeighingCount,
  formatWeightKg,
  MIN_WEIGHINGS_PER_WEEK,
  weightWeekSummary,
} from "../../domain/rules/weightRules";
import { COMPOSITION_SPECS, formatComposition, type CompositionKey } from "../../domain/rules/bodyCompositionRules";
import { correctWeight, recordWeight, removeWeight, todayForWeight, type WeightForm } from "./weightActions";
import "./WeightCard.css";

/**
 * Carte « Pesée du jour » de l'Accueil (lot I.1). Pas encore de pesée
 * aujourd'hui : le champ est ouvert. Déjà une pesée : la valeur s'affiche,
 * modifiable (remplacement, jamais de doublon). Masse grasse et masse
 * musculaire se notent avec, facultatives (26/09/2026). Un jour passé se choisit
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

const EMPTY_FORM: Required<WeightForm> = { kg: "", fatPct: "", muscleKg: "" };

function formOf(entry: WeightEntry | undefined): Required<WeightForm> {
  return { kg: formatKgInput(entry?.kg), fatPct: formatKgInput(entry?.fatPct), muscleKg: formatKgInput(entry?.muscleKg) };
}

const COMPOSITION_KEYS: readonly CompositionKey[] = ["fatPct", "muscleKg"];

/** « MG 18,4 % · MM 62,1 kg », ou rien sans composition. */
function compositionLine(entry: WeightEntry): string | undefined {
  const parts = COMPOSITION_KEYS.flatMap((key) => (entry[key] === undefined ? [] : [`${key === "fatPct" ? "MG" : "MM"} ${formatComposition(key, entry[key])}`]));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Masse grasse et masse musculaire (26/09/2026) : facultatives, estimées
 * par la balance ; vides, rien n'est enregistré.
 */
function CompositionFields({ form, onChange, labelSuffix = "" }: { form: Required<WeightForm>; onChange: (form: Required<WeightForm>) => void; labelSuffix?: string }) {
  return (
    <>
      {COMPOSITION_KEYS.map((key) => {
        const spec = COMPOSITION_SPECS[key];
        return (
          <label key={key} className="weight-card__field weight-card__field--optional">
            <span>
              {spec.label} <small>facultatif</small>
            </span>
            <span className="weight-card__input">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={key === "fatPct" ? "ex. 18,4" : "ex. 62,1"}
                aria-label={`${spec.label} en ${spec.unit}${labelSuffix}`}
                value={form[key]}
                onChange={(event) => onChange({ ...form, [key]: event.target.value })}
              />
              <span>{spec.unit}</span>
            </span>
          </label>
        );
      })}
    </>
  );
}

interface WeightCardProps {
  /** Jour local courant ; remplaçable pour les tests. */
  today?: string;
}

export function WeightCard({ today = todayForWeight() }: WeightCardProps) {
  const [entries, setEntries] = useState<WeightEntry[] | undefined>();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<Required<WeightForm>>(EMPTY_FORM);
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
  const existingForDate = entries.find((entry) => entry.date === date);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await recordWeight(date, form);
      setForm(EMPTY_FORM);
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

  function openFull(nextDate: string, nextForm: Required<WeightForm>) {
    setEditing(true);
    setError(undefined);
    setDate(nextDate);
    setForm(nextForm);
  }

  /* Accueil compact (27/09/2026) : une seule ligne ; le formulaire complet
     (composition, autre jour, moyennes, pesées récentes) s'ouvre au toucher. */
  if (!editing) {
    return (
      <section className="today-card weight-card weight-card--compact" aria-label="Pesée du jour">
        {todayEntry ? (
          <button type="button" className="weight-card__done" onClick={() => openFull(today, formOf(todayEntry))}>
            <span className="weight-card__done-label">
              Pesée <Check size={16} strokeWidth={3} aria-label="faite" />
            </span>
            <span className="weight-card__done-values">
              <strong>{formatWeightKg(todayEntry.kg)}</strong>
              {compositionLine(todayEntry) && <span className="weight-card__composition">{compositionLine(todayEntry)}</span>}
            </span>
            <ChevronRight size={16} className="weight-card__done-chevron" aria-hidden="true" />
          </button>
        ) : (
          <>
            <form
              className="weight-card__quick"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!busy) void submit();
              }}
            >
              <span className="weight-card__quick-label">Pesée du jour</span>
              <span className="weight-card__input">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="00,0"
                  aria-label="Poids en kg"
                  value={form.kg}
                  onChange={(event) => setForm({ ...form, kg: event.target.value })}
                />
                <span>kg</span>
              </span>
              <button type="submit" className="weight-card__quick-submit" disabled={busy}>
                Enregistrer
              </button>
            </form>
            {error && (
              <p className="weight-card__error" role="alert">
                {error}
              </p>
            )}
            <span className="weight-card__quick-links">
              {/* Pesée oubliée : le formulaire complet s'ouvre sur la veille. */}
              <button type="button" onClick={() => openFull(formatLocalDate(addDays(parseISO(today), -1)), EMPTY_FORM)}>
                autre jour
              </button>
              <button type="button" onClick={() => openFull(today, form)}>
                + composition
              </button>
            </span>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="today-card weight-card" aria-labelledby="weight-card-title">
      <div className="weight-card__head">
        <span className="weight-card__icon" aria-hidden="true">
          <Scale size={22} strokeWidth={2} />
        </span>
        <h2 id="weight-card-title" className="today-card__title">Pesée du jour</h2>
      </div>

      <form
        className="weight-card__form"
        /* Nos règles répondent, en français, sur tous les navigateurs. */
        noValidate
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
              value={form.kg}
              onChange={(event) => setForm({ ...form, kg: event.target.value })}
            />
            <span>kg</span>
          </span>
        </label>
        <CompositionFields form={form} onChange={setForm} />
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
          <button type="button" className="weight-card__cancel" onClick={() => { setEditing(false); setError(undefined); setForm(EMPTY_FORM); setDate(today); }}>
            Fermer
          </button>
          <button type="submit" className="weight-card__submit" disabled={busy}>
            Enregistrer
          </button>
        </div>
      </form>

      {entries.length > 0 && <WeightAverages entries={entries} today={today} />}

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
                  {compositionLine(entry) && <span className="weight-card__row-composition">{compositionLine(entry)}</span>}
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
  const [form, setForm] = useState(formOf(entry));
  const [error, setError] = useState<string>();

  return (
    <form
      className="weight-card__form weight-card__form--inline"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          try {
            await correctWeight(entry.id, date, form);
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
          value={form.kg}
          onChange={(event) => setForm({ ...form, kg: event.target.value })}
        />
        <span>kg</span>
      </span>
      <CompositionFields form={form} onChange={setForm} labelSuffix={` corrigée du ${entry.date}`} />
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

/**
 * Moyennes de la carte (lot I.2, D9) : la dernière semaine complète, valide
 * à partir de 3 pesées, et la semaine en cours, toujours « provisoire ».
 * Arrondi d'affichage à 0,1 kg ; les calculs gardent les valeurs exactes.
 */
function WeightAverages({ entries, today }: { entries: WeightEntry[]; today: string }) {
  const { lastComplete, current } = weightWeekSummary(entries, today);

  return (
    <dl className="weight-card__averages">
      <div>
        <dt>Semaine dernière <small>{formatWeekSpan(lastComplete)}</small></dt>
        <dd>
          {lastComplete.valid && lastComplete.mean !== undefined ? (
            <>
              <strong>{formatWeightKg(lastComplete.mean)}</strong> · {formatWeighingCount(lastComplete.count)}
            </>
          ) : (
            <>Pas assez de pesées ({lastComplete.count} sur {MIN_WEIGHINGS_PER_WEEK} minimum)</>
          )}
        </dd>
      </div>
      <div>
        <dt>Cette semaine <small>provisoire</small></dt>
        <dd>
          {current.mean !== undefined ? (
            <>
              <strong>{formatWeightKg(current.mean)}</strong> · {formatWeighingCount(current.count)}
            </>
          ) : (
            <>Aucune pesée</>
          )}
        </dd>
      </div>
    </dl>
  );
}
