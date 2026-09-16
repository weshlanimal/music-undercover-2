import { describe, expect, it } from "vitest";
import { MockMusicProvider } from "@/lib/music/MockMusicProvider";
import { YouTubeProvider } from "@/lib/music/YouTubeProvider";
import { MusicResolver } from "@/lib/music/MusicResolver";

describe("MockMusicProvider", () => {
  const provider = new MockMusicProvider();

  it("reconnaît un lien mock://", () => {
    expect(provider.canHandle("mock://demo-01")).toBe(true);
  });

  it("reconnaît un lien de test contenant 'mock' et un id de démo", () => {
    expect(provider.canHandle("https://example.com/mock/demo-03")).toBe(true);
  });

  it("rejette un lien YouTube ou un texte quelconque", () => {
    expect(provider.canHandle("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(provider.canHandle("n'importe quoi")).toBe(false);
  });

  it("extrait le bon trackId depuis mock://demo-05", () => {
    const link = provider.parseUrl("mock://demo-05");
    expect(link?.trackId).toBe("demo-05");
  });

  it("renvoie null pour un id de démo inexistant", () => {
    expect(provider.parseUrl("mock://demo-99")).toBeNull();
  });

  it("résout un morceau mock avec une preview toujours disponible", async () => {
    const link = provider.parseUrl("mock://demo-02")!;
    const outcome = await provider.resolveTrack(link);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.track.previewUrl).toBe("/mock-audio/demo-02.wav");
      expect(outcome.track.provider).toBe("mock");
      expect(outcome.track.videoId).toBeNull();
    }
  });
});

describe("YouTubeProvider (extraction d'ID, sans appel réseau)", () => {
  const provider = new YouTubeProvider();

  it("reconnaît un lien youtube.com/watch?v=", () => {
    expect(provider.canHandle("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("reconnaît un lien court youtu.be/", () => {
    expect(provider.canHandle("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("reconnaît un lien youtube.com/shorts/", () => {
    expect(provider.canHandle("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
  });

  it("rejette un lien Spotify ou un texte quelconque", () => {
    expect(provider.canHandle("https://open.spotify.com/track/abc123")).toBe(false);
    expect(provider.canHandle("bonjour")).toBe(false);
  });

  it("extrait le bon videoId depuis un lien /watch?v=", () => {
    const link = provider.parseUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=xyz");
    expect(link?.trackId).toBe("dQw4w9WgXcQ");
  });

  it("extrait le bon videoId depuis un lien youtu.be", () => {
    const link = provider.parseUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(link?.trackId).toBe("dQw4w9WgXcQ");
  });

  it("renvoie null pour un id de vidéo mal formé", () => {
    expect(provider.parseUrl("https://www.youtube.com/watch?v=trop-court")).toBeNull();
  });
});

describe("MusicResolver (mode mock, sans clé API)", () => {
  it("résout un lien mock de bout en bout via l'orchestrateur", async () => {
    const outcome = await MusicResolver.resolve("mock://demo-07");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.track.title).toBe("Chill House");
  });

  it("renvoie 'unrecognized_link' pour un texte qui n'est ni un lien ni un id mock", async () => {
    const outcome = await MusicResolver.resolve("ceci n'est pas un lien");
    expect(outcome).toEqual({ ok: false, reason: "unrecognized_link" });
  });

  it("isRecognizedLink ne fait aucun appel réseau et répond de façon synchrone", () => {
    expect(MusicResolver.isRecognizedLink("mock://demo-01")).toBe(true);
    expect(MusicResolver.isRecognizedLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(MusicResolver.isRecognizedLink("bonjour")).toBe(false);
  });
});
