import type {
  PerformedTestBlock,
  TestMeasureSpec,
  TestMeasureValue,
  TestProtocolVersion,
  TestResult,
  TestTrial,
} from "../models";

/**
 * Résultat d'un test (conception V2 § 5.3, D28, N9) — fonction pure. Les
 * mesures dérivées se calculent **une fois à l'enregistrement** et sont
 * stockées : un changement de formule ne réécrit pas le passé. L'écran
 * affiche le même calcul en direct.
 *
 * `complete` : toutes les mesures requises saisies sont là (les deux côtés
 * pour une mesure par côté) et les dérivées requises sont calculables.
 */

export type TestDraft = NonNullable<PerformedTestBlock["draft"]>;

export interface ComputedTestResult {
  status: TestResult["status"];
  measures: TestMeasureValue[];
  trials?: TestTrial[];
  /** Pourquoi le résultat est incomplet, dans les mots de l'écran. */
  messages: string[];
}

/** Unité d'une mesure : celle de la version pour les sprints (D17). */
export function measureUnit(spec: TestMeasureSpec, version: Pick<TestProtocolVersion, "settings">): string {
  if (spec.unit) return spec.unit;
  const unit = version.settings?.unit;
  return unit === "watts" ? "W" : unit === "meters" ? "m" : "";
}

const round = (value: number, step: number) => Math.round(value / step) * step;
/** Évite 0.30000000000000004 : arrondi au pas, puis au nombre de décimales du pas. */
const roundTo = (value: number, step: number) => Number(round(value, step).toFixed(Math.max(0, -Math.floor(Math.log10(step)))));

/**
 * Un test à essais dégressifs est fini au premier échec, ou sur une
 * réussite au réglage le plus bas de la machine.
 */
export function isTrialsTestFinished(trials: ReadonlyArray<TestTrial>): boolean {
  const last = [...trials].sort((a, b) => a.order - b.order).at(-1);
  return last !== undefined && (last.outcome === "failure" || last.atLowestSetting === true);
}

/** Dernier essai réussi dans l'ordre des essais (§ 5.3, traction). */
export function lastSuccessfulTrial(trials: ReadonlyArray<TestTrial>): TestTrial | undefined {
  return [...trials].sort((a, b) => a.order - b.order).filter((trial) => trial.outcome === "success").at(-1);
}

function derive(key: string, values: Record<string, number>, trials: TestTrial[]): number | undefined {
  switch (key) {
    case "assistance_min_kg":
      return lastSuccessfulTrial(trials)?.value;
    case "essais_nb":
      return trials.length > 0 ? trials.length : undefined;
    case "fc_moy_16_20": {
      const readings = [16, 17, 18, 19, 20].map((minute) => values[`fc_${minute}`]);
      if (readings.some((reading) => reading === undefined)) return undefined;
      return Math.round(readings.reduce((sum: number, reading) => sum + reading!, 0) / 5);
    }
    case "sprint_puissance_moy": {
      const sprints = [1, 2, 3, 4, 5, 6].map((index) => values[`sprint_${index}`]).filter((value): value is number => value !== undefined);
      return sprints.length > 0 ? roundTo(sprints.reduce((sum, value) => sum + value, 0) / sprints.length, 0.1) : undefined;
    }
    case "sprint_baisse_pct": {
      const first = values.sprint_1;
      const last = values.sprint_6;
      if (first === undefined || last === undefined || first <= 0) return undefined;
      return roundTo(((first - last) / first) * 100, 0.1);
    }
    case "ratio_epaules_taille": {
      const shoulders = values.epaules_cm;
      const waist = values.taille_cm;
      if (shoulders === undefined || waist === undefined || waist <= 0) return undefined;
      return roundTo(shoulders / waist, 0.01);
    }
    default:
      return undefined;
  }
}

