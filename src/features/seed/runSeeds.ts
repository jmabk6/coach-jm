import { db } from "../../db/database";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { seedProgramV1, seedRoutines, seedRoutinesContent } from "../program/seedProgramV1";
import { seedCardioASingleBlock } from "../program/seedCardioASingleBlock";
import { seedFixWorkout20260924, seedRemoveSkipped20260924 } from "../workout/seedFixWorkout20260924";
import { seedWorkout20260925 } from "../history/seedWorkout20260925";
import { seedLegCurlCouche20260927 } from "../history/seedLegCurlCouche20260927";
import { seedProgramFrames } from "../strength/seedProgramFrames";
import { seedRpeScale } from "../strength/seedRpeScale";
import { seedFrameTargets20260925, seedTractionIncrement20261003, seedTractionTarget20261003 } from "../strength/seedFrameTargets20260925";
import { seedChair90 } from "../exercises/seedChair90";
import { seedTestsWeek20260927 } from "../program/seedTestsWeek20260927";
import { seedRemoveOldMuscuA } from "../sessions/seedRemoveOldMuscuA";
import { seedArchiveProgramV1, seedProgramV2 } from "../program/seedProgramV2";
import { seedTractionPriority20261003 } from "../program/seedTractionPriority";
import { seedTractionV620261004 } from "../program/seedTractionV6";
import { seedTractionTest7kg20261003 } from "../tests/seedTractionTest7kg";
import { seedTractionTestV320261005 } from "../tests/seedTractionTestV3";
import { seedGoals } from "../goals/seedGoals";
import { seedTestProtocols } from "../tests/seedTestProtocols";
import { seedSettingsDefaults, seedThemeLight } from "./seedSettingsDefaults";

/**
 * Seeds du lancement (SCHEMA_DEXIE_V3_MIGRATION.md § 5) : exécutés après
 * une ouverture réussie, séquentiellement, dans l'ordre du § 5.2 —
 * `settingsDefaults` avant tout, pour que les suivants trouvent
 * l'enregistrement `install` où poser leur marqueur. Chaque seed est une
 * transaction : ses données et son marqueur sont écrits ensemble ou pas
 * du tout. Un seed qui lève est journalisé, ceux qui en dépendent ne
 * s'exécutent pas, et l'application démarre quand même ; il sera retenté
 * au lancement suivant.
 *
 * Le seed 8 (objectifs, lot H) vient en dernier : il lit exercices et protocoles.
 */

export interface SeedStep {
  name: string;
  dependsOn?: string[];
  run: () => Promise<void>;
}

