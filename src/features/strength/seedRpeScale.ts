import { getAllRpeScaleVersions, saveRpeScaleVersion } from "../../db/repositories/rpeScaleRepository";
import { formatLocalDate } from "../../domain/rules/programRules";
import { rpeScaleV1 } from "../../domain/rules/strengthRules";

/**
 * Pose la V1 de l'échelle de RPE (conception v1.6, § 4.5) au premier
 * lancement qui ne la trouve pas. Idempotent : dès qu'une version existe
 * en base — la V1 ou n'importe quelle autre — **aucune écriture**. Sa
 * `startDate` est la date locale de ce premier lancement : les séances
 * antérieures gardent leur RPE tel quel, sans version ni conversion.
 */
export async function seedRpeScale(now: Date = new Date()): Promise<void> {
  const existing = await getAllRpeScaleVersions();

  if (existing.length > 0) return;

  await saveRpeScaleVersion(rpeScaleV1(formatLocalDate(now), now.toISOString()));
}
