import { describe, expect, it } from "vitest";
import { OFFICIAL_MISSIONS, assignMissionsForRound, maybePickMission } from "@/lib/game/missions";

describe("OFFICIAL_MISSIONS (lues depuis data/missions.csv au démarrage)", () => {
  it("contient au moins une mission", () => {
    expect(OFFICIAL_MISSIONS.length).toBeGreaterThan(0);
  });

  it("n'a aucun id dupliqué", () => {
    const ids = new Set(OFFICIAL_MISSIONS.map((m) => m.id));
    expect(ids.size).toBe(OFFICIAL_MISSIONS.length);
  });

  it("n'a aucun libellé vide", () => {
    for (const mission of OFFICIAL_MISSIONS) {
      expect(mission.label.length).toBeGreaterThan(0);
    }
  });
});

describe("maybePickMission", () => {
  it("renvoie soit null, soit une mission appartenant à la base officielle", () => {
    for (let i = 0; i < 50; i++) {
      const picked = maybePickMission();
      if (picked !== null) expect(OFFICIAL_MISSIONS).toContainEqual(picked);
    }
  });

  it("renvoie null largement plus souvent qu'une mission (le cas par défaut doit rester majoritaire)", () => {
    let missionCount = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      if (maybePickMission() !== null) missionCount++;
    }
    // ~20% attendu ; large marge pour éviter un test qui flake, mais assez
    // stricte pour détecter un vrai bug d'inversion de probabilité.
    expect(missionCount).toBeLessThan(trials * 0.4);
    expect(missionCount).toBeGreaterThan(0);
  });
});

describe("assignMissionsForRound", () => {
  it("garantit toujours au moins une mission dans la manche, même si le tirage indépendant n'en donne aucune", () => {
    for (let i = 0; i < 30; i++) {
      const missions = assignMissionsForRound(4);
      expect(missions.some((m) => m !== null)).toBe(true);
    }
  });

  it("renvoie un tableau de la même longueur que le nombre de joueurs", () => {
    expect(assignMissionsForRound(7)).toHaveLength(7);
  });

  it("ne force jamais TOUS les joueurs à avoir une mission (reste l'exception, pas la norme)", () => {
    let allHadMissionCount = 0;
    const trials = 40;
    for (let i = 0; i < trials; i++) {
      const missions = assignMissionsForRound(6);
      if (missions.every((m) => m !== null)) allHadMissionCount++;
    }
    expect(allHadMissionCount).toBeLessThan(trials);
  });

  it("ne plante pas avec zéro joueur", () => {
    expect(assignMissionsForRound(0)).toEqual([]);
  });
});
