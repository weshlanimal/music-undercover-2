import type { MusicProvider } from "./MusicProvider";
import type { ParsedMusicLink, ResolveOutcome } from "@/types";

// ---------------------------------------------------------------------------
// Provider YouTube. Contrairement à Spotify/Apple Music (retirés du projet),
// YouTube ne demande AUCUNE clé API pour ce dont ce jeu a besoin :
//
//  - la LECTURE se fait via le lecteur officiel embarqué
//    (https://www.youtube.com/embed/VIDEO_ID), public et sans authentification ;
//  - les MÉTADONNÉES (titre, chaîne, vignette) viennent de l'endpoint public
//    "oEmbed" (https://www.youtube.com/oembed?...), lui aussi sans clé.
//
// oEmbed ne fournit pas la durée de la vidéo : ce n'est pas un problème ici
// puisque l'extrait diffusé est de toute façon plafonné côté salle
// (RoomSettings.clipSeconds, 60s par défaut) via les paramètres d'URL
// start/end du lecteur embarqué.
//
// oEmbed renvoie 401 quand le propriétaire de la vidéo a désactivé
// l'intégration ("embedding disabled") : cas géré explicitement plutôt que
// de planter silencieusement.
// ---------------------------------------------------------------------------

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function extractVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\.|^m\.|^music\./, "");

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1);
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  if (host === "youtube.com") {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    const shorts = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shorts?.[1]) return shorts[1];
    const embed = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed?.[1]) return embed[1];
  }

  return null;
}

interface OEmbedResponse {
  title: string;
  author_name: string;
  thumbnail_url: string;
}

export class YouTubeProvider implements MusicProvider {
  readonly name = "youtube" as const;

  canHandle(url: string): boolean {
    return extractVideoId(url) !== null;
  }

  parseUrl(url: string): ParsedMusicLink | null {
    const videoId = extractVideoId(url);
    if (!videoId) return null;
    return { provider: "youtube", rawUrl: url, trackId: videoId };
  }

  async resolveTrack(link: ParsedMusicLink): Promise<ResolveOutcome> {
    const target = `https://www.youtube.com/watch?v=${link.trackId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;

    let res: Response;
    try {
      res = await fetch(oembedUrl);
    } catch {
      return { ok: false, reason: "provider_error" };
    }

    if (res.status === 401) return { ok: false, reason: "embedding_disabled" };
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "provider_error" };

    const data = (await res.json()) as OEmbedResponse;

    return {
      ok: true,
      track: {
        provider: "youtube",
        providerTrackId: link.trackId,
        title: data.title,
        artist: data.author_name,
        artworkUrl: data.thumbnail_url,
        originalUrl: link.rawUrl,
        videoId: link.trackId,
        previewUrl: null,
        durationMs: 0
      }
    };
  }
}
