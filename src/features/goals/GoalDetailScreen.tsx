import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Gauge, Info, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { BottomSheet } from "../../components/ui/BottomSheet";
import type { GoalKey } from "../../domain";
import { goalDueCard, goalStatusCard, type GoalCardText } from "../../domain/rules/goalListRules";
import { reachedLabel } from "../../domain/rules/goalRules";
import { formatTestNumber } from "../../domain/rules/testResultRules";
import { todayLocalDate } from "../today/useTodayData";
import { activateNextSegment, editGoalSegment, LEGS_MEASURES } from "./goalActions";
import { GoalCurveChart } from "./GoalCurveChart";
import { loadGoalDetail, type GoalDetail } from "./goalDetail";
import "./GoalDetailScreen.css";

type Tab = "progression" | "exercices" | "conseils";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "progression", label: "Progression" },
  { key: "exercices", label: "Exercices" },
  { key: "conseils", label: "Conseils" },
];

function formatLongDate(date: string): string {
  return format(parseISO(date), "d MMMM yyyy", { locale: fr });
}

/**
 * Objectif (M5 à M7) : trois cartes, puis l'onglet Progression (lot H.4) —
 * prochain test, courbe, indicateurs secondaires, séances liées ; la cible,
 * l'échéance et la mesure de Jambes se modifient ici.
 */
