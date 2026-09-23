import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde du lot B : aucune adresse d'écran renommable n'est écrite en dur
 * hors de `app/paths.ts`. Un littéral `"/sessions…"`, `"/seance…"` ou
 * `"/programme…"` réapparu ailleurs ferait échouer ce test : il se
 * remplace par l'appel `paths.*` correspondant.
 */
const SRC = join(__dirname, "..");
const LEGACY = /["'`]\/(sessions|seance|programme)(?![\w-])/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("garde des chemins", () => {
  it("aucun chemin d'écran renommable écrit en dur hors de paths.ts", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join("app", "paths.ts")))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => LEGACY.test(line))
          .map(({ line, index }) => `${relative(SRC, file)}:${index + 1} ${line.trim()}`),
      );

    expect(offenders).toEqual([]);
  });
});
