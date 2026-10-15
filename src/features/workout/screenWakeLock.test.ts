import { describe, expect, it, vi } from "vitest";
import { createScreenWakeLock, type WakeLockEnv, type WakeLockSentinelLike } from "./screenWakeLock";

/**
 * Écran allumé pendant la séance (15/10/2026) : une seule demande à la
 * fois, libération à la fin, nouvelle demande au retour au premier plan
 * seulement si la séance est toujours active ; refus et absence de l'API
 * sans erreur.
 */

class FakeSentinel implements WakeLockSentinelLike {
  released = false;
  private listeners: Array<() => void> = [];
  addEventListener(_type: "release", listener: () => void) {
    this.listeners.push(listener);
  }
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    this.listeners.forEach((listener) => listener());
  });
  /** Ce que fait le système quand l'app passe en arrière-plan. */
  systemRelease() {
    void this.release();
  }
}

function fakeEnv(options: { supported?: boolean; refuse?: boolean; manual?: boolean } = {}) {
  let visible = true;
  const listeners: Array<() => void> = [];
  const sentinels: FakeSentinel[] = [];
  const resolvers: Array<() => void> = [];
  const request = vi.fn((type: "screen") => {
    expect(type).toBe("screen");
    if (options.refuse) return Promise.reject(new DOMException("refusé", "NotAllowedError"));
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    if (!options.manual) return Promise.resolve(sentinel);
    return new Promise<WakeLockSentinelLike>((resolve) => resolvers.push(() => resolve(sentinel)));
  });
  const env: WakeLockEnv = {
    ...(options.supported === false ? {} : { wakeLock: { request } }),
    isVisible: () => visible,
    onVisibilityChange: (listener) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
  };
  const setVisible = (value: boolean) => {
    visible = value;
    if (!value) sentinels.forEach((sentinel) => sentinel.systemRelease());
    listeners.forEach((listener) => listener());
  };
  return { env, request, sentinels, resolvers, setVisible, listeners };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("maintien de l'écran allumé", () => {
  it("démarrage : une demande ; séance toujours active (exercices, repos) : aucune nouvelle demande", async () => {
    const { env, request, sentinels } = fakeEnv();
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    await flush();
    lock.setActive(true);
    lock.setActive(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("screen");
    expect(sentinels[0]!.released).toBe(false);
  });

  it("demandes rapprochées pendant qu'une demande est en cours : une seule", async () => {
    const { env, request, resolvers } = fakeEnv({ manual: true });
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    lock.setActive(true);
    lock.setActive(false);
    lock.setActive(true);
    expect(request).toHaveBeenCalledTimes(1);
    resolvers[0]!();
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fin ou abandon : le verrou est libéré (le délai de veille habituel reprend)", async () => {
    const { env, sentinels } = fakeEnv();
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    await flush();
    lock.setActive(false);
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1);
    expect(sentinels[0]!.released).toBe(true);
  });

  it("demande aboutie après la fin de la séance : libérée aussitôt", async () => {
    const { env, sentinels, resolvers } = fakeEnv({ manual: true });
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    lock.setActive(false);
    resolvers[0]!();
    await flush();
    expect(sentinels[0]!.released).toBe(true);
  });

  it("arrière-plan : le système libère ; retour au premier plan : nouvelle demande si la séance est active", async () => {
    const { env, request, sentinels, setVisible } = fakeEnv();
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    await flush();
    setVisible(false);
    await flush();
    expect(sentinels[0]!.released).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(sentinels[1]!.released).toBe(false);
  });

  it("retour au premier plan sans séance active : aucune demande", async () => {
    const { env, request, setVisible } = fakeEnv();
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    await flush();
    setVisible(false);
    lock.setActive(false);
    setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("séance démarrée pendant que l'app est en arrière-plan : la demande attend le retour au premier plan", async () => {
    const { env, request, setVisible } = fakeEnv();
    const lock = createScreenWakeLock(env);
    setVisible(false);
    lock.setActive(true);
    expect(request).not.toHaveBeenCalled();
    setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("verrou libéré par le système sans changement de visibilité : redemandé au prochain retour", async () => {
    const { env, request, sentinels, listeners } = fakeEnv();
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    await flush();
    sentinels[0]!.systemRelease();
    listeners.forEach((listener) => listener());
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("demande refusée : pas d'erreur, la séance continue ; nouvel essai au retour au premier plan", async () => {
    const { env, request, setVisible } = fakeEnv({ refuse: true });
    const lock = createScreenWakeLock(env);
    expect(() => lock.setActive(true)).not.toThrow();
    await flush();
    lock.setActive(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    setVisible(false);
    setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("API absente : rien ne se passe, aucune erreur", async () => {
    const { env } = fakeEnv({ supported: false });
    const lock = createScreenWakeLock(env);
    expect(() => {
      lock.setActive(true);
      lock.setActive(false);
      lock.dispose();
    }).not.toThrow();
  });

  it("fermeture de la veille : verrou libéré, plus d'écoute de la visibilité", async () => {
    const { env, request, sentinels, listeners, setVisible } = fakeEnv();
    const lock = createScreenWakeLock(env);
    lock.setActive(true);
    await flush();
    lock.dispose();
    expect(sentinels[0]!.released).toBe(true);
    expect(listeners).toHaveLength(0);
    setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