export function computeTestResult(
  version: Pick<TestProtocolVersion, "kind" | "measures" | "settings">,
  draft: TestDraft | undefined,
): ComputedTestResult {
  const values = draft?.values ?? {};
  const sideValues = draft?.sideValues ?? {};
  const trials = [...(draft?.trials ?? [])].sort((a, b) => a.order - b.order);
  const measures: TestMeasureValue[] = [];
  const messages: string[] = [];
  let complete = true;

  for (const spec of version.measures) {
    const unit = measureUnit(spec, version);

    if (spec.input === "entered" && spec.side) {
      const sides = sideValues[spec.key] ?? {};
      for (const side of ["left", "right"] as const) {
        const value = sides[side];
        if (value !== undefined) measures.push({ key: spec.key, value, unit, side });
      }
      if (spec.required && (sides.left === undefined || sides.right === undefined)) {
        complete = false;
        messages.push(`${spec.label} : les deux côtés sont nécessaires`);
      }
      continue;
    }

    const value = spec.input === "entered" ? values[spec.key] : derive(spec.key, values, trials);
    if (value !== undefined) {
      measures.push({ key: spec.key, value, unit });
      continue;
    }
    if (spec.required) {
      complete = false;
      if (spec.input === "entered") messages.push(`${spec.label} manquant`);
    }
  }

  /* Messages du § 5.3 et de N9, dans les mots du protocole. */
  if (version.kind === "trials_descending") {
    if (trials.length > 0 && !lastSuccessfulTrial(trials)) {
      complete = false;
      messages.push("Aucun essai réussi : recalibrer le premier essai");
    } else if (trials.length > 0 && !isTrialsTestFinished(trials)) {
      /* « Jusqu'au premier échec » : sans échec, le test n'est pas allé au
         bout — sauf réussite au réglage le plus bas de la machine. */
      complete = false;
      messages.push("Le test va jusqu'au premier échec, ou jusqu'à une réussite au réglage le plus bas");
    } else if (trials.length === 0) {
      complete = false;
      messages.push("Aucun essai");
    }
  }
  if (version.measures.some((spec) => spec.key === "fc_moy_16_20") && derive("fc_moy_16_20", values, trials) === undefined) {
    messages.push("FC incomplète : les 5 relevés de la 16e à la 20e minute sont nécessaires");
  }
  if (version.measures.some((spec) => spec.key.startsWith("sprint_")) && !version.settings?.unit) {
    complete = false;
    messages.push("Unité des sprints à choisir (watts ou mètres)");
  }

  const result: ComputedTestResult = { status: complete ? "complete" : "incomplete", measures, messages };
  if (trials.length > 0) result.trials = trials;
  return result;
}

/**
 * Valeur principale d'un résultat, telle que la mesure la compare : pour
 * une mesure par côté, le côté le moins bon (le plus grand écart, Apley).
 */
export function primaryValue(
  version: Pick<TestProtocolVersion, "primaryMeasureKey" | "measures">,
  measures: ReadonlyArray<TestMeasureValue>,
): number | undefined {
  const key = version.primaryMeasureKey;
  if (!key) return undefined;
  const found = measures.filter((measure) => measure.key === key);
  if (found.length === 0) return undefined;
  return found.length === 1 ? found[0]!.value : Math.max(...found.map((measure) => measure.value));
}

/**
 * La saisie d'un résultat enregistré, pour l'afficher comme en séance
 * (D27 : la séance ne garde que `testResultId`, le détail lit le résultat).
 * Les dérivées stockées y figurent aussi : elles ne sont jamais recalculées.
 */
export function draftFromResult(result: Pick<TestResult, "measures" | "trials" | "note">): TestDraft {
  const draft: TestDraft = {};
  for (const measure of result.measures) {
    if (measure.side) {
      draft.sideValues = { ...draft.sideValues, [measure.key]: { ...draft.sideValues?.[measure.key], [measure.side]: measure.value } };
    } else {
      draft.values = { ...draft.values, [measure.key]: measure.value };
    }
  }
  if (result.trials && result.trials.length > 0) draft.trials = structuredClone(result.trials);
  if (result.note) draft.note = result.note;
  return draft;
}
