import type { PrivatePlayerSecret, PublicRoomState } from "@/types";

// Intentions client → serveur (section 41). Le serveur est seul juge :
// chaque handler revalide tout côté GameEngine, jamais de confiance dans le payload.
export const ClientEvents = {
  CREATE_ROOM: "room:create",
  JOIN_ROOM: "room:join",
  REJOIN_SESSION: "session:rejoin",
  SET_READY: "player:set_ready",
  UPDATE_SETTINGS: "host:update_settings",
  ADD_CUSTOM_THEME: "host:add_custom_theme",
  START_GAME: "host:start_game",
  ACK_ROLE_REVEAL: "role:ack",
  SUBMIT_MUSIC_URL: "music:submit_url",
  SUBMIT_VOTE: "vote:submit",
  DISCUSSION_READY: "discussion:ready",
  SEND_PLAYBACK_CONTROL: "clue:control_send",
  SKIP_CLUE_PLAYBACK: "clue:skip",
  HOST_ADVANCE_DISCUSSION: "host:advance_discussion",
  HOST_FORCE_NEXT_PHASE: "host:force_next_phase",
  HOST_REMOVE_PLAYER: "host:remove_player",
  HOST_PAUSE: "host:pause",
  REMATCH: "host:rematch",
  LEAVE_ROOM: "player:leave"
} as const;

// Événements serveur → client.
export const ServerEvents = {
  ROOM_STATE: "room:state",
  ROOM_ERROR: "room:error",
  ROLE_SECRET: "role:secret",
  MUSIC_RESOLVING: "music:resolving",
  MUSIC_RESOLVE_ERROR: "music:resolve_error",
  CLUE_CONTROL: "clue:control",
  JOINED: "session:joined"
} as const;

export interface JoinedPayload {
  playerId: string;
  sessionId: string;
  roomCode: string;
}

export interface MusicResolveErrorPayload {
  reason: "unrecognized_link" | "not_found" | "embedding_disabled" | "provider_error" | "duplicate_track" | "not_your_turn";
}

/**
 * Watch2gether : la personne qui vient d'envoyer l'indice contrôle la
 * lecture (lire/pause/déplacer) pour tout le monde. Diffusé par le serveur
 * à toute la room à chaque action du contrôleur ; `serverTime` sert aux
 * autres clients à compenser le petit délai réseau.
 */
export interface CluePlaybackControlPayload {
  action: "play" | "pause";
  positionSeconds: number;
  serverTime: number;
}

export type { PrivatePlayerSecret, PublicRoomState };
