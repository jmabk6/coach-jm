import type { TestMeasureSpec, TestProtocol, TestProtocolVersion } from "../../domain";

/**
 * Protocoles V1 (conception V2 § 3.7.4, seed 4 du lot G). Une version 1
 * par protocole ; `traction_stricte` est installé en pause (segment S2 de
 * Traction, correction A). Les consignes reprennent la conception ; celles
 * de la souplesse suivent les quatre paramètres de la v1.6 § 6.2 (état,
 * position, méthode, consigne d'arrêt).
 */

export interface TestProtocolContent {
  key: string;
  name: string;
  status: TestProtocol["status"];
  version: Pick<TestProtocolVersion, "kind" | "instructions" | "measures"> &
    Partial<Pick<TestProtocolVersion, "settings" | "primaryMeasureKey">>;
}

export function testProtocolId(key: string): string {
  return `protocol-${key}`;
}

export function testProtocolVersionId(key: string, number: number): string {
  return `protocol-${key}-v${number}`;
}

const entered = (key: string, label: string, unit: string, extra: Partial<TestMeasureSpec> = {}): TestMeasureSpec => ({
  key, label, unit, input: "entered", required: true, ...extra,
});

const derived = (key: string, label: string, unit: string, extra: Partial<TestMeasureSpec> = {}): TestMeasureSpec => ({
  key, label, unit, input: "derived", required: true, ...extra,
});

const optional = { required: false } as const;

/** Unité des sprints : celle de la version, fixée au premier test (D17). */
export const SPRINT_UNIT_SETTING = "unit";

export const TEST_PROTOCOLS_V1: TestProtocolContent[] = [
  {
    key: "traction",
    name: "Traction assistée",
    status: "active",
    version: {
      kind: "trials_descending",
      instructions: [
        "Échauffement : 2 séries faciles à environ 55 kg d'aide, non enregistrées.",
        "Premier essai à 40 kg d'assistance.",
        "Puis 2 à 3 kg d'aide en moins à chaque essai.",
        "3 min de repos entre deux essais.",
        "Jusqu'au premier échec.",
        "Toujours la même machine.",
      ],
      settings: { warmupAssistKg: 55, warmupSets: 2, firstTrialKg: 40, stepMinKg: 2, stepMaxKg: 3, restSec: 180 },
      measures: [
        derived("assistance_min_kg", "Assistance minimale", "kg", { exerciseId: "traction-assistee" }),
        derived("essais_nb", "Nombre d'essais", "essais", optional),
      ],
      primaryMeasureKey: "assistance_min_kg",
    },
  },
  {
    key: "traction_stricte",
    name: "Traction stricte",
    status: "paused",
    version: {
      kind: "single_attempt",
      instructions: ["À la barre, sans aide.", "Amplitude complète : bras tendus en bas, menton au-dessus de la barre en haut."],
      measures: [entered("tractions_barre", "Tractions à la barre", "reps")],
      primaryMeasureKey: "tractions_barre",
    },
  },
  {
    key: "cardio",
    name: "Cardio",
    status: "active",
    version: {
      kind: "measures",
      instructions: [
        "20 min de tapis à 5 km/h, pente 8 %.",
        "Relever la fréquence cardiaque à la fin de chaque minute, de la 16e à la 20e.",
        "Les relevés à 5, 10 et 15 min, la FC max, la récupération à 1 min et le RPE final sont facultatifs.",
      ],
      settings: { durationMin: 20, speedKmh: 5, inclinePercent: 8 },
      measures: [
        ...[16, 17, 18, 19, 20].map((minute) => entered(`fc_${minute}`, `FC à ${minute} min`, "bpm", { exerciseId: "tapis" })),
        derived("fc_moy_16_20", "FC moyenne 16-20 min", "bpm"),
        ...[5, 10, 15].map((minute) => entered(`fc_${minute}`, `FC à ${minute} min`, "bpm", optional)),
        entered("fc_max", "FC max", "bpm", optional),
        entered("fc_recup_1min", "FC après 1 min de récupération", "bpm", optional),
        entered("rpe_final", "RPE final", "RPE", optional),
      ],
      primaryMeasureKey: "fc_moy_16_20",
    },
  },
  {
    key: "jambes",
    name: "Jambes",
    status: "active",
    version: {
      kind: "measures",
      instructions: [
        "6 sprints de 12 s sur le vélo, 48 s de récupération entre deux.",
        "Même vélo, même résistance à chaque test.",
        "Puis la chaise contre le mur à 60°, durée maximale.",
      ],
      /* `unit` (watts ou mètres) n'est pas fixée : elle l'est au premier test (D17). */
      settings: { sprintCount: 6, sprintSec: 12, recoverySec: 48, chairAngleDeg: 60 },
      measures: [
        ...[1, 2, 3, 4, 5, 6].map((index) => entered(`sprint_${index}`, `Sprint ${index}`, "", { exerciseId: "sprint-velo" })),
        derived("sprint_puissance_moy", "Moyenne des sprints", ""),
        derived("sprint_baisse_pct", "Baisse du 1er au 6e sprint", "%"),
        entered("chaise_duree_s", "Chaise contre le mur", "s", { exerciseId: "chaise-60" }),
        entered("resistance", "Résistance du vélo", "niveau"),
      ],
    },
  },
  {
    key: "souplesse",
    name: "Souplesse",
    status: "active",
    version: {
      kind: "measures",
      instructions: [
        "État : à froid, avant tout échauffement.",
        "Position et méthode : toujours les mêmes, au mètre ruban.",
        "Doigts-sol : jambes tendues, 0 = contact ; positif = au-dessus du sol, négatif = au-delà.",
        "Mains dans le dos (Apley) : écart entre les doigts, côté gauche et côté droit.",
        "Papillon : distance genou-sol.",
        "Consigne d'arrêt : à la première tension franche, sans à-coup.",
      ],
      measures: [
        entered("doigts_sol_cm", "Doigts-sol", "cm", { signed: true, exerciseId: "test-doigts-sol" }),
        entered("apley_cm", "Mains dans le dos", "cm", { side: true, exerciseId: "test-apley" }),
        entered("papillon_cm", "Papillon", "cm", { exerciseId: "test-papillon" }),
      ],
      primaryMeasureKey: "doigts_sol_cm",
    },
  },
  {
    key: "mensurations",
    name: "Mensurations",
    status: "active",
    version: {
      kind: "measures",
      instructions: ["Le matin, avant le petit-déjeuner.", "Toujours le même mètre ruban."],
      measures: [
        entered("epaules_cm", "Tour d'épaules", "cm"),
        entered("taille_cm", "Tour de taille", "cm"),
        derived("ratio_epaules_taille", "Rapport épaules / taille", ""),
      ],
      primaryMeasureKey: "ratio_epaules_taille",
    },
  },
  {
    key: "tronc",
    name: "Tronc",
    status: "active",
    version: {
      kind: "single_attempt",
      instructions: [
        "Planche sur les avant-bras, un seul essai.",
        "Durée maximale en bonne forme.",
        "Arrêt dès que le bassin descend ou monte franchement.",
      ],
      measures: [entered("planche_duree_s", "Planche", "s", { exerciseId: "planche" })],
      primaryMeasureKey: "planche_duree_s",
    },
  },
];
