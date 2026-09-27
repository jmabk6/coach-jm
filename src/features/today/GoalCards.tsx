import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../app/paths";
import { formatShortDay } from "../../domain/rules/programRules";
import { PictogramTile } from "../exercises/ExercisePictogram";
import { goalIcon, goalTone } from "../goals/goalIcons";
import { loadGoalList, type GoalListRow } from "../goals/goalList";
import "./GoalCards.css";

/**
 * « Mes 7 objectifs » (M1, lot J.2) : ne lit que les résultats de test et
 * les pesées (goalProgress) — jamais une séance d'entraînement présentée
 * comme un résultat. Accueil compact (27/09/2026) : une ligne par
 * objectif — icône, nom, valeur ou « À mesurer · test … », statut ;
 * toucher ouvre l'objectif.
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
          Tout voir <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <ul className="goal-cards-home__list">
        {rows.map((row) => {
          const status = statusOf(row);
          return (
            <li key={row.goal.id}>
              <Link to={paths.goal(row.goal.key)} className="goal-card-home" data-goal={row.goal.key}>
                <span className="goal-card-home__icon">
                  <PictogramTile Icon={goalIcon(row.goal)} label={row.goal.title} tone={goalTone(row.goal)} size={18} />
                </span>
                <span className="goal-card-home__body">
                  <strong className="goal-card-home__title">{row.goal.title}</strong>
                  <span className="goal-card-home__value">{valueOf(row)}</span>
                </span>
                {status && <span className={`goal-card-home__status goal-card-home__status--${status.tone}`}>{status.label}</span>}
                <ChevronRight className="goal-card-home__chevron" size={16} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** La valeur, ou « À mesurer · test dim. 27 sept. » quand un test est prévu. */
function valueOf(row: GoalListRow): string {
  if (row.text.value === "À mesurer" && row.badge?.kind === "test") return `À mesurer · test ${formatShortDay(row.badge.date)}`;
  return row.text.value;
}

/** Le statut en un mot ; un test manqué passe devant : « À replanifier ». */
function statusOf(row: GoalListRow): { label: string; tone: string } | undefined {
  if (row.badge?.kind === "reschedule") return { label: "À replanifier", tone: "warning" };
  return row.status;
}
