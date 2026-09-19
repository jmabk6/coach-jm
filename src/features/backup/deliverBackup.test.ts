// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBackupFile,
  canShareFile,
  copyBackupText,
  downloadBackupFile,
  isStandaloneDisplay,
  shareBackupFile,
} from "./deliverBackup";

const file = buildBackupFile('{"a":1}', "coach-jm-sauvegarde-test.json");

afterEach(() => vi.restoreAllMocks());

describe("voie 1 — Web Share avec fichier", () => {
  it("partage quand canShare accepte le fichier, et distingue « lancé » de toute preuve de sauvegarde", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { canShare: vi.fn().mockReturnValue(true), share };

    expect(canShareFile(nav, file)).toBe(true);
    expect(await shareBackupFile(nav, file)).toBe("launched");
    expect(share).toHaveBeenCalledWith({ files: [file], title: file.name });
  });

  it("un partage refermé par l'utilisateur est « annulé », pas une erreur", async () => {
    const abort = Object.assign(new Error("abort"), { name: "AbortError" });
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(abort) };

    expect(await shareBackupFile(nav, file)).toBe("cancelled");
  });

  it("sans API, avec canShare refusant les fichiers, ou sur NotAllowedError : « non pris en charge »", async () => {
    expect(await shareBackupFile({}, file)).toBe("unsupported");
    expect(await shareBackupFile({ share: vi.fn() }, file)).toBe("unsupported");
    expect(await shareBackupFile({ canShare: () => false, share: vi.fn() }, file)).toBe("unsupported");
    expect(
      await shareBackupFile(
        {
          canShare: () => {
            throw new TypeError("bad");
          },
          share: vi.fn(),
        },
        file,
      ),
    ).toBe("unsupported");
    const notAllowed = Object.assign(new Error("no"), { name: "NotAllowedError" });
    expect(await shareBackupFile({ canShare: () => true, share: vi.fn().mockRejectedValue(notAllowed) }, file)).toBe("unsupported");
  });
});

describe("voie 2 — téléchargement", () => {
  it("crée un lien éphémère nommé, le clique, le retire, révoque l'URL", () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadBackupFile(document, file);

    expect(create).toHaveBeenCalledWith(file);
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:test");
    vi.useRealTimers();
  });
});

describe("voie 3 — presse-papiers", () => {
  it("copie quand l'API existe, répond faux sinon ou en cas de refus", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyBackupText({ clipboard: { writeText } }, "texte")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("texte");
    expect(await copyBackupText({}, "texte")).toBe(false);
    expect(await copyBackupText({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error("nope")) } }, "t")).toBe(false);
  });
});

describe("mode plein écran", () => {
  it("lit navigator.standalone (iOS) ou la media query display-mode", () => {
    const win = (standalone: boolean | undefined, matches: boolean) =>
      ({ navigator: { standalone }, matchMedia: () => ({ matches }) }) as unknown as Window & {
        navigator: Navigator & { standalone?: boolean };
      };

    expect(isStandaloneDisplay(win(true, false))).toBe(true);
    expect(isStandaloneDisplay(win(undefined, true))).toBe(true);
    expect(isStandaloneDisplay(win(false, false))).toBe(false);
  });
});
