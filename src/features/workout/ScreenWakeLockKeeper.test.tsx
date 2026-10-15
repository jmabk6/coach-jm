// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/database";
import type { PlannedSession } from "../../domain";
import { resumeSeedsForTests, runSeeds } from "../seed/runSeeds";
import { cancelWorkout } from "./deleteWorkout";
import { endWorkout, reopenWorkout } from "./finishWorkout";
import { ScreenWakeLockKeeper } from "./ScreenWakeLockKeeper";
import type { WakeLockEnv, WakeLockSentinelLike } from "./screenWakeLock";
import { startFreeWorkout } from "./startFreeWorkout";
import { startWorkout } from "./startWorkout";

/**
 * Écran allumé pendant la séance (15/10/2026), relié au cycle de vie réel
 * de la séance dans la base : démarrage (planifiée ou libre), Terminer,
 * Reprendre la séance, Annuler cette séance, rechargement de l'app avec une
 * séance active. Aucune donnée n'est écrite par la veille.
 */

const PLANNED: PlannedSession = {
  id: "weekly-2026-10-15", date: "2026-10-15", sessionTemplateId: "v1-muscu-a", status: "upcoming", source: "weekly_program",
  sourceWeekday: "thursday", sourceDate: "2026-10-15", createdAt: "x", updatedAt: "x",
};
const START = "2026-10-15T17:00:00.000Z";

function fakeEnv() {
  const sentinels: Array<WakeLockSentinelLike & { released: boolean }> = [];
  const request = vi.fn(async (type: "screen") => {
    expect(type).toBe("screen");
    const listeners: Array<() => void> = [];
    const sentinel = {
      released: false,
      addEventListener: (_event: "release", listener: () => void) => listeners.push(listener),
      release: vi.fn(async () => {
        sentinel.released = true;
        listeners.forEach((listener) => listener());
      }),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  const env: WakeLockEnv = { wakeLock: { request }, isVisible: () => true, onVisibilityChange: () => () => undefined };
  const held = () => sentinels.filter((sentinel) => !sentinel.released).length;
  return { env, request, held };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  resumeSeedsForTests();
  await runSeeds();
  await db.plannedSessions.put(PLANNED);
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

describe("veille de l'écran allumé", () => {
  it("sans séance active : aucune demande", async () => {
    const { env, request } = fakeEnv();
    render(<ScreenWakeLockKeeper env={env} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(request).not.toHaveBeenCalled();
  });

  it("séance planifiée : démarrage → écran maintenu ; Terminer → libéré ; Reprendre la séance → de nouveau maintenu", async () => {
    const { env, request, held } = fakeEnv();
    render(<ScreenWakeLockKeeper env={env} />);
    const workout = await startWorkout(PLANNED.id, START);
    await waitFor(() => expect(held()).toBe(1));

    await endWorkout(workout.id, "2026-10-15T18:00:00.000Z");
    await waitFor(() => expect(held()).toBe(0));

    await reopenWorkout(workout.id, "2026-10-15T18:01:00.000Z");
    await waitFor(() => expect(held()).toBe(1));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("séance libre annulée (Annuler cette séance) : libéré", async () => {
    const { env, held } = fakeEnv();
    render(<ScreenWakeLockKeeper env={env} />);
    const workout = await startFreeWorkout("2026-10-15", START);
    await waitFor(() => expect(held()).toBe(1));
    await cancelWorkout(workout.id, "2026-10-15T17:05:00.000Z");
    await waitFor(() => expect(held()).toBe(0));
  });

  it("enregistrement de la séance en cours (exercices, repos) : pas de nouvelle demande", async () => {
    const { env, request, held } = fakeEnv();
    render(<ScreenWakeLockKeeper env={env} />);
    const workout = await startFreeWorkout("2026-10-15", START);
    await waitFor(() => expect(held()).toBe(1));
    await db.workouts.put({ ...workout, lastActionAt: "2026-10-15T17:10:00.000Z", updatedAt: "2026-10-15T17:10:00.000Z" });
    await db.workouts.put({ ...workout, lastActionAt: "2026-10-15T17:12:00.000Z", updatedAt: "2026-10-15T17:12:00.000Z" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(request).toHaveBeenCalledTimes(1);
    expect(held()).toBe(1);
  });

  it("rechargement avec une séance active restaurée : écran maintenu ; démontage : libéré", async () => {
    await startFreeWorkout("2026-10-15", START);
    const { env, held } = fakeEnv();
    const view = render(<ScreenWakeLockKeeper env={env} />);
    await waitFor(() => expect(held()).toBe(1));
    view.unmount();
    expect(held()).toBe(0);
  });

  it("séance terminée mais pas encore enregistrée au rechargement : écran non maintenu", async () => {
    const workout = await startFreeWorkout("2026-10-15", START);
    await endWorkout(workout.id, "2026-10-15T18:00:00.000Z");
    const { env, request } = fakeEnv();
    render(<ScreenWakeLockKeeper env={env} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(request).not.toHaveBeenCalled();
  });
});
