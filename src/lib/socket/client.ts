"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ClientEvents, ServerEvents, type MusicResolveErrorPayload, type CluePlaybackStartedPayload } from "./events";
import type { PrivatePlayerSecret, PublicRoomState, RoomSettings } from "@/types";

const SESSION_STORAGE_KEY = "music-undercover:sessionId";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

export type MusicResolutionStatus =
  | { state: "idle" }
  | { state: "resolving" }
  | { state: "error"; reason: MusicResolveErrorPayload["reason"] };

interface UseGameSocketReturn {
  connected: boolean;
  sessionId: string;
  playerId: string | null;
  roomCode: string | null;
  state: PublicRoomState | null;
  mySecret: PrivatePlayerSecret | null;
  errorMessage: string | null;
  musicResolution: MusicResolutionStatus;
  cluePlayback: CluePlaybackStartedPayload | null;
  createRoom: (nickname: string, settings?: Partial<RoomSettings>) => void;
  joinRoom: (code: string, nickname: string) => void;
  setReady: (ready: boolean) => void;
  updateSettings: (patch: Partial<RoomSettings>) => void;
  addCustomTheme: (civilTheme: string, undercoverTheme: string) => void;
  startGame: () => void;
  ackRoleReveal: () => void;
  submitMusicUrl: (url: string) => void;
  submitVote: (targetId: string) => void;
  hostAdvanceDiscussion: () => void;
  hostForceNextPhase: () => void;
  hostRemovePlayer: (targetId: string) => void;
  hostPause: (paused: boolean) => void;
  rematch: () => void;
  leaveRoom: () => void;
}

export function useGameSocket(): UseGameSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [mySecret, setMySecret] = useState<PrivatePlayerSecret | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [musicResolution, setMusicResolution] = useState<MusicResolutionStatus>({ state: "idle" });
  const [cluePlayback, setCluePlayback] = useState<CluePlaybackStartedPayload | null>(null);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Reconnexion automatique après refresh/petite déco.
      if (sessionId) socket.emit(ClientEvents.REJOIN_SESSION, { sessionId });
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on(ServerEvents.JOINED, (payload: { playerId: string; roomCode: string }) => {
      setPlayerId(payload.playerId);
      setRoomCode(payload.roomCode);
      setErrorMessage(null);
    });

    socket.on(ServerEvents.ROOM_STATE, (payload: PublicRoomState) => {
      setState(payload);
      if (payload.phase !== "waiting_for_music") setMusicResolution({ state: "idle" });
    });

    socket.on(ServerEvents.ROLE_SECRET, (payload: PrivatePlayerSecret) => setMySecret(payload));

    socket.on(ServerEvents.MUSIC_RESOLVING, () => setMusicResolution({ state: "resolving" }));
    socket.on(ServerEvents.MUSIC_RESOLVE_ERROR, (payload: MusicResolveErrorPayload) =>
      setMusicResolution({ state: "error", reason: payload.reason })
    );

    socket.on(ServerEvents.CLUE_PLAYBACK_STARTED, (payload: CluePlaybackStartedPayload) => setCluePlayback(payload));

    socket.on(ServerEvents.ROOM_ERROR, (payload: { message: string }) => setErrorMessage(payload.message));

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload ?? {});
  }, []);

  return {
    connected,
    sessionId,
    playerId,
    roomCode,
    state,
    mySecret,
    errorMessage,
    musicResolution,
    cluePlayback,
    createRoom: (nickname, settings) => emit(ClientEvents.CREATE_ROOM, { nickname, sessionId, settings }),
    joinRoom: (code, nickname) => emit(ClientEvents.JOIN_ROOM, { code, nickname, sessionId }),
    setReady: (ready) => emit(ClientEvents.SET_READY, { ready }),
    updateSettings: (patch) => emit(ClientEvents.UPDATE_SETTINGS, patch),
    addCustomTheme: (civilTheme, undercoverTheme) => emit(ClientEvents.ADD_CUSTOM_THEME, { civilTheme, undercoverTheme }),
    startGame: () => emit(ClientEvents.START_GAME),
    ackRoleReveal: () => emit(ClientEvents.ACK_ROLE_REVEAL),
    submitMusicUrl: (url) => emit(ClientEvents.SUBMIT_MUSIC_URL, { url }),
    submitVote: (targetId) => emit(ClientEvents.SUBMIT_VOTE, { targetId }),
    hostAdvanceDiscussion: () => emit(ClientEvents.HOST_ADVANCE_DISCUSSION),
    hostForceNextPhase: () => emit(ClientEvents.HOST_FORCE_NEXT_PHASE),
    hostRemovePlayer: (targetId) => emit(ClientEvents.HOST_REMOVE_PLAYER, { targetId }),
    hostPause: (paused) => emit(ClientEvents.HOST_PAUSE, { paused }),
    rematch: () => emit(ClientEvents.REMATCH),
    leaveRoom: () => emit(ClientEvents.LEAVE_ROOM)
  };
}
