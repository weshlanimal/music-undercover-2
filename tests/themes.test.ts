import { describe, expect, it } from "vitest";
import { OFFICIAL_THEMES } from "@/lib/game/themes-data";
import { pickRandomTheme } from "@/lib/game/themes";

describe("OFFICIAL_THEMES (générés depuis data/themes.csv)", () => {
  it("contient 500 thèmes", () => {
    expect(OFFICIAL_THEMES.length).toBe(500);
  });

  it("n'a aucun id dupliqué", () => {
    const ids = new Set(OFFICIAL_THEMES.map((t) => t.id));
    expect(ids.size).toBe(OFFICIAL_THEMES.length);
  });

  it("n'a aucun thème vide, et civil/infiltré sont toujours différents", () => {
    for (const pair of OFFICIAL_THEMES) {
      expect(pair.civilTheme.length).toBeGreaterThan(0);
      expect(pair.undercoverTheme.length).toBeGreaterThan(0);
      expect(pair.civilTheme).not.toBe(pair.undercoverTheme);
    }
  });

  it("marque tous les thèmes officiels comme non personnalisés", () => {
    expect(OFFICIAL_THEMES.every((t) => t.custom === false)).toBe(true);
  });

  it("couvre bien plusieurs catégories (pas tout dans une seule)", () => {
    const categories = new Set(OFFICIAL_THEMES.map((t) => t.category));
    expect(categories.size).toBeGreaterThan(10);
  });
});

describe("pickRandomTheme", () => {
  it("pioche toujours un thème appartenant au pool fourni", () => {
    for (let i = 0; i < 20; i++) {
      const picked = pickRandomTheme(OFFICIAL_THEMES);
      expect(OFFICIAL_THEMES).toContain(picked);
    }
  });

  it("lève une erreur explicite si le pool est vide", () => {
    expect(() => pickRandomTheme([])).toThrow();
  });
});
