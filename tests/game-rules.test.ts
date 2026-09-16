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

describe("GameRules.resolvePluralityWinner — un seul suspect par tour de vote", () => {
  it("désigne le joueur ayant reçu le plus de votes", () => {
    expect(GameRules.resolvePluralityWinner({ a: 3, b: 1 })).toBe("a");
  });

  it("ne désigne personne en cas d'égalité au sommet", () => {
    expect(GameRules.resolvePluralityWinner({ a: 2, b: 2, c: 1 })).toBeNull();
  });

  it("ne désigne personne si personne n'a voté", () => {
    expect(GameRules.resolvePluralityWinner({})).toBeNull();
  });

  it("fonctionne avec un seul candidat", () => {
    expect(GameRules.resolvePluralityWinner({ a: 1 })).toBe("a");
  });
});
