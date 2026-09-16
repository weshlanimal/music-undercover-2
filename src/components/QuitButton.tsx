"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

interface QuitButtonProps {
  onQuit: () => void;
}

/**
 * Toujours visible, quelle que soit la phase de jeu. En lobby, quitter
 * retire réellement le joueur de la salle (l'hôte est réattribué si besoin).
 * En cours de partie, quitter équivaut à une déconnexion normale : le
 * joueur peut revenir plus tard via le même lien (voir GameEngine.leaveRoom).
 */
export function QuitButton({ onQuit }: QuitButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-signal/40 bg-ink-elevated/95 py-2 pl-3 pr-2 text-xs shadow-lg backdrop-blur-md">
        <span className="text-paper-muted">Quitter ?</span>
        <button onClick={onQuit} className="rounded-full bg-signal px-2 py-1 font-medium text-white">
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
      aria-label="Quitter la partie"
      className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-ink-border bg-ink-elevated/90 text-paper-muted shadow-lg backdrop-blur-md transition-colors hover:text-signal"
    >
      <LogOut size={16} />
    </button>
  );
}
