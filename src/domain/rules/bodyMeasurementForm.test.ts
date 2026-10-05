import { describe, expect, it } from "vitest";
import type { BodyMeasurement } from "../models";
import {
  bmiOf,
  bodyDeviceLabel,
  derivedComposition,
  emptyBodyMeasurementForm,
  formOfBodyMeasurement,
  lastBodyMeasurement,
  parseBodyMeasurementForm,
  type BodyMeasurementFormValues,
} from "./bodyMeasurementForm";

/**
 * Corps, phase 2 : le formulaire de mesure corporelle (RENPHO par défaut).
 * La masse grasse en kg et la masse sans graisse se calculent avec
 * certitude (poids × % ; poids − graisse) : jamais demandées. L'IMC se
 * calcule si la taille du profil est connue.
 */

process.env.TZ = "Europe/Paris";

const NOW = "2026-10-05T07:00:00.000Z";
const CTX = { id: "m1", now: NOW, today: "2026-10-05", referenceDevice: "renpho" };

/** La mesure du 05/10, telle que l'écran RENPHO l'affiche. */
function form0510(): BodyMeasurementFormValues {
  return {
    ...emptyBodyMeasurementForm("2026-10-05", "06:50"),
    weightKg: "91,90",
    fatPct: "27,5",
    muscleKg: "62,12",
    skeletalMuscleKg: "38,06",
    bmi: "29,3",
    waterKg: "48,80",
    proteinKg: "13,33",
    boneKg: "4,50",
    visceralFat: "10",
    bmrKcal: "1696",
    metabolicAge: "60",
    score: "73",
  };
}

