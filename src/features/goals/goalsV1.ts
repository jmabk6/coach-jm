import type { Goal, GoalSecondaryIndicator, GoalSegment } from "../../domain";
import { testProtocolId } from "../tests/testProtocolsV1";

/**
 * Les 7 objectifs installés d'office (conception V2 § 2.2, § 3.6.2, seed 8
 * du lot H). **Aucune valeur inventée** : seules Traction S1 (0 kg au
 * 31/03/2027, correction A, N1) et Poids (75 kg au 31/03/2027, D9) ont une
 * cible et une échéance ; toutes les autres sont vides, statut « — ».
 * Jambes n'a pas encore de mesure : elle se choisit après 2 tests.
 */

export type GoalContent = Omit<Goal, "createdAt" | "updatedAt">;

export function goalId(key: Goal["key"]): string {
  return `goal-${key}`;
}

const test = (protocolKey: string, measureKey: string) =>
  ({ source: "test", protocolId: testProtocolId(protocolKey), measureKey }) as const;

const exercise = (exerciseId: string, metric: Extract<GoalSecondaryIndicator, { kind: "exercise" }>["metric"]): GoalSecondaryIndicator => ({
  kind: "exercise",
  exerciseId,
  metric,
});

const measure = (protocolKey: string, measureKey: string): GoalSecondaryIndicator => ({
  kind: "test_measure",
  protocolId: testProtocolId(protocolKey),
  measureKey,
});

const linked = (...ids: string[]) => ids.map((exerciseId) => ({ exerciseId }));

function single(key: Goal["key"], segment: Omit<GoalSegment, "id" | "role">): { segments: GoalSegment[]; currentSegmentId: string } {
  const id = `${goalId(key)}-s1`;
  return { segments: [{ id, role: "final", ...segment }], currentSegmentId: id };
}

const UPPER_BODY = ["chest-press", "developpe-epaules-machine", "developpe-incline-halteres", "elevations-laterales-halteres", "rowing-poulie-basse", "tirage-vertical", "extension-triceps-poulie"];

export const GOALS_V1: GoalContent[] = [
  {
    id: goalId("traction"),
    key: "traction",
    position: 0,
    title: "Traction",
    icon: "biceps-flexed",
    segments: [
      {
        id: "goal-traction-s1",
        role: "intermediate",
        measure: test("traction", "assistance_min_kg"),
        direction: "decrease",
        target: 0,
        dueDate: "2027-03-31",
        label: "Assistance minimale",
      },
      {
        id: "goal-traction-s2",
        role: "final",
        measure: test("traction_stricte", "tractions_barre"),
        direction: "increase",
        target: 1,
        /* N1 : échéance saisie à l'activation de S2. */
        label: "Traction stricte",
      },
    ],
    currentSegmentId: "goal-traction-s1",
    linkedExercises: linked("traction-assistee", "traction-negative", "tirage-vertical", "rowing-poulie-basse", "pullover-poulie", "suspension-omoplates"),
    secondaryIndicators: [
      exercise("traction-negative", "reps"),
      exercise("traction-negative", "durationMax"),
      exercise("tirage-vertical", "chargeMax"),
      exercise("rowing-poulie-basse", "chargeMax"),
      exercise("suspension-omoplates", "durationMax"),
    ],
    adviceKey: "traction",
  },
  {
    id: goalId("upper_body"),
    key: "upper_body",
    position: 1,
    title: "Haut du corps",
    icon: "shirt",
    ...single("upper_body", { measure: test("mensurations", "ratio_epaules_taille"), direction: "increase", label: "Rapport épaules / taille" }),
    linkedExercises: linked(...UPPER_BODY),
    secondaryIndicators: UPPER_BODY.map((id) => exercise(id, "chargeMax")),
    adviceKey: "upper_body",
  },
  {
    id: goalId("legs"),
    key: "legs",
    position: 2,
    title: "Jambes",
    icon: "footprints",
    /* Mesure à choisir après 2 tests (§ 2.2) : absente, statut « — ». */
    ...single("legs", { label: "Indicateur à choisir" }),
    linkedExercises: linked("squat", "presse-cuisses", "leg-curl-assis", "montee-banc", "chaise-60", "marche-laterale-elastique", "mollets-debout", "sprint-velo"),
    secondaryIndicators: [
      measure("jambes", "sprint_puissance_moy"),
      measure("jambes", "sprint_baisse_pct"),
      measure("jambes", "chaise_duree_s"),
      exercise("squat", "chargeMax"),
      exercise("presse-cuisses", "chargeMax"),
      exercise("leg-curl-assis", "chargeMax"),
      exercise("mollets-debout", "chargeMax"),
    ],
    adviceKey: "legs",
  },
  {
    id: goalId("cardio"),
    key: "cardio",
    position: 3,
    title: "Cardio",
    icon: "heart-pulse",
    ...single("cardio", { measure: test("cardio", "fc_moy_16_20"), direction: "decrease", label: "FC moyenne 16-20 min" }),
    linkedExercises: linked("tapis", "velo"),
    secondaryIndicators: [measure("cardio", "fc_max"), measure("cardio", "fc_recup_1min"), measure("cardio", "rpe_final")],
    adviceKey: "cardio",
  },
  {
    id: goalId("core"),
    key: "core",
    position: 4,
    title: "Tronc",
    icon: "shield",
    ...single("core", { measure: test("tronc", "planche_duree_s"), direction: "increase", label: "Planche" }),
    /* Correction B : exercices des routines du soir, à définir. */
    linkedExercises: [],
    secondaryIndicators: [],
    adviceKey: "core",
  },
  {
    id: goalId("flexibility"),
    key: "flexibility",
    position: 5,
    title: "Souplesse",
    icon: "move-vertical",
    ...single("flexibility", { measure: test("souplesse", "doigts_sol_cm"), direction: "decrease", label: "Doigts-sol" }),
    linkedExercises: [],
    secondaryIndicators: [measure("souplesse", "apley_cm"), measure("souplesse", "papillon_cm")],
    adviceKey: "flexibility",
  },
  {
    id: goalId("weight"),
    key: "weight",
    position: 6,
    title: "Poids",
    icon: "scale",
    ...single("weight", { measure: { source: "weight_weekly_average" }, direction: "decrease", target: 75, dueDate: "2027-03-31", label: "Moyenne de la semaine" }),
    linkedExercises: [],
    secondaryIndicators: [],
    adviceKey: "weight",
  },
];
