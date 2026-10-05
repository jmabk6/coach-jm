import type { BodyMeasurement, BodySegment, BodySegmentKey } from "../models";
import { weightReferenceEligible } from "./bodyWeightRules";

/**
 * Corps, phase 2 (05/10/2026) — le formulaire de mesure corporelle, en
 * règles pures : lecture de la saisie (virgule ou point, bornes, messages
 * en français), valeurs calculées, provenance.
 *
 * Ne sont jamais demandées les valeurs qui se calculent avec certitude :
 * la masse grasse en kg (poids × %) et la masse sans graisse (poids −
 * graisse), affichées « calculées » ; l'IMC se calcule avec la taille du
 * profil, et ne se saisit que si elle manque. Une valeur stockée (import
 * CSV à venir) l'emporte toujours sur le calcul.
 */

export type BodyFieldKey =
  | "weightKg"
  | "fatPct"
  | "muscleKg"
  | "skeletalMuscleKg"
  | "bmi"
  | "waterKg"
  | "proteinKg"
  | "boneKg"
  | "visceralFat"
  | "bmrKcal"
  | "metabolicAge"
  | "score";

export interface BodyFieldSpec {
  label: string;
  /** Unité affichée à côté du champ ; vide pour un indice. */
  unit: string;
  /** Libellé accessible complet (« Poids en kg »). */
  ariaLabel: string;
  min: number;
  max: number;
  integer?: boolean;
  /** Une masse partielle ne dépasse jamais le poids. */
  belowWeight?: boolean;
  placeholder: string;
}

export const BODY_FIELD_SPECS: Record<BodyFieldKey, BodyFieldSpec> = {
  weightKg: { label: "Poids", unit: "kg", ariaLabel: "Poids en kg", min: 20, max: 300, placeholder: "91,90" },
  fatPct: { label: "Masse grasse", unit: "%", ariaLabel: "Masse grasse en %", min: 3, max: 75, placeholder: "27,5" },
  muscleKg: { label: "Masse musculaire", unit: "kg", ariaLabel: "Masse musculaire en kg", min: 5, max: 200, belowWeight: true, placeholder: "62,12" },
  skeletalMuscleKg: { label: "Muscle squelettique", unit: "kg", ariaLabel: "Muscle squelettique en kg", min: 5, max: 150, belowWeight: true, placeholder: "38,06" },
  bmi: { label: "IMC", unit: "", ariaLabel: "IMC", min: 10, max: 80, placeholder: "29,3" },
  waterKg: { label: "Eau", unit: "kg", ariaLabel: "Eau en kg", min: 5, max: 200, belowWeight: true, placeholder: "48,80" },
  proteinKg: { label: "Protéines", unit: "kg", ariaLabel: "Protéines en kg", min: 1, max: 100, belowWeight: true, placeholder: "13,33" },
  boneKg: { label: "Os", unit: "kg", ariaLabel: "Os en kg", min: 0.5, max: 20, belowWeight: true, placeholder: "4,50" },
  visceralFat: { label: "Graisse viscérale", unit: "", ariaLabel: "Graisse viscérale (indice)", min: 1, max: 60, placeholder: "10" },
  bmrKcal: { label: "Métabolisme de base", unit: "kcal", ariaLabel: "Métabolisme de base en kcal", min: 500, max: 5000, integer: true, placeholder: "1696" },
  metabolicAge: { label: "Âge métabolique", unit: "ans", ariaLabel: "Âge métabolique en ans", min: 10, max: 120, integer: true, placeholder: "60" },
  score: { label: "Score", unit: "", ariaLabel: "Score", min: 0, max: 100, integer: true, placeholder: "73" },
};

/** Les champs principaux, toujours visibles ; les autres sont dans « Détails ». */
export const MAIN_BODY_FIELDS: readonly BodyFieldKey[] = ["weightKg", "fatPct", "muscleKg", "skeletalMuscleKg"];
export const DETAIL_BODY_FIELDS: readonly BodyFieldKey[] = ["bmi", "waterKg", "proteinKg", "boneKg", "visceralFat", "bmrKcal", "metabolicAge", "score"];

export const BODY_SEGMENTS: ReadonlyArray<{ key: BodySegmentKey; label: string }> = [
  { key: "leftArm", label: "Bras gauche" },
  { key: "rightArm", label: "Bras droit" },
  { key: "trunk", label: "Tronc" },
  { key: "leftLeg", label: "Jambe gauche" },
  { key: "rightLeg", label: "Jambe droite" },
];

/** Appareils proposés ; « other » ouvre un nom libre (jamais codé en dur ailleurs). */
export type BodyDeviceChoice = "renpho" | "withings" | "other";

export interface BodyMeasurementFormValues extends Record<BodyFieldKey, string> {
  date: string;
  time: string;
  device: BodyDeviceChoice;
  otherDevice: string;
  segments: Record<BodySegmentKey, { fatKg: string; muscleKg: string }>;
}

