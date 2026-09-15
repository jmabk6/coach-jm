/**
 * Normalisation des illustrations d'exercices.
 *
 * Entrée  : media-src/exercises/<zone>/<exerciseId>.(webp|png|jpg)
 *           media-src/exercises/<zone>/<exerciseId>.frames.(png|webp)  planche de poses (facultative)
 * Sortie  : public/media/exercises/<zone>/<exerciseId>-thumb.<hash>.webp  (vignette 5:4)
 *           public/media/exercises/<zone>/<exerciseId>.<hash>.webp        (photo 16:9)
 *           public/media/exercises/<zone>/<exerciseId>-frame<n>.<hash>.webp (poses 16:9, cadre commun)
 *           src/features/exercises/exerciseMedia.generated.ts             (manifeste id -> chemins)
 *
 * Règle appliquée à chaque image, sans réglage individuel :
 *   1. détection du fond par propagation depuis les bords (dégradés et cadres clairs
 *      compris) et rognage à la bounding box du dessin ;
 *   2. mise à l'échelle pour tenir dans le canvas cible moins une marge fixe ;
 *   3. centrage et complément en transparent (la couleur de fond reste au CSS) ;
 *   4. encodage WebP, nom de fichier suffixé du hash du contenu.
 *
 * Le script n'efface jamais rien : les fichiers du dossier de sortie qu'il
 * n'a pas produits sont listés en fin d'exécution pour suppression manuelle.
 *
 * Usage : npm run media:normalize
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "media-src", "exercises");
const OUT_DIR = path.join(ROOT, "public", "media", "exercises");
const PUBLIC_PREFIX = "media/exercises";
const CATALOG_FILE = path.join(
  ROOT,
  "src",
  "features",
  "exercises",
  "exerciseCatalog.ts",
);
const MANIFEST_FILE = path.join(
  ROOT,
  "src",
  "features",
  "exercises",
  "exerciseMedia.generated.ts",
);

const VARIANTS = [
  { key: "thumbnail", suffix: "-thumb", width: 400, height: 320, margin: 0.03 },
  { key: "photo", suffix: "", width: 1200, height: 675, margin: 0.04 },
];

/**
 * Poses d'animation : une planche de N panneaux séparés par des gouttières
 * blanches, même personnage et même angle. Les panneaux sont découpés aux
 * gouttières, puis TOUTES les poses sont cadrées et mises à l'échelle avec le
 * même rectangle (union des dessins) : le personnage ne saute pas d'une pose
 * à l'autre.
 */
const FRAMES_SUFFIX = ".frames";
const FRAME_VARIANT = { suffix: "-frame", width: 1200, height: 675, margin: 0.04 };
/** Colonne de gouttière : moyenne du canal le plus sombre au-dessus de ce seuil. */
const GUTTER_MIN_LIGHTNESS = 245;
const GUTTER_MIN_WIDTH = 4;

/**
 * Le fond est reconnu par propagation depuis les bords de l'image :
 * un pixel clair et peu saturé, voisin d'un pixel de fond de teinte proche,
 * est du fond. Un dégradé ou un cadre clair sont ainsi suivis, alors que les
 * zones claires enfermées dans le dessin (chaussures blanches) restent opaques.
 */
const BACKGROUND_MIN_LIGHTNESS = 200;
const BACKGROUND_MAX_SATURATION = 24;
const BACKGROUND_LOCAL_STEP = 20;
/** Fondu des bords du dessin : écart au fond voisin au-delà duquel le pixel est opaque. */
const OPAQUE_DISTANCE = 72;
const WEBP_QUALITY = 82;
const HASH_LENGTH = 8;

/** Seuils de contrôle qualité. */
const EDGE_TOUCH_RATIO = 0.01;
const TEXT_BAND_MAX_RATIO = 0.12;
const TEXT_BAND_GAP_RATIO = 0.01;
/**
 * Une bande détachée en haut ou en bas, fine et représentant moins de cette part
 * des pixels du dessin, est un résidu (légende, trait, filigrane) : elle est retirée.
 */
const STRAY_BAND_MAX_AREA_RATIO = 0.03;
const MAX_UPSCALE = 1.5;

const SOURCE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg"]);

/**
 * Les lots livrés en 1600×900 exactement ont été produits en étirant des
 * originaux 1536×1024 (3:2) vers du 16:9 : +19 % en largeur, roues ovales,
 * personnages élargis. Ces sources sont ramenées à leurs proportions 3:2
 * avant analyse. Une source native (autre taille) n'est jamais modifiée.
 */
