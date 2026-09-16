import { describe, expect, it } from "vitest";
import { guessMatchesTheme, normalizeGuess } from "@/lib/utils";

describe("normalizeGuess", () => {
  it("ignore la casse", () => {
    expect(normalizeGuess("Musique D'ÉTÉ")).toBe(normalizeGuess("musique d'été"));
  });

  it("ignore les accents", () => {
    expect(normalizeGuess("Été")).toBe(normalizeGuess("Ete"));
  });

  it("ignore les espaces superflus", () => {
    expect(normalizeGuess("  musique   de   plage  ")).toBe(normalizeGuess("musique de plage"));
  });
});

describe("guessMatchesTheme — dernière chance de Mr White", () => {
  it("accepte une réponse correcte malgré casse/accents/espaces différents", () => {
    expect(guessMatchesTheme("  MUSIQUE d'Été  ", "Musique d'été")).toBe(true);
  });

  it("refuse une réponse incorrecte", () => {
    expect(guessMatchesTheme("Musique d'hiver", "Musique d'été")).toBe(false);
  });

  it("refuse une réponse vide", () => {
    expect(guessMatchesTheme("", "Musique d'été")).toBe(false);
  });
});
