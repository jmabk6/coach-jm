import { Navigate, useLocation } from "react-router-dom";

/**
 * Redirection permanente d'une ancienne adresse (lot B) : le préfixe
 * `from` est remplacé par `to`, le reste du chemin, la requête et l'ancre
 * sont gardés. `replace` : le retour arrière ne revient pas sur
 * l'ancienne adresse.
 */
export function RedirectPrefix({ from, to }: { from: string; to: string }) {
  const location = useLocation();
  const rest = location.pathname.startsWith(from) ? location.pathname.slice(from.length) : "";

  return <Navigate to={{ pathname: `${to}${rest}`, search: location.search, hash: location.hash }} replace />;
}