const STRETCHED_SOURCE = {
  width: 1600,
  height: 900,
  restoredHeight: 1067,
  /** Sources 1600×900 issues d'un 16:9 natif (non étirées) : à ne pas corriger. */
  nativeIds: new Set([
    "developpe-epaules-machine",
    "developpe-militaire-halteres",
    "mobilite-cheville-genou-mur",
  ]),
};

async function readCatalogIds() {
  const source = await readFile(CATALOG_FILE, "utf8");
  return new Set(
    [...source.matchAll(/^\s+id: "([^"]+)",$/gm)].map((match) => match[1]),
  );
}

/**
 * Analyse d'une image : masque de fond, bounding box du dessin, bandes horizontales.
 */
function analyze(data, width, height, channels) {
  const size = width * height;
  const isBackgroundCandidate = (i) => {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    return min >= BACKGROUND_MIN_LIGHTNESS && max - min <= BACKGROUND_MAX_SATURATION;
  };
  const closeTo = (i, j) => {
    const a = i * channels;
    const b = j * channels;
    return (
      Math.abs(data[a] - data[b]) <= BACKGROUND_LOCAL_STEP &&
      Math.abs(data[a + 1] - data[b + 1]) <= BACKGROUND_LOCAL_STEP &&
      Math.abs(data[a + 2] - data[b + 2]) <= BACKGROUND_LOCAL_STEP
    );
  };

  const background = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  const seed = (i) => {
    if (!background[i] && isBackgroundCandidate(i)) {
      background[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    const neighbours = [];
    if (x > 0) neighbours.push(i - 1);
    if (x < width - 1) neighbours.push(i + 1);
    if (y > 0) neighbours.push(i - width);
    if (y < height - 1) neighbours.push(i + width);
    for (const j of neighbours) {
      if (!background[j] && isBackgroundCandidate(j) && closeTo(i, j)) {
        background[j] = 1;
        queue[tail++] = j;
      }
    }
  }

  const rowFill = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!background[y * width + x]) rowFill[y]++;
    }
  }

  const findBands = () => {
    const bands = [];
    let start = null;
    for (let y = 0; y <= height; y++) {
      const filled = y < height && rowFill[y] > 0;
      if (filled && start === null) start = y;
      if (!filled && start !== null) {
        bands.push([start, y - 1]);
        start = null;
      }
    }
    return bands;
  };

  /* Retrait des bandes parasites détachées en haut ou en bas. */
  const removedBands = [];
  let bands = findBands();
  const totalContent = rowFill.reduce((sum, v) => sum + v, 0);
  const isStray = (band, gap) => {
    const bandHeight = (band[1] - band[0] + 1) / height;
    let pixels = 0;
    for (let y = band[0]; y <= band[1]; y++) pixels += rowFill[y];
    return (
      bandHeight < TEXT_BAND_MAX_RATIO &&
      gap / height >= TEXT_BAND_GAP_RATIO &&
      pixels / totalContent < STRAY_BAND_MAX_AREA_RATIO
    );
  };
  const eraseBand = (band, side) => {
    for (let y = band[0]; y <= band[1]; y++) {
      for (let x = 0; x < width; x++) background[y * width + x] = 1;
      rowFill[y] = 0;
    }
    removedBands.push(side);
  };
  while (bands.length >= 2 && isStray(bands[0], bands[1][0] - bands[0][1])) {
    eraseBand(bands[0], "haut");
    bands = findBands();
  }
  while (
    bands.length >= 2 &&
    isStray(bands[bands.length - 1], bands[bands.length - 1][0] - bands[bands.length - 2][1])
  ) {
    eraseBand(bands[bands.length - 1], "bas");
    bands = findBands();
  }

  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    if (rowFill[y] === 0) continue;
    for (let x = 0; x < width; x++) {
      if (background[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  if (x1 < 0) return { empty: true };

  return {
    empty: false,
    background,
    bbox: { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 },
    bands,
    removedBands,
  };
}

function qualityWarnings(analysis, width, height) {
  const warnings = [];
  const { bbox, bands } = analysis;

  const edges = {
    gauche: bbox.x0 / width,
    droite: (width - 1 - bbox.x1) / width,
    haut: bbox.y0 / height,
    bas: (height - 1 - bbox.y1) / height,
  };
  const touching = Object.entries(edges)
    .filter(([, ratio]) => ratio < EDGE_TOUCH_RATIO)
    .map(([side]) => side);
  if (touching.length > 0) {
    warnings.push(
      `dessin coupé à la source (touche le bord : ${touching.join(", ")})`,
    );
  }

  for (const side of analysis.removedBands) {
    warnings.push(`bande parasite retirée en ${side} (légende ou trait résiduel)`);
  }

  if (bands.length >= 2) {
    const first = bands[0];
    const last = bands[bands.length - 1];
    const bandHeight = ([a, b]) => (b - a + 1) / height;
    const gapAfterFirst = (bands[1][0] - first[1]) / height;
    const gapBeforeLast = (last[0] - bands[bands.length - 2][1]) / height;
    if (
      bandHeight(first) < TEXT_BAND_MAX_RATIO &&
      gapAfterFirst >= TEXT_BAND_GAP_RATIO
    ) {
      warnings.push("bande détachée en haut : texte incrusté probable");
    }
    if (
      bandHeight(last) < TEXT_BAND_MAX_RATIO &&
      gapBeforeLast >= TEXT_BAND_GAP_RATIO
    ) {
      warnings.push("bande détachée en bas : texte incrusté probable");
    }
  }

  return warnings;
}

/**
 * Rend le fond transparent. Les pixels du dessin qui touchent le fond
 * reçoivent une opacité proportionnelle à leur écart avec ce fond,
 * pour conserver un bord lissé.
 */
function keyOutBackground(data, width, height, channels, background) {
  const size = width * height;
  const out = Buffer.alloc(size * 4);
  for (let i = 0; i < size; i++) {
    const s = i * channels;
    const o = i * 4;
    out[o] = data[s];
    out[o + 1] = data[s + 1];
    out[o + 2] = data[s + 2];

    if (background[i]) {
      out[o + 3] = 0;
      continue;
    }

    const x = i % width;
    const y = (i - x) / width;
    let alpha = 255;
    for (const j of [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ]) {
      if (j < 0 || !background[j]) continue;
      const n = j * channels;
      const d =
        Math.abs(data[s] - data[n]) +
        Math.abs(data[s + 1] - data[n + 1]) +
        Math.abs(data[s + 2] - data[n + 2]);
      alpha = Math.min(alpha, Math.round(Math.min(1, d / OPAQUE_DISTANCE) * 255));
    }
    out[o + 3] = alpha;
  }
  return out;
}

async function renderVariant(rgba, sourceWidth, sourceHeight, bbox, variant) {
  const targetWidth = Math.round(variant.width * (1 - 2 * variant.margin));
  const targetHeight = Math.round(variant.height * (1 - 2 * variant.margin));
  const scale = Math.min(targetWidth / bbox.width, targetHeight / bbox.height);
  const contentWidth = Math.max(1, Math.round(bbox.width * scale));
  const contentHeight = Math.max(1, Math.round(bbox.height * scale));
  const left = Math.floor((variant.width - contentWidth) / 2);
  const top = Math.floor((variant.height - contentHeight) / 2);

  const buffer = await sharp(rgba, {
    raw: { width: sourceWidth, height: sourceHeight, channels: 4 },
  })
    .extract({
      left: bbox.x0,
      top: bbox.y0,
      width: bbox.width,
      height: bbox.height,
    })
    .resize(contentWidth, contentHeight, { fit: "fill", kernel: "lanczos3" })
    .extend({
      top,
      bottom: variant.height - contentHeight - top,
      left,
      right: variant.width - contentWidth - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 90 })
    .toBuffer();

  return {
    buffer,
    scale,
    fill: {
      width: contentWidth / variant.width,
      height: contentHeight / variant.height,
    },
  };
}

async function listSources() {
  if (!existsSync(SRC_DIR)) return [];
  const zones = await readdir(SRC_DIR, { withFileTypes: true });
  const sources = [];
  for (const zone of zones) {
    if (!zone.isDirectory()) continue;
    const files = await readdir(path.join(SRC_DIR, zone.name));
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      const base = path.basename(file, ext);
      const isFrames = base.endsWith(FRAMES_SUFFIX);
      sources.push({
        zone: zone.name,
        id: isFrames ? base.slice(0, -FRAMES_SUFFIX.length) : base,
        file: path.join(SRC_DIR, zone.name, file),
        isFrames,
      });
    }
  }
  return sources.sort((a, b) => a.id.localeCompare(b.id, "fr"));
}

/** Limites [x0, x1] des panneaux d'une planche, séparés par des colonnes blanches. */
function detectPanels(data, width, height, channels) {
  const isGutterColumn = (x) => {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      sum += Math.min(data[i], data[i + 1], data[i + 2]);
    }
    return sum / height >= GUTTER_MIN_LIGHTNESS;
  };
  const panels = [];
  let start = null;
  let gutter = 0;
  for (let x = 0; x <= width; x++) {
    const inPanel = x < width && !isGutterColumn(x);
    if (inPanel) {
      if (start === null) start = x;
      gutter = 0;
    } else if (start !== null) {
      gutter++;
      if (gutter >= GUTTER_MIN_WIDTH || x === width) {
        panels.push([start, x - gutter]);
        start = null;
        gutter = 0;
      }
    }
  }
  return panels.filter(([a, b]) => (b - a + 1) / width >= 0.1);
}

