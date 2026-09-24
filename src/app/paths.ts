/**
 * Chemins de l'application (lot B, conception V2 § 2.1) : **seul** endroit
 * où une adresse est écrite. Les écrans appellent ces fonctions au lieu de
 * concaténer des chaînes ; renommer une route se fait ici, et un chemin
 * oublié devient une erreur de compilation plutôt qu'un lien cassé.
 *
 * `/exercises…` et `/workouts…` ne changent pas de nom au lot B : ils
 * restent écrits là où ils sont utilisés.
 */

export const ROUTES = {
  home: "/",
  planning: "/planning",
  weeklyProgram: "/planning/programmation",
  goals: "/objectifs",
  /** Un objectif (M5 à M7, lot H.4) ; `:key` est la clé de l'objectif. */
  goal: "/objectifs/:key",
  sessions: "/seances",
  workoutLive: "/seance-en-cours",
  quickExercise: "/seance-en-cours/exercice-rapide",
  /** Fin de séance (M10) : séance terminée, en attente d'enregistrement (lot E). */
  workoutEnd: "/seance-en-cours/fin",
  progression: "/progression",
  history: "/historique",
  plus: "/plus",
  /** Plus > Protocoles de tests (M11, lot G.6). */
  plusTests: "/plus/protocoles",
} as const;

/**
 * Anciennes adresses (avant le lot B), redirigées de façon permanente :
 * le préfixe est remplacé, le reste du chemin et la requête sont gardés
 * (`/sessions/abc/blocks/b1?add=x` → `/seances/abc/blocks/b1?add=x`).
 * Elles protègent les liens mémorisés et les `returnTo` déjà construits.
 */
export const LEGACY_PREFIXES: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/programme", to: ROUTES.planning },
  { from: "/sessions", to: ROUTES.sessions },
  { from: "/seance", to: ROUTES.workoutLive },
];

type Query = URLSearchParams | Record<string, string | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;

  const params =
    query instanceof URLSearchParams
      ? query
      : new URLSearchParams(
          Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
        );
  const search = params.toString();

  return search ? `${path}?${search}` : path;
}

/** Segment de route relatif, tel que `createHashRouter` l'attend (`programme`). */
export function routeSegment(path: string): string {
  return path.replace(/^\//, "");
}

export const paths = {
  home: () => ROUTES.home,

  goals: () => ROUTES.goals,
  goal: (key: string, query?: { onglet?: "exercices" | "conseils" }) => withQuery(`${ROUTES.goals}/${key}`, query),

  planning: (query?: { date?: string; view?: "mois"; month?: string }) => withQuery(ROUTES.planning, query),
  weeklyProgram: () => ROUTES.weeklyProgram,

  sessions: () => ROUTES.sessions,
  sessionNew: () => `${ROUTES.sessions}/new`,
  session: (sessionId: string) => `${ROUTES.sessions}/${sessionId}`,
  sessionEdit: (sessionId: string) => `${ROUTES.sessions}/${sessionId}/edit`,
  sessionNote: (sessionId: string, blockId: string) => `${ROUTES.sessions}/${sessionId}/notes/${blockId}`,
  sessionBlock: (sessionId: string, blockId: string) => `${ROUTES.sessions}/${sessionId}/blocks/${blockId}`,
  sessionGroup: (sessionId: string, groupId: string) => `${ROUTES.sessions}/${sessionId}/groups/${groupId}`,
  sessionGroupChild: (sessionId: string, groupId: string, childId: string) =>
    `${ROUTES.sessions}/${sessionId}/groups/${groupId}/children/${childId}`,

  workoutLive: (query?: Query) => withQuery(ROUTES.workoutLive, query),
  quickExercise: () => ROUTES.quickExercise,
  workoutEnd: () => ROUTES.workoutEnd,

  progression: (query?: Query) => withQuery(ROUTES.progression, query),
  cardioDetail: (exerciseId: string, query?: Query) => withQuery(`${ROUTES.progression}/cardio/${exerciseId}`, query),
  history: () => ROUTES.history,

  plus: () => ROUTES.plus,
  plusTests: () => ROUTES.plusTests,
} as const;

/** Vrai si `pathname` est la route `base` ou l'une de ses sous-routes. */
export function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}
