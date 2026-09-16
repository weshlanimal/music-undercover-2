"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

interface RestartMatchButtonProps {
  onRestart: () => void;
}

/**
 * Réservé à l'hôte, visible dès que le match est en cours (pas en lobby, où
 * "Lancer la partie" en tient déjà lieu). Recommence tout — scores compris —
 * pour toute la salle, d'où la confirmation avant d'agir, comme QuitButton.
 */
export function RestartMatchButton({ onRestart }: RestartMatchButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="fixed left-16 top-4 z-50 flex items-center gap-2 rounded-full border border-signal/40 bg-ink-elevated/95 py-2 pl-3 pr-2 text-xs shadow-lg backdrop-blur-md">
        <span className="text-paper-muted">Recommencer pour tout le monde ?</span>
        <button
          onClick={() => {
            onRestart();
            setConfirming(false);
          }}
          className="rounded-full bg-signal px-2 py-1 font-medium text-white"
        >
          Oui
        </button>
        <button onClick={() => setConfirming(false)} className="px-1 text-paper-faint">
          Non
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      aria-label="Recommencer la partie"
      className="fixed left-16 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-ink-border bg-ink-elevated/90 text-paper-muted shadow-lg backdrop-blur-md transition-colors hover:text-signal"
    >
      <RotateCcw size={15} />
    </button>
  );
}