export const SEEDS: SeedStep[] = [
  { name: "settingsDefaults", run: () => seedSettingsDefaults() },
  { name: "exerciseCatalog", run: () => db.transaction("rw", db.exercises, () => seedExerciseCatalog()) },
  { name: "rpeScale", run: () => db.transaction("rw", db.rpeScaleVersions, () => seedRpeScale()) },
  { name: "testProtocols", dependsOn: ["exerciseCatalog"], run: () => seedTestProtocols() },
  { name: "programV1", dependsOn: ["exerciseCatalog"], run: () => seedProgramV1() },
  { name: "routines", run: () => seedRoutines() },
  { name: "frames", dependsOn: ["exerciseCatalog", "programV1"], run: () => seedProgramFrames() },
  { name: "goals", dependsOn: ["exerciseCatalog", "testProtocols"], run: () => seedGoals() },
  /* Seed 13 (lot K.1) : le contenu des routines du soir, les exercices liés de Tronc et Souplesse. */
  { name: "routinesContent", dependsOn: ["exerciseCatalog", "routines", "goals"], run: () => seedRoutinesContent() },
  /* Seed 9 (24/09/2026) : Cardio A en un seul bloc, le test sur le palier principal. */
  { name: "cardioASingleBlock", dependsOn: ["programV1", "testProtocols"], run: () => seedCardioASingleBlock() },
  /* Seed 10 : la Cardio A du 24/09, enregistrée avec deux blocs validés à vide. */
  { name: "fixWorkout20260924", run: () => seedFixWorkout20260924() },
  /* Seed 11 : « Retirer ce bloc » supprime ; les blocs sautés de cette séance aussi. */
  { name: "removeSkipped20260924", run: () => seedRemoveSkipped20260924() },
  /* Seed 12 : la séance du 25/09, que l'utilisateur n'a pas pu saisir. */
  { name: "addWorkout20260925", dependsOn: ["exerciseCatalog"], run: () => seedWorkout20260925() },
  /* Seed 14 : thème Clair par défaut. */
  { name: "themeLight", dependsOn: ["settingsDefaults"], run: () => seedThemeLight() },
  /* Seed 15 : premières cibles de trois cadres de Muscu B, d'après la séance du 25/09. */
  { name: "frameTargets20260925", dependsOn: ["frames"], run: () => seedFrameTargets20260925() },
  /* Seed 16 : la chaise contre le mur à 90° (nom, technique, test Jambes, Muscu C). */
  { name: "chair90", dependsOn: ["exerciseCatalog", "testProtocols", "programV1"], run: () => seedChair90() },
  /* Seed 17 : les tests de la semaine du 27/09 sur les séances de journée générées avant le lot G. */
  { name: "testsWeek20260927", dependsOn: ["testProtocols", "programV1"], run: () => seedTestsWeek20260927() },
  /* Seed 18 : l'ancien modèle « Muscu A » du 17/09, jamais utilisé, supprimé. */
  { name: "removeOldMuscuA", run: () => seedRemoveOldMuscuA() },
  /* Seed 21 (27/09/2026) : le leg curl couché et la durée de la Muscu A du 27/09. */
  { name: "legCurlCouche20260927", dependsOn: ["exerciseCatalog"], run: () => seedLegCurlCouche20260927() },
  /* Seed 19 : le programme V2, à partir du 04/10/2026 (la semaine de tests reste en V1). */
  { name: "programV2", dependsOn: ["exerciseCatalog", "programV1", "frames", "goals", "testProtocols"], run: () => seedProgramV2() },
  /* Seed 20 : les modèles V1 archivés, pas avant le 04/10. */
  { name: "archiveProgramV1", dependsOn: ["programV2"], run: () => seedArchiveProgramV1() },
  /* Seed 22 (03/10/2026) : la traction assistée recalée à 42 kg d'aide. */
  { name: "tractionTarget20261003", dependsOn: ["frames"], run: () => seedTractionTarget20261003() },
  /* Seed 23 (03/10/2026) : le cran de 7 kg de la machine de traction. */
  { name: "tractionIncrement20261003", dependsOn: ["frames"], run: () => seedTractionIncrement20261003() },
  /* Seed 24 (03/10/2026) : traction légère en premier en Muscu B, suspension en Muscu C. */
  { name: "tractionPriority20261003", dependsOn: ["programV2"], run: () => seedTractionPriority20261003() },
  /* Seed 25 (03/10/2026) : le test traction par paliers de 7 kg (version 2). */
  { name: "tractionTest7kg20261003", dependsOn: ["testProtocols"], run: () => seedTractionTest7kg20261003() },
  /* Seed 26 (04/10/2026) : pari traction V6 — Muscu A, Muscu B et le cadre de la traction. */
  { name: "tractionV620261004", dependsOn: ["programV2", "tractionIncrement20261003"], run: () => seedTractionV620261004() },
  /* Seed 27 (05/10/2026) : test traction V3 — départ au palier A réel, remplace la traction de Muscu A. */
  { name: "tractionTestV320261005", dependsOn: ["testProtocols", "programV2", "tractionTest7kg20261003"], run: () => seedTractionTestV320261005() },
];

/**
 * Pour les tests qui figent l'état d'avant le programme V2 (modèles,
 * cadres et objectifs V1) : tous les seeds sauf 19 et 20.
 */
export const SEEDS_BEFORE_PROGRAM_V2: SeedStep[] = SEEDS.filter((seed) => !["programV2", "archiveProgramV1", "tractionPriority20261003", "tractionV620261004", "tractionTestV320261005"].includes(seed.name));

export interface SeedReport {
  ran: string[];
  failed: string[];
  skipped: string[];
  suspended: boolean;
}

/* Drapeau en mémoire (§ 7.4, étape 3) : entre l'effacement de la base et
   le rechargement qui suit une restauration, aucun seed ne doit écrire
   dans la base vide. Le rechargement le remet à zéro. */
let suspended = false;

export function suspendSeeds(): void {
  suspended = true;
}

export function seedsSuspended(): boolean {
  return suspended;
}

/** Réservé aux tests : lève la suspension sans recharger. */
export function resumeSeedsForTests(): void {
  suspended = false;
}

export async function runSeeds(steps: SeedStep[] = SEEDS): Promise<SeedReport> {
  const report: SeedReport = { ran: [], failed: [], skipped: [], suspended };
  if (suspended) return report;

  for (const step of steps) {
    const blockedBy = (step.dependsOn ?? []).find((name) => report.failed.includes(name) || report.skipped.includes(name));
    if (blockedBy !== undefined) {
      report.skipped.push(step.name);
      continue;
    }

    try {
      await step.run();
      report.ran.push(step.name);
    } catch (error) {
      console.error(`[coach-jm] le seed « ${step.name} » a échoué ; il sera retenté au prochain lancement`, error);
      report.failed.push(step.name);
    }
  }

  return report;
}
