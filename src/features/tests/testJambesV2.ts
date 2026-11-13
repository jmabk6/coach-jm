import type { GoalDirection, TestMeasureSpec, TestProtocolVersion, TestScheduleEntry } from "../../domain";

/**
 * Test jambes V2 (brief de JM et rapport de conception validé du 13/11/2026,
 * `COFFRE_COACH-JM/2-SPECS/CONCEPTION_TEST_JAMBES_V2_2026-11-13.md`) :
 * l'endurance des jambes (monter des marches sans brûlure, enchaîner les
 * flexions) remplace la puissance sur vélo de la V1. La V1 n'a aucun
 * résultat ; elle est archivée, jamais supprimée.
 *
 * Déroulé (~12 min) : montées sur banc 2 min → récupération 3 min → squats
 * sur chaise → récupération 3 min → chaise contre le mur.
 */

export const JAMBES_PROTOCOL_ID = "protocol-jambes";
export const JAMBES_V2_ID = "protocol-jambes-v2";
/** Activation : dès l'ouverture de l'application (même date que le programme 4+2) ; 1er test le mardi 24/11. */
export const TEST_JAMBES_V2_START = "2026-11-13";

const entered = (key: string, label: string, unit: string, extra: Partial<TestMeasureSpec> = {}): TestMeasureSpec => ({ key, label, unit, input: "entered", required: true, ...extra });

export const TEST_JAMBES_V2: Pick<TestProtocolVersion, "kind" | "instructions" | "settings" | "measures" | "primaryMeasureKey"> = {
  kind: "measures",
  instructions: [
    "Même banc, même chaise et même distance talons-mur à chaque test. Le protocole ne change pas d'un test à l'autre : on compare dans des conditions identiques.",
    "Arrêt immédiat en cas de douleur devant le genou ou en bas du dos. La brûlure dans les cuisses est normale.",
    "1. Montées sur banc : 2 min, banc de 30 cm, 20 montées par minute (métronome à 80 bips/min : 1 bip = 1 pas, 4 pas = 1 montée). Relever la FC à la fin, puis 1 min après ; noter la brûlure des cuisses de 0 à 10 et si la cadence a tenu jusqu'au bout.",
    "Récupération : 3 min.",
    "2. Squats sur chaise : tempo 2 s de descente, 1 s de montée (métronome à 60 bips/min), fesses qui touchent la chaise, sans les bras, 40 répétitions au plus. La série s'arrête à la première pause de plus de 2 s, ou dès que la technique se dégrade.",
    "Récupération : 3 min.",
    "3. Chaise contre le mur : angle confortable, repéré par la distance talons-mur, 120 s au plus.",
  ],
  settings: {
    stepHeightCm: 30,
    stepCadencePerMin: 20,
    stepMetronomeBpm: 80,
    stepDurationSec: 120,
    recoverySec: 180,
    squatTempo: "2-1",
    squatMetronomeBpm: 60,
    squatCapReps: 40,
    chairCapSec: 120,
  },
  measures: [
    entered("step_fc_fin", "FC fin des montées", "bpm", { exerciseId: "montee-banc" }),
    entered("step_fc_1min", "FC 1 min après", "bpm"),
    { key: "step_fc_recup", label: "Récupération cardiaque", unit: "bpm", input: "derived", required: false },
    entered("step_brulure", "Brûlure des cuisses", "/10", { max: 10 }),
    entered("step_cadence_tenue", "Cadence tenue", "", { choices: [{ value: 1, label: "Oui" }, { value: 0, label: "Non" }] }),
    entered("squat_reps", "Squats sur chaise", "reps", { max: 40, exerciseId: "squat-chaise" }),
    entered("chaise_duree_s", "Chaise contre le mur", "s", { max: 120, exerciseId: "chaise-60" }),
    entered("chaise_distance_cm", "Distance talons-mur", "cm", { prefill: "previous" }),
    entered("arret_douleur", "Arrêt sur douleur", "", { required: false, choices: [{ value: 0, label: "Aucun" }, { value: 1, label: "Genou" }, { value: 2, label: "Dos" }] }),
  ],
  primaryMeasureKey: "squat_reps",
};

/** Le mardi de la semaine de tests : le test remplace les efforts et récupérations du Cardio A ; bloc jambes retiré ; retour au calme à 10 min. */
const FRACTIONNE_TEST_STEP_IDS = [1, 2, 3, 4, 5].flatMap((n) => [`v2-cardio-b-effort-${n}`, ...(n < 5 ? [`v2-cardio-b-recup-${n}`] : [])]);
export const LEG_BLOCK_IDS = ["v2-cardio-b-presse-une-jambe", "v5-cardio-a-montee", "v5-cardio-a-chaise", "v2-cardio-b-squat-chaise"] as const;

export const JAMBES_V2_SCHEDULE_ENTRY: TestScheduleEntry = {
  protocolKey: "jambes",
  weekday: "tuesday",
  slot: "day",
  templateId: "v2-cardio-b",
  placement: "replace_block",
  targetBlockId: "v2-cardio-b-tapis",
  targetStepIds: FRACTIONNE_TEST_STEP_IDS,
  adjustments: [...LEG_BLOCK_IDS.map((blockId) => ({ blockId, remove: true as const })), { blockId: "v2-cardio-b-tapis", stepDurationsSec: { "v2-cardio-b-retour": 600 } }],
};

/** Mesures proposées pour la courbe de l'objectif Jambes. */
export const LEGS_MEASURES_V2: ReadonlyArray<{ measureKey: string; direction: GoalDirection }> = [
  { measureKey: "squat_reps", direction: "increase" },
  { measureKey: "chaise_duree_s", direction: "increase" },
  { measureKey: "step_fc_fin", direction: "decrease" },
];
