import type { RouteObject } from "react-router-dom";
import { LEGACY_PREFIXES, routeSegment } from "./paths";
import { RedirectPrefix } from "./RedirectPrefix";

/**
 * Routes des anciennes adresses : `ancien/*` couvre l'adresse elle-même et
 * toutes ses sous-adresses. `seance/*` ne capture pas `seance-en-cours` :
 * React Router compare segment par segment.
 */
export const legacyRedirectRoutes: RouteObject[] = LEGACY_PREFIXES.map(({ from, to }) => ({
  path: `${routeSegment(from)}/*`,
  element: <RedirectPrefix from={from} to={to} />,
}));
