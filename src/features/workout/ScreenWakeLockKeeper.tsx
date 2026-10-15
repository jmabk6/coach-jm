import { liveQuery } from "dexie";
import { useEffect } from "react";
import { getInProgressWorkout } from "../../db/repositories/workoutRepository";
import { createScreenWakeLock, type WakeLockEnv } from "./screenWakeLock";

/**
 * Écran allumé pendant la séance (15/10/2026) : suit dans la base la
 * séance active (`in_progress`, pas encore terminée) — démarrage, reprise,
 * Terminer, Reprendre la séance, Annuler, rechargement — et tient le
 * verrou d'écran en conséquence. N'écrit rien.
 */
export function ScreenWakeLockKeeper({ env }: { env?: WakeLockEnv }) {
  useEffect(() => {
    const lock = createScreenWakeLock(env);
    const subscription = liveQuery(async () => (await getInProgressWorkout()) !== undefined).subscribe({
      next: (active) => lock.setActive(active),
      /* Lecture impossible : on ne garde pas l'écran allumé. */
      error: () => lock.setActive(false),
    });
    return () => {
      subscription.unsubscribe();
      lock.dispose();
    };
  }, [env]);

  return null;
}
