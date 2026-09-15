/**
 * Fichier généré par scripts/normalize-exercise-media.mjs — ne pas modifier à la main.
 *
 * Chemins relatifs à import.meta.env.BASE_URL.
 */

export const exerciseMedia = {
  "hip-thrust": {
    thumbnail: "media/exercises/jambes/hip-thrust-thumb.eaf0ebbb.webp",
    photo: "media/exercises/jambes/hip-thrust.557e638b.webp",
  },
  "leg-curl-assis": {
    thumbnail: "media/exercises/jambes/leg-curl-assis-thumb.9ab49d2d.webp",
    photo: "media/exercises/jambes/leg-curl-assis.2e867b34.webp",
  },
  "presse-cuisses": {
    thumbnail: "media/exercises/jambes/presse-cuisses-thumb.7a7fa803.webp",
    photo: "media/exercises/jambes/presse-cuisses.36691872.webp",
  },
  "souleve-terre-roumain": {
    thumbnail: "media/exercises/jambes/souleve-terre-roumain-thumb.7d195d99.webp",
    photo: "media/exercises/jambes/souleve-terre-roumain.d1e6ff49.webp",
  },
  "squat": {
    thumbnail: "media/exercises/jambes/squat-thumb.8a7fe7ec.webp",
    photo: "media/exercises/jambes/squat.4f953e27.webp",
  },
} as const;

export type ExerciseMediaId = keyof typeof exerciseMedia;
