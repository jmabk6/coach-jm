import { describe, expect, it } from "vitest";
import {
  canonicalStringify as scriptCanonical,
  sha256Hex as scriptSha256,
} from "../../../scripts/verify-backup.mjs";
import { CANONICAL_RULE, canonicalStringify, hashCanonical, sha256Hex } from "./canonicalJson";
import { auditStore, auditStores, describeIssue } from "./serializationAudit";

const tricky = {
  z: 1,
  a: { d: [3, 2, { y: null, x: "é — « »  \n\"\\" }], c: 0.1 + 0.2, b: -0 },
  m: [undefined, 1],
  u: undefined,
  n: null,
  t: true,
  big: 1e21,
  small: 1e-7,
  emoji: "🏋️",
};

describe("forme canonique", () => {
  it("trie les clés à tous les niveaux, garde l'ordre des tableaux, omet undefined, écrit -0 comme 0", () => {
    const text = canonicalStringify(tricky);

    expect(text).toBe(
      '{"a":{"b":0,"c":0.30000000000000004,"d":[3,2,{"x":"é — « »  \\n\\"\\\\","y":null}]},"big":1e+21,"emoji":"🏋️","m":[null,1],"n":null,"small":1e-7,"t":true,"z":1}',
    );
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it("est identique à l'implémentation du script de vérification (navigateur et Node signent pareil)", async () => {
    for (const value of [tricky, [], {}, "x", 0, null, [{ b: [{ d: 1, c: 2 }], a: "" }]]) {
      expect(scriptCanonical(value)).toBe(canonicalStringify(value));
    }
    expect(scriptSha256(canonicalStringify(tricky))).toBe(await sha256Hex(canonicalStringify(tricky)));
    expect(await hashCanonical(tricky)).toHaveLength(64);
    expect(CANONICAL_RULE).toBe("sorted-keys-json-v1");
  });

  it("l'empreinte ne dépend ni de l'ordre des clés ni de la mise en forme du fichier", async () => {
    const a = await hashCanonical({ stores: { workouts: [{ id: "1", x: [1, 2] }] } });
    const b = await hashCanonical(JSON.parse('{ "stores" : { "workouts": [ { "x": [1,2], "id": "1" } ] } }'));
    expect(a).toBe(b);
  });
});

describe("audit de sérialisation", () => {
  it("ne signale rien sur des valeurs JSON pures", () => {
    expect(auditStore("workouts", [{ id: "w", a: [1, "x", null, { b: true, c: 1.5 }] }])).toEqual([]);
  });

  it("classe les pertes bénignes en avertissement, avec store, identifiant et chemin", () => {
    const issues = auditStore("workouts", [
      { id: "w1", blocks: [{ series: [{ rpe: undefined }] }], zero: -0, list: [1, undefined] },
    ]);

    expect(issues.map((issue) => [issue.path, issue.kind, issue.severity])).toEqual([
      ["blocks[0].series[0].rpe", "undefined_property", "lossy"],
      ["zero", "negative_zero", "lossy"],
      ["list[1]", "undefined_in_array", "lossy"],
    ]);
    expect(describeIssue(issues[0]!)).toBe("workouts · w1 · blocks[0].series[0].rpe : propriété indéfinie (omise dans le fichier)");
  });

  it("refuse ce qui n'a pas de forme JSON fidèle : Date, NaN, Infinity, bigint, Map, Set, binaire, classe inconnue, fonction", () => {
    class Foreign {}
    const issues = auditStores({
      exercises: [{ id: "e", created: new Date("2026-09-19T00:00:00Z"), nan: NaN, inf: -Infinity }],
      workouts: [{ id: "w", big: 10n, map: new Map(), set: new Set(), bytes: new Uint8Array(2), buffer: new ArrayBuffer(1), other: new Foreign(), fn: () => 1 }],
    });

    expect(issues.every((issue) => issue.severity === "unserializable")).toBe(true);
    expect(issues.map((issue) => issue.kind)).toEqual([
      "date",
      "non_finite_number",
      "non_finite_number",
      "bigint",
      "map_or_set",
      "map_or_set",
      "binary",
      "binary",
      "foreign_object",
      "function",
    ]);
    expect(issues[0]).toMatchObject({ store: "exercises", id: "e", path: "created" });
  });

  it("un enregistrement sans identifiant lisible est repéré par sa position", () => {
    const issues = auditStore("goals", [{ noId: true, when: new Date() }]);
    expect(issues[0]).toMatchObject({ id: undefined, path: "when" });
    expect(auditStore("goals", [new Date()])[0]?.path).toBe("[0]");
  });
});
