#!/usr/bin/env node
/**
 * Vérification hors appareil d'une sauvegarde Coach JM (conception lot 0, § 4).
 *
 *   node scripts/verify-backup.mjs coach-jm-sauvegarde-2026-09-19-1042.json
 *
 * Relit le fichier, recalcule l'empreinte canonique (`sorted-keys-json-v1`,
 * même règle que `src/features/backup/canonicalJson.ts`), recompte chaque
 * store, vérifie l'unicité des identifiants et signale les références
 * orphelines à titre d'information. Ne modifie rien. Code de sortie 0 si
 * l'empreinte et les comptes concordent, 1 sinon.
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export function canonicalStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalStringify(item))).join(",")}]`;
  }
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
}

export function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function verifyBackup(envelope) {
  const problems = [];
  const notes = [];

  if (envelope.format !== "coach-jm-backup") problems.push(`format inattendu : ${envelope.format}`);
  if (envelope.formatVersion !== 1) problems.push(`version de format inconnue : ${envelope.formatVersion}`);
  if (!envelope.stores || !envelope.counts || !envelope.integrity) {
    problems.push("enveloppe incomplète (stores, counts ou integrity)");
    return { ok: false, problems, notes, computed: undefined };
  }

  const computed = sha256Hex(canonicalStringify(envelope.stores));
  if (computed !== envelope.integrity.hash) {
    problems.push(`empreinte DIFFÉRENTE : fichier ${envelope.integrity.hash}, recalculée ${computed}`);
  }

  /* Empreinte des sept stores d'origine seuls : permet de comparer une
     sauvegarde prise après migration (19 stores) à celle prise avant (7). */
  const legacyStores = Object.fromEntries(
    LEGACY_STORE_ORDER.filter((name) => Array.isArray(envelope.stores[name])).map((name) => [name, envelope.stores[name]]),
  );
  const legacyHash = Object.keys(legacyStores).length === LEGACY_STORE_ORDER.length ? sha256Hex(canonicalStringify(legacyStores)) : undefined;

  for (const [name, count] of Object.entries(envelope.counts)) {
    const records = envelope.stores[name];
    if (!Array.isArray(records)) problems.push(`store manquant : ${name}`);
    else if (records.length !== count) problems.push(`${name} : ${count} annoncés, ${records.length} présents`);
  }
  for (const name of Object.keys(envelope.stores)) {
    if (!(name in envelope.counts)) problems.push(`store sans compte annoncé : ${name}`);
  }

  for (const [name, records] of Object.entries(envelope.stores)) {
    if (!Array.isArray(records)) continue;
    const ids = records.map((record) => record?.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) problems.push(`${name} : identifiants en double (${ids.length - unique.size})`);
    if (ids.some((id) => typeof id !== "string")) problems.push(`${name} : enregistrement sans identifiant`);
  }

  const idsOf = (name) => new Set((envelope.stores[name] ?? []).map((record) => record?.id));
  const exercises = idsOf("exercises");
  const templates = idsOf("sessionTemplates");
  const planned = idsOf("plannedSessions");

  for (const workout of envelope.stores.workouts ?? []) {
    if (workout.plannedSessionId && !planned.has(workout.plannedSessionId)) {
      notes.push(`workouts · ${workout.id} : plannedSessionId ${workout.plannedSessionId} sans instance`);
    }
    if (workout.sessionTemplateId && !templates.has(workout.sessionTemplateId)) {
      notes.push(`workouts · ${workout.id} : sessionTemplateId ${workout.sessionTemplateId} sans modèle`);
    }
    for (const block of workout.blocks ?? []) {
      if (block.kind === "exercise" && !exercises.has(block.exerciseId)) {
        notes.push(`workouts · ${workout.id} · ${block.id} : exerciseId ${block.exerciseId} sans exercice`);
      }
      if (block.kind === "group") {
        for (const round of block.rounds ?? []) {
          for (const child of round.children ?? []) {
            if (!exercises.has(child.exerciseId)) {
              notes.push(`workouts · ${workout.id} · ${child.id} : exerciseId ${child.exerciseId} sans exercice`);
            }
          }
        }
      }
    }
  }
  for (const session of envelope.stores.plannedSessions ?? []) {
    if (!templates.has(session.sessionTemplateId)) {
      notes.push(`plannedSessions · ${session.id} : sessionTemplateId ${session.sessionTemplateId} sans modèle`);
    }
  }
  for (const template of envelope.stores.sessionTemplates ?? []) {
    for (const block of template.blocks ?? []) {
      if (block.kind === "exercise" && !exercises.has(block.exerciseId)) {
        notes.push(`sessionTemplates · ${template.id} · ${block.id} : exerciseId ${block.exerciseId} sans exercice`);
      }
    }
  }

  return { ok: problems.length === 0, problems, notes, computed, legacyHash };
}

