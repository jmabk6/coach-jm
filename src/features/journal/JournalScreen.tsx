import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { deleteEntry, getDaySummary, setDayComplete, updateEntryQuantity, type DaySummary } from "../../db/repositories/nutritionRepository";
import type { FoodLogEntry, MealSlot } from "../../domain";
import {
  formatJournalDay,
  formatQuantity,
  formatTotalGrams,
  journalDayAfter,
  journalDayBefore,
  parseQuantityInput,
  resolveJournalDate,
} from "../../domain/rules/journalRules";
import { calculateNutrients, dayTotals, formatGrams, formatKcal, MEAL_SLOT_LABELS, MEAL_SLOTS } from "../../domain/rules/nutritionRules";
import { todayLocalDate } from "../today/useTodayData";
import { EstimateSheet } from "./EstimateSheet";
import "./JournalScreen.css";

/** « Ajouter au déjeuner », « à la collation », « aux extras ». */
const ADD_LABELS: Record<MealSlot, string> = {
  breakfast: "Ajouter au petit-déjeuner",
  lunch: "Ajouter au déjeuner",
  snack: "Ajouter à la collation",
  dinner: "Ajouter au dîner",
  extra: "Ajouter aux extras",
};

/** « 115 kcal · 20,0 g P », protéines omises si aucune ligne ne les donne, « ≥ » si partielles. */
function mealLine(entries: readonly FoodLogEntry[]): string {
  const totals = dayTotals(entries)!;
  const withProtein = entries.length - totals.entriesWithoutMacros.proteinG;
  if (withProtein === 0) return formatKcal(totals.kcal);
  return `${formatKcal(totals.kcal)} · ${formatTotalGrams(totals.proteinG, totals.entriesWithoutMacros.proteinG > 0)} P`;
}

/**
 * Journal alimentaire (phase 3A.2) : le jour (aujourd'hui au plus tard,
 * gardé dans l'adresse), un résumé compact — jamais 0 kcal pour une
 * journée non renseignée, macros partielles signalées « ≥ » —, les cinq
 * repas et leurs lignes, la journée complète. Le « + » ouvre pour
 * l'instant l'estimation ; l'ajout d'aliments viendra en 3A.3.
 */
