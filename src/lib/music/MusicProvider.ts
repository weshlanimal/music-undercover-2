import type { ParsedMusicLink, ResolveOutcome } from "@/types";

export interface MusicProvider {
  readonly name: "youtube" | "mock";
  /** Détection rapide et synchrone : le lien appartient-il à ce provider ? */
  canHandle(url: string): boolean;
  /** Extraction de l'identifiant depuis l'URL. Ne fait aucun appel réseau. */
  parseUrl(url: string): ParsedMusicLink | null;
  /** Résolution complète : métadonnées (titre/artiste/vignette). */
  resolveTrack(link: ParsedMusicLink): Promise<ResolveOutcome>;
}
