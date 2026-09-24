import { db } from "../../db/database";
import { seedExerciseCatalog } from "../exercises/seedExerciseCatalog";
import { seedProgramV1, seedRoutines } from "../program/seedProgramV1";
import { seedCardioASingleBlock } from "../program/seedCardioASingleBlock";
import { seedFixWorkout20260924, seedRemoveSkipped20260924 } from "../workout/seedFixWorkout20260924";
import { seedProgramFrames } from "../strength/seedProgramFrames";
import { seedRpeScale } from "../strength/seedRpeScale";
import { seedGoals } from "../goals/seedGoals";
import { seedTestProtocols } from "../tests/seedTestProtocols";
import { seedSettingsDefaults } from "./seedSettingsDefaults";

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
  /* Seed 9 (24/09/2026) : Cardio A en un seul bloc, le test sur le palier principal. */
  { name: "cardioASingleBlock", dependsOn: ["programV1", "testProtocols"], run: () => seedCardioASingleBlock() },
  /* Seed 10 : la Cardio A du 24/09, enregistrée avec deux blocs validés à vide. */
  { name: "fixWorkout20260924", run: () => seedFixWorkout20260924() },
  /* Seed 11 : « Retirer ce bloc » supprime ; les blocs sautés de cette séance aussi. */
  { name: "removeSkipped20260924", run: () => seedRemoveSkipped20260924() },
];

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
