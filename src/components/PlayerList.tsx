"use client";

import clsx from "clsx";
import { Avatar } from "./Avatar";
import type { PublicPlayer } from "@/types";

interface PlayerListProps {
  players: PublicPlayer[];
  currentTurnPlayerId?: string | null;
  showReady?: boolean;
  meId?: string | null;
  hostId?: string;
}

export function PlayerList({ players, currentTurnPlayerId, showReady, meId, hostId }: PlayerListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {players.map((p) => (
        <li
          key={p.id}
          className={clsx(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
            currentTurnPlayerId === p.id ? "border-signal/60 bg-signal-dim/40" : "border-transparent bg-ink-elevated/60"
          )}
        >
          <Avatar emoji={p.avatar} size="sm" dimmed={!p.isAlive} pulsing={currentTurnPlayerId === p.id} ringColor="signal" />
          <span className={clsx("flex-1 truncate text-sm", !p.isAlive && "text-paper-faint line-through")}>
            {p.nickname}
            {p.id === meId && <span className="text-paper-faint"> (toi)</span>}
            {p.id === hostId && <span className="ml-1 text-[10px] text-alert">HOST</span>}
          </span>
          {!p.isConnected && <span className="text-xs text-paper-faint">déco</span>}
          {showReady && p.isAlive && (
            <span className={clsx("h-2 w-2 rounded-full", p.isReady ? "bg-wave" : "bg-ink-border")} />
          )}
        </li>
      ))}
    </ul>
  );
}
