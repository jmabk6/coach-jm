/**
 * Nom d'une séance en deux lignes (décision du 26/09/2026) : la partie
 * avant « — » (« Muscu A »), puis la partie après (« Traction force / dos »).
 * Sans « — », une seule ligne.
 */
export function splitSessionName(name: string): { main: string; sub?: string } {
  const index = name.indexOf(" — ");
  if (index < 0) return { main: name };
  const main = name.slice(0, index).trim();
  const sub = name.slice(index + 3).trim();
  return sub ? { main, sub } : { main };
}
