"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import type { MusicProviderName } from "@/types";

interface ClueMediaProps {
  provider: MusicProviderName;
  videoId: string | null;
  audioUrl: string | null;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  clipSeconds: number;
  autoPlay?: boolean;
}

/**
 * Contrairement à la version initiale du projet, rien n'est masqué ici :
 * titre et artiste sont affichés dès l'envoi de l'indice (choix demandé
 * explicitement — la découverte musicale prime sur l'anonymisation).
 * L'extrait YouTube est plafonné via les paramètres d'URL start/end du
 * lecteur officiel embarqué, quelle que soit la durée réelle de la vidéo.
 */
export function ClueMedia({ provider, videoId, audioUrl, title, artist, thumbnailUrl, clipSeconds, autoPlay }: ClueMediaProps) {
  const [started, setStarted] = useState(false);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-ink-border bg-ink-elevated">
      <div className="p-4 pb-3">
        <p className="font-display text-lg font-medium leading-snug text-paper">{title}</p>
        <p className="text-sm text-paper-muted">{artist}</p>
      </div>

      {provider === "youtube" && videoId ? (
        started ? (
          <div className="aspect-video w-full bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}?start=0&end=${clipSeconds}&autoplay=1&rel=0&modestbranding=1`}
              title={title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
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

      <p className="px-4 pb-3 pt-2 text-center text-xs text-paper-faint">Extrait limité à {clipSeconds}s</p>
    </div>
  );
}
