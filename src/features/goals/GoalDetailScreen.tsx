import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Gauge, Info, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { paths } from "../../app/paths";
import { BottomSheet } from "../../components/ui/BottomSheet";
import type { GoalKey } from "../../domain";
import type { GoalCurve } from "../../domain/rules/goalRules";
import { goalDueCard, goalStatusCard, type GoalCardText } from "../../domain/rules/goalListRules";
import { reachedLabel } from "../../domain/rules/goalRules";
import { formatTestNumber } from "../../domain/rules/testResultRules";
import { todayLocalDate } from "../today/useTodayData";
import { activateNextSegment, editGoalSegment, LEGS_MEASURES } from "./goalActions";
import { BodyCompositionSection } from "./BodyCompositionSection";
import { BodyCompositionPanel } from "../body/BodyCompositionPanel";
import { WeightHistoryTable } from "../body/WeightHistoryTable";
import { TractionBetSection } from "./TractionBetSection";
import { v6ShortStatus } from "./tractionV6View";
import { GoalCurveChart } from "./GoalCurveChart";
import { GoalAdviceTab, GoalExercisesTab } from "./GoalTabs";
import { loadGoalDetail, type GoalDetail } from "./goalDetail";
import "./GoalDetailScreen.css";
import { formatFr } from "../../domain/rules/dateFr";
import { weightCurrentCard, weightEtaCard, weightPaceCard, weightTrajectory, WEIGHT_LOSS_KG_PER_WEEK, type WeightCardText } from "../../domain/rules/weightGoalRules";
import type { WeekAverage } from "../../domain/rules/weightRules";

type Tab = "progression" | "exercices" | "conseils";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "progression", label: "Progression" },
  { key: "exercices", label: "Exercices" },
  { key: "conseils", label: "Conseils" },
];