const LEGACY_STORE_ORDER = ["exercises", "sessionTemplates", "weeklyPrograms", "plannedSessions", "workouts", "goals", "weightEntries"];

async function main(path) {
  if (!path) {
    console.error("Usage : node scripts/verify-backup.mjs <fichier.json>");
    process.exit(2);
  }
  const text = await readFile(path, "utf8");
  const envelope = JSON.parse(text);
  const result = verifyBackup(envelope);

  console.log(`Fichier      : ${path}`);
  console.log(`Exporté le   : ${envelope.exportedAt ?? "?"} — build ${envelope.app?.buildTime ?? "?"}`);
  console.log(`Appareil     : ${envelope.device?.userAgent ?? "?"}${envelope.device?.standalone ? " (écran d'accueil)" : ""}`);
  console.log(`Base         : ${envelope.database?.name ?? "?"} — schéma version ${envelope.database?.version ?? "?"}`);
  console.log(`Empreinte    : ${result.ok && !result.problems.length ? "OK" : "voir ci-dessous"} — ${envelope.integrity?.hash?.slice(0, 8) ?? "?"} (fichier) / ${result.computed?.slice(0, 8) ?? "?"} (recalculée)`);
  if (result.legacyHash) {
    console.log(`Sept stores d'origine : ${result.legacyHash.slice(0, 8)} (empreinte des 7 stores seuls, comparable entre v1 et v2)`);
  }
  console.log(`Stores       : ${Object.keys(envelope.stores ?? {}).length}`);
  console.log("Comptes      :");
  for (const [name, count] of Object.entries(envelope.counts ?? {})) {
    console.log(`  ${name.padEnd(18)} ${String(count).padStart(5)}`);
  }
  const exercises = envelope.stores?.exercises ?? [];
  if (Array.isArray(exercises) && exercises.length) {
    const withGroup = exercises.filter((e) => e?.progressionGroup !== undefined).length;
    const withFamily = exercises.filter((e) => e?.movementFamily !== undefined).length;
    const strength = exercises.filter((e) => e?.category === "Musculation").length;
    console.log(`Classification : groupe de progression sur ${withGroup} exercice(s), famille de mouvement sur ${withFamily} (musculation : ${strength})`);
  }
  if (envelope.warnings?.length) {
    console.log(`Avertissements de sérialisation embarqués : ${envelope.warnings.length}`);
    for (const warning of envelope.warnings) console.log(`  - ${warning.store} · ${warning.id ?? ""} · ${warning.path} : ${warning.kind}`);
  }
  if (result.notes.length) {
    console.log(`Références orphelines (information) : ${result.notes.length}`);
    for (const note of result.notes) console.log(`  - ${note}`);
  } else {
    console.log("Références : aucune orpheline");
  }
  if (result.problems.length) {
    console.log("PROBLÈMES :");
    for (const problem of result.problems) console.log(`  ! ${problem}`);
    process.exit(1);
  }
  console.log("Résultat     : sauvegarde cohérente (empreinte et comptes concordent)");
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (invokedDirectly) {
  main(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
