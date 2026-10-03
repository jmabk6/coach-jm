import { AlertTriangle, Target } from "lucide-react";
import { formatFr } from "../../domain/rules/dateFr";
import { formatBetSets, type BetSet } from "./tractionBet";
import type { V6Color } from "./tractionV6";
import type { V6Progress, V6Row } from "./tractionV6View";

/**
 * Objectif Traction, pari V6 (04/10/2026) : 1 traction stricte au plus
 * tard le 31/03/2027. En tête : le palier A réel face à la référence de la
 * semaine, avec un statut vert / orange / rouge selon l'écart de paliers
 * seulement ; la prochaine Muscu A et la Muscu B ; le poids et la charge
 * effective indicative ; le garde-fou. Puis la référence V6 S1-S26, fixe,
 * face au réel, repliable. Jamais d'écart en semaines.
 */

const day = (date: string) => formatFr(date, "dd/MM");
const kg = (value: number) => `${String(value).replace(".", ",")} kg`;
const reps = (values: readonly number[]) => values.join(" / ");

/** « 35 kg · 4 / 3 / 3 », ou le détail par série si l'aide change d'une série à l'autre (repli). */
function formatDone(sets: readonly BetSet[]): string {
  const levels = new Set(sets.map((set) => set.assistKg));
  return levels.size === 1 ? `${kg(sets[0]!.assistKg)} · ${reps(sets.map((set) => set.reps))}` : formatBetSets(sets);
}

const COLOR_LABELS: Record<V6Color, string> = { vert: "Vert", orange: "Orange", rouge: "Rouge", gagne: "Gagné" };

function Dot({ color }: { color: V6Color }) {
  return <span className={`bet__dot bet__dot--${color}`} aria-label={COLOR_LABELS[color]} role="img" />;
}

function RowReal({ row }: { row: V6Row }) {
  const parts: string[] = [];
  if (row.session) {
    const flags = [row.repli ? "repli" : undefined, row.validatedKg !== undefined ? `${kg(row.validatedKg)} validé` : undefined, row.regression ? "en baisse" : undefined].filter(Boolean);
    parts.push(`Réel : ${formatDone(row.session.sets)}${row.compare ? ` (réf ≥ ${reps(row.compare.ref)})` : ""}${flags.length > 0 ? ` · ${flags.join(" · ")}` : ""}`);
  } else if (row.week.kind === "force" && row.state === "past") {
    parts.push("Pas de Muscu A de force");
  }
  if (row.testKg !== undefined) parts.push(`Test : ${kg(row.testKg)} obtenu`);
  if (row.weightKg !== undefined) parts.push(`Poids : ${kg(row.weightKg)}`);
  return parts.length > 0 ? <span className="bet__row-done">{parts.join(" — ")}</span> : null;
}

export function TractionBetSection({ bet }: { bet: V6Progress }) {
  const { state, week, next, light } = bet;
  const lastRow = state.last ? bet.rows.find((row) => row.session?.workoutId === state.last!.workoutId) : undefined;
  const real =
    state.phase === "gagne"
      ? "Objectif gagné : 1 traction stricte"
      : state.phase === "essai_libre"
        ? "Phase essai libre : 0 kg d'abord, séries à 7 kg"
        : `${kg(state.aKg)} d'aide`;

  return (
    <section className="goal-section bet" aria-labelledby="bet-title">
      <div className="bet__head">
        <h2 id="bet-title">
          <Target size={18} aria-hidden="true" /> 1 traction stricte le 31/03/2027
        </h2>
        <span className={`bet__status bet__status--${bet.color}`}>
          <Dot color={bet.color} />
          {bet.statusLabel}
        </span>
      </div>

      <dl className="bet__facts">
        <div>
          <dt>Palier A réel</dt>
          <dd>
            {real}
            <small>
              Référence S{week.number} ({day(week.date)}) : {kg(week.refKg)}
              {week.kind === "test" ? " · semaine test" : week.kind === "essai" ? " · essais libres" : ""}
            </small>
          </dd>
        </div>
        <div>
          <dt>Dernière Muscu A</dt>
          <dd>
            {state.last ? formatDone(state.last.sets) : "—"}
            {state.last && (
              <small>
                {day(state.last.date)}
                {state.last.sets.some((set) => set.rpe !== undefined) ? ` · RPE ${state.last.sets.map((set) => set.rpe ?? "—").join(" / ")}` : ""}
                {lastRow?.compare ? ` · réf ≥ ${reps(lastRow.compare.ref)}` : ""}
                {lastRow?.repli ? " · repli : exclue des régressions" : ""}
              </small>
            )}
          </dd>
        </div>
        {state.phase !== "gagne" && (
          <div>
            <dt>Prochaine Muscu A</dt>
            <dd>
              {next.lines[0]}
              {next.lines[2] && <small>{next.lines[2]}</small>}
            </dd>
          </div>
        )}
        {state.phase !== "gagne" && (
          <div>
            <dt>Muscu B</dt>
            <dd>{light.label}</dd>
          </div>
        )}
        <div>
          <dt>Poids</dt>
          <dd>
            {bet.weight ? `${kg(bet.weight.kg)} le ${formatFr(bet.weight.date, "d MMM")}` : "pas encore de pesée"} · référence {kg(week.weightKg)}
            {bet.effectiveKg !== undefined && (
              <small>Charge effective indicative ≈ {kg(bet.effectiveKg)} (poids − assistance) : une tendance, pas une mesure.</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Date limite</dt>
          <dd>
            31/03/2027
            <small>Dernière chance le 28/03, repos le 30/03, essai final le 31/03.</small>
          </dd>
        </div>
      </dl>

      {bet.guard && (
        <p className="bet__alert" role="status">
          <AlertTriangle size={16} aria-hidden="true" /> {bet.guard}
        </p>
      )}
      {bet.earlyTry && <p className="bet__test">{bet.earlyTry}</p>}

      <details className="bet__plan" open={false}>
        <summary>Référence V6 face au réel (S1–S26)</summary>
        <p className="bet__plan-lead">
          Référence fixe : elle ne se décale jamais. Le réel s'affiche en dessous ; la couleur ne dépend que du palier A, les reps ne la changent pas.
        </p>
        <ol className="bet__rows">
          {bet.rows.map((row) => (
            <li
              key={row.week.date}
              className={`bet__row bet__row--${row.state}${row.week.kind === "test" ? " bet__row--test" : ""}`}
            >
              <span className="bet__row-date">
                S{row.week.number}
                <small>{day(row.week.date)}</small>
              </span>
              <span className="bet__row-body">
                <span className="bet__row-plan">
                  {row.week.kind === "force" ? `A ${row.week.a}` : row.week.a}
                </span>
                <span className="bet__row-test">
                  B {row.week.b} · C {row.week.c} · {kg(row.week.weightKg)}
                </span>
                <RowReal row={row} />
              </span>
              {row.color && row.aKg !== undefined ? (
                <span className={`bet__chip bet__chip--${row.color}`}>
                  <Dot color={row.color} /> {row.color === "gagne" ? "Gagné" : `A ${kg(row.aKg)}`}
                </span>
              ) : (
                <span className="bet__chip">À venir</span>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