function emptySegments(): BodyMeasurementFormValues["segments"] {
  return {
    leftArm: { fatKg: "", muscleKg: "" },
    rightArm: { fatKg: "", muscleKg: "" },
    trunk: { fatKg: "", muscleKg: "" },
    leftLeg: { fatKg: "", muscleKg: "" },
    rightLeg: { fatKg: "", muscleKg: "" },
  };
}

/** Un formulaire neuf : le jour et l'heure donnés, RENPHO par défaut. */
export function emptyBodyMeasurementForm(date: string, time: string): BodyMeasurementFormValues {
  return {
    date,
    time,
    device: "renpho",
    otherDevice: "",
    weightKg: "",
    fatPct: "",
    muscleKg: "",
    skeletalMuscleKg: "",
    bmi: "",
    waterKg: "",
    proteinKg: "",
    boneKg: "",
    visceralFat: "",
    bmrKcal: "",
    metabolicAge: "",
    score: "",
    segments: emptySegments(),
  };
}

/** `38.06` → `38,06` ; absent → vide. */
export function formatBodyInput(value: number | undefined): string {
  return value === undefined ? "" : String(Math.round(value * 100) / 100).replace(".", ",");
}

const pad = (value: number) => String(value).padStart(2, "0");

/** L'heure locale `HH:MM` d'un instant ISO. */
export function localTimeOf(takenAt: string): string {
  const date = new Date(takenAt);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Le formulaire prérempli d'une mesure existante. */
export function formOfBodyMeasurement(measurement: BodyMeasurement): BodyMeasurementFormValues {
  const known = measurement.device === "renpho" || measurement.device === "withings";
  const form = emptyBodyMeasurementForm(measurement.date, localTimeOf(measurement.takenAt));
  form.device = known ? (measurement.device as BodyDeviceChoice) : "other";
  form.otherDevice = known ? "" : measurement.device;
  for (const key of [...MAIN_BODY_FIELDS, ...DETAIL_BODY_FIELDS]) form[key] = formatBodyInput(measurement[key]);
  for (const { key } of BODY_SEGMENTS) {
    const segment = measurement.segments?.[key];
    form.segments[key] = { fatKg: formatBodyInput(segment?.fatKg), muscleKg: formatBodyInput(segment?.muscleKg) };
  }
  return form;
}

/** L'appareil réellement enregistré par le formulaire. */
export function deviceOfForm(form: Pick<BodyMeasurementFormValues, "device" | "otherDevice">): string {
  return form.device === "other" ? form.otherDevice.trim() : form.device;
}

type Read = { ok: true; value?: number } | { ok: false; message: string };

/** Lit un nombre facultatif : vide = absent ; virgule ou point ; arrondi au centième. */
function readNumber(raw: string, label: string, spec: { unit: string; min: number; max: number; integer?: boolean }): Read {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return { ok: true };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, message: `${label} : nombre illisible.` };
  const value = Number(text);
  if (spec.integer && !Number.isInteger(value)) return { ok: false, message: `${label} : nombre entier.` };
  const rounded = Math.round(value * 100) / 100;
  if (rounded < spec.min || rounded > spec.max) {
    return { ok: false, message: `${label} : entre ${formatBodyInput(spec.min)} et ${formatBodyInput(spec.max)}${spec.unit ? ` ${spec.unit}` : ""}.` };
  }
  return { ok: true, value: rounded };
}

/** Éligibilité fixée à l'enregistrement : une mesure modifiée la garde, sauf si son appareil change. */
export function weightReferenceForForm(device: string, existing: BodyMeasurement | undefined, referenceDevice: string): boolean {
  return existing && existing.device === device ? existing.weightReference : weightReferenceEligible(device, referenceDevice);
}

export interface BodyFormContext {
  /** Identifiant de la mesure (nouveau, ou celui de la mesure modifiée). */
  id: string;
  now: string;
  /** Jour local courant : jamais de mesure dans le futur. */
  today: string;
  /** L'appareil de référence du moment (réglage) ; seule l'éligibilité d'un nouvel appareil en dépend. */
  referenceDevice: string;
  existing?: BodyMeasurement;
}

export type ParsedBodyMeasurement = { ok: true; measurement: BodyMeasurement } | { ok: false; message: string };

