import type { ServerRoom } from "./types";

// ---------------------------------------------------------------------------
// Store en mémoire, volontairement simple pour le MVP (doit tourner avec
// `npm install && npm run dev`, sans service externe).
//
// Choix assumé, différent d'une stack Postgres/Supabase : une room de party
// game est éphémère (quelques dizaines de minutes), n'a pas besoin de
// persistance durable, et un store en mémoire donne le temps réel le plus
// simple et le plus rapide à développer/tester.
//
// Limite explicite : un redémarrage du process perd toutes les rooms en
// cours, et ce store ne fonctionne que sur une seule instance Node (pas de
// scaling horizontal sans passer par une couche partagée — Redis, ou une
// bascule vers une base partagée).
// ---------------------------------------------------------------------------

const rooms = new Map<string, ServerRoom>();
/** sessionId -> { roomCode, playerId } pour permettre la reconnexion après refresh. */
const sessionIndex = new Map<string, { roomCode: string; playerId: string }>();

export const RoomStore = {
  get(code: string): ServerRoom | undefined {
    return rooms.get(code.toUpperCase());
  },

  set(room: ServerRoom): void {
    rooms.set(room.code, room);
  },

  delete(code: string): void {
    rooms.delete(code.toUpperCase());
  },

  has(code: string): boolean {
    return rooms.has(code.toUpperCase());
  },

  linkSession(sessionId: string, roomCode: string, playerId: string): void {
    sessionIndex.set(sessionId, { roomCode, playerId });
  },

  resolveSession(sessionId: string): { roomCode: string; playerId: string } | undefined {
    return sessionIndex.get(sessionId);
  },

  unlinkSession(sessionId: string): void {
    sessionIndex.delete(sessionId);
  },

  /** Nettoyage périodique des rooms mortes (personne connecté depuis longtemps). */
  sweepStaleRooms(maxIdleMs: number): void {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const anyoneConnected = [...room.players.values()].some((p) => p.connected);
      const idleFor = now - room.createdAt;
      if (!anyoneConnected && idleFor > maxIdleMs) {
        rooms.delete(code);
      }
    }
  }
};
