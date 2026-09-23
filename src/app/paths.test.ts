import { describe, expect, it } from "vitest";
import { isUnder, paths, routeSegment, ROUTES } from "./paths";

/**
 * Lot B : chaque chemin rend exactement l'adresse attendue. Les
 * paramètres passent par `URLSearchParams`, comme `encodeURIComponent`
 * pour tout ce que l'application y met (identifiants, dates, chemins).
 */
describe("chemins de l'application", () => {
  it("rend les adresses des écrans", () => {
    expect(paths.home()).toBe("/");
    expect(paths.planning()).toBe(ROUTES.planning);
    expect(paths.planning({ date: "2026-09-27" })).toBe(`${ROUTES.planning}?date=2026-09-27`);
    expect(paths.weeklyProgram()).toBe(ROUTES.weeklyProgram);
    expect(paths.sessions()).toBe(ROUTES.sessions);
    expect(paths.sessionNew()).toBe(`${ROUTES.sessions}/new`);
    expect(paths.session("abc")).toBe(`${ROUTES.sessions}/abc`);
    expect(paths.sessionEdit("abc")).toBe(`${ROUTES.sessions}/abc/edit`);
    expect(paths.sessionNote("abc", "new")).toBe(`${ROUTES.sessions}/abc/notes/new`);
    expect(paths.sessionBlock("abc", "b1")).toBe(`${ROUTES.sessions}/abc/blocks/b1`);
    expect(paths.sessionGroup("abc", "g1")).toBe(`${ROUTES.sessions}/abc/groups/g1`);
    expect(paths.sessionGroupChild("abc", "g1", "c1")).toBe(`${ROUTES.sessions}/abc/groups/g1/children/c1`);
    expect(paths.workoutLive()).toBe(ROUTES.workoutLive);
    expect(paths.quickExercise()).toBe(ROUTES.quickExercise);
    expect(paths.progression()).toBe(ROUTES.progression);
    expect(paths.history()).toBe(ROUTES.history);
    expect(paths.plus()).toBe(ROUTES.plus);
  });

  it("encode les paramètres comme encodeURIComponent pour les valeurs de l'application", () => {
    expect(paths.workoutLive({ add: "developpe-incline-halteres" })).toBe(`${ROUTES.workoutLive}?add=developpe-incline-halteres`);

    const substitute = new URLSearchParams();
    substitute.set("substitute", "block-1");
    substitute.set("child", "child-1");
    expect(paths.workoutLive(substitute)).toBe(`${ROUTES.workoutLive}?substitute=block-1&child=child-1`);

    const returnTo = `${ROUTES.progression}?tab=cardio&period=4w`;
    expect(paths.cardioDetail("tapis", { period: "4w", returnTo })).toBe(
      `${ROUTES.progression}/cardio/tapis?period=4w&returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(paths.progression({ tab: "cardio", period: undefined })).toBe(`${ROUTES.progression}?tab=cardio`);
  });

  it("segments de route et appartenance", () => {
    expect(routeSegment(ROUTES.planning)).toBe(ROUTES.planning.slice(1));
    expect(isUnder(`${ROUTES.sessions}/abc`, ROUTES.sessions)).toBe(true);
    expect(isUnder(ROUTES.sessions, ROUTES.sessions)).toBe(true);
    expect(isUnder(`${ROUTES.sessions}x`, ROUTES.sessions)).toBe(false);
  });
});
