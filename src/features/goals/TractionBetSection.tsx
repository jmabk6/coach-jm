import { Check, Target } from "lucide-react";
import { formatFr } from "../../domain/rules/dateFr";
import { BET_LEVELS, formatPosition, testHint, type BetProgress } from "./tractionBet";

/**
 * Objectif Traction : le pari du 31/03/2027 (03/10/2026). Chaque dimanche :
 * où j'en suis, où je devrais en être, combien de paliers et de semaines
 * restent, ce qu'il faut réussir. Le 31/03 ne bouge pas ; la date
 * prévisionnelle n'apparaît qu'après deux nouveaux paliers validés.
 */
export function TractionBetSection({ bet }: { bet: BetProgress }) {
  const nextIndex = bet.trajectory.findIndex((point) => !point.reached);
  const nextPoint = nextIndex >= 0 ? bet.trajectory[nextIndex] : undefined;
  const nextLevel = nextIndex >= 0 ? BET_LEVELS[nextIndex] : undefined;
  const kg = (value: number) => `${String(value).replace(".", ",")} kg`;

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
          <dt>Où j'en suis</dt>
          <dd>
            {formatPosition(bet.position)}
            {bet.last && <small>Dernière Muscu A, {formatFr(bet.last.date, "d MMM")} : {bet.last.sets.map((set) => set.reps).join(" / ")} à {bet.last.sets.map((set) => set.assistKg).filter((value, index, all) => all.indexOf(value) === index).join(" et ")} kg</small>}
          </dd>
        </div>
        <div>
          <dt>Où je devrais en être</dt>
          <dd>{formatPosition(bet.expected)}</dd>
        </div>
        <div>
          <dt>Il reste</dt>
          <dd>
            {bet.levelsLeft} palier{bet.levelsLeft > 1 ? "s" : ""} · {bet.weeksLeft} semaine{bet.weeksLeft > 1 ? "s" : ""}
            {bet.weeksPerLevelNeeded !== undefined && (
              <small>Rythme nécessaire : 1 palier toutes les {String(bet.weeksPerLevelNeeded).replace(".", ",")} semaines</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Prévision</dt>
          <dd>
            {bet.forecast ? `0 kg vers le ${formatFr(bet.forecast, "d MMMM yyyy")}` : "après deux nouveaux paliers validés"}
          </dd>
        </div>
        <div>
          <dt>Pour tenir le pari</dt>
          <dd>
            Prochaine Muscu A : {bet.prescription.minimum}
            {nextPoint && nextLevel !== undefined && (
              <small>
                Puis {nextLevel === 0 ? "1 traction stricte" : `${nextLevel} kg validé`} d'ici le {formatFr(nextPoint.date, "d MMMM")}
              </small>
            )}
          </dd>
        </div>
      </dl>

      <ol className="bet__trajectory" aria-label="Trajectoire">
        {bet.trajectory.map((point) => (
          <li key={point.date} className={point.reached ? "bet__point bet__point--reached" : point.due ? "bet__point bet__point--late" : "bet__point"}>
            {point.reached && <Check size={13} strokeWidth={3} aria-hidden="true" />}
            {point.label}
          </li>
        ))}
      </ol>

      <p className="bet__weight">
        Poids : {bet.weight.last ? `${kg(bet.weight.last.kg)} le ${formatFr(bet.weight.last.date, "d MMM")}` : "pas encore de pesée"} · cible du moment {kg(bet.weight.target)}
        <small>Deux courbes liées, pas une équation : perdre du poids aide, sans dire à lui seul quelle aide vous pouvez enlever.</small>
      </p>
      <p className="bet__test">{testHint(bet.prescription)}</p>
    </section>
  );
}
