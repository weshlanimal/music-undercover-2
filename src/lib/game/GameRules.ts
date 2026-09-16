import type { Role } from "@/types";

/**
 * Une partie = un thème, un seul infiltré, une seule manche de vote. Le
 * résultat se déduit directement de qui a été éliminé (ou de personne, en
 * cas d'égalité persistante) : pas de logique de "manches successives" à
 * suivre ici.
 */
export const GameRules = {
  /**
   * @param eliminatedRole Le rôle du joueur éliminé par le vote, ou `null`
   *   si personne n'a été éliminé (aucun vote, ou égalité qui persiste après
   *   le second tour).
   */
  resolveOutcome(eliminatedRole: Role | null): Role {
    // Les civils gagnent uniquement s'ils ont correctement démasqué
    // l'infiltré. Dans tout autre cas — un civil éliminé par erreur, ou
    // personne d'éliminé du tout — l'infiltré s'en sort et gagne.
    return eliminatedRole === "undercover" ? "civil" : "undercover";
  },

  /** Résout une égalité de vote : renvoie les joueurs à départager. */
  resolveTie(tally: Record<string, number>): string[] {
    const max = Math.max(0, ...Object.values(tally));
    if (max === 0) return [];
    return Object.entries(tally)
      .filter(([, count]) => count === max)
      .map(([playerId]) => playerId);
  }
};
