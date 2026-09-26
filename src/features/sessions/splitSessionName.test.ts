import { describe, expect, it } from "vitest";
import { splitSessionName } from "./splitSessionName";

describe("nom de séance en deux lignes (26/09/2026)", () => {
  it("avant « — » en ligne 1, après en ligne 2 ; sans « — », une seule ligne", () => {
    expect(splitSessionName("Muscu A — Traction force / dos")).toEqual({ main: "Muscu A", sub: "Traction force / dos" });
    expect(splitSessionName("Séance libre")).toEqual({ main: "Séance libre" });
    expect(splitSessionName("A — B — C")).toEqual({ main: "A", sub: "B — C" });
  });
});
