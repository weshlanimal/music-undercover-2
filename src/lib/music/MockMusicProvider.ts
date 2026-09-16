import type { MusicProvider } from "./MusicProvider";
import type { ParsedMusicLink, ResolveOutcome } from "@/types";

// ---------------------------------------------------------------------------
// Fournisseur factice permettant de développer/tester tout le moteur de jeu
// sans réseau du tout (utile hors-ligne, ou pour les tests automatisés).
// Les "morceaux" sont des tonalités synthétiques générées par
// scripts/generate-mock-audio.mjs : aucun contenu protégé n'est utilisé.
//
// En jeu normal, ce mode n'est plus nécessaire : YouTube ne demande aucune
// clé API (voir YouTubeProvider.ts), donc de vrais liens fonctionnent
// directement. Le mode démo reste disponible pour dépanner ou tester.
//
// Deux façons de "coller un lien" en mode mock :
//   - un lien littéral  mock://demo-03
//   - n'importe quelle URL http(s) qui contient le mot "mock" quelque part.
// ---------------------------------------------------------------------------

interface MockTrackDef {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
}

export const MOCK_TRACKS: MockTrackDef[] = [
  { id: "demo-01", title: "Nocturne Synthé", artist: "Test Combo A", durationMs: 3600 },
  { id: "demo-02", title: "Arpège Lo-fi", artist: "Test Combo B", durationMs: 4400 },
  { id: "demo-03", title: "Groove Nu-Disco", artist: "Test Combo C", durationMs: 3000 },
  { id: "demo-04", title: "Ballade Douce", artist: "Test Combo D", durationMs: 4800 },
  { id: "demo-05", title: "Beat Sombre", artist: "Test Combo E", durationMs: 3200 },
  { id: "demo-06", title: "Pop Solaire", artist: "Test Combo F", durationMs: 2800 },
  { id: "demo-07", title: "Chill House", artist: "Test Combo G", durationMs: 4000 },
  { id: "demo-08", title: "Drill Nocturne", artist: "Test Combo H", durationMs: 2240 }
];

function trackById(id: string): MockTrackDef | undefined {
  return MOCK_TRACKS.find((t) => t.id === id);
}

export class MockMusicProvider implements MusicProvider {
  readonly name = "mock" as const;

  canHandle(url: string): boolean {
    const trimmed = url.trim();
    if (trimmed.startsWith("mock://")) return true;
    return /mock/i.test(trimmed) && /^https?:\/\//i.test(trimmed);
  }

  parseUrl(url: string): ParsedMusicLink | null {
    const trimmed = url.trim();
    let trackId: string | null = null;

    if (trimmed.startsWith("mock://")) {
      trackId = trimmed.replace("mock://", "").split(/[/?#]/)[0] ?? null;
    } else if (/mock/i.test(trimmed)) {
      const match = trimmed.match(/demo-0[1-8]/);
      trackId = match ? match[0] : null;
    }

    if (!trackId) return null;
    if (!trackById(trackId)) return null;

    return { provider: "mock", rawUrl: url, trackId };
  }

  async resolveTrack(link: ParsedMusicLink): Promise<ResolveOutcome> {
    const track = trackById(link.trackId);
    if (!track) return { ok: false, reason: "not_found" };

    return {
      ok: true,
      track: {
        provider: "mock",
        providerTrackId: track.id,
        title: track.title,
        artist: track.artist,
        artworkUrl: null,
        originalUrl: link.rawUrl,
        videoId: null,
        previewUrl: `/mock-audio/${track.id}.wav`,
        durationMs: track.durationMs
      }
    };
  }
}

/** Utilitaire pour l'UI : liste des liens de démo prêts à coller. */
export function mockDemoLinks(): { label: string; url: string }[] {
  return MOCK_TRACKS.map((t) => ({ label: `${t.title} — ${t.artist}`, url: `mock://${t.id}` }));
}