describe("formulaire de mesure corporelle", () => {
  it("formulaire vide : RENPHO par défaut, date et heure du moment, aucun champ rempli", () => {
    const empty = emptyBodyMeasurementForm("2026-10-05", "06:50");
    expect(empty).toMatchObject({ date: "2026-10-05", time: "06:50", device: "renpho", weightKg: "", fatPct: "" });
  });

  it("la mesure du 05/10 : valeurs lues à la virgule, provenance manuelle, éligible (RENPHO = appareil de référence), heure locale", () => {
    const parsed = parseBodyMeasurementForm(form0510(), CTX);
    expect(parsed).toEqual({
      ok: true,
      measurement: {
        id: "m1",
        date: "2026-10-05",
        takenAt: "2026-10-05T04:50:00.000Z",
        device: "renpho",
        source: "manual",
        weightReference: true,
        weightKg: 91.9,
        fatPct: 27.5,
        muscleKg: 62.12,
        skeletalMuscleKg: 38.06,
        bmi: 29.3,
        waterKg: 48.8,
        proteinKg: 13.33,
        boneKg: 4.5,
        visceralFat: 10,
        bmrKcal: 1696,
        metabolicAge: 60,
        score: 73,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  });

  it("calculs certains : graisse 25,27 kg et masse sans graisse 66,63 kg ; une valeur stockée (import) l'emporte", () => {
    expect(derivedComposition({ weightKg: 91.9, fatPct: 27.5 })).toEqual({ fatKg: 25.27, fatFreeKg: 66.63 });
    expect(derivedComposition({ weightKg: 91.9 })).toEqual({});
    expect(derivedComposition({ weightKg: 91.9, fatPct: 27.5, fatKg: 25.3, fatFreeKg: 66.6 })).toEqual({ fatKg: 25.3, fatFreeKg: 66.6 });
  });

  it("IMC : saisi d'abord ; sinon calculé avec la taille du profil ; sinon inconnu", () => {
    expect(bmiOf({ weightKg: 91.9, bmi: 29.4 }, 177)).toBe(29.4);
    expect(bmiOf({ weightKg: 91.9 }, 177)).toBe(29.3);
    expect(bmiOf({ weightKg: 91.9 }, undefined)).toBeUndefined();
  });

  it("seul le poids est obligatoire ; champ vide = absent", () => {
    const parsed = parseBodyMeasurementForm({ ...emptyBodyMeasurementForm("2026-10-05", "07:00"), weightKg: "92" }, CTX);
    expect(parsed.ok && Object.keys(parsed.measurement).sort()).toEqual(
      ["createdAt", "date", "device", "id", "source", "takenAt", "updatedAt", "weightKg", "weightReference"],
    );
  });

  it("refus en français : poids absent, hors bornes, jour futur, heure absente, appareil vide", () => {
    const base = form0510();
    expect(parseBodyMeasurementForm({ ...base, weightKg: "" }, CTX)).toEqual({ ok: false, message: "Poids : obligatoire." });
    expect(parseBodyMeasurementForm({ ...base, weightKg: "12" }, CTX)).toEqual({ ok: false, message: "Poids : entre 20 et 300 kg." });
    expect(parseBodyMeasurementForm({ ...base, fatPct: "80" }, CTX)).toEqual({ ok: false, message: "Masse grasse : entre 3 et 75 %." });
    expect(parseBodyMeasurementForm({ ...base, muscleKg: "beaucoup" }, CTX)).toEqual({ ok: false, message: "Masse musculaire : nombre illisible." });
    expect(parseBodyMeasurementForm({ ...base, skeletalMuscleKg: "95" }, CTX)).toEqual({ ok: false, message: "Muscle squelettique : ne peut dépasser le poids." });
    expect(parseBodyMeasurementForm({ ...base, date: "2026-10-06" }, CTX)).toEqual({ ok: false, message: "Jour : pas de mesure dans le futur." });
    expect(parseBodyMeasurementForm({ ...base, time: "" }, CTX)).toEqual({ ok: false, message: "Heure : obligatoire." });
    expect(parseBodyMeasurementForm({ ...base, device: "other", otherDevice: " " }, CTX)).toEqual({ ok: false, message: "Appareil : préciser le nom." });
  });

  it("segments : seuls les segments renseignés sont gardés", () => {
    const values = form0510();
    values.segments.leftArm = { fatKg: "1,6", muscleKg: "3,4" };
    values.segments.trunk = { fatKg: "", muscleKg: "29" };
    const parsed = parseBodyMeasurementForm(values, CTX);
    expect(parsed.ok && parsed.measurement.segments).toEqual({ leftArm: { fatKg: 1.6, muscleKg: 3.4 }, trunk: { muscleKg: 29 } });
  });

  it("appareil : un autre appareil n'est pas éligible ; le réglage d'appareil de référence décide, jamais le code", () => {
    const withings = parseBodyMeasurementForm({ ...form0510(), device: "withings" }, CTX);
    expect(withings.ok && withings.measurement).toMatchObject({ device: "withings", weightReference: false });
    const other = parseBodyMeasurementForm({ ...form0510(), device: "other", otherDevice: "Tanita BC-545" }, CTX);
    expect(other.ok && other.measurement).toMatchObject({ device: "Tanita BC-545", weightReference: false });
    const switched = parseBodyMeasurementForm({ ...form0510(), device: "other", otherDevice: "Tanita BC-545" }, { ...CTX, referenceDevice: "Tanita BC-545" });
    expect(switched.ok && switched.measurement.weightReference).toBe(true);
  });

  it("modification : la création, la provenance et l'éligibilité stockée restent si l'appareil ne change pas ; l'éligibilité se recalcule s'il change", () => {
    const existing: BodyMeasurement = {
      id: "m1", date: "2026-10-05", takenAt: "2026-10-05T04:50:00.000Z", device: "renpho", source: "csv_import", weightReference: true,
      weightKg: 91.9, fatPct: 27.5, importRef: "renpho.csv#3", extra: { "Graisse sous-cutanée (%)": 23.4 }, createdAt: "2026-10-05T05:00:00.000Z", updatedAt: "2026-10-05T05:00:00.000Z",
    };
    const form = formOfBodyMeasurement(existing);
    expect(form).toMatchObject({ date: "2026-10-05", time: "06:50", device: "renpho", weightKg: "91,9", fatPct: "27,5" });

    /* Le réglage a changé depuis : la mesure garde son éligibilité, fixée à l'enregistrement. */
    const kept = parseBodyMeasurementForm({ ...form, weightKg: "91,8" }, { ...CTX, referenceDevice: "withings", existing });
    expect(kept.ok && kept.measurement).toMatchObject({
      weightReference: true, source: "csv_import", importRef: "renpho.csv#3", extra: { "Graisse sous-cutanée (%)": 23.4 }, createdAt: "2026-10-05T05:00:00.000Z", updatedAt: NOW, weightKg: 91.8,
    });

    const moved = parseBodyMeasurementForm({ ...form, device: "withings" }, { ...CTX, existing });
    expect(moved.ok && moved.measurement.weightReference).toBe(false);
  });

  it("dernière mesure : la plus récente, jamais une copie de pesée remplacée ; appareil lisible", () => {
    const at = (id: string, takenAt: string, extra: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
      id, date: takenAt.slice(0, 10), takenAt, device: "renpho", source: "manual", weightReference: true, weightKg: 92, createdAt: NOW, updatedAt: NOW, ...extra,
    });
    const copy = at("copie", "2026-10-05T09:00:00.000Z", { device: "withings", source: "weight_entry", weightReference: false, originWeightEntry: { id: "w", date: "2026-10-05", kg: 91.6, createdAt: NOW, updatedAt: NOW } });
    expect(lastBodyMeasurement([at("a", "2026-10-05T04:50:00.000Z"), copy, at("b", "2026-10-04T05:00:00.000Z")])?.id).toBe("a");
    expect(lastBodyMeasurement([copy])).toBeUndefined();
    expect(bodyDeviceLabel("renpho")).toBe("RENPHO");
    expect(bodyDeviceLabel("withings")).toBe("Withings");
    expect(bodyDeviceLabel("unknown")).toBe("Appareil inconnu");
    expect(bodyDeviceLabel("Tanita BC-545")).toBe("Tanita BC-545");
  });
});
