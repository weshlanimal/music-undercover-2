"use client";

import { useRef, type CSSProperties } from "react";

interface Reaction {
  id: string;
  emoji: string;
}

interface ReactionOverlayProps {
  reactions: Reaction[];
  onExpire: (id: string) => void;
}

/**
 * Monté une seule fois au niveau de la page (pas par écran de jeu), pour
 * qu'une réaction en plein vol ne disparaisse jamais brutalement à cause
 * d'un changement de phase pendant son animation.
 */
export function ReactionOverlay({ reactions, onExpire }: ReactionOverlayProps) {
  if (reactions.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {reactions.map((r) => (
        <FloatingEmoji key={r.id} emoji={r.emoji} onDone={() => onExpire(r.id)} />
      ))}
    </div>
  );
}

function FloatingEmoji({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  // Calculé une seule fois à l'apparition de CETTE réaction précise (chaque
  // instance a son propre id de clé React, donc son propre montage) — pas
  // besoin d'état, juste une valeur stable sur la durée de vie du composant.
  const params = useRef({
    left: 8 + Math.random() * 84,
    duration: 2.2 + Math.random() * 1.3,
    drift: Math.round((Math.random() - 0.5) * 70),
    rotate: Math.round((Math.random() - 0.5) * 36)
  }).current;

  return (
    <span
      onAnimationEnd={onDone}
      className="absolute bottom-0 select-none text-4xl"
      style={
        {
          left: `${params.left}%`,
          animation: `reaction-float-up ${params.duration}s ease-out forwards`,
          "--reaction-drift": `${params.drift}px`,
          "--reaction-rotate": `${params.rotate}deg`
        } as CSSProperties
      }
    >
      {emoji}
    </span>
  );
}
