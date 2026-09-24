import Dexie, { type Transaction } from "dexie";
import { CoachJmDatabase, REMOVED_IN_V3, STORE_NAMES, VERSION_2_STORES, guardV3Migration, MigrationGuardError } from "../db/database";
import { rpeScaleV1 } from "../domain/rules/strengthRules";
import { canonicalStringify } from "../features/backup/canonicalJson";
import { readBackup, serializeBackup } from "../features/backup/exportBackup";
import { parseBackup, replaceWith } from "../features/backup/restoreBackup";
import { CoachJmDatabaseV2, writePrototypeOf } from "../features/backup/testDatabase";
import { exerciseCatalog } from "../features/exercises/exerciseCatalog";
import { buildImportedWorkouts } from "../features/history/importedWorkouts";

/**
 * Page de recette C.8 (SCHEMA_DEXIE_V3_MIGRATION.md § 3.3 et § 9) :
 * rejoue dans le navigateur réel — Safari iOS en particulier — E2, E4,
 * T-3, T-4a, T-5, T-7 et le remplacement atomique de C.7 bis. Données
 * fictives uniquement, dans des bases `coach-jm-recette-*` : la base
 * `coach-jm` n'est jamais ouverte. Servie par le serveur de
 * développement et par le build `--mode tunnel`, jamais par la
 * production.
 */

const PREFIX = "coach-jm-recette-";
const KEPT_STORES = Object.keys(VERSION_2_STORES).filter((name) => !REMOVED_IN_V3.includes(name));
const V2_STORES = Object.keys(VERSION_2_STORES);
let counter = 0;

class CaseFailure extends Error {}

function check(condition: boolean, message: string): void {
  if (!condition) throw new CaseFailure(message);
}

function newName(label: string): string {
  counter += 1;
  return `${PREFIX}${label}-${Date.now()}-${counter}`;
}

const frame = { id: "frame-tv", exerciseId: "tirage-vertical", activeVersionId: "frame-tv-v1", createdAt: "2026-09-22T10:12:04.435Z", updatedAt: "2026-09-22T10:12:04.435Z" };
const frameVersion = {
  id: "frame-tv-v1",
  frameId: "frame-tv",
  number: 1,
  status: "active" as const,
  progressionType: "charge_croissante" as const,
  workSets: 3,
  repRange: { min: 10, max: 12 },
  rpeTarget: 8,
  restSec: 90,
  increment: { unit: "kg" as const, value: 2.5 },
  currentTarget: { value: 40, unit: "kg" as const, acceptedAt: "2026-09-22T10:12:04.435Z" },
  createdAt: "2026-09-22T10:12:04.435Z",
  updatedAt: "2026-09-22T10:12:04.435Z",
};

async function createV2(label: string, extra?: (database: CoachJmDatabaseV2) => Promise<void>): Promise<string> {
  const name = newName(label);
  const legacy = new CoachJmDatabaseV2(name);
  await legacy.open();
  await legacy.exercises.bulkAdd(exerciseCatalog);
  await legacy.workouts.bulkAdd(buildImportedWorkouts());
  await legacy.rpeScaleVersions.add(rpeScaleV1("2026-09-22", "2026-09-22T10:05:03.053Z"));
  await legacy.strengthFrames.add(frame);
  await legacy.strengthFrameVersions.add(frameVersion);
  await legacy.weightEntries.add({ id: "p1", date: "2026-09-21", kg: 81.2, createdAt: "x", updatedAt: "x" });
  if (extra) await extra(legacy);
  legacy.close();
  return name;
}

async function dump(database: Dexie, stores: string[]): Promise<string> {
  const result: Record<string, unknown[]> = {};
  for (const store of stores) {
    const table = database.table(store);
    const key = String(table.schema.primKey.keyPath);
    result[store] = (await table.toArray()).sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : String(a[key]) > String(b[key]) ? 1 : 0));
  }
  return canonicalStringify(result);
}

async function dumpV2(name: string): Promise<string> {
  const legacy = new CoachJmDatabaseV2(name);
  await legacy.open();
  const result = await dump(legacy, V2_STORES);
  legacy.close();
  return result;
}

/** La base telle qu'elle est (mode dynamique) : version et stores. */
async function inspect(name: string): Promise<{ verno: number; tables: string[]; goalIndexes: string[] }> {
  const database = new Dexie(name);
  await database.open();
  const result = {
    verno: database.verno,
    tables: database.tables.map((table) => table.name).sort(),
    goalIndexes: database.tables.find((table) => table.name === "goals")?.schema.indexes.map((index) => index.name).sort() ?? [],
  };
  database.close();
  return result;
}

