import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Carte RENPHO de l'Accueil (correctif du 05/10/2026) : en production,
 * l'ordre des feuilles de style n'est pas celui du développement —
 * `.today-card` (colonne) passait après `.body-card` (ligne) et le « + »
 * tombait sous les mesures. Les surcharges de `.today-card` doivent donc
 * gagner par leur précision, jamais par l'ordre de chargement.
 */
const css = readFileSync(new URL("./body.css", import.meta.url), "utf8");

describe("carte RENPHO : surcharges de .today-card indépendantes de l'ordre du CSS", () => {
  it("la mise en ligne et la version vide sont écrites .today-card.body-card", () => {
    expect(css).toMatch(/\.today-card\.body-card\s*\{[^}]*flex-direction:\s*row/);
    expect(css).toMatch(/\.today-card\.body-card--empty\s*\{/);
    expect(css).not.toMatch(/(^|\n)\.body-card\s*\{/);
    expect(css).not.toMatch(/(^|\n)\.body-card--empty\s*\{/);
  });
});
