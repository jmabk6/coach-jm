import type Dexie from "dexie";
import { parseBackup, restoreBackup } from "./restoreBackup";

/**
 * Console de développement (conception lot 0, § 7.2) : restaure un
 * fichier de sauvegarde dans la base de **cet origin** — le serveur de
 * recette, jamais la PWA. Chargé par `main.tsx` uniquement sous
 * `import.meta.env.DEV` : absent du build de production.
 *
 * Usage dans la console : `await __coachJmRestore(texteJson)`.
 */
export function installDevRestore(database: Dexie): void {
  const target = globalThis as unknown as { __coachJmRestore?: (text: string) => Promise<unknown> };

  target.__coachJmRestore = async (text: string) => {
    const envelope = parseBackup(text);
    const result = await restoreBackup(envelope, database);
    console.info("[coach-jm] restauration terminée", result.counts, result.hash.slice(0, 8));

    return result;
  };
}