async function openFails(database: Dexie): Promise<unknown> {
  return database.open().then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

async function assertStillV2(name: string, before: string): Promise<string> {
  const shape = await inspect(name);
  check(shape.verno === 2, `version ${shape.verno} au lieu de 2`);
  check(canonicalStringify(shape.tables) === canonicalStringify([...V2_STORES].sort()), `${shape.tables.length} stores au lieu de 19`);
  check(shape.goalIndexes.includes("status") && !shape.goalIndexes.includes("key"), "index de goals modifiés");
  check((await dumpV2(name)) === before, "contenu différent de l'avant");
  return `version 2, ${shape.tables.length} stores, contenu intact`;
}

type Case = { id: string; title: string; run: () => Promise<string> };

const CASES: Case[] = [
  {
    id: "E2 / T-4a",
    title: "Garde : un test cardio présent refuse la migration",
    run: async () => {
      const name = await createV2("t4a", async (database) => {
        await database.cardioTests.add({ id: "c1", versionId: "v", date: "2026-09-01", time: "18:00", status: "complet", endReason: "critere_atteint", conditionsRespected: true, createdAt: "x", updatedAt: "x" } as never);
      });
      const before = await dumpV2(name);
      const database = new CoachJmDatabase(name);
      const error = await openFails(database);
      database.close();
      check(error instanceof MigrationGuardError, `erreur inattendue : ${String(error)}`);
      check((error as MigrationGuardError).message.includes("cardioTests (1)"), "cardioTests non nommé");
      return `refus nommant cardioTests ; ${await assertStillV2(name, before)}`;
    },
  },
  {
    id: "E4",
    title: "Upgrade qui écrit puis lève : aucune écriture ne subsiste",
    run: async () => {
      const name = await createV2("e4");
      const before = await dumpV2(name);
      const database = new CoachJmDatabase(name, {
        upgradeGuard: async (tx: Transaction) => {
          const workout = await tx.table("workouts").get("import-2026-09-15");
          await tx.table("workouts").put({ ...workout, note: "écrit pendant l'upgrade" });
          await tx.table("settings").put({ key: "preferences", value: { theme: "dark", timerSound: false, freeWorkoutRestSec: 30 } });
          throw new Error("panne simulée après écritures");
        },
      });
      const error = await openFails(database);
      database.close();
      check(error instanceof Error && error.message.includes("panne simulée"), `erreur inattendue : ${String(error)}`);
      const shape = await inspect(name);
      check(!shape.tables.includes("settings"), "le store settings existe");
      return `écritures annulées, pas de store settings ; ${await assertStillV2(name, before)}`;
    },
  },
  {
    id: "T-5",
    title: "Panne pendant la migration, après une lecture",
    run: async () => {
      const name = await createV2("t5");
      const before = await dumpV2(name);
      const database = new CoachJmDatabase(name, {
        upgradeGuard: async (tx: Transaction) => {
          await tx.table("workouts").count();
          throw new Error("panne simulée pendant la migration");
        },
      });
      const error = await openFails(database);
      database.close();
      check(error instanceof Error && error.message.includes("panne simulée"), `erreur inattendue : ${String(error)}`);
      return await assertStillV2(name, before);
    },
  },
  {
    id: "T-3",
    title: "Migration réussie : tout est relu à l'identique",
    run: async () => {
      const name = await createV2("t3");
      const legacy = new CoachJmDatabaseV2(name);
      await legacy.open();
      const before = await dump(legacy, KEPT_STORES);
      legacy.close();

      const migrated = new CoachJmDatabase(name);
      await migrated.open();
      check(migrated.verno === 3, `version ${migrated.verno} au lieu de 3`);
      check(canonicalStringify(migrated.tables.map((t) => t.name).sort()) === canonicalStringify([...STORE_NAMES].sort()), "stores v3 inattendus");
      check((await dump(migrated, KEPT_STORES)) === before, "contenu différent après migration");
      const sessions = await migrated.workouts.count();
      const frameAfter = await migrated.strengthFrameVersions.get("frame-tv-v1");
      check(canonicalStringify(frameAfter) === canonicalStringify(frameVersion), "cadre tirage-vertical modifié");
      migrated.close();
      return `version 3, ${STORE_NAMES.length} stores, ${sessions} séances et cadre identiques`;
    },
  },
  {
    id: "T-7",
    title: "Réouvertures : la garde ne s'exécute qu'une fois",
    run: async () => {
      const name = await createV2("t7");
      let calls = 0;
      const counting = async (tx: Transaction) => {
        calls += 1;
        await guardV3Migration(tx);
      };
      const first = new CoachJmDatabase(name, { upgradeGuard: counting });
      await first.open();
      const reference = await dump(first, STORE_NAMES);
      first.close();
      for (let i = 0; i < 3; i++) {
        const again = new CoachJmDatabase(name, { upgradeGuard: counting });
        await again.open();
        check((await dump(again, STORE_NAMES)) === reference, `contenu changé à la réouverture ${i + 1}`);
        again.close();
      }
      check(calls === 1, `garde appelée ${calls} fois`);
      return "garde appelée 1 fois, 3 réouvertures identiques";
    },
  },
  {
    id: "C.7 bis",
    title: "Import : une panne pendant le remplacement laisse l'ancienne base intacte",
    run: async () => {
      const source = new CoachJmDatabase(newName("source"));
      await source.open();
      await source.exercises.bulkAdd(exerciseCatalog);
      await source.workouts.bulkAdd(buildImportedWorkouts());
      const file = parseBackup(serializeBackup(await readBackup(source, { now: new Date(), buildTime: "recette", userAgent: navigator.userAgent, standalone: false })));
      source.close();

      const target = new CoachJmDatabase(newName("cible"));
      await target.open();
      await target.weightEntries.add({ id: "p-actuelle", date: "2026-09-24", kg: 80, createdAt: "x", updatedAt: "x" });
      await target.settings.put({ key: "preferences", value: { theme: "dark", timerSound: true, freeWorkoutRestSec: 90 } });
      const before = await dump(target, STORE_NAMES);

      const proto = writePrototypeOf(target);
      const original = proto.bulkAdd!;
      let calls = 0;
      proto.bulkAdd = function (this: unknown, ...args: unknown[]) {
        calls += 1;
        if (calls === 2) throw new Error("panne simulée pendant l'écriture");
        return original.apply(this, args);
      };
      let error: unknown;
      try {
        await replaceWith(file, target);
      } catch (caught) {
        error = caught;
      } finally {
        proto.bulkAdd = original;
      }
      check(error instanceof Error && error.message.includes("panne simulée"), `erreur inattendue : ${String(error)}`);
      check((await dump(target, STORE_NAMES)) === before, "l'ancienne base a changé");

      await replaceWith(file, target);
      const sessions = await target.workouts.count();
      check(sessions === (file.stores.workouts ?? []).length, "remplacement incomplet");
      check((await target.weightEntries.count()) === 0 && (await target.settings.count()) === 0, "anciennes données restantes");
      target.close();
      return `panne : ancienne base intacte ; remplacement ensuite : ${sessions} séances, anciennes données retirées`;
    },
  },
];

async function eraseRecetteBases(): Promise<number> {
  const names = (await Dexie.getDatabaseNames()).filter((name) => name.startsWith(PREFIX));
  for (const name of names) await Dexie.delete(name);
  return names.length;
}

function render(): void {
  const root = document.getElementById("recette")!;
  const results = document.getElementById("resultats")!;
  const summary = document.getElementById("bilan")!;
  const run = document.getElementById("lancer") as HTMLButtonElement;
  const erase = document.getElementById("effacer") as HTMLButtonElement;

  document.getElementById("contexte")!.textContent = `${navigator.userAgent} — Dexie ${Dexie.semVer} — build ${__BUILD_TIME__}`;

  run.addEventListener("click", async () => {
    run.disabled = true;
    erase.disabled = true;
    results.replaceChildren();
    summary.textContent = "Tests en cours…";
    let failures = 0;
    for (const testCase of CASES) {
      const line = document.createElement("li");
      line.className = "cas cas--encours";
      line.innerHTML = `<strong></strong> <span class="titre"></span><div class="detail">en cours…</div>`;
      line.querySelector("strong")!.textContent = testCase.id;
      line.querySelector(".titre")!.textContent = testCase.title;
      results.append(line);
      const detail = line.querySelector(".detail")!;
      try {
        detail.textContent = `OK — ${await testCase.run()}`;
        line.className = "cas cas--ok";
      } catch (error) {
        failures += 1;
        detail.textContent = `ÉCHEC — ${error instanceof Error ? error.message : String(error)}`;
        line.className = "cas cas--echec";
      }
    }
    summary.textContent = failures === 0 ? `Tous les cas sont OK (${CASES.length}/${CASES.length}).` : `${failures} cas en ÉCHEC sur ${CASES.length}.`;
    summary.className = failures === 0 ? "bilan bilan--ok" : "bilan bilan--echec";
    run.disabled = false;
    erase.disabled = false;
  });

  erase.addEventListener("click", async () => {
    erase.disabled = true;
    const count = await eraseRecetteBases();
    summary.textContent = `${count} base${count > 1 ? "s" : ""} de recette effacée${count > 1 ? "s" : ""}.`;
    summary.className = "bilan";
    erase.disabled = false;
  });

  root.hidden = false;
}

render();
