import { describe, expect, it } from "vitest";
import { OFFICIAL_THEMES, pickRandomTheme } from "@/lib/game/themes";

// Volontairement aucun nombre codé en dur ici (ex. "doit contenir 500
// thèmes") : c'est exactement ce genre de couplage qui rendait le fichier de
// thèmes fragile à modifier. On teste l'INTÉGRITÉ de la base, quel que soit
// son contenu réel dans data/themes.csv au moment du test.
describe("OFFICIAL_THEMES (lus depuis data/themes.csv au démarrage)", () => {
  it("contient au moins un thème", () => {
    expect(OFFICIAL_THEMES.length).toBeGreaterThan(0);
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

  it("couvre plusieurs catégories (pas tout dans une seule)", () => {
    const categories = new Set(OFFICIAL_THEMES.map((t) => t.category));
    expect(categories.size).toBeGreaterThan(1);
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
