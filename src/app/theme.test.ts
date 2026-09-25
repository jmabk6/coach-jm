// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTheme, resolveTheme, THEME_COLORS } from "./theme";

/** Lot L.3 — thème clair / sombre / auto ; plus aucune couleur en dur hors tokens.css. */

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

const SRC = join(__dirname, "..");

describe("thème", () => {
  it("Auto suit le système ; Clair et Sombre s'imposent", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("applyTheme pose data-theme, color-scheme et theme-color", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_COLORS.dark);
    expect(localStorage.getItem("coach-jm-theme")).toBe("dark");
  });

  it("aucune couleur en dur dans les styles, hors tokens.css ; chaque jeton utilisé est défini dans les deux thèmes", () => {
    const tokens = readFileSync(join(SRC, "styles", "tokens.css"), "utf8");
    const cut = tokens.lastIndexOf(':root[data-theme="dark"]');
    const [light, dark] = [tokens.slice(0, cut), tokens.slice(cut)];
    const defined = (block: string) => new Set([...block.matchAll(/(--color-[a-z0-9-]+):/g)].map((match) => match[1]));
    const lightTokens = defined(light);
    const darkTokens = defined(dark);
    expect([...lightTokens].filter((token) => !darkTokens.has(token))).toEqual([]);

    const offenders: string[] = [];
    const missing = new Set<string>();
    for (const file of cssFiles(SRC)) {
      if (file.endsWith(join("styles", "tokens.css"))) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b(?!-)/g)) offenders.push(`${file}: ${match[0]}`);
      for (const match of text.matchAll(/var\((--color-[a-z0-9-]+)/g)) if (!lightTokens.has(match[1]!)) missing.add(match[1]!);
    }
    expect(offenders).toEqual([]);
    expect([...missing]).toEqual([]);
  });
});
