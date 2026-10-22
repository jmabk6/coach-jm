import type { Id } from "./exercise";

/**
 * Perspectives au 31 mars (lot P1, 22/10/2026) : données de progression
 * par exercice des séances Muscu A, B et C.
 *
 * Quatre repères distincts, jamais confondus :
 * 1. la trajectoire initiale, enregistrée une fois au départ de la piste ;
 * 2. l'objectif du jour, figé sur la brique de la séance (`DayTarget`) ;
 * 3. le résultat réel, les séries enregistrées ;
 * 4. la prévision actualisée, recalculée à la demande, jamais stockée.
 */

/** Horizon des perspectives : après cette date, bilan consultable, aucune nouvelle échéance. */
export const PERSPECTIVE_HORIZON = "2027-03-31";

/**
 * Crans réels d'un équipement : les charges possibles sont `below`, puis
 * `base`, `base + step`, `base + 2 × step`… Jamais de charge intermédiaire
 * inventée (pas de 135 kg à la presse, pas de 47,5 kg à la chest press).
 */
export interface LoadSteps {
  base: number;
  step: number;
  /** Charges isolées sous `base` (haltères 4 et 5 kg avant 6, 8, 10…). */
  below?: number[];
}

export type PerspectiveSession = "A" | "B" | "C";

/** Une série visée : charge (kg, par haltère pour les haltères), répétitions, durée. */
export interface SetTarget {
  kg?: number;
  reps?: number;
  /** Durée tenue (suspension) ou durée de descente par répétition (négatives). */
  durationSec?: number;
  /**
   * +1 répétition **visée** : seulement si la série reste dans le plafond de
   * RPE. Refaire une répétition de moins dans le plafond compte comme
   * objectif atteint, jamais comme un échec.
   */
  stretch?: true;
  /**
   * Transition entre deux crans : série de travail à l'ancien cran ou au
   * nouveau. L'échauffement n'est jamais dans l'objectif.
   */
  step?: "previous" | "new";
}

export type DayTargetKind =
  /** +1 répétition sur au moins une série. */
  | "progress"
  /** Mêmes répétitions : séries faites au plafond de RPE. */
  | "repeat"
  /** RPE au-dessus du plafond, manquant, ou série manquante : on reproduit dans la règle. */
  | "consolidate"
  /** Palier validé : cran supérieur, retour au bas de la fourchette. */
  | "raise"
  /** Grand cran (> 15 %) ou série tombée sous la fourchette : une partie des séries au nouveau cran. */
  | "transition"
  /** Progression suspendue (douleur) : ni objectif ni charge recommandée. */
  | "suspended"
  /** Pas encore de séance comparable. */
  | "insufficient"
  /** Traction assistée : l'objectif vient du pari V6. */
  | "v6";

/**
 * L'objectif présenté pour une séance, figé au démarrage : ce qui est noté
 * pendant la séance ne le déplace pas. Enregistré sur la brique.
 */
export interface DayTarget {
  computedAt: string;
  kind: DayTargetKind;
  /** Une entrée par série de travail prévue ; vide si suspendu ou données insuffisantes. */
  sets: SetTarget[];
  /** Plafond de RPE à respecter sur chaque série. */
  rpeMax?: number;
  /** Séance réelle sur laquelle l'objectif est calculé. */
  basisWorkoutId?: Id;
  /** Explication courte affichée avec l'objectif. */
  reason: string;
}

/** Une semaine de trajectoire ou de prévision : niveau estimé et forme lisible. */
export interface TrajectoryWeek {
  /** Lundi de la semaine (YYYY-MM-DD). */
  week: string;
  /** Niveau de force estimé (outil interne, jamais affiché comme un maximum). */
  level?: number;
  probable?: SetTarget;
  low?: SetTarget;
  high?: SetTarget;
}

/**
 * Une semaine de la référence détaillée (correction du 22/10/2026) :
 * l'objectif de **chaque** série, comme en séance.
 */
export interface PlanWeek {
  /** Lundi de la semaine (YYYY-MM-DD). */
  week: string;
  sets: SetTarget[];
  kind?: DayTargetKind;
  /** Moyenne des niveaux des séries au minimum accepté (outil interne). */
  level: number;
  /**
   * Validation **interne** de la simulation : la séance simulée peut-elle
   * faire cet objectif ? Sinon il est repris la semaine suivante. Jamais
   * présenté comme un résultat : une semaine à venir n'est jamais « atteinte ».
   */
  feasible: boolean;
  /** Réalisable : ce que la séance simulée fait, série par série (la répétition visée faite ou non). */
  done?: SetTarget[];
}

export type ProgressionEngine =
  /** Charge et répétitions (machines, poulies, haltères). */
  | "load"
  /** Durée tenue sans charge (suspension). */
  | "duration"
  /** Répétitions et durée de descente (tractions négatives). */
  | "negatives"
  /** Traction assistée : pari V6, aucun second moteur. */
  | "v6";

/**
 * Une piste : un exercice dans une séance A, B ou C (identifiant = la
 * brique du modèle de séance). Une séance lourde en A n'augmente jamais le
 * volume de B : chaque piste a sa consigne et son historique, sauf un
 * groupe partagé explicite (élévations latérales).
 */
export interface ProgressionTrack {
  /** Identifiant de la brique du modèle (`sourceBlockId` des séances). */
  id: Id;
  session: PerspectiveSession;
  templateId: Id;
  exerciseId: Id;
  engine: ProgressionEngine;
  /**
   * Groupe partagé : même exercice, même consigne, même plafond, même
   * convention dans plusieurs séances. Un seul niveau, au plus un cran
   * par semaine pour l'ensemble du groupe.
   */
  shareGroup?: string;
  createdAt: string;
  /**
   * Trajectoire initiale : calculée une fois, jamais réécrite. Son sens
   * d'origine est conservé : un **repère de meilleure série** (une charge et
   * un nombre de répétitions), pas un objectif pour chaque série.
   */
  initial: {
    createdAt: string;
    weeks: TrajectoryWeek[];
    /** Moins de 5 séances comparables au départ. */
    provisional: boolean;
    /** Recréée après la restauration d'une sauvegarde qui ne la contenait pas. */
    recreated?: true;
  };
  /**
   * Référence détaillée, datée, ajoutée par la correction du 22/10/2026 :
   * l'objectif de chaque série semaine par semaine, calculé une fois sur
   * les séances d'alors, jamais réécrit. N'efface pas `initial`.
   */
  detailed?: {
    createdAt: string;
    /** Dernière séance réelle sur laquelle elle part. */
    basis?: { workoutId: Id; date: string };
    weeks: PlanWeek[];
    provisional: boolean;
    recreated?: true;
  };
  /**
   * Références successives : les séances antérieures à la dernière ne sont
   * plus comparées (changement de programme, de machine, de convention).
   */
  references: Array<{ from: string; reason: string }>;
  /** Hausse suspendue (douleur signalée) : ni objectif ni charge recommandée. */
  suspension?: { from: string; reason: string };
  /** Exercice retiré du programme : piste close, consultable. */
  closedAt?: string;
}
