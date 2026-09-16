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
  /** voterId -> cible UNIQUE, réutilisé pour le tour de vote actif (infiltré, puis Mr White). */
  votes: Map<string, string>;
  /** Résultat du 1er tour (qui est l'infiltré ?), gardé secret côté serveur jusqu'à la révélation combinée finale. */
  undercoverAccusedId: string | null;
  undercoverTally: VoteTally | null;
  /** Résultat du 2e tour (qui est Mr White ?), le cas échéant. */
  mrWhiteAccusedId: string | null;
  mrWhiteTally: VoteTally | null;
  lastEliminatedPlayerIds: string[];
  lastEliminatedRoles: Record<string, Role>;
  /** Qui doit deviner le thème des civils, le cas échéant (phase mrwhite_guess). */
  mrWhiteGuessPlayerId: string | null;
  mrWhiteGuessResult: { guess: string; correct: boolean } | null;
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
    undercoverAccusedId: null,
    undercoverTally: null,
    mrWhiteAccusedId: null,
    mrWhiteTally: null,
    lastEliminatedPlayerIds: [],
    lastEliminatedRoles: {},
    mrWhiteGuessPlayerId: null,
    mrWhiteGuessResult: null,
    lastRoundRoles: {},
    matchWinnerIds: null,
    phaseDeadline: null,
    phaseTimer: null,
    createdAt: Date.now(),
    paused: false
  };
}
