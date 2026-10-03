import { Check, Target } from "lucide-react";
import { formatFr } from "../../domain/rules/dateFr";
import { getWeekStartDate } from "../../domain/rules/programRules";
import { BET_PLAN, formatBetSets, testHint, type BetProgress, type BetRow, type BetSet } from "./tractionBet";

/**
 * Objectif Traction : le pari du 31/03/2027 (03/10/2026). En tête : ce qui
 * était prévu cette semaine, ce qui a été fait, ce qu'il faut faire à la
 * prochaine Muscu A, l'écart en semaines. Puis la vue mensuelle (tirée du
 * rétroplanning) et le rétroplanning complet, repliable. Le rétroplanning
 * est figé : il ne se décale jamais ; la séance suit la performance réelle.
 */

const day = (date: string) => formatFr(date, "dd/MM");
const reps = (sets: readonly BetSet[]) => sets.map((set) => set.reps).join(" / ");
const kg = (value: number) => `${String(value).replace(".", ",")} kg`;

/** « 42 kg · 8 / 8 / 6 », ou le détail par série si l'aide change d'une série à l'autre. */
function formatDone(sets: readonly BetSet[]): string {
  const levels = new Set(sets.map((set) => set.assistKg));
  return levels.size === 1 ? `${kg(sets[0]!.assistKg)} · ${reps(sets)}` : formatBetSets(sets);
}

const STATE_LABELS: Record<BetRow["state"], string> = {
  done: "Atteint",
  late: "En retard",
  current: "Cette semaine",
  ahead: "Déjà atteint",
  upcoming: "À venir",
};

export function TractionBetSection({ bet }: { bet: BetProgress }) {
  const expectedRow = bet.expected >= 0 ? BET_PLAN[bet.expected] : undefined;
  const thisWeek = bet.rows.find((item) => item.row.date === getWeekStartDate(bet.today));

  return (
    <section className="goal-section bet" aria-labelledby="bet-title">
      <div className="bet__head">
        <h2 id="bet-title">
          <Target size={18} aria-hidden="true" /> 1 traction stricte le 31/03/2027
        </h2>
        <span className={`bet__status bet__status--${bet.status}`}>{bet.statusLabel}</span>
      </div>

      <dl className="bet__facts">
        <div>
          <dt>Prévu à cette date</dt>
          <dd>
            {expectedRow ? formatBetSets(expectedRow.sets) : "rien encore : le rétroplanning commence le 04/10"}
            {expectedRow && <small>Rétroplanning, semaine du {day(expectedRow.date)}</small>}
          </dd>
        </div>
        <div>
          <dt>Réalisé</dt>
          <dd>
            {bet.last ? formatDone(bet.last.sets) : "—"}
            {bet.last && (
              <small>
                Muscu A du {day(bet.last.date)}
                {bet.last.sets.some((set) => set.rpe !== undefined) ? ` · RPE ${bet.last.sets.map((set) => set.rpe ?? "—").join(" / ")}` : ""}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Prochaine Muscu A</dt>
          <dd>
            {bet.prescription.minimum}
            <small>D'après votre dernier résultat ; validation : {bet.prescription.validation}</small>
          </dd>
        </div>
        <div>
          <dt>Écart</dt>
          <dd>
            {bet.gapLabel}
            <small>
              {bet.weeksLeft} semaine{bet.weeksLeft > 1 ? "s" : ""} jusqu'au 31/03 · {bet.levelsLeft} palier{bet.levelsLeft > 1 ? "s" : ""} restant{bet.levelsLeft > 1 ? "s" : ""}
            </small>
          </dd>
        </div>
        <div>
          <dt>Prévision</dt>
          <dd>{bet.forecast ? `0 kg vers le ${formatFr(bet.forecast, "d MMMM yyyy")}` : "après deux nouveaux paliers validés"}</dd>
        </div>
      </dl>

      <ol className="bet__trajectory" aria-label="Repères du rétroplanning">
        {bet.trajectory.map((point) => (
          <li key={point.date} className={point.reached ? "bet__point bet__point--reached" : point.due ? "bet__point bet__point--late" : "bet__point"}>
            {point.reached && <Check size={13} strokeWidth={3} aria-hidden="true" />}
            {point.label} · {day(point.date)}
          </li>
        ))}
      </ol>

      <details className="bet__plan" open={false}>
        <summary>Rétroplanning jusqu'au 31/03</summary>
        <p className="bet__plan-lead">
          Figé : les dates ne bougent jamais. Si une étape est ratée, la séance suivante la refait, et l'écart s'affiche.
        </p>
        <ol className="bet__rows">
          {bet.rows.map((item) => (
            <li
              key={item.row.date}
              className={`bet__row bet__row--${item.state}${item.row.test ? " bet__row--test" : ""}${item === thisWeek ? " bet__row--now" : ""}`}
            >
              <span className="bet__row-date">{day(item.row.date)}</span>
              <span className="bet__row-body">
                <span className="bet__row-plan">
                  {item.row.test && <span className="bet__chip bet__chip--test">TEST</span>}
                  {item.row.strict ? `Essai de traction stricte, puis ${formatBetSets(item.row.sets.slice(1))}` : formatBetSets(item.row.sets)}
                </span>
                {item.row.test && (
                  <span className="bet__row-test">
                    Test : {item.row.test.note}
                    {item.testResultKg !== undefined ? ` · obtenu : ${kg(item.testResultKg)}` : ""}
                  </span>
                )}
                {item.done && <span className="bet__row-done">Réalisé : {formatDone(item.done.sets)}</span>}
                {item.row.milestone && <span className="bet__row-milestone">{item.row.milestone}</span>}
              </span>
              <span className={`bet__chip bet__chip--${item.state}`}>{STATE_LABELS[item.state]}</span>
            </li>
          ))}
        </ol>
      </details>

      <p className="bet__weight">
        Poids : {bet.weight.last ? `${kg(bet.weight.last.kg)} le ${formatFr(bet.weight.last.date, "d MMM")}` : "pas encore de pesée"} · cible du moment {kg(bet.weight.target)}
        <small>Deux courbes liées, pas une équation : perdre du poids aide, sans dire à lui seul quelle aide vous pouvez enlever.</small>
      </p>
      <p className="bet__test">{testHint(bet.prescription)}</p>
    </section>
  );
}
