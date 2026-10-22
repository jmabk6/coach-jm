import type { DayTarget, PerformedSeries, SetTarget } from "../../domain";

/** Mise en forme de l'objectif du jour (lot P2) : « 55 kg · 8/8/6–7 », transitions sur une ligne par cran. */

const kg = (value: number) => `${String(Math.round(value * 100) / 100).replace(".", ",")} kg`;

export function formatTargetLines(target: Pick<DayTarget, "sets">, perDumbbell: boolean): string[] {
  const unit = (value: number) => `${kg(value)}${perDumbbell ? " par haltère" : ""}`;
  const reps = (set: SetTarget) => (set.stretch && set.reps !== undefined ? `${set.reps - 1}–${set.reps}` : String(set.reps ?? "—"));
  const sets = target.sets;
  if (sets.length === 0) return [];
  if (sets.every((set) => set.kg === undefined)) {
    if (sets.every((set) => set.reps === undefined)) return [sets.map((set) => `${set.durationSec ?? "—"} s`).join(" / ")];
    return [`${sets.length} × ${sets[0]!.reps} répétitions, descente ${sets[0]!.durationSec ?? "—"} s`];
  }
  if (sets.some((set) => set.step)) {
    const groups: Array<{ kg: number; label: string; indexes: number[]; reps: string[] }> = [];
    sets.forEach((set, index) => {
      const label = set.step === "previous" ? "ancien cran" : "nouveau cran";
      const group = groups.find((item) => item.kg === set.kg && item.label === label);
      if (group) {
        group.indexes.push(index + 1);
        group.reps.push(reps(set));
      } else {
        groups.push({ kg: set.kg!, label, indexes: [index + 1], reps: [reps(set)] });
      }
    });
    return groups.map(
      (group) => `${group.indexes.length > 1 ? `Séries ${group.indexes.join(", ")}` : `Série ${group.indexes[0]}`} : ${unit(group.kg)} × ${group.reps.join("/")} (${group.label})`,
    );
  }
  const loads = [...new Set(sets.map((set) => set.kg))];
  if (loads.length === 1) return [`${unit(loads[0]!)} · ${sets.map(reps).join("/")}`];
  return [sets.map((set) => `${kg(set.kg!)} × ${reps(set)}`).join(" · ")];
}

/**
 * « 55 kg · 8/8/6 · RPE 8/9/9 » : toute la dernière séance (séries de
 * travail seulement), pas sa seule dernière série.
 */
export function formatLastSession(series: ReadonlyArray<PerformedSeries>, perDumbbell: boolean): string | undefined {
  const work = series.filter((item) => item.status === "completed" && item.role !== "echauffement");
  if (work.length === 0) return undefined;
  const loads = work.map((item) => (item.load?.kind === "total" ? item.load.kg : undefined));
  const values = work.map((item) => (item.reps !== undefined ? String(item.reps) : item.durationSec !== undefined ? `${item.durationSec} s` : "—"));
  const rpe = work.every((item) => item.rpe === undefined) ? "" : ` · RPE ${work.map((item) => item.rpe ?? "—").join("/")}`;
  const sameLoad = loads.every((value) => value === loads[0]);
  if (loads[0] === undefined && sameLoad) return `${values.join("/")}${rpe}`;
  if (sameLoad) return `${kg(loads[0]!)}${perDumbbell ? " par haltère" : ""} · ${values.join("/")}${rpe}`;
  return `${loads.map((load, index) => `${load !== undefined ? kg(load) : "—"} × ${values[index]}`).join(" · ")}${rpe}`;
}

/** « 21/10 » */
export function formatDayMonth(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

/** Un objectif complet sur une ligne : « 55 kg · 8/8/7 », ou les groupes d'une transition séparés par « · ». */
export function formatPlan(sets: ReadonlyArray<SetTarget>, perDumbbell: boolean): string {
  return formatTargetLines({ sets: [...sets] }, perDumbbell).join(" · ") || "—";
}

/** Une cible de trajectoire ou de prévision : « 60 kg × 8 », « 28 kg d'aide × 5 », « 30 s ». */
export function formatSetTarget(set: SetTarget | undefined, options: { perDumbbell?: boolean; assistance?: boolean } = {}): string {
  if (!set) return "—";
  if (set.kg === undefined) return set.durationSec !== undefined ? `${set.durationSec} s` : set.reps !== undefined ? `${set.reps} rép.` : "—";
  const load = `${kg(set.kg)}${options.assistance ? " d’aide" : options.perDumbbell ? " par haltère" : ""}`;
  return set.reps !== undefined ? `${load} × ${set.reps}` : load;
}

/** Une séance réelle d'une piste : « 55 kg · 8/8/6 · RPE 8/9/9 ». */
export function formatResult(sets: ReadonlyArray<{ kg: number; reps: number; rpe?: number; durationSec?: number }>, options: { perDumbbell?: boolean; assistance?: boolean } = {}): string {
  if (sets.length === 0) return "—";
  const values = sets.map((set) => (set.durationSec !== undefined && set.reps === 0 ? `${set.durationSec} s` : String(set.reps)));
  const rpe = sets.every((set) => set.rpe === undefined) ? "" : ` · RPE ${sets.map((set) => set.rpe ?? "—").join("/")}`;
  const loads = [...new Set(sets.map((set) => set.kg))];
  const suffix = options.assistance ? " d’aide" : options.perDumbbell ? " par haltère" : "";
  if (loads.length === 1) return loads[0] === 0 ? `${values.join("/")}${rpe}` : `${kg(loads[0]!)}${suffix} · ${values.join("/")}${rpe}`;
  return `${sets.map((set, index) => `${kg(set.kg)} × ${values[index]}`).join(" · ")}${rpe}`;
}