export function JournalScreen() {
  const [params, setParams] = useSearchParams();
  const today = todayLocalDate();
  const { date, corrected } = resolveJournalDate(params.get("date"), today);
  const [summary, setSummary] = useState<DaySummary>();
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState<MealSlot>();
  const [editing, setEditing] = useState<FoodLogEntry>();
  const [deleting, setDeleting] = useState<FoodLogEntry>();
  const [error, setError] = useState<string>();

  const reload = () => setVersion((value) => value + 1);
  const goTo = (next: string) => setParams({ date: next }, { replace: true });

  /* Une date future ou illisible : retour à aujourd'hui, adresse corrigée. */
  useEffect(() => {
    if (corrected) setParams({ date }, { replace: true });
  }, [corrected, date, setParams]);

  useEffect(() => {
    let cancelled = false;
    void getDaySummary(date).then((loaded) => {
      if (!cancelled) setSummary(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [date, version]);

  const next = journalDayAfter(date, today);
  const loaded = summary?.date === date ? summary : undefined;

  async function toggleComplete(complete: boolean) {
    setError(undefined);
    try {
      await setDayComplete(date, complete, new Date().toISOString());
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="journal">
      <header className="journal__day">
        <button type="button" className="journal__arrow" aria-label="Jour précédent" onClick={() => goTo(journalDayBefore(date))}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="journal__title">
          <h1>{formatJournalDay(date)}</h1>
          {date === today ? (
            <span className="journal__today">Aujourd'hui</span>
          ) : (
            <button type="button" className="journal__today journal__today--button" onClick={() => goTo(today)}>
              Aujourd'hui
            </button>
          )}
        </div>
        <button type="button" className="journal__arrow" aria-label="Jour suivant" disabled={!next} onClick={() => next && goTo(next)}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </header>

      {loaded && (
        <>
          <DaySummaryBlock summary={loaded} />

          {MEAL_SLOTS.map((slot) => {
            const entries = loaded.entries.filter((entry) => entry.slot === slot);
            return (
              <section key={slot} className="journal-meal" aria-label={MEAL_SLOT_LABELS[slot]}>
                <div className="journal-meal__head">
                  <h2>{MEAL_SLOT_LABELS[slot]}</h2>
                  {entries.length > 0 && <span className="journal-meal__total">{mealLine(entries)}</span>}
                  <button type="button" className="journal-meal__add" aria-label={ADD_LABELS[slot]} onClick={() => setAdding(slot)}>
                    <Plus size={20} aria-hidden="true" />
                  </button>
                </div>
                {entries.map((entry) => (
                  <button key={entry.id} type="button" className="journal-line" onClick={() => setEditing(entry)}>
                    <span className="journal-line__name">
                      {entry.name}
                      {entry.estimated && <span className="journal-line__estimated">≈ estimé</span>}
                    </span>
                    <span className="journal-line__kcal">{formatKcal(entry.nutrients.kcal)}</span>
                    <span className="journal-line__quantity">{formatQuantity(entry.quantity, entry.unit)}</span>
                    <span className="journal-line__protein">{entry.nutrients.proteinG !== undefined ? `${formatGrams(entry.nutrients.proteinG)} P` : ""}</span>
                  </button>
                ))}
              </section>
            );
          })}

          <label className={`journal-complete${loaded.state === "unrecorded" ? " journal-complete--disabled" : ""}`}>
            <input
              type="checkbox"
              checked={loaded.state === "complete"}
              disabled={loaded.state === "unrecorded"}
              onChange={(event) => void toggleComplete(event.target.checked)}
            />
            <span>Journée alimentaire complète</span>
          </label>
          {loaded.state === "unrecorded" && <p className="journal__hint">Ajoute au moins une ligne pour pouvoir la déclarer complète.</p>}
          {error && (
            <p className="journal__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      {adding && (
        <EstimateSheet
          date={date}
          slot={adding}
          onDismiss={() => setAdding(undefined)}
          onSaved={() => {
            setAdding(undefined);
            reload();
          }}
        />
      )}
      {editing && (
        <EntrySheet
          entry={editing}
          onDismiss={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            reload();
          }}
          onDelete={() => {
            setDeleting(editing);
            setEditing(undefined);
          }}
        />
      )}
      {deleting && (
        <BottomSheet
          title="Supprimer cette ligne ?"
          message={`${deleting.name} · ${formatQuantity(deleting.quantity, deleting.unit)} · ${formatKcal(deleting.nutrients.kcal)}`}
          actions={[
            {
              label: "Supprimer",
              hint: "La ligne disparaît du journal",
              tone: "danger",
              onSelect: () =>
                void (async () => {
                  const target = deleting;
                  setDeleting(undefined);
                  await deleteEntry(target.id);
                  reload();
                })(),
            },
          ]}
          onDismiss={() => setDeleting(undefined)}
        />
      )}
    </section>
  );
}

function DaySummaryBlock({ summary }: { summary: DaySummary }) {
  if (summary.state === "unrecorded") {
    return (
      <section className="journal-summary journal-summary--empty" aria-label="Résumé de la journée">
        <strong className="journal-summary__kcal">—</strong>
        <span className="journal-summary__state">Journée non renseignée</span>
      </section>
    );
  }
  const { totals } = summary;
  const partial = totals.entriesWithoutMacros;
  const count = summary.entries.length;
  /* Aucune ligne ne donne la macro : inconnue (« — »), jamais 0 ; certaines seulement : « ≥ ». */
  const macro = (key: "proteinG" | "carbsG" | "fatG") => (partial[key] === count ? "—" : formatTotalGrams(totals[key], partial[key] > 0));
  const anyPartial = (["proteinG", "carbsG", "fatG"] as const).some((key) => partial[key] > 0 && partial[key] < count);
  return (
    <section className={`journal-summary${summary.state === "complete" ? " journal-summary--complete" : ""}`} aria-label="Résumé de la journée">
      <div className="journal-summary__main">
        <strong className="journal-summary__kcal">{formatKcal(totals.kcal)}</strong>
        <span className="journal-summary__protein">
          <strong>{macro("proteinG")}</strong> protéines
        </span>
      </div>
      <span className="journal-summary__macros">
        {`glucides ${macro("carbsG")} · lipides ${macro("fatG")}`}
      </span>
      <span className="journal-summary__state">
        {summary.state === "complete" ? (
          <>
            <Check size={14} strokeWidth={3} aria-hidden="true" /> Journée complète
          </>
        ) : (
          "Journée en cours · non comptée"
        )}
        {totals.estimatedEntries > 0 && ` · ${totals.estimatedEntries} estimée${totals.estimatedEntries > 1 ? "s" : ""}`}
      </span>
      {anyPartial && <span className="journal-summary__note">≥ : au moins une ligne sans cette valeur</span>}
    </section>
  );
}

function EntrySheet({ entry, onSaved, onDismiss, onDelete }: { entry: FoodLogEntry; onSaved: () => void; onDismiss: () => void; onDelete: () => void }) {
  const [text, setText] = useState(String(entry.quantity).replace(".", ","));
  const [error, setError] = useState<string>();
  const parsed = parseQuantityInput(text);
  /* Aperçu depuis la base figée de la ligne, comme l'enregistrement. */
  const preview = parsed.ok ? calculateNutrients(entry.basis, parsed.quantity) : undefined;
  const unit = entry.unit === "piece" ? "pièces" : entry.unit === "portion" ? "portions" : entry.unit;

  async function save() {
    if (!parsed.ok) return setError(parsed.message);
    try {
      await updateEntryQuantity(entry.id, parsed.quantity, new Date().toISOString());
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <BottomSheet
      title={entry.name}
      message={entry.estimated ? "≈ estimé" : undefined}
      actions={[
        { label: "Enregistrer", tone: "primary", onSelect: () => void save() },
        { label: "Supprimer la ligne", hint: "Après confirmation", tone: "danger", onSelect: onDelete },
      ]}
      onDismiss={onDismiss}
    >
      <div className="journal-form">
        <label className="journal-form__wide">
          <span>Quantité</span>
          <span className="journal-form__unit">
            <input type="text" inputMode="decimal" aria-label={`Quantité en ${unit}`} autoComplete="off" value={text} onChange={(event) => setText(event.target.value)} />
            {unit}
          </span>
        </label>
        <p className="journal-form__preview journal-form__wide">
          {preview
            ? `= ${formatKcal(preview.kcal)}${preview.proteinG !== undefined ? ` · ${formatGrams(preview.proteinG)} protéines` : ""}`
            : "—"}
        </p>
        {error && (
          <p className="journal-form__error journal-form__wide" role="alert">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
