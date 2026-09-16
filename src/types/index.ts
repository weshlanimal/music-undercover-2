// ---------------------------------------------------------------------------
// Modèle de données central.
//
// Règles de confidentialité :
//  - le RÔLE (civil/infiltré) n'est JAMAIS envoyé à personne, pas même au
//    joueur concerné, avant son élimination. Tout le monde reçoit
//    exactement la même forme de message ({ playerId, theme }) — rien dans
//    le payload réseau ne permet de distinguer un civil d'un infiltré.
//  - à l'inverse, les musiques ne sont PAS anonymisées : titre, artiste,
//    vignette et lien d'origine sont visibles par tout le monde dès qu'un
//    indice est envoyé. MusicClue est un type entièrement public.
//
// Format de partie : une partie = un thème, un seul infiltré, une seule
// manche de vote. On ne rejoue pas plusieurs manches sur le même thème —
// la partie se conclut dès que le vote tombe (ou qu'une égalité persiste).
// "Rejouer" démarre une toute nouvelle partie avec un thème et des rôles
// neufs plutôt que d'enchaîner une "manche suivante".
// ---------------------------------------------------------------------------

export type Role = "civil" | "undercover";

export type MusicProviderName = "youtube" | "mock";

export interface ThemePair {
  id: string;
  civilTheme: string;
  undercoverTheme: string;
  category: string;
  custom: boolean;
  ownerRoomCode?: string;
}

export interface RoomSettings {
  maxPlayers: number; // 3..12
  timers: {
    enabled: boolean;
    musicSeconds: number; // défaut 60
    discussionSeconds: number; // défaut 90
    voteSeconds: number; // défaut 30
  };
  themeSource: "official" | "custom";
  /** Durée maximale (en secondes) d'un extrait diffusé, quelle que soit la longueur réelle de la vidéo/piste. */
  clipSeconds: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  timers: {
    enabled: true,
    musicSeconds: 60,
    discussionSeconds: 90,
    voteSeconds: 30
  },
  themeSource: "official",
  clipSeconds: 60
};

export type GamePhase =
  | "lobby"
  | "role_reveal"
  | "round_start"
  | "waiting_for_music"
  | "clue_playback"
  | "next_player"
  | "discussion"
  | "voting"
  | "vote_result"
  | "elimination"
  | "game_over";

export type RoomStatus = "lobby" | "in_progress" | "finished";

export interface PublicPlayer {
  id: string;
  nickname: string;
  avatar: string;
  isHost: boolean;
  isAlive: boolean;
  isReady: boolean;
  isConnected: boolean;
  hasPlayedThisRound: boolean;
}

/**
 * Ce que CE joueur connaît de lui-même : uniquement son thème. Civil et
 * infiltré reçoivent tous les deux exactement la même forme de message —
 * personne ne sait jamais s'il a le thème majoritaire ou minoritaire.
 */
export interface PrivatePlayerSecret {
  playerId: string;
  theme: string;
}

/** Un indice musical — entièrement visible par tous, y compris pendant la manche. */
export interface MusicClue {
  id: string;
  playerId: string;
  order: number;
  provider: MusicProviderName;
  /** Identifiant YouTube (pour l'intégration du lecteur officiel). Null en mode démo. */
  videoId: string | null;
  /** URL audio locale (mode démo uniquement). Null pour YouTube. */
  audioUrl: string | null;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  originalUrl: string;
  /** Durée effectivement diffusée (plafonnée), en secondes. */
  clipSeconds: number;
}

export interface VoteTally {
  [playerId: string]: number;
}

export interface PublicRoomState {
  code: string;
  status: RoomStatus;
  phase: GamePhase;
  hostPlayerId: string;
  settings: RoomSettings;
  players: PublicPlayer[];
  turnOrder: string[]; // playerIds, ordre de passage de la partie
  currentTurnPlayerId: string | null;
  clues: MusicClue[];
  phaseDeadline: number | null; // epoch ms, null si timers désactivés
  lastEliminatedPlayerId: string | null;
  /** Révélé dès l'élimination, pas seulement en fin de partie. */
  lastEliminatedRole: Role | null;
  lastVoteTally: VoteTally | null;
  /** Nombre de votes déjà reçus pendant la phase de vote en cours (le détail reste caché jusqu'au résultat). */
  votesSubmittedCount: number;
  /** Second tour restreint aux joueurs à égalité ; null hors cas d'égalité. */
  pendingTieBreak: string[] | null;
  winner: Role | null;
  /** Rempli uniquement en game_over : récap complet des rôles, thèmes et musiques. */
  reveal: RoomReveal | null;
}

export interface RoomReveal {
  roles: Record<string, { role: Role; theme: string }>;
  clues: MusicClue[];
}

export interface ParsedMusicLink {
  provider: MusicProviderName;
  rawUrl: string;
  trackId: string;
}

export interface ResolvedTrack {
  provider: MusicProviderName;
  providerTrackId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  originalUrl: string;
  /** Identifiant YouTube, pour le lecteur embarqué officiel. Null en mode démo. */
  videoId: string | null;
  /** URL audio locale, mode démo uniquement. Null pour YouTube. */
  previewUrl: string | null;
  durationMs: number;
}

export type ResolveOutcome =
  | { ok: true; track: ResolvedTrack }
  | {
      ok: false;
      reason: "unrecognized_link" | "not_found" | "embedding_disabled" | "provider_error";
    };
