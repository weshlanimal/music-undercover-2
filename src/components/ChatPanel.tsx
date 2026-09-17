"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import type { ChatMessage, PublicPlayer } from "@/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  players: PublicPlayer[];
  myPlayerId: string;
  onSend: (text: string) => void;
}

/**
 * Bulle flottante façon messagerie mobile plutôt qu'un panneau intégré au
 * flux : ça évite toute collision avec le pied de page (bouton "Passer",
 * "Passer au vote"…) déjà utilisé par les écrans où ce chat apparaît.
 * N'est monté que pendant clue_playback et discussion (voir page.tsx) —
 * pas besoin de re-vérifier la phase ici.
 */
export function ChatPanel({ messages, players, myPlayerId, onSend }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const prevCountRef = useRef(messages.length);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > prevCountRef.current && !open) {
      setUnread((u) => u + (messages.length - prevCountRef.current));
    }
    prevCountRef.current = messages.length;
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, open]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen((o) => !o);
          setUnread(0);
        }}
        aria-label={open ? "Fermer le chat" : "Ouvrir le chat"}
        className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-wave text-ink shadow-glowTeal transition-transform active:scale-95"
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
        {unread > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-signal text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 bottom-40 z-40 flex max-h-[46vh] flex-col overflow-hidden rounded-2xl border border-ink-border bg-ink-elevated/95 shadow-lg backdrop-blur-md sm:inset-x-auto sm:right-4 sm:w-80">
          <div className="flex items-center justify-between border-b border-ink-border px-3.5 py-2.5">
            <p className="text-sm font-medium text-paper">Chat</p>
            <span className="text-xs text-paper-faint">{players.length} joueur{players.length > 1 ? "s" : ""}</span>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2.5">
            {messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-paper-faint">Aucun message pour l&apos;instant — écris le premier.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {messages.map((m) => {
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
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-ink-border p-2.5">
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
      )}
    </>
  );
}
