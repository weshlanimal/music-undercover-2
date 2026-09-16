import { describe, expect, it } from "vitest";
import { GameRules } from "@/lib/game/GameRules";

describe("GameRules.pointsFor — points strictement individuels", () => {
  it("un civil qui survit gagne +1", () => {
    expect(GameRules.pointsFor("civil", true)).toBe(1);
  });

  it("un infiltré qui survit gagne +2", () => {
    expect(GameRules.pointsFor("undercover", true)).toBe(2);
  });

  it("Mr White qui survit gagne +2", () => {
    expect(GameRules.pointsFor("mrwhite", true)).toBe(2);
  });

  it("n'importe quel rôle éliminé gagne 0, quel que soit le sort des autres", () => {
    expect(GameRules.pointsFor("civil", false)).toBe(0);
    expect(GameRules.pointsFor("undercover", false)).toBe(0);
    expect(GameRules.pointsFor("mrwhite", false)).toBe(0);
  });
});

describe("GameRules.resolveMajority", () => {
  it("élimine un seul joueur s'il est seul à dépasser la majorité absolue", () => {
    // 5 joueurs vivants -> majorité absolue = 3
    expect(GameRules.resolveMajority({ a: 3, b: 1 }, 5)).toEqual(["a"]);
  });

  it("peut éliminer plusieurs joueurs à la fois s'ils dépassent tous la majorité", () => {
    // 6 joueurs vivants -> majorité absolue = 4
    const result = GameRules.resolveMajority({ a: 4, b: 4, c: 1 }, 6);
    expect(result.sort()).toEqual(["a", "b"]);
  });

  it("n'élimine personne si personne n'atteint la majorité absolue", () => {
    // 6 joueurs vivants -> majorité absolue = 4, personne n'atteint 4
    expect(GameRules.resolveMajority({ a: 3, b: 2 }, 6)).toEqual([]);
  });

  it("renvoie un tableau vide si personne n'a voté", () => {
    expect(GameRules.resolveMajority({}, 5)).toEqual([]);
  });
});
