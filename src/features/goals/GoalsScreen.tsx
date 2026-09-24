import { CalendarDays, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { formatWeekRange } from "../../domain/rules/programRules";
import { daysUntilNextTestWeek, nextTestWeekStart } from "../../domain/rules/testCycleRules";
import { PictogramTile } from "../exercises/ExercisePictogram";
import { todayLocalDate } from "../today/useTodayData";
import { goalIcon, goalTone } from "./goalIcons";
import { loadGoalList, type GoalList, type GoalListRow } from "./goalList";
import "./GoalsScreen.css";

/**
 * M4 — Objectifs (lot H.3) : les 7 objectifs, leur segment courant, leur
 * prochain test. N'écrit rien.
 */
export function GoalsScreen() {
  const [today] = useState(todayLocalDate);
  const [list, setList] = useState<GoalList>();

  useEffect(() => {
    let cancelled = false;
    void loadGoalList(today).then((loaded) => {
      if (!cancelled) setList(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  return (
    <section className="goals">
      <h1>Objectifs</h1>

      {list?.cycle && <TestWeekBanner today={today} cycle={list.cycle} />}

      {list === undefined ? (
        <p className="goals__message">Chargement…</p>
      ) : list.rows.length === 0 ? (
        <p className="goals__message">Aucun objectif pour le moment.</p>
      ) : (
        <ol className="goals__list">
          {list.rows.map((row) => (
            <GoalRow key={row.goal.id} row={row} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TestWeekBanner({ today, cycle }: { today: string; cycle: NonNullable<GoalList["cycle"]> }) {
  const weekStart = nextTestWeekStart(today, cycle);
  const days = daysUntilNextTestWeek(today, cycle);
  return (
    <Link to={paths.planning({ date: weekStart })} className="goals__banner">
      <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
      <span>
        <strong>Semaine de tests{days > 0 ? ` dans ${days} jour${days > 1 ? "s" : ""}` : ""}</strong>
        <br />
        {formatWeekRange(weekStart)}
      </span>
      <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

function GoalRow({ row }: { row: GoalListRow }) {
  const { goal, number, text, badge } = row;
  const tone = goalTone(goal);

  return (
    <li className="goal-row" data-goal={goal.key}>
      <span className={`goal-row__number goal-row__number--${tone}`}>{number}</span>
      <span className="goal-row__icon">
        <PictogramTile Icon={goalIcon(goal)} label={goal.title} tone={tone} size={26} />
      </span>
      <span className="goal-row__body">
        <span className="goal-row__head">
          <strong className="goal-row__title">{goal.title}</strong>
          {badge && <span className={`goal-row__badge goal-row__badge--${badge.kind}`}>{badge.label}</span>}
        </span>
        <span className="goal-row__subtitle">{text.subtitle}</span>
        <span className="goal-row__bar" role="progressbar" aria-label={`Progression ${goal.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(text.bar)}>
          <span className="goal-row__fill" style={{ width: `${text.bar}%` }} />
        </span>
        <span className="goal-row__foot">
          <span className="goal-row__value">
            {text.value}
            {text.reached && <span className="goal-row__reached"> · {text.reached}</span>}
          </span>
          <span className="goal-row__target">{text.target}</span>
        </span>
      </span>
    </li>
  );
}
