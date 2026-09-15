/**
 * Découpe une planche d'illustrations (plusieurs dessins séparés par des
 * gouttières claires, en grille ou en bande) en fichiers sources individuels,
 * SANS aucun redimensionnement : chaque panneau garde ses pixels d'origine.
 *
 * Usage :
 *   node scripts/split-exercise-sheet.mjs <planche.png> <zone> <id1> <id2> ...
 *
 * Les identifiants sont attribués aux panneaux dans l'ordre de lecture
 * (ligne par ligne, de gauche à droite). Les panneaux sont écrits dans
 * media-src/exercises/<zone>/<id>.png ; un fichier existant est écrasé.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "media-src", "exercises");

/** Pixel clair et peu saturé = gouttière ou fond. */
const LIGHT_MIN = 200;
const SATURATION_MAX = 24;
/** Une gouttière est une bande de lignes/colonnes entièrement claires d'au moins cette largeur. */
const MIN_GUTTER = 6;
/** Un panneau doit contenir au moins cette part de la dimension totale. */
const MIN_PANEL_RATIO = 0.08;

function isLight(data, i) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return Math.min(r, g, b) >= LIGHT_MIN && Math.max(r, g, b) - Math.min(r, g, b) <= SATURATION_MAX;
}

/** Segments [début, fin] des zones non entièrement claires, séparés par des gouttières. */
function segments(profile, total) {
  const result = [];
  let start = null;
  let gutter = 0;
  for (let i = 0; i <= total; i++) {
    const filled = i < total && profile[i] > 0;
    if (filled) {
      if (start === null) start = i;
      gutter = 0;
    } else if (start !== null) {
      gutter++;
      if (gutter >= MIN_GUTTER || i === total) {
        result.push([start, i - gutter]);
        start = null;
        gutter = 0;
      }
    }
  }
  return result.filter(([a, b]) => (b - a + 1) / total >= MIN_PANEL_RATIO);
}

async function main() {
  const [sheetFile, zone, ...ids] = process.argv.slice(2);
  if (!sheetFile || !zone || ids.length === 0) {
    console.error("Usage : node scripts/split-exercise-sheet.mjs <planche> <zone> <id...>");
    process.exit(1);
  }

  const image = sharp(sheetFile).removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  /* Lignes non vides → bandes horizontales ; puis colonnes non vides dans chaque bande. */
  const rowProfile = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isLight(data, (y * width + x) * channels)) rowProfile[y]++;
    }
  }
  const rows = segments(rowProfile, height);

  const panels = [];
  for (const [y0, y1] of rows) {
    const colProfile = new Uint32Array(width);
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < width; x++) {
        if (!isLight(data, (y * width + x) * channels)) colProfile[x]++;
      }
    }
    for (const [x0, x1] of segments(colProfile, width)) {
      panels.push({ x0, y0, x1, y1 });
    }
  }

  if (panels.length !== ids.length) {
    console.error(
      `${panels.length} panneau(x) détecté(s) pour ${ids.length} identifiant(s) :`,
    );
    for (const p of panels) {
      console.error(`  ${p.x1 - p.x0 + 1}×${p.y1 - p.y0 + 1} à (${p.x0}, ${p.y0})`);
    }
    process.exit(1);
  }

  const outDir = path.join(SRC_DIR, zone);
  await mkdir(outDir, { recursive: true });

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    /* Marge de fond conservée autour du dessin (2 % de la planche), pour que la
       normalisation ne prenne pas le bord du panneau pour un dessin coupé. */
    const pad = Math.round(Math.max(width, height) * 0.02);
    const left = Math.max(0, p.x0 - pad);
    const top = Math.max(0, p.y0 - pad);
    const w = Math.min(width, p.x1 + pad + 1) - left;
    const h = Math.min(height, p.y1 + pad + 1) - top;
    const buffer = await sharp(sheetFile)
      .extract({ left, top, width: w, height: h })
      .png()
      .toBuffer();
    const file = path.join(outDir, `${ids[i]}.png`);
    await writeFile(file, buffer);
    console.log(`✓ ${zone}/${ids[i]}.png — ${w}×${h}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
