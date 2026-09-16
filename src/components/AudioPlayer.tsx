"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { VolumeControl } from "./VolumeControl";
import { useLocalVolume } from "@/hooks/useLocalVolume";

interface AudioPlayerProps {
  src: string;
  label: string;
  autoPlay?: boolean;
  /** Démarre à cet instant serveur (epoch ms) pour une synchronisation approximative entre joueurs (section 21). */
  syncStartAt?: number | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, label, autoPlay, syncStartAt }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [needsUnlock, setNeedsUnlock] = useState(autoPlay ?? false);
  const { volume, setVolume } = useLocalVolume();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume / 100;

    if (syncStartAt) {
      const elapsedSeconds = Math.max(0, (Date.now() - syncStartAt) / 1000);
      audio.currentTime = elapsedSeconds;
    }

    if (autoPlay) {
      audio.play().then(() => setNeedsUnlock(false)).catch(() => setNeedsUnlock(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function handleVolumeChange(next: number) {
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next / 100;
  }

  function unlockAndPlay() {
    audioRef.current?.play().then(() => {
      setNeedsUnlock(false);
      setPlaying(true);
    });
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="w-full rounded-2xl border border-ink-border bg-ink-elevated p-5">
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          e.currentTarget.volume = volume / 100;
        }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-paper-muted">{label}</span>
        <WaveformIcon active={playing} />
      </div>

      {needsUnlock ? (
        <button
          onClick={unlockAndPlay}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-wave/15 py-3 text-sm font-medium text-wave"
        >
          🔊 Activer le son
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            aria-label={playing ? "Mettre en pause" : "Lire"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wave text-ink transition-transform active:scale-95"
          >
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <div className="flex-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-border">
              <div className="h-full rounded-full bg-wave transition-[width] duration-150" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-paper-faint">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="-mx-5 -mb-5 mt-4 border-t border-ink-border">
        <VolumeControl volume={volume} onChange={handleVolumeChange} />
      </div>
    </div>
  );
}

function WaveformIcon({ active }: { active: boolean }) {
  const bars = [6, 12, 8, 16, 10, 14, 7];
  return (
    <div className="flex h-4 items-end gap-0.5">
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-wave/70"
          style={{
            height: active ? `${h}px` : "4px",
            transition: "height 0.3s ease",
            animation: active ? `pulse-ring 1.1s ${i * 0.08}s ease-in-out infinite alternate` : undefined
          }}
        />
      ))}
    </div>
  );
}
