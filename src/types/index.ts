// ---------------------------------------------------------------------------
// Modèle de données central.
//
// Règles de confidentialité :
//  - le RÔLE n'est JAMAIS envoyé à personne, pas même au joueur concerné.
//    Civil et infiltré reçoivent exactement la même forme de message
//    ({ playerId, theme }) — rien ne permet de les distinguer. Mr White
//    n'a structurellement aucun thème à recevoir (theme: null), ce qui lui
//    révèle de facto son propre rôle (inévitable : on ne peut pas cacher
//    une absence totale d'information à celui qui la reçoit).
//  - les musiques ne sont PAS anonymisées : titre, artiste, vignette et
//    lien d'origine sont visibles par tout le monde dès qu'un indice est
//    envoyé. MusicClue est un type entièrement public.
//
// Format de partie : un "match" enchaîne plusieurs MANCHES (chacune : un
// thème, des rôles neufs, un tour de musique par joueur, une discussion,
// deux votes) jusqu'à ce qu'un·e joueur·se atteigne le score cible configuré
// par l'hôte. Toujours EXACTEMENT UN infiltré ; Mr White optionnel. Le vote
// se déroule en deux tours à cible UNIQUE (jamais plusieurs suspects à la
// fois, pour éviter le n'importe quoi) : d'abord qui est l'infiltré, puis
// (si Mr White est activé) qui est Mr White — sans révéler le résultat du
// premier tour avant la fin du second.
// ---------------------------------------------------------------------------

export type Role = "civil" | "undercover" | "mrwhite";

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
  maxPlayers: number; // 3..16
  mrWhiteEnabled: boolean;
  /** Score à atteindre pour remporter le match (plusieurs manches enchaînées). */
  targetScore: number;
  timers: {
    enabled: boolean;
    musicSeconds: number; // défaut 60
    discussionSeconds: number; // défaut 300 (5 min)
    voteSeconds: number; // défaut 45
  };
  themeSource: "official" | "custom";
  /** Durée maximale (en secondes) d'un extrait diffusé, quelle que soit la longueur réelle de la vidéo/piste. */
  clipSeconds: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 16,
  mrWhiteEnabled: false,
  targetScore: 3,
  timers: {
    enabled: true,
    musicSeconds: 60,
    discussionSeconds: 300,
    voteSeconds: 45
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
  | "voting_undercover"
  | "voting_mrwhite"
  | "elimination"
  | "mrwhite_guess"
  | "round_result"
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
  /** Cumulé sur tout le match, remis à zéro seulement à la revanche depuis le lobby. */
  score: number;
}

/**
 * Ce que CE joueur connaît de lui-même. Civil et infiltré reçoivent tous
 * les deux `{ theme: string }` — indiscernables. Mr White reçoit
 * `{ theme: null }` : il n'y a rien d'autre à lui cacher, l'absence de
 * thème EST son information.
 */
export interface PrivatePlayerSecret {
  playerId: string;
  theme: string | null;
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

/**
 * Résultat COMBINÉ des deux tours de vote — rempli seulement une fois que
 * TOUS les votes applicables sont clos (jamais entre les deux tours, pour ne
 * rien dévoiler avant l'heure). `undercoverAccusedId`/`mrWhiteAccusedId`
 * valent `null` en cas d'égalité (personne n'est désigné ce tour-là) — que
 * la personne désignée ait effectivement le rôle correspondant ou non est à
 * lire via `lastEliminatedRoles`.
 */
export interface VoteReveal {
  undercoverAccusedId: string | null;
  undercoverTally: VoteTally;
  mrWhiteAccusedId: string | null;
  /** null si Mr White est désactivé pour ce match (pas de second tour). */
  mrWhiteTally: VoteTally | null;
}

export interface PublicRoomState {
  code: string;
  status: RoomStatus;
  phase: GamePhase;
  hostPlayerId: string;
  settings: RoomSettings;
  players: PublicPlayer[];
  roundNumber: number;
  turnOrder: string[]; // playerIds, ordre de passage de la manche courante
  currentTurnPlayerId: string | null;
  clues: MusicClue[];
  phaseDeadline: number | null; // epoch ms, null si timers désactivés
  /** Éliminé·e·s par les votes de cette manche (0 à 2 personnes : l'accusé infiltré et/ou l'accusé Mr White). */
  lastEliminatedPlayerIds: string[];
  /** Rôle RÉEL de chaque éliminé·e de cette manche, révélé une fois les deux votes clos. */
  lastEliminatedRoles: Record<string, Role>;
  /** Rempli uniquement une fois les deux tours de vote clos (phase elimination et après) — jamais entre les deux tours. */
  voteReveal: VoteReveal | null;
  /** Non-null pendant la phase mrwhite_guess : qui doit deviner le thème des civils pour s'en sortir malgré tout. */
  mrWhiteGuessPlayerId: string | null;
  /** Rempli une fois la devinette de Mr White résolue (correcte ou non) — visible dès round_result. */
  mrWhiteGuessResult: { guess: string; correct: boolean } | null;
  /** Nombre de bulletins déjà reçus pendant LE TOUR DE VOTE EN COURS (le détail reste caché jusqu'à la révélation finale). */
  votesSubmittedCount: number;
  /** Nombre de joueurs prêts à passer au vote pendant la discussion. */
  discussionReadyCount: number;
  /** Rôle de CHAQUE joueur pour la manche qui vient de se conclure — révélé une fois le résultat connu (round_result / game_over), jamais avant. */
  lastRoundRoles: Record<string, Role> | null;
  /** Rempli uniquement en game_over : le ou les joueurs ayant atteint le score cible. */
  matchWinnerIds: string[] | null;
  /** Rempli uniquement en game_over : récap complet des rôles, thèmes et musiques de la dernière manche. */
  reveal: RoomReveal | null;
}

export interface RoomReveal {
  roles: Record<string, { role: Role; theme: string | null }>;
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