function formatLongDate(date: string): string {
  return formatFr(date, "d MMMM yyyy");
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
    ? { value: formatValue(latest.value), caption: `${segment.label} · ${formatFr(latest.date, "d MMM")}` }
    : { value: evaluation.kind === "no_measure" ? "—" : "À mesurer", caption: segment.label };

  /* Poids : pas de test, une moyenne dès 3 pesées dans une semaine (§ 5.4). */
  const weight = segment.measure?.source === "weight_weekly_average";
  const statusCard =
    detail.bet && evaluation.kind === "tracking"
    ? /* Pari traction V6 : l'écart de paliers, jamais un écart en semaines. */
      {
        value: v6ShortStatus(detail.bet.statusState, today).label,
        caption: `Palier A ${detail.bet.state.aKg} kg · référence S${detail.bet.week.number} : ${detail.bet.week.a}`,
      }
    : weight && evaluation.kind === "no_result"
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
        {/* Poids (15/10/2026) : poids actuel, avance ou retard sur −0,5 kg/semaine depuis le départ, échéance estimée ; la moyenne de la semaine passe sous la courbe. */}
        {detail.weight ? (
          <>
            <WeightCard icon={<Gauge size={18} aria-hidden="true" />} title="Poids actuel" text={weightCurrentCard(detail.weight.overview)} />
            <WeightCard icon={<TrendingUp size={18} aria-hidden="true" />} title="Trajectoire" text={weightPaceCard(detail.weight.overview)} toneOnValue />
            <WeightCard icon={<CalendarDays size={18} aria-hidden="true" />} title="Échéance estimée" text={weightEtaCard(detail.weight.overview)} />
          </>
        ) : (
          <>
            <Card icon={<Gauge size={18} aria-hidden="true" />} title="Aujourd'hui" text={todayCard} />
            <Card icon={<TrendingUp size={18} aria-hidden="true" />} title="Statut" text={statusCard} />
            <Card icon={<CalendarDays size={18} aria-hidden="true" />} title="Échéance" text={goalDueCard(segment.dueDate ?? goal.dueDate, today)} />
          </>
        )}
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
      {tab === "exercices" && <GoalExercisesTab goal={goal} />}
      {tab === "conseils" && <GoalAdviceTab goal={goal} />}
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

/** Trois cartes de 80 px à 375 px : un nombre ne quitte jamais son unité (« 90,4 kg », « −0,5 kg/sem. », « 5 sem. », « 3 j »), « : » ne commence jamais une ligne. */
const keepTogether = (text: string) => text.replace(/(\d) (?=[a-zé])/g, "$1\u00a0").replace(/ :/g, "\u00a0:");

/** Carte Poids (maquette du 15/10/2026) : valeur, sous-ligne, trait, ligne forte, petite ligne ; vert = favorable, rouge = défavorable (sur la valeur pour la Trajectoire). */
function WeightCard({ icon, title, text, toneOnValue = false }: { icon: React.ReactNode; title: string; text: WeightCardText; toneOnValue?: boolean }) {
  const tone = `goal-card__tone--${text.tone ?? "neutral"}`;
  return (
    <div className="goal-card goal-card--weight">
      <span className="goal-card__title">
        {icon} {title}
      </span>
      <strong className={`goal-card__value${toneOnValue ? ` ${tone}` : ""}`}>{keepTogether(text.value)}</strong>
      {text.sub && <span className="goal-card__sub">{keepTogether(text.sub)}</span>}
      {(text.highlight || text.foot) && <hr className="goal-card__rule" />}
      {text.highlight && <span className={`goal-card__highlight${toneOnValue ? "" : ` ${tone}`}`}>{keepTogether(text.highlight)}</span>}
      {text.foot && <span className="goal-card__foot">{keepTogether(text.foot)}</span>}
    </div>
  );
}

const weekKg = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** « 88,6 kg · 4 pesées », « provisoire » sous 3 pesées ; « — » sans pesée. */
function weekLine(week: WeekAverage): string {
  if (week.mean === undefined || week.count === 0) return "Aucune pesée";
  return `${weekKg.format(week.mean)} kg · ${week.count} pesée${week.count > 1 ? "s" : ""}${week.valid ? "" : " (provisoire)"}`;
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
  /* Poids (15/10/2026) : la trajectoire en pointillé suit −0,5 kg/semaine depuis le départ fixe, jusqu'à l'objectif enregistré. */
  const weightLine = detail.weight ? weightTrajectory(detail.weight.overview) : undefined;
  const weightCurve: GoalCurve | undefined = detail.weight
    ? weightLine
      ? { ...curve, trajectory: weightLine }
      : { series: curve.series, ...(curve.provisional ? { provisional: curve.provisional } : {}) }
    : undefined;

  return (
    <>
      {detail.bet && <TractionBetSection bet={detail.bet} />}

      {/* Objectif Poids en clair (correctif du 05/10/2026) : sa valeur et son échéance, même sans moyenne
          de la semaine ; « objectif », jamais « cible » — le mot désigne seulement la cible de composition. */}
      {weight && (
        <section className="goal-section weight-goal" aria-labelledby="weight-goal-title">
          <h2 id="weight-goal-title">Objectif Poids</h2>
          <p className="weight-goal__value">
            <strong>{segment.target !== undefined ? formatValue(segment.target) : "À définir"}</strong>
            {/* 15/10/2026 : plus d'échéance fixe ; la date estimée à −0,5 kg/semaine depuis la dernière pesée. */}
            {detail.weight?.overview.eta.kind === "estimate" && (
              <span>
                estimé au {formatFr(detail.weight.overview.eta.date, "d MMMM yyyy")} à −{String(WEIGHT_LOSS_KG_PER_WEEK).replace(".", ",")} kg/semaine
              </span>
            )}
            {detail.weight?.overview.eta.kind === "reached" && <span>objectif atteint</span>}
          </p>
          <button type="button" className="goal-actions__button" onClick={() => setEditing(true)}>
            Modifier l'objectif
          </button>
        </section>
      )}

      {/* Phase 2.1 : composition corporelle et cible personnelle indicative, indépendantes de l'objectif Poids. */}
      {weight && <BodyCompositionPanel />}

      {weight ? (
        <section className="goal-section goal-test">
          <h2>Pesée</h2>
          <p>Chaque matin, sur l'Accueil. La moyenne de la semaine lisse les variations d'un jour à l'autre et aide à suivre la tendance.</p>
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
          curve={weightCurve ?? curve}
          today={today}
          {...(detail.weight
            ? weightCurve?.trajectory
              ? { dueDate: weightCurve.trajectory[1].date }
              : {}
            : segment.dueDate ?? goal.dueDate
              ? { dueDate: (segment.dueDate ?? goal.dueDate)! }
              : {})}
          {...(segment.target !== undefined ? { target: segment.target } : {})}
          formatValue={formatValue}
          {...(weight ? { emptyText: "La courbe apparaîtra après ta première semaine de pesées." } : {})}
        />
        {detail.weight && (
          <dl className="weight-weeks" aria-label="Moyennes de la semaine">
            <div>
              <dt>Moyenne de la semaine en cours</dt>
              <dd>{weekLine(detail.weight.weeks.current)}</dd>
            </div>
            <div>
              <dt>Semaine précédente</dt>
              <dd>{weekLine(detail.weight.weeks.lastComplete)}</dd>
            </div>
          </dl>
        )}
        {evaluation.kind === "reached" && <p className="goal-detail__reached">{reachedLabel(goal, evaluation.role)}</p>}
        <div className="goal-actions">
          {/* Poids : le bouton est dans le bloc « Objectif Poids », plus haut. */}
          {!weight && (
            <button type="button" className="goal-actions__button" onClick={() => setEditing(true)}>
              {goal.key === "legs" ? "Modifier la mesure, la cible et l'échéance" : "Modifier la cible et l'échéance"}
            </button>
          )}
          {evaluation.kind === "reached" && evaluation.role === "intermediate" && nextSegment && (
            <button type="button" className="goal-actions__button goal-actions__button--primary" onClick={() => setActivating(true)}>
              {goal.key === "traction" ? "Passer à la traction stricte" : `Passer à : ${nextSegment.label}`}
            </button>
          )}
        </div>
      </section>

      {/* 06/10/2026 : toutes les pesées, une par ligne, avec la composition de la balance de référence. */}
      {weight && <WeightHistoryTable />}

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
                    {card.since ? ` depuis le ${formatFr(card.since, "d MMM")}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.composition && <BodyCompositionSection summaries={detail.composition} />}

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
                      <strong>{formatFr(session.date, "d")}</strong>
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
  /* Poids : « objectif », jamais « cible » (le mot désigne la cible de composition). */
  const weight = segment.measure?.source === "weight_weekly_average";
  const [target, setTarget] = useState(segment.target !== undefined ? formatTestNumber(segment.target) : "");
  const [dueDate, setDueDate] = useState(segment.dueDate ?? "");
  const [measureKey, setMeasureKey] = useState(segment.measure?.source === "test" ? segment.measure.measureKey : "");
  const [error, setError] = useState<string>();

  const parsed = target.trim() === "" ? undefined : Number(target.replace(",", "."));
  /* Poids (15/10/2026) : l'échéance est estimée, plus saisie ; seul l'objectif se modifie. */
  const valid = (parsed === undefined || Number.isFinite(parsed)) && (weight || dueDate === "" || dueDate > today) && (!legs || measureKey !== "" || parsed === undefined);
  const labelOf = (key: string) => version?.measures.find((measure) => measure.key === key)?.label ?? key;

  async function save() {
    try {
      await editGoalSegment(goal.id, segment.id, {
        ...(parsed !== undefined ? { target: parsed } : {}),
        /* Poids : l'échéance n'est plus saisie ; celle déjà enregistrée est gardée telle quelle, jamais effacée. */
        ...(weight ? (segment.dueDate ? { dueDate: segment.dueDate } : {}) : dueDate ? { dueDate } : {}),
        ...(legs && measureKey ? { measureKey, measureLabel: labelOf(measureKey) } : {}),
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Modification impossible");
    }
  }

  return (
    <BottomSheet
      title={weight ? "Modifier l'objectif Poids" : goal.title}
      message={
        weight
          ? "Vide = à définir. L'avance ou le retard et l'échéance estimée (−0,5 kg/semaine) se recalculent aussitôt ; la composition corporelle ne change pas."
          : "Vide = à définir. Le statut, le départ et l'atteinte se recalculent aussitôt."
      }
      actions={[
        {
          label: "Enregistrer",
          tone: "primary",
          disabled: !valid,
          hint: valid ? undefined : weight ? "Objectif numérique" : "Échéance dans le futur, cible numérique",
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
        {weight ? (
          <label>
            <span>Objectif (kg)</span>
            <input inputMode="decimal" aria-label="Objectif en kg" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="à définir" />
          </label>
        ) : (
          <label>
            <span>Cible</span>
            <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="à définir" />
          </label>
        )}
        {!weight && (
          <label>
            <span>Échéance</span>
            <input type="date" value={dueDate} min={today} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        )}
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
