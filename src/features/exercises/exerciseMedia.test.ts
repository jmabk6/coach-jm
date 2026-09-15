/// <reference types="node" />

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exerciseCatalog } from "./exerciseCatalog";
import { exerciseMedia } from "./exerciseMedia.generated";

const publicDir = path.join(process.cwd(), "public");

function publicFileFor(url: string): string {
  return path.join(
    publicDir,
    url.replace(import.meta.env.BASE_URL, ""),
  );
}

describe("médias officiels des exercices", () => {
  it("référence uniquement des exercices du catalogue", () => {
    const catalogIds = new Set(
      exerciseCatalog.map((exercise) => exercise.id),
    );

    for (const id of Object.keys(exerciseMedia)) {
      expect(catalogIds.has(id), `média orphelin : ${id}`).toBe(true);
    }
  });

  it("pointe vers des fichiers réellement présents dans public/", () => {
    const illustrated = exerciseCatalog.filter(
      (exercise) => exercise.media !== undefined,
    );

    expect(illustrated.length).toBeGreaterThan(0);

    for (const exercise of illustrated) {
      for (const url of [
        exercise.media?.thumbnailUrl,
        exercise.media?.photoUrl,
        ...(exercise.media?.animationFrameUrls ?? []),
      ]) {
        expect(url).toBeDefined();
        expect(
          existsSync(publicFileFor(url!)),
          `${exercise.id} : fichier manquant ${url}`,
        ).toBe(true);
      }
    }
  });

  it("utilise des noms de fichiers stables suffixés d'un hash", () => {
    const hashedName = (base: string) =>
      new RegExp(`/${base}[.][0-9a-f]{8}[.]webp$`);

    for (const [id, entry] of Object.entries(exerciseMedia)) {
      expect(entry.thumbnail).toMatch(hashedName(`${id}-thumb`));
      expect(entry.photo).toMatch(hashedName(id));
    }
  });
});