/**
 * Produit les poses d'un exercice depuis sa planche. Retourne les noms de
 * fichiers écrits, dans l'ordre des panneaux.
 */
async function renderFrames(source, outZoneDir, produced) {
  const { data, info } = await sharp(source.file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const panelBounds = detectPanels(data, width, height, channels);
  if (panelBounds.length < 2) {
    throw new Error(
      `${source.zone}/${source.id} : ${panelBounds.length} panneau détecté sur la planche de poses (gouttières blanches attendues)`,
    );
  }

  /* Analyse de chaque panneau dans son propre repère. */
  const panels = [];
  for (const [x0, x1] of panelBounds) {
    const pw = x1 - x0 + 1;
    const raw = await sharp(data, { raw: { width, height, channels } })
      .extract({ left: x0, top: 0, width: pw, height })
      .raw()
      .toBuffer();
    const analysis = analyze(raw, pw, height, channels);
    if (analysis.empty) throw new Error(`${source.zone}/${source.id} : panneau vide`);
    panels.push({ raw, width: pw, analysis });
  }

  /* Cadre commun = union des dessins, en coordonnées de panneau. */
  const union = panels.reduce(
    (acc, p) => ({
      x0: Math.min(acc.x0, p.analysis.bbox.x0),
      y0: Math.min(acc.y0, p.analysis.bbox.y0),
      x1: Math.max(acc.x1, p.analysis.bbox.x1),
      y1: Math.max(acc.y1, p.analysis.bbox.y1),
    }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  );
  const minPanelWidth = Math.min(...panels.map((p) => p.width));
  const bbox = {
    x0: union.x0,
    y0: union.y0,
    x1: Math.min(union.x1, minPanelWidth - 1),
    y1: union.y1,
  };
  bbox.width = bbox.x1 - bbox.x0 + 1;
  bbox.height = bbox.y1 - bbox.y0 + 1;

  const files = [];
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const rgba = keyOutBackground(p.raw, p.width, height, channels, p.analysis.background);
    const rendered = await renderVariant(rgba, p.width, height, bbox, FRAME_VARIANT);
    const hash = createHash("sha1").update(rendered.buffer).digest("hex").slice(0, HASH_LENGTH);
    const fileName = `${source.id}${FRAME_VARIANT.suffix}${i + 1}.${hash}.webp`;
    await writeFile(path.join(outZoneDir, fileName), rendered.buffer);
    produced.add(fileName);
    files.push(fileName);
  }
  return { files, panelCount: panels.length, bbox };
}

function formatPercent(value) {
  return `${Math.round(value * 100)} %`;
}

async function main() {
  const catalogIds = await readCatalogIds();
  const sources = await listSources();

  if (sources.length === 0) {
    console.error(`Aucune source dans ${path.relative(ROOT, SRC_DIR)}.`);
    process.exit(1);
  }

  const manifest = {};
  const producedByZone = new Map();
  let hasErrors = false;

  for (const source of sources) {
    if (source.isFrames) continue;
    const label = `${source.zone}/${source.id}`;

    if (!catalogIds.has(source.id)) {
      console.error(
        `✗ ${label} : aucun exercice "${source.id}" dans le catalogue.`,
      );
      hasErrors = true;
      continue;
    }

    let image = sharp(source.file).removeAlpha();
    const meta = await image.metadata();
    const restoredProportions =
      meta.width === STRETCHED_SOURCE.width &&
      meta.height === STRETCHED_SOURCE.height &&
      !STRETCHED_SOURCE.nativeIds.has(source.id);
    if (restoredProportions) {
      image = image.resize(STRETCHED_SOURCE.width, STRETCHED_SOURCE.restoredHeight, {
        fit: "fill",
        kernel: "lanczos3",
      });
    }
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    const analysis = analyze(data, info.width, info.height, info.channels);
    if (analysis.empty) {
      console.error(`✗ ${label} : image vide.`);
      hasErrors = true;
      continue;
    }

    const warnings = qualityWarnings(analysis, info.width, info.height);
    if (restoredProportions) {
      warnings.push("proportions 3:2 rétablies (source 1600×900 étirée)");
    }
    const rgba = keyOutBackground(
      data,
      info.width,
      info.height,
      info.channels,
      analysis.background,
    );

    const outZoneDir = path.join(OUT_DIR, source.zone);
    await mkdir(outZoneDir, { recursive: true });
    const produced = producedByZone.get(source.zone) ?? new Set();
    producedByZone.set(source.zone, produced);

    const entry = {};
    const report = [];

    for (const variant of VARIANTS) {
      const rendered = await renderVariant(
        rgba,
        info.width,
        info.height,
        analysis.bbox,
        variant,
      );

      if (rendered.scale > MAX_UPSCALE) {
        warnings.push(
          `${variant.key} : agrandissement ×${rendered.scale.toFixed(2)} (source trop petite)`,
        );
      }

      const hash = createHash("sha1")
        .update(rendered.buffer)
        .digest("hex")
        .slice(0, HASH_LENGTH);
      const fileName = `${source.id}${variant.suffix}.${hash}.webp`;
      await writeFile(path.join(outZoneDir, fileName), rendered.buffer);
      produced.add(fileName);

      entry[variant.key] = `${PUBLIC_PREFIX}/${source.zone}/${fileName}`;
      report.push(
        `${variant.key} ${formatPercent(rendered.fill.width)} × ${formatPercent(rendered.fill.height)}`,
      );
    }

    manifest[source.id] = entry;

    const { bbox } = analysis;
    console.log(
      `${warnings.length ? "⚠" : "✓"} ${label} — source ${info.width}×${info.height}, dessin ${bbox.width}×${bbox.height} — ${report.join(", ")}`,
    );
    for (const warning of warnings) console.log(`    ↳ ${warning}`);
  }

  /* Planches de poses : après les images fixes, car une pose sans exercice illustré n'a pas de sens. */
  for (const source of sources.filter((s) => s.isFrames)) {
    const label = `${source.zone}/${source.id}`;
    if (!manifest[source.id]) {
      console.error(`✗ ${label} : planche de poses sans illustration fixe pour cet exercice.`);
      hasErrors = true;
      continue;
    }
    try {
      const outZoneDir = path.join(OUT_DIR, source.zone);
      const produced = producedByZone.get(source.zone) ?? new Set();
      producedByZone.set(source.zone, produced);
      const { files, panelCount, bbox } = await renderFrames(source, outZoneDir, produced);
      manifest[source.id].frames = files.map((f) => `${PUBLIC_PREFIX}/${source.zone}/${f}`);
      console.log(
        `✓ ${label} — ${panelCount} poses, cadre commun ${bbox.width}×${bbox.height}`,
      );
    } catch (error) {
      console.error(`✗ ${error.message}`);
      hasErrors = true;
    }
  }

  const ids = Object.keys(manifest).sort((a, b) => a.localeCompare(b, "fr"));
  const lines = [
    "/**",
    " * Fichier généré par scripts/normalize-exercise-media.mjs — ne pas modifier à la main.",
    " *",
    " * Chemins relatifs à import.meta.env.BASE_URL.",
    " */",
    "",
    "export const exerciseMedia = {",
    ...ids.flatMap((id) => [
      `  "${id}": {`,
      `    thumbnail: "${manifest[id].thumbnail}",`,
      `    photo: "${manifest[id].photo}",`,
      ...(manifest[id].frames
        ? [
            "    frames: [",
            ...manifest[id].frames.map((f) => `      "${f}",`),
            "    ],",
          ]
        : []),
      "  },",
    ]),
    "} as const;",
    "",
    "export type ExerciseMediaId = keyof typeof exerciseMedia;",
    "",
  ];
  await writeFile(MANIFEST_FILE, lines.join("\n"), "utf8");

  console.log(
    `\n${ids.length} exercice(s) illustré(s) → ${path.relative(ROOT, MANIFEST_FILE)}`,
  );

  /* Fichiers présents dans la sortie mais non produits : à supprimer à la main. */
  const orphans = [];
  for (const [zone, produced] of producedByZone) {
    for (const file of await readdir(path.join(OUT_DIR, zone))) {
      if (!produced.has(file)) orphans.push(`${zone}/${file}`);
    }
  }
  if (orphans.length > 0) {
    console.log(
      `\n${orphans.length} fichier(s) non générés dans ${path.relative(ROOT, OUT_DIR)} (à supprimer) :`,
    );
    for (const orphan of orphans) console.log(`  – ${orphan}`);
  }

  if (hasErrors) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
