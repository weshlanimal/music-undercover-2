"use client";

import { Volume2, VolumeX } from "lucide-react";

interface VolumeControlProps {
  volume: number; // 0-100
  onChange: (volume: number) => void;
}

/**
 * Contrairement à lecture/pause/défilement (watch2gether, pilotés par le
 * présentateur), le volume reste 100% local à chaque joueur — y compris
 * pour les spectateurs dont le lecteur vidéo est par ailleurs verrouillé.
 */
export function VolumeControl({ volume, onChange }: VolumeControlProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <button
        onClick={() => onChange(volume === 0 ? 80 : 0)}
        aria-label={volume === 0 ? "Réactiver le son" : "Couper le son"}
        className="shrink-0 text-paper-muted hover:text-paper"
      >
        {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer accent-wave"
        aria-label="Volume"
      />
      <span className="w-9 shrink-0 text-right text-xs text-paper-faint">{volume}%</span>
    </div>
  );
}
