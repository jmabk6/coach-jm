import "fake-indexeddb/auto";

import Dexie, { type Transaction } from "dexie";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Lot C.1 — le comportement de Dexie sur lequel repose la migration v3
 * (SCHEMA_DEXIE_V3_MIGRATION.md § 3) : l'`upgrade()` d'une version peut
 * encore lire les stores que cette version déclare `null` ; ils ne sont
 * supprimés qu'après ; une exception dans l'`upgrade()` annule toute la
 * transaction de changement de version. Bases factices, en mémoire.
 *
 * Ce test verrouille la décision « v3 seule » : s'il échoue après une
 * montée de version de Dexie, la décision est à revoir (v3 + v4).
 */

const V1 = { workouts: "id, status", goals: "id, status, dueDate, achievedAt, updatedAt" };
const V2 = { ...V1, cardioTests: "id, versionId, date, status", mobilityMeasures: "id, assessmentId, [assessmentId+key]" };
const V3 = {
  workouts: "id, status",
  goals: "id, &key, position, updatedAt",
  testResults: "id, protocolId, date",
  settings: "key",
  cardioTests: null,
  mobilityMeasures: null,
};

const opened: string[] = [];
let counter = 0;

function uniqueName(): string {
  counter += 1;
  const name = `dexie-upgrade-${Date.now()}-${counter}`;
  opened.push(name);
  return name;
}

async function seedV2(name: string, { cardio = 0, goals = 0 } = {}): Promise<void> {
  const database = new Dexie(name);
  database.version(1).stores(V1);
  database.version(2).stores(V2);
  await database.open();
  await database.table("workouts").bulkAdd([
    { id: "w1", status: "completed", blocks: [1] },
    { id: "w2", status: "completed" },
  ]);
  for (let i = 0; i < cardio; i++) {
    await database.table("cardioTests").add({ id: `c${i}`, versionId: "v", date: "2026-09-01", status: "complet" });
  }
  for (let i = 0; i < goals; i++) {
    await database.table("goals").add({ id: `g${i}`, status: "active", target: { kind: "weight", targetKg: 75, direction: "lose" } });
  }
  database.close();
}

function openV3(name: string, upgrade: (tx: Transaction) => Promise<void> | void): Dexie {
  const database = new Dexie(name);
  database.version(1).stores(V1);
  database.version(2).stores(V2);
  database.version(3).stores(V3).upgrade(upgrade);
  return database;
}

/** Ouverture dynamique, sans déclarer de version : lit la base telle qu'elle est. */
async function inspect(name: string) {
  const database = new Dexie(name);
  await database.open();
  const tables = database.tables.map((table) => table.name).sort();
  const result = {
    verno: database.verno,
    tables,
    workouts: await database.table("workouts").toArray(),
    cardio: tables.includes("cardioTests") ? await database.table("cardioTests").count() : undefined,
    goalIndexes: database.table("goals").schema.indexes.map((index) => `${index.unique ? "&" : ""}${index.name}`).sort(),
    goals: await database.table("goals").count(),
  };
  database.close();
  return result;
}

const WORKOUTS = [
  { id: "w1", status: "completed", blocks: [1] },
  { id: "w2", status: "completed" },
];

afterEach(async () => {
  for (const name of opened.splice(0)) await Dexie.delete(name);
});

describe("Dexie 4.4.6 — comportement de l'upgrade (décision v3 seule)", () => {
  it("la version installée est bien celle que la décision suppose", () => {
    expect(Dexie.semVer).toBe("4.4.6");
  });

  it("E1 — l'upgrade lit un store déclaré null ; sans garde, il est supprimé avec sa donnée", async () => {
    const name = uniqueName();
    await seedV2(name, { cardio: 1 });
    let seen: number | undefined;

    const database = openV3(name, async (tx) => {
      seen = await tx.table("cardioTests").count();
    });
    await database.open();
    database.close();

    expect(seen).toBe(1);
    const after = await inspect(name);
    expect(after.verno).toBe(3);
    expect(after.tables).not.toContain("cardioTests");
    expect(after.workouts).toEqual(WORKOUTS);
  });

  it("E2 — une garde qui lève laisse la base en version 2, intacte", async () => {
    const name = uniqueName();
    await seedV2(name, { cardio: 1 });

    const database = openV3(name, async (tx) => {
      const count = await tx.table("cardioTests").count();
      if (count > 0) throw new Error(`GARDE : cardioTests non vide (${count})`);
    });
    await expect(database.open()).rejects.toThrow(/GARDE/);
    database.close();

    const after = await inspect(name);
    expect(after.verno).toBe(2);
    expect(after.tables).toEqual(["cardioTests", "goals", "mobilityMeasures", "workouts"]);
    expect(after.cardio).toBe(1);
    expect(after.goalIndexes).toEqual(["achievedAt", "dueDate", "status", "updatedAt"]);
    expect(after.workouts).toEqual(WORKOUTS);
  });

  it("E3 — stores anciens vides : contrôle, puis suppression et réindexation de goals", async () => {
    const name = uniqueName();
    await seedV2(name);
    let seen: number[] = [];

    const database = openV3(name, async (tx) => {
      seen = [
        await tx.table("cardioTests").count(),
        await tx.table("mobilityMeasures").count(),
        await tx.table("goals").count(),
      ];
    });
    await database.open();
    database.close();

    expect(seen).toEqual([0, 0, 0]);
    const after = await inspect(name);
    expect(after.verno).toBe(3);
    expect(after.tables).toEqual(["goals", "settings", "testResults", "workouts"]);
    expect(after.goalIndexes).toEqual(["&key", "position", "updatedAt"]);
    expect(after.workouts).toEqual(WORKOUTS);
  });

  it("E4 — une exception après des écritures annule tout : aucune écriture ne subsiste", async () => {
    const name = uniqueName();
    await seedV2(name);

    const database = openV3(name, async (tx) => {
      await tx.table("workouts").put({ id: "w1", status: "MODIFIÉE" });
      await tx.table("settings").put({ key: "x" });
      throw new Error("panne simulée");
    });
    await expect(database.open()).rejects.toThrow(/panne simulée/);
    database.close();

    const after = await inspect(name);
    expect(after.verno).toBe(2);
    expect(after.tables).not.toContain("settings");
    expect(after.workouts).toEqual(WORKOUTS);
  });

  it("E5 — une base déjà en version 3 n'exécute plus l'upgrade", async () => {
    const name = uniqueName();
    await seedV2(name);
    let calls = 0;

    for (let i = 0; i < 3; i++) {
      const database = openV3(name, () => {
        calls += 1;
      });
      await database.open();
      database.close();
    }

    expect(calls).toBe(1);
  });

  it("E6 — sans garde, des objectifs v1 traverseraient la migration (d'où la garde sur goals)", async () => {
    const name = uniqueName();
    await seedV2(name, { goals: 2 });

    const database = openV3(name, () => undefined);
    await database.open();
    database.close();

    const after = await inspect(name);
    expect(after.verno).toBe(3);
    expect(after.goals).toBe(2);
  });

  it("E7 — pendant l'upgrade, storeNames ne liste que le nouveau schéma ; après, les anciens stores ont disparu", async () => {
    const name = uniqueName();
    await seedV2(name);
    let during: string[] = [];

    const database = openV3(name, (tx) => {
      during = [...tx.storeNames].sort();
    });
    await database.open();
    const afterTables = database.tables.map((table) => table.name).sort();
    database.close();

    expect(during).toEqual(["goals", "settings", "testResults", "workouts"]);
    expect(afterTables).toEqual(["goals", "settings", "testResults", "workouts"]);
  });
});
