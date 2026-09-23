// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from "react-router-dom";
import { legacyRedirectRoutes } from "./legacyRedirects";
import { ROUTES, routeSegment } from "./paths";

/**
 * Lot B.2 : chaque ancienne adresse aboutit à la nouvelle, chemin,
 * requête et ancre gardés ; le retour arrière ne revient pas dessus.
 */
function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</p>;
}

function routes(): RouteObject[] {
  return [
    {
      path: "/",
      children: [
        { index: true, element: <Where /> },
        { path: `${routeSegment(ROUTES.planning)}/*`, element: <Where /> },
        { path: `${routeSegment(ROUTES.sessions)}/*`, element: <Where /> },
        { path: `${routeSegment(ROUTES.workoutLive)}/*`, element: <Where /> },
        ...legacyRedirectRoutes,
      ],
    },
  ];
}

function open(entries: string[]) {
  const router = createMemoryRouter(routes(), { initialEntries: entries, initialIndex: entries.length - 1 });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(cleanup);

describe("redirections permanentes des anciennes adresses", () => {
  it.each([
    ["/programme", "/planning"],
    ["/programme?date=2026-09-27", "/planning?date=2026-09-27"],
    ["/programme?view=mois&month=2026-09", "/planning?view=mois&month=2026-09"],
    ["/programme/programmation", "/planning/programmation"],
    ["/sessions", "/seances"],
    ["/sessions/new", "/seances/new"],
    ["/sessions/abc", "/seances/abc"],
    ["/sessions/abc/edit", "/seances/abc/edit"],
    ["/sessions/abc/notes/n1", "/seances/abc/notes/n1"],
    ["/sessions/abc/blocks/b1?add=x", "/seances/abc/blocks/b1?add=x"],
    ["/sessions/abc/groups/g1?add=x&rejected=y", "/seances/abc/groups/g1?add=x&rejected=y"],
    ["/sessions/abc/groups/g1/children/c1", "/seances/abc/groups/g1/children/c1"],
    ["/sessions/abc?select=1&picked=b1", "/seances/abc?select=1&picked=b1"],
    ["/seance", "/seance-en-cours"],
    ["/seance?add=tirage-vertical", "/seance-en-cours?add=tirage-vertical"],
    ["/seance?substitute=b&child=c", "/seance-en-cours?substitute=b&child=c"],
    ["/seance/exercice-rapide", "/seance-en-cours/exercice-rapide"],
  ])("%s → %s", async (from, to) => {
    open([from]);
    expect((await screen.findByTestId("where")).textContent).toBe(to);
  });

  it("le retour arrière ne ramène pas à l'ancienne adresse", async () => {
    const router = open(["/", "/sessions/abc"]);
    expect((await screen.findByTestId("where")).textContent).toBe("/seances/abc");

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/");
  });

  it("les nouvelles adresses ne sont pas capturées par les anciennes (seance ≠ seance-en-cours)", async () => {
    open(["/seance-en-cours?add=x"]);
    expect((await screen.findByTestId("where")).textContent).toBe("/seance-en-cours?add=x");
  });
});
