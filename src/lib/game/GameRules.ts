import type { Role, VoteTally } from "@/types";

// ---------------------------------------------------------------------------
// Les points sont entièrement individuels : infiltré et Mr White ne
// forment PAS une équipe entre eux, chacun gagne (ou pas) selon sa propre
// survie au vote de la manche — pas selon le sort de l'autre. Un infiltré
// démasqué gagne 0 même si Mr White survit à côté de lui.
// ---------------------------------------------------------------------------
export const GameRules = {
  /** Points gagnés par UN joueur pour cette manche, selon son propre rôle et sa propre survie. */
  pointsFor(role: Role, survived: boolean): number {
    if (!survived) return 0;
    return role === "civil" ? 1 : 2;
  },

  /**
   * Un seul suspect par bulletin, un seul désigné par tour de vote : renvoie
   * la personne ayant reçu le plus de votes, ou `null` s'il y a égalité au
   * sommet (personne n'est désigné ce tour-là) ou si personne n'a voté.
   * Volontairement pas de second tour de rattrapage en cas d'égalité — pour
   * éviter le n'importe quoi, on part sur "pas de consensus, pas d'accusé".
   */
  resolvePluralityWinner(tally: VoteTally): string | null {
    const entries = Object.entries(tally);
    if (entries.length === 0) return null;
    const max = Math.max(...entries.map(([, count]) => count));
    const top = entries.filter(([, count]) => count === max);
    return top.length === 1 ? top[0]![0] : null;
  }
};
