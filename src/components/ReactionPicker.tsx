"use client";

import { REACTION_EMOJIS } from "@/lib/reactions";

interface ReactionPickerProps {
  onSend: (emoji: string) => void;
}

export function ReactionPicker({ onSend }: ReactionPickerProps) {
  return (
    <div className="flex justify-center gap-2 overflow-x-auto py-1">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSend(emoji)}
          aria-label={`Réagir avec ${emoji}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-elevated text-xl transition-transform active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
