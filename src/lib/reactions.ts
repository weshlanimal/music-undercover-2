/**
 * Liste fermée d'emojis de réaction (façon "emote spam" Twitch) — partagée
 * entre le bouton client et la validation serveur pour ne jamais diverger.
 * Volontairement fermée plutôt que du texte libre : pas de modération à
 * prévoir, et ça reste dans l'esprit "réaction instantanée" plutôt que chat.
 */
export const REACTION_EMOJIS = ["😂", "🔥", "😱", "💀", "❤️", "🤔", "👎", "😴"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isValidReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === "string" && (REACTION_EMOJIS as readonly string[]).includes(value);
}
