import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import { RPE_SCALE_V1_ID, RPE_SCALE_V1_TABLE } from "../../domain/rules/strengthRules";
import { readStores } from "../backup/exportBackup";
import { canonicalStringify } from "../backup/canonicalJson";
import { WRITE_METHODS, writePrototypeOf } from "../backup/testDatabase";
import { seedRpeScale } from "./seedRpeScale";

/**
 * Le seed de l'échelle de RPE (v1.6, § 4.5) sur la vraie classe de base,
 * dans fake-indexeddb : une V1 posée au premier lancement, puis plus
 * jamais une écriture.
 */
describe("seedRpeScale", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  it("crée la V1 au premier lancement, datée du jour local, sans toucher aux autres stores", async () => {
    await db.delete();
    await db.open();
    /* 23 h 30 heure locale : la date de début est celle du jour local, pas de l'UTC. */
    const now = new Date(2026, 8, 22, 23, 30, 0);

    await seedRpeScale(now);

    const versions = await db.rpeScaleVersions.toArray();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toEqual({
      id: RPE_SCALE_V1_ID,
      number: 1,
      status: "active",
      table: RPE_SCALE_V1_TABLE,
      startDate: "2026-09-22",
      createdAt: now.toISOString(),
    });

    const { counts } = await readStores(db);
    for (const [store, count] of Object.entries(counts)) {
      expect(count, store).toBe(store === "rpeScaleVersions" ? 1 : 0);
    }
  });

  it("relance : aucune écriture, sur aucun store", async () => {
    await db.delete();
    await db.open();
    await seedRpeScale(new Date("2026-09-22T10:00:00.000Z"));
    const before = canonicalStringify((await readStores(db)).stores);

    const proto = writePrototypeOf(db);
    const spies = WRITE_METHODS.map((method) => vi.spyOn(proto, method));

    await seedRpeScale(new Date("2026-10-05T10:00:00.000Z"));
    await seedRpeScale();

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(canonicalStringify((await readStores(db)).stores)).toBe(before);
    expect((await db.rpeScaleVersions.get(RPE_SCALE_V1_ID))?.startDate).toBe("2026-09-22");
  });

  it("une échelle déjà présente, même différente, est respectée : rien n'est écrit", async () => {
    await db.delete();
    await db.open();
    await db.rpeScaleVersions.put({
      id: "rpe-scale-v2",
      number: 2,
      status: "active",
      table: [{ rpe: 10, repsInReserveLabel: "0" }],
      startDate: "2027-01-01",
      createdAt: "2027-01-01T00:00:00.000Z",
    });

    const proto = writePrototypeOf(db);
    const spies = WRITE_METHODS.map((method) => vi.spyOn(proto, method));

    await seedRpeScale();

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await db.rpeScaleVersions.count()).toBe(1);
    expect(await db.rpeScaleVersions.get(RPE_SCALE_V1_ID)).toBeUndefined();
  });
});
