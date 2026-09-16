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
  /** Clés de morceaux déjà utilisées par CE joueur (provider:trackId), pour éviter les doublons — remis à zéro à chaque manche. */
  usedTrackKeys: Set<string>;
  hasPlayedThisRound: boolean;
  /** Cumulé sur tout le match, remis à zéro uniquement à la revanche depuis le lobby. */
  score: number;
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
  roundNumber: number;
  turnOrder: string[];
  currentTurnIndex: number;
  currentRoundClues: MusicClue[];
  /** voterId -> ensemble des cibles cochées (vote multiple). */
  votes: Map<string, Set<string>>;
  lastVoteTally: VoteTally | null;
  lastEliminatedPlayerIds: string[];
  lastEliminatedRoles: Record<string, Role>;
  lastRoundRoles: Record<string, Role>;
  matchWinnerIds: string[] | null;
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
    roundNumber: 0,
    turnOrder: [],
    currentTurnIndex: 0,
    currentRoundClues: [],
    votes: new Map(),
    lastVoteTally: null,
    lastEliminatedPlayerIds: [],
    lastEliminatedRoles: {},
    lastRoundRoles: {},
    matchWinnerIds: null,
    phaseDeadline: null,
    phaseTimer: null,
    createdAt: Date.now(),
    paused: false
  };
}
