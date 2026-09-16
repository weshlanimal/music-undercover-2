import { describe, expect, it } from "vitest";
import { GameRules } from "@/lib/game/GameRules";

describe("GameRules.resolveOutcome", () => {
  it("les civils gagnent quand l'infiltré est éliminé par le vote", () => {
    expect(GameRules.resolveOutcome("undercover")).toBe("civil");
  });

  it("l'infiltré gagne si un civil est éliminé par erreur", () => {
    expect(GameRules.resolveOutcome("civil")).toBe("undercover");
  });

  it("l'infiltré gagne si personne n'est éliminé (égalité persistante ou aucun vote)", () => {
    expect(GameRules.resolveOutcome(null)).toBe("undercover");
  });
});

describe("GameRules.resolveTie", () => {
  it("renvoie le seul joueur en tête s'il n'y a pas d'égalité", () => {
    expect(GameRules.resolveTie({ a: 3, b: 1 })).toEqual(["a"]);
  });

  it("renvoie tous les joueurs à égalité au score maximum", () => {
    const result = GameRules.resolveTie({ a: 2, b: 2, c: 1 });
    expect(result.sort()).toEqual(["a", "b"]);
  });

  it("renvoie un tableau vide si personne n'a voté", () => {
    expect(GameRules.resolveTie({})).toEqual([]);
  });
});
