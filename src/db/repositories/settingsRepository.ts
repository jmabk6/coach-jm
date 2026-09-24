import { db } from "../database";
import type { SettingsKey, SettingsRecord, SettingsValue } from "../../domain";

/**
 * Réglages (conception V2 § 3.9) : un enregistrement par clé. Chaque
 * écriture remplace l'enregistrement entier.
 */

export async function getSetting<K extends SettingsKey>(key: K): Promise<SettingsValue<K> | undefined> {
  const record = await db.settings.get(key);

  return record?.value as SettingsValue<K> | undefined;
}

export async function saveSetting(record: SettingsRecord): Promise<void> {
  await db.settings.put(record);
}