export function GoalDetailScreen() {
  const { key } = useParams<{ key: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("onglet") === "exercices" ? "exercices" : searchParams.get("onglet") === "conseils" ? "conseils" : "progression";
  const [today] = useState(todayLocalDate);
  const [detail, setDetail] = useState<GoalDetail | null>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadGoalDetail(key as GoalKey, today).then((loaded) => {
      if (!cancelled) setDetail(loaded ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [key, today, version]);

  if (detail === undefined) return <section className="goal-detail"><p className="goal-detail__message">Chargement…</p></section>;
  if (detail === null) {
    return (
      <section className="goal-detail">
        <Link to={paths.goals()} className="goal-detail__back">‹ Objectifs</Link>
        <p className="goal-detail__message">Cet objectif est introuvable.</p>
      </section>
    );
  }

  const { goal, progress, formatValue, nextTest } = detail;
  const { segment, evaluation } = progress;
  const latest = evaluation.kind === "untracked" || evaluation.kind === "reached" || evaluation.kind === "tracking" ? evaluation.latest : undefined;
  const todayCard: GoalCardText = latest
    ? { value: formatValue(latest.value), caption: `${segment.label} · ${format(parseISO(latest.date), "d MMM", { locale: fr })}` }
    : { value: evaluation.kind === "no_measure" ? "—" : "À mesurer", caption: segment.label };

  /* Poids : pas de test, une moyenne dès 3 pesées dans une semaine (§ 5.4). */
  const weight = segment.measure?.source === "weight_weekly_average";
  const statusCard =
    weight && evaluation.kind === "no_result"
      ? { value: "—", caption: "Première moyenne après 3 pesées dans une semaine" }
      : goalStatusCard(evaluation, nextTest);

  return (
    <section className="goal-detail">
      <header className="goal-detail__nav">
        <Link to={paths.goals()} className="goal-detail__back">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> Objectifs
        </Link>
        <h1>{goal.title}</h1>
        <span />
      </header>

      <div className="goal-cards">
        <Card icon={<Gauge size={18} aria-hidden="true" />} title="Aujourd'hui" text={todayCard} />
        <Card icon={<TrendingUp size={18} aria-hidden="true" />} title="Statut" text={statusCard} />
        <Card icon={<CalendarDays size={18} aria-hidden="true" />} title="Échéance" text={goalDueCard(segment.dueDate ?? goal.dueDate, today)} />
      </div>

      <nav className="goal-tabs" aria-label="Onglets de l'objectif">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`goal-tabs__tab${item.key === tab ? " goal-tabs__tab--active" : ""}`}
            aria-pressed={item.key === tab}
            onClick={() => setSearchParams(item.key === "progression" ? {} : { onglet: item.key }, { replace: true })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "progression" && <ProgressionTab detail={detail} today={today} onChanged={() => setVersion((value) => value + 1)} />}
      {tab !== "progression" && <p className="goal-detail__message">Cet onglet arrive avec la suite du lot H.</p>}
    </section>
  );
}

function Card({ icon, title, text }: { icon: React.ReactNode; title: string; text: GoalCardText }) {
  return (
    <div className="goal-card">
      <span className="goal-card__title">
        {icon} {title}
      </span>
      <strong className="goal-card__value">{text.value}</strong>
      <span className="goal-card__caption">{text.caption}</span>
    </div>
  );
}

function ProgressionTab({ detail, today, onChanged }: { detail: GoalDetail; today: string; onChanged: () => void }) {
  const { goal, progress, protocol, version, formatValue, nextTest, secondary, linkedSessions } = detail;
  const { segment, evaluation, curve } = progress;
  const [editing, setEditing] = useState(false);
  const [activating, setActivating] = useState(false);
  const weight = segment.measure?.source === "weight_weekly_average";
  const currentIndex = goal.segments.findIndex((item) => item.id === segment.id);
  const nextSegment = goal.segments[currentIndex + 1];
  const returnTo = paths.goal(goal.key);
  const measureKey = segment.measure?.source === "test" ? segment.measure.measureKey : version?.primaryMeasureKey;
  const measureLabel = version?.measures.find((measure) => measure.key === measureKey)?.label;

  return (
    <>
      {weight ? (
        <section className="goal-section goal-test">
          <h2>Pesée</h2>
          <p>Chaque matin, sur l'Accueil : la moyenne de la semaine fait foi, jamais la pesée du jour.</p>
        </section>
      ) : (
        protocol && (
          <section className="goal-section goal-test">
            <div className="goal-test__head">
              <h2>{evaluation.kind === "no_result" || evaluation.kind === "no_measure" ? "Premier test" : "Prochain test"}</h2>
              {nextTest && <span className="goal-test__date">{formatLongDate(nextTest)}</span>}
            </div>
            <p>
              {protocol.name}
              {measureLabel ? ` · mesure : ${measureLabel.toLowerCase()}` : ""}
            </p>
            <div className="goal-test__links">
              <Link to={`${paths.plusTests()}?saisie=${encodeURIComponent(protocol.id)}&retour=${encodeURIComponent(returnTo)}`}>
                Saisir un test passé
              </Link>
              <Link to={paths.plusTests()}>
                <Info size={14} aria-hidden="true" /> Voir le protocole
              </Link>
            </div>
          </section>
        )
      )}

      <section className="goal-section">
        <h2>Évolution : {segment.label.toLowerCase()}</h2>
        <GoalCurveChart
          curve={curve}
          today={today}
          {...(segment.dueDate ?? goal.dueDate ? { dueDate: (segment.dueDate ?? goal.dueDate)! } : {})}
          {...(segment.target !== undefined ? { target: segment.target } : {})}
          formatValue={formatValue}
          {...(weight ? { emptyText: "La courbe apparaîtra après ta première semaine de pesées." } : {})}
        />
        {evaluation.kind === "reached" && <p className="goal-detail__reached">{reachedLabel(goal, evaluation.role)}</p>}
        <div className="goal-actions">
          <button type="button" className="goal-actions__button" onClick={() => setEditing(true)}>
            {goal.key === "legs" ? "Modifier la mesure, la cible et l'échéance" : "Modifier la cible et l'échéance"}
          </button>
          {evaluation.kind === "reached" && evaluation.role === "intermediate" && nextSegment && (
            <button type="button" className="goal-actions__button goal-actions__button--primary" onClick={() => setActivating(true)}>
              {goal.key === "traction" ? "Passer à la traction stricte" : `Passer à : ${nextSegment.label}`}
            </button>
          )}
        </div>
      </section>

      {secondary.length > 0 && (
        <section className="goal-section">
          <h2>Indicateurs secondaires</h2>
          <p className="goal-section__lead">Les qualités qui contribuent à cet objectif, depuis le début de l'historique.</p>
          <ul className="goal-secondary">
            {secondary.map((card, index) => (
              <li key={index} className="goal-secondary__card">
                <span className="goal-secondary__label">{card.label}</span>
                <strong>{card.best ?? "À mesurer"}</strong>
                <span className="goal-secondary__caption">{card.caption}</span>
                {card.gain && (
                  <span className="goal-secondary__gain">
                    {card.gain}
                    {card.since ? ` depuis le ${format(parseISO(card.since), "d MMM", { locale: fr })}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {goal.linkedExercises.length > 0 && (
        <section className="goal-section">
          <h2>Séances liées à cet objectif</h2>
          {linkedSessions.length === 0 ? (
            <p className="goal-section__lead">Aucune séance enregistrée avec ces exercices pour le moment.</p>
          ) : (
            <ul className="goal-linked">
              {linkedSessions.map((session) => (
                <li key={session.workoutId}>
                  <Link to={`/workouts/${session.workoutId}?returnTo=${encodeURIComponent(returnTo)}`} className="goal-linked__row">
                    <span className="goal-linked__date">
                      <strong>{format(parseISO(session.date), "d", { locale: fr })}</strong>
                      {format(parseISO(session.date), "MMM", { locale: fr })}
                    </span>
                    <span className="goal-linked__lines">{session.lines.join(" · ")}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <SegmentSheet
          detail={detail}
          today={today}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
          onDismiss={() => setEditing(false)}
        />
      )}
      {activating && nextSegment && (
        <ActivateSheet
          goalId={goal.id}
          label={nextSegment.label}
          today={today}
          onDone={() => {
            setActivating(false);
            onChanged();
          }}
          onDismiss={() => setActivating(false)}
        />
      )}
    </>
  );
}

function SegmentSheet({ detail, today, onDone, onDismiss }: { detail: GoalDetail; today: string; onDone: () => void; onDismiss: () => void }) {
  const { goal, progress, version } = detail;
  const { segment } = progress;
  const legs = goal.key === "legs";
  const [target, setTarget] = useState(segment.target !== undefined ? formatTestNumber(segment.target) : "");
  const [dueDate, setDueDate] = useState(segment.dueDate ?? "");
  const [measureKey, setMeasureKey] = useState(segment.measure?.source === "test" ? segment.measure.measureKey : "");
  const [error, setError] = useState<string>();

  const parsed = target.trim() === "" ? undefined : Number(target.replace(",", "."));
  const valid = (parsed === undefined || Number.isFinite(parsed)) && (dueDate === "" || dueDate > today) && (!legs || measureKey !== "" || parsed === undefined);
  const labelOf = (key: string) => version?.measures.find((measure) => measure.key === key)?.label ?? key;

  async function save() {
    try {
      await editGoalSegment(goal.id, segment.id, {
        ...(parsed !== undefined ? { target: parsed } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(legs && measureKey ? { measureKey, measureLabel: labelOf(measureKey) } : {}),
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Modification impossible");
    }
  }

  return (
    <BottomSheet
      title={goal.title}
      message="Vide = à définir. Le statut, le départ et l'atteinte se recalculent aussitôt."
      actions={[
        {
          label: "Enregistrer",
          tone: "primary",
          disabled: !valid,
          hint: valid ? undefined : "Échéance dans le futur, cible numérique",
          onSelect: () => void save(),
        },
      ]}
      onDismiss={onDismiss}
    >
      <div className="goal-form">
        {legs && (
          <label>
            <span>Mesure</span>
            <select value={measureKey} onChange={(event) => setMeasureKey(event.target.value)}>
              <option value="">À choisir</option>
              {LEGS_MEASURES.map((item) => (
                <option key={item.measureKey} value={item.measureKey}>
                  {labelOf(item.measureKey)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Cible</span>
          <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="à définir" />
        </label>
        <label>
          <span>Échéance</span>
          <input type="date" value={dueDate} min={today} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        {error && <p className="goal-form__error">{error}</p>}
      </div>
    </BottomSheet>
  );
}

function ActivateSheet({ goalId, label, today, onDone, onDismiss }: { goalId: string; label: string; today: string; onDone: () => void; onDismiss: () => void }) {
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string>();

  return (
    <BottomSheet
      title={`Passer à : ${label}`}
      message="Le palier est atteint. Donne une échéance à l'étape suivante ; le palier atteint reste dans la courbe."
      actions={[
        {
          label: "Passer à l'étape suivante",
          tone: "primary",
          disabled: dueDate <= today,
          hint: dueDate <= today ? "Choisis une échéance dans le futur" : undefined,
          onSelect: () =>
            void activateNextSegment(goalId, dueDate)
              .then(onDone)
              .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Impossible")),
        },
      ]}
      onDismiss={onDismiss}
    >
      <div className="goal-form">
        <label>
          <span>Échéance</span>
          <input type="date" value={dueDate} min={today} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        {error && <p className="goal-form__error">{error}</p>}
      </div>
    </BottomSheet>
  );
}
