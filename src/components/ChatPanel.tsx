"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import type { ChatMessage, PublicPlayer } from "@/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  players: PublicPlayer[];
  myPlayerId: string;
  onSend: (text: string) => void;
}

/**
 * Panneau TOUJOURS visible dans le flux normal de l'écran (pas une bulle à
 * ouvrir) — demande explicite : on doit voir les messages arriver sans avoir
 * à cliquer sur quoi que ce soit. N'est monté que pendant clue_playback et
 * discussion (voir page.tsx), donc pas besoin de re-vérifier la phase ici.
 */
export function ChatPanel({ messages, players, myPlayerId, onSend }: ChatPanelProps) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="mt-5 flex flex-col overflow-hidden rounded-2xl border border-ink-border bg-ink-elevated/70">
      <div className="flex items-center gap-1.5 border-b border-ink-border px-3.5 py-2">
        <MessageCircle size={13} className="text-paper-faint" />
        <p className="text-xs font-medium uppercase tracking-wide text-paper-faint">Chat</p>
      </div>

      <div ref={listRef} className="flex h-40 flex-col gap-2 overflow-y-auto px-3 py-2.5">
        {messages.length === 0 ? (
          <p className="m-auto max-w-[80%] text-center text-xs text-paper-faint">
            Aucun message pour l&apos;instant — écris le premier.
          </p>
        ) : (
          messages.map((m) => {
            const author = players.find((p) => p.id === m.playerId);
            const mine = m.playerId === myPlayerId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && <span className="mb-0.5 text-[10px] text-paper-faint">{author?.nickname ?? "?"}</span>}
                <span
                  className={`max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm ${
                    mine ? "bg-wave text-ink" : "bg-ink-raised text-paper"
                  }`}
                >
                  {m.text}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-ink-border p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Écrire un message…"
          className="min-w-0 flex-1 rounded-full bg-ink-raised px-3.5 py-2 text-sm text-paper placeholder:text-paper-faint focus:outline-none focus:ring-2 focus:ring-wave/30"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Envoyer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wave text-ink disabled:opacity-40"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
