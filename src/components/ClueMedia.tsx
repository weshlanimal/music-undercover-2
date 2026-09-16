"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { VolumeControl } from "./VolumeControl";
import { useLocalVolume } from "@/hooks/useLocalVolume";
import type { MusicProviderName } from "@/types";
import type { PlaybackControlEvent } from "@/lib/socket/client";

interface ClueMediaProps {
  provider: MusicProviderName;
  videoId: string | null;
  audioUrl: string | null;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  clipSeconds: number;
  autoPlay?: boolean;
  /** Affiche de vrais contrôles YouTube cliquables sur CE lecteur (réécoute libre, ou le contrôleur watch2gether). */
  interactive?: boolean;
  /** Watch2gether : cette instance EST le lecteur qui pilote tout le monde (celui qui vient d'envoyer l'indice) — implique interactive. */
  isController?: boolean;
  /** Watch2gether côté spectateur : dernier ordre reçu du contrôleur, à appliquer sur ce lecteur. */
  remoteControl?: PlaybackControlEvent | null;
  /** Watch2gether côté contrôleur : appelé à chaque lecture/pause pour diffuser aux autres. */
  onControl?: (action: "play" | "pause", positionSeconds: number) => void;
}

// L'API JS YouTube (IFrame Player API) se charge une seule fois globalement
// et notifie via window.onYouTubeIframeAPIReady — on mutualise ce chargement
// entre tous les lecteurs de la page.
let youTubeApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as typeof window & { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve();
  if (youTubeApiPromise) return youTubeApiPromise;
  youTubeApiPromise = new Promise((resolve) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return youTubeApiPromise;
}

// Typage minimal du player YT (pas de @types/youtube dans ce projet — juste ce qu'on utilise réellement).
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}
const YT_STATE_PLAYING = 1;

/**
 * Contrairement à la version initiale du projet, rien n'est masqué ici :
 * titre et artiste sont affichés dès l'envoi de l'indice. L'extrait YouTube
 * est plafonné via les paramètres start/end du lecteur officiel embarqué.
 *
 * Watch2gether : pour un indice YouTube, seul le contrôleur (celui qui vient
 * d'envoyer l'indice) a de vrais contrôles ; tout le monde d'autre a un
 * lecteur en lecture seule qui suit ses lecture/pause en direct.
 */
export function ClueMedia({
  provider,
  videoId,
  audioUrl,
  title,
  artist,
  thumbnailUrl,
  clipSeconds,
  autoPlay,
  interactive,
  isController,
  remoteControl,
  onControl
}: ClueMediaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const lastAppliedServerTimeRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [started, setStarted] = useState(!!autoPlay || !!isController);
  const canInteract = !!interactive || !!isController;
  const { volume, setVolume } = useLocalVolume();
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const isYouTube = provider === "youtube" && !!videoId;

  // Création du lecteur YouTube (une fois la vidéo affichée).
  useEffect(() => {
    if (!isYouTube || !started || !containerRef.current) return;
    let cancelled = false;

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as unknown as { YT: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: Record<string, number> } }).YT;
      playerRef.current = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          start: 0,
          end: clipSeconds,
          controls: canInteract ? 1 : 0,
          disablekb: canInteract ? 0 : 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setReady(true);
            // Le volume est TOUJOURS local, même pour un spectateur dont le
            // lecteur est par ailleurs verrouillé (lecture/pause pilotées à
            // distance) — sa préférence de volume, elle, ne l'est jamais.
            playerRef.current?.setVolume(volumeRef.current);
            if (volumeRef.current === 0) playerRef.current?.mute();
            if ((isController || autoPlay) && started) playerRef.current?.playVideo();
          },
          onStateChange: (e: { data: number }) => {
            if (cancelled || !playerRef.current) return;
            if (e.data === YT_STATE_PLAYING) setNeedsJoin(false);
            if (isController) {
              if (e.data === YT_STATE_PLAYING) onControl?.("play", playerRef.current.getCurrentTime());
              else if (e.data === 2 /* paused */) onControl?.("pause", playerRef.current.getCurrentTime());
            }
          }
        }
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, started, videoId]);

  // Spectateur : applique les ordres de lecture reçus du contrôleur.
  useEffect(() => {
    if (isController || !remoteControl || !ready || !playerRef.current) return;
    if (remoteControl.serverTime <= lastAppliedServerTimeRef.current) return;
    lastAppliedServerTimeRef.current = remoteControl.serverTime;

    const networkDelaySeconds = Math.max(0, (Date.now() - remoteControl.serverTime) / 1000);
    const target = remoteControl.positionSeconds + (remoteControl.action === "play" ? networkDelaySeconds : 0);
    playerRef.current.seekTo(target, true);

    if (remoteControl.action === "play") {
      playerRef.current.playVideo();
      // Les navigateurs bloquent parfois la lecture avec le son déclenchée
      // par un événement réseau (pas un vrai clic) : si ça n'a pas démarré
      // après un court instant, on propose de rejoindre manuellement.
      setTimeout(() => {
        if (playerRef.current?.getPlayerState() !== YT_STATE_PLAYING) setNeedsJoin(true);
      }, 900);
    } else {
      playerRef.current.pauseVideo();
    }
  }, [remoteControl, isController, ready]);

  function joinPlayback() {
    playerRef.current?.playVideo();
    setNeedsJoin(false);
  }

  function handleVolumeChange(next: number) {
    setVolume(next);
    if (!playerRef.current) return;
    playerRef.current.setVolume(next);
    if (next === 0) playerRef.current.mute();
    else playerRef.current.unMute();
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-ink-border bg-ink-elevated">
      <div className="p-4 pb-3">
        <p className="font-display text-lg font-medium leading-snug text-paper">{title}</p>
        <p className="text-sm text-paper-muted">{artist}</p>
      </div>

      {isYouTube ? (
        started ? (
          <>
            <div className="relative aspect-video w-full bg-black">
              <div ref={containerRef} className={`h-full w-full ${canInteract ? "" : "pointer-events-none"}`} />
              {needsJoin && (
                <button
                  onClick={joinPlayback}
                  className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-medium text-white"
                >
                  🔊 Rejoindre la lecture
                </button>
              )}
            </div>
            {/* Toujours cliquable, y compris pour un spectateur dont la vidéo
                elle-même est verrouillée : le volume reste personnel. */}
            <VolumeControl volume={volume} onChange={handleVolumeChange} />
          </>
        ) : (
          <button onClick={() => setStarted(true)} className="group relative block aspect-video w-full bg-black" aria-label="Lire l'extrait">
            {thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt="" className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-90" />
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-signal text-white shadow-glow">
                <Play size={24} fill="currentColor" className="ml-1" />
              </span>
            </span>
          </button>
        )
      ) : audioUrl ? (
        <div className="p-4 pt-0">
          <AudioPlayer src={audioUrl} label="Mode démo" autoPlay={autoPlay} />
        </div>
      ) : (
        <p className="px-4 pb-4 text-sm text-paper-faint">Média indisponible.</p>
      )}

      <p className="px-4 pb-3 pt-2 text-center text-xs text-paper-faint">
        {isYouTube && isController ? `Tu contrôles la lecture pour tout le monde · plafonné à ${clipSeconds}s` : `Extrait limité à ${clipSeconds}s`}
      </p>
    </div>
  );
}