export function parseBodyMeasurementForm(form: BodyMeasurementFormValues, context: BodyFormContext): ParsedBodyMeasurement {
  const fail = (message: string): ParsedBodyMeasurement => ({ ok: false, message });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return fail("Jour : obligatoire.");
  if (form.date > context.today) return fail("Jour : pas de mesure dans le futur.");
  if (!/^\d{2}:\d{2}$/.test(form.time)) return fail("Heure : obligatoire.");
  const device = deviceOfForm(form);
  if (device === "") return fail("Appareil : préciser le nom.");

  if (form.weightKg.trim() === "") return fail("Poids : obligatoire.");
  const values: Partial<Record<BodyFieldKey, number>> = {};
  for (const key of [...MAIN_BODY_FIELDS, ...DETAIL_BODY_FIELDS]) {
    const spec = BODY_FIELD_SPECS[key];
    const read = readNumber(form[key], spec.label, spec);
    if (!read.ok) return fail(read.message);
    if (read.value !== undefined) values[key] = read.value;
  }
  const weightKg = values.weightKg!;
  for (const key of [...MAIN_BODY_FIELDS, ...DETAIL_BODY_FIELDS]) {
    const value = values[key];
    if (BODY_FIELD_SPECS[key].belowWeight && value !== undefined && value > weightKg) return fail(`${BODY_FIELD_SPECS[key].label} : ne peut dépasser le poids.`);
  }

  const segments: Partial<Record<BodySegmentKey, BodySegment>> = {};
  for (const { key, label } of BODY_SEGMENTS) {
    const segment: BodySegment = {};
    for (const [part, name] of [["fatKg", "graisse"], ["muscleKg", "muscle"]] as const) {
      const read = readNumber(form.segments[key][part], `${label} : ${name}`, { unit: "kg", min: 0, max: 100 });
      if (!read.ok) return fail(read.message);
      if (read.value !== undefined && read.value > weightKg) return fail(`${label} : ${name} ne peut dépasser le poids.`);
      if (read.value !== undefined) segment[part] = read.value;
    }
    if (Object.keys(segment).length > 0) segments[key] = segment;
  }

  const takenAt = new Date(`${form.date}T${form.time}:00`);
  if (Number.isNaN(takenAt.getTime())) return fail("Heure : illisible.");

  const { existing } = context;
  const weightReference = weightReferenceForForm(device, existing, context.referenceDevice);

  /* Ce que le formulaire ne montre pas (import, notes) est gardé ; une masse grasse
     en kg stockée n'est gardée que si le poids et le % n'ont pas bougé. */
  const kept: Partial<BodyMeasurement> = {};
  if (existing) {
    for (const key of ["extra", "importRef", "note"] as const) if (existing[key] !== undefined) Object.assign(kept, { [key]: existing[key] });
    if (existing.weightKg === weightKg && existing.fatPct === values.fatPct) {
      if (existing.fatKg !== undefined) kept.fatKg = existing.fatKg;
      if (existing.fatFreeKg !== undefined) kept.fatFreeKg = existing.fatFreeKg;
    }
  }

  return {
    ok: true,
    measurement: {
      id: context.id,
      date: form.date,
      takenAt: takenAt.toISOString(),
      device,
      source: existing?.source ?? "manual",
      weightReference,
      ...values,
      weightKg,
      ...kept,
      ...(Object.keys(segments).length > 0 ? { segments } : {}),
      createdAt: existing?.createdAt ?? context.now,
      updatedAt: context.now,
    },
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Graisse en kg et masse sans graisse : la valeur stockée, sinon le calcul certain à partir du poids et du %. */
export function derivedComposition(measurement: Pick<BodyMeasurement, "weightKg" | "fatPct" | "fatKg" | "fatFreeKg">): { fatKg?: number; fatFreeKg?: number } {
  const fatKg = measurement.fatKg ?? (measurement.fatPct !== undefined ? round2((measurement.weightKg * measurement.fatPct) / 100) : undefined);
  const fatFreeKg = measurement.fatFreeKg ?? (fatKg !== undefined ? round2(measurement.weightKg - fatKg) : undefined);
  return { ...(fatKg !== undefined ? { fatKg } : {}), ...(fatFreeKg !== undefined ? { fatFreeKg } : {}) };
}

/** IMC : la valeur saisie, sinon poids ÷ taille² (taille du profil), au dixième. */
export function bmiOf(measurement: Pick<BodyMeasurement, "weightKg" | "bmi">, heightCm: number | undefined): number | undefined {
  if (measurement.bmi !== undefined) return measurement.bmi;
  if (!heightCm) return undefined;
  return Math.round((measurement.weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

/** La dernière mesure : la plus récente, jamais la copie d'une pesée remplacée. */
export function lastBodyMeasurement(measurements: readonly BodyMeasurement[]): BodyMeasurement | undefined {
  return measurements
    .filter((measurement) => measurement.originWeightEntry === undefined)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt) || b.id.localeCompare(a.id))[0];
}

const DEVICE_LABELS: Record<string, string> = { renpho: "RENPHO", withings: "Withings", unknown: "Appareil inconnu" };

export function bodyDeviceLabel(device: string): string {
  return DEVICE_LABELS[device] ?? device;
}

/** La provenance lisible : « saisie manuelle », « import CSV », « pesée d'origine »… */
export function bodySourceLabel(measurement: Pick<BodyMeasurement, "source" | "originWeightEntry">): string {
  if (measurement.originWeightEntry !== undefined) return "pesée d'origine";
  if (measurement.source === "csv_import") return "import CSV";
  if (measurement.source === "weight_entry") return "reprise d'une pesée";
  return "saisie manuelle";
}

const formatters = new Map<number, Intl.NumberFormat>();

/** Nombre à la française, au plus `decimals` décimales (`25,27`, `1 696`). */
export function formatBodyNumber(value: number, decimals = 2): string {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimals });
    formatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

/** `25,27 kg`, `27,5 %`, `10` (indice sans unité). */
export function formatBodyValue(value: number, unit: string, decimals = 2): string {
  return unit ? `${formatBodyNumber(value, decimals)} ${unit}` : formatBodyNumber(value, decimals);
}
