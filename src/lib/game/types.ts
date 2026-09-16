import type { GamePhase, MusicClue, Role, RoomSettings, RoomStatus, ThemePair, VoteTally } from "@/types";

// ---------------------------------------------------------------------------
// Ces types vivent UNIQUEMENT côté serveur (importés seulement depuis
// server.ts / src/lib/socket / src/lib/game). Ne jamais les importer depuis
// un composant client : ils portent les rôles et thèmes de tout le monde.
// ---------------------------------------------------------------------------

export interface ServerPlayer {
  id: string;
  sessionId: string;
  nickname: string;
  avatar: string;
  isHost: boolean;
  isAlive: boolean;
  isReady: boolean;
  connected: boolean;
  socketId: string | null;
  role: Role | null;
  theme: string | null;
  /** Clés de morceaux déjà utilisées par CE joueur (provider:trackId), pour éviter les doublons. */
  usedTrackKeys: Set<string>;
  hasPlayedThisRound: boolean;
}

export interface ServerRoom {
  code: string;
  status: RoomStatus;
  phase: GamePhase;
  hostPlayerId: string;
  settings: RoomSettings;
  players: Map<string, ServerPlayer>;
  customThemePairs: ThemePair[];
  themePair: ThemePair | null;
  turnOrder: string[];
  currentTurnIndex: number;
  currentRoundClues: MusicClue[];
  votes: Map<string, string>; // voterId -> targetId
  lastVoteTally: VoteTally | null;
  lastEliminatedPlayerId: string | null;
  lastEliminatedRole: Role | null;
  pendingTieBreak: string[] | null;
  winner: Role | null;
  phaseDeadline: number | null;
  phaseTimer: NodeJS.Timeout | null;
  createdAt: number;
  paused: boolean;
}

export function createEmptyRoom(code: string, hostPlayerId: string, settings: RoomSettings): ServerRoom {
  return {
    code,
    status: "lobby",
    phase: "lobby",
    hostPlayerId,
    settings,
    players: new Map(),
    customThemePairs: [],
    themePair: null,
    turnOrder: [],
    currentTurnIndex: 0,
    currentRoundClues: [],
    votes: new Map(),
    lastVoteTally: null,
    lastEliminatedPlayerId: null,
    lastEliminatedRole: null,
    pendingTieBreak: null,
    winner: null,
    phaseDeadline: null,
    phaseTimer: null,
    createdAt: Date.now(),
    paused: false
  };
}
