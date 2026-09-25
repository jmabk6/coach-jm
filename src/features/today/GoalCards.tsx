import { CalendarDays, ChevronRight, CircleDot } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import type { GoalBadge } from "../../domain/rules/goalListRules";
import { formatShortDay } from "../../domain/rules/programRules";
import { PictogramTile } from "../exercises/ExercisePictogram";
import { goalIcon, goalTone } from "../goals/goalIcons";
import { loadGoalList, type GoalListRow } from "../goals/goalList";
import "./GoalCards.css";

/**
 * « Mes 7 objectifs » (M1, lot J.2) : une carte par objectif, qui ne lit que
 * les résultats de test et les pesées (goalProgress) — jamais une séance
 * d'entraînement présentée comme un résultat. Même contenu que la liste
 * des Objectifs (M4).
 */
export function GoalCards({ today }: { today: string }) {
  const [rows, setRows] = useState<GoalListRow[]>();

  useEffect(() => {
    let cancelled = false;
    void loadGoalList(today).then((list) => {
      if (!cancelled) setRows(list.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="goal-cards-home" aria-label={`Mes ${rows.length} objectifs`}>
      <header className="goal-cards-home__head">
        <h2>Mes {rows.length} objectifs</h2>
        <Link to={paths.goals()}>
          Voir tous les objectifs <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <ul className="goal-cards-home__grid">
        {rows.map((row) => (
          <li key={row.goal.id}>
            <Link to={paths.goal(row.goal.key)} className="goal-card-home" data-goal={row.goal.key}>
              <span className="goal-card-home__top">
                <span className={`goal-row__number goal-row__number--${goalTone(row.goal)}`}>{row.number}</span>
                <span className="goal-card-home__icon">
                  <PictogramTile Icon={goalIcon(row.goal)} label={row.goal.title} tone={goalTone(row.goal)} size={22} />
                </span>
              </span>
              <strong className="goal-card-home__title">{row.goal.title}</strong>
              <span className="goal-card-home__value">{row.text.reached ?? row.text.value}</span>
              {row.badge && (
                <span className={`goal-card-home__foot goal-card-home__foot--${row.badge.kind}`}>
                  {row.badge.kind === "test" ? <CalendarDays size={13} aria-hidden="true" /> : <CircleDot size={13} aria-hidden="true" />}
                  {badgeText(row.badge)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « Test dim. 27 sept. », « Test à replanifier », « Pesée demain » (M1). */
function badgeText(badge: GoalBadge): string {
  if (badge.kind === "test") return `Test ${formatShortDay(badge.date)}`;
  if (badge.kind === "reschedule") return "Test à replanifier";
  return badge.label;
}
