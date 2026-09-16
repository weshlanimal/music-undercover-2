import type { MusicProvider } from "./MusicProvider";
import { MockMusicProvider } from "./MockMusicProvider";
import { YouTubeProvider } from "./YouTubeProvider";
import type { ResolveOutcome } from "@/types";

// ---------------------------------------------------------------------------
// Le reste du jeu appelle uniquement MusicResolver.resolve(url). Il ne sait
// jamais si le lien venait de YouTube ou du mode démo.
//
// Spotify et Apple Music ont été retirés du projet (demande explicite) au
// profit de YouTube seul + mode démo hors-ligne. Conséquence : plus besoin
// de logique de fallback entre fournisseurs (elle existait uniquement pour
// contourner l'absence fréquente d'extrait audio sur Spotify) — YouTube n'a
// pas ce problème, la vidéo est jouable dès qu'elle existe et autorise
// l'intégration.
// ---------------------------------------------------------------------------

const providers: MusicProvider[] = [new MockMusicProvider(), new YouTubeProvider()];

function detectProvider(url: string): MusicProvider | null {
  return providers.find((p) => p.canHandle(url)) ?? null;
}

export const MusicResolver = {
  /** Un lien est-il reconnu par un provider, sans faire d'appel réseau ? */
  isRecognizedLink(url: string): boolean {
    return detectProvider(url) !== null;
  },

  async resolve(url: string): Promise<ResolveOutcome> {
    const provider = detectProvider(url);
    if (!provider) return { ok: false, reason: "unrecognized_link" };

    const link = provider.parseUrl(url);
    if (!link) return { ok: false, reason: "unrecognized_link" };

    return provider.resolveTrack(link);
  }
};
