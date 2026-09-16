import type { Role } from "@/types";

// ---------------------------------------------------------------------------
// Les points sont entièrement individuels : infiltré(s) et Mr White ne
// forment PAS une équipe entre eux, chacun gagne (ou pas) selon sa propre
// survie au vote de la manche — pas selon le sort des autres joueurs de son
// "camp". Un infiltré démasqué gagne 0 même si un autre infiltré ou Mr
// White survit à côté de lui.
// ---------------------------------------------------------------------------
export const GameRules = {
  /** Points gagnés par UN joueur pour cette manche, selon son propre rôle et sa propre survie. */
  pointsFor(role: Role, survived: boolean): number {
    if (!survived) return 0;
    return role === "civil" ? 1 : 2;
  },

  /** Joueurs ayant reçu la majorité absolue des votes — peut en renvoyer plusieurs, ou aucun. */
  resolveMajority(tally: Record<string, number>, aliveCount: number): string[] {
    const threshold = Math.floor(aliveCount / 2) + 1;
    return Object.entries(tally)
      .filter(([, count]) => count >= threshold)
      .map(([playerId]) => playerId);
  }
};
