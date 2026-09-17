import type { Server, Socket } from "socket.io";
import { GameEngine, type EngineBus } from "@/lib/game/GameEngine";
import { RoomStore } from "@/lib/game/RoomStore";
import { createSessionId } from "@/lib/utils";
import { ClientEvents, ServerEvents, type JoinedPayload } from "./events";
import type { RoomSettings } from "@/types";

interface SocketData {
  sessionId: string | null;
  roomCode: string | null;
  playerId: string | null;
}

function socketData(socket: Socket): SocketData {
  socket.data.session ??= { sessionId: null, roomCode: null, playerId: null };
  return socket.data.session as SocketData;
}

function makeBus(io: Server, roomCode: string): EngineBus {
  const bus: EngineBus = {
    broadcastState(room) {
      const state = new GameEngine(room, bus).getPublicState();
      io.to(roomCode).emit(ServerEvents.ROOM_STATE, state);
    },
    sendToPlayer(playerId, event, payload) {
      const room = RoomStore.get(roomCode);
      const player = room?.players.get(playerId);
      if (player?.socketId) io.to(player.socketId).emit(event, payload);
    },
    broadcastToRoom(event, payload) {
      io.to(roomCode).emit(event, payload);
    }
  };
  return bus;
}

function engineFor(io: Server, roomCode: string): GameEngine | null {
  const room = RoomStore.get(roomCode);
  if (!room) return null;
  return new GameEngine(room, makeBus(io, roomCode));
}

function fail(socket: Socket, message: string): void {
  socket.emit(ServerEvents.ROOM_ERROR, { message });
}

export function attachSocketServer(io: Server): void {
  io.on("connection", (socket) => {
    const data = socketData(socket);

    socket.on(ClientEvents.CREATE_ROOM, (payload: { nickname: string; sessionId?: string; settings?: Partial<RoomSettings> }) => {
      const sessionId = payload.sessionId || createSessionId();
      const room = GameEngine.createRoom(payload.nickname ?? "Host", sessionId, payload.settings);
      const player = [...room.players.values()][0]!;
      player.socketId = socket.id;

      data.sessionId = sessionId;
      data.roomCode = room.code;
      data.playerId = player.id;
      socket.join(room.code);

      socket.emit(ServerEvents.JOINED, { playerId: player.id, sessionId, roomCode: room.code } satisfies JoinedPayload);
      const engine = engineFor(io, room.code)!;
      io.to(room.code).emit(ServerEvents.ROOM_STATE, engine.getPublicState());
    });

    socket.on(ClientEvents.JOIN_ROOM, (payload: { code: string; nickname: string; sessionId?: string }) => {
      const code = (payload.code || "").trim().toUpperCase();
      const room = RoomStore.get(code);
      if (!room) return fail(socket, "Cette salle n'existe pas.");

      const sessionId = payload.sessionId || createSessionId();
      const engine = new GameEngine(room, makeBus(io, code));
      const result = engine.addPlayer(sessionId, payload.nickname ?? "Joueur");
      if (!result.ok) return fail(socket, result.error);

      const player = room.players.get(result.value)!;
      player.socketId = socket.id;

      data.sessionId = sessionId;
      data.roomCode = code;
      data.playerId = player.id;
      socket.join(code);

      socket.emit(ServerEvents.JOINED, { playerId: player.id, sessionId, roomCode: code } satisfies JoinedPayload);
      io.to(code).emit(ServerEvents.ROOM_STATE, engine.getPublicState());
    });

    socket.on(ClientEvents.REJOIN_SESSION, (payload: { sessionId: string }) => {
      // Émis automatiquement et silencieusement à CHAQUE connexion (y
      // compris la toute première visite d'un nouvel arrivant, qui n'a
      // encore rejoint aucune salle) : un échec ici est donc normal et
      // attendu la plupart du temps, pas une vraie erreur. On ne remonte
      // jamais de message "Session inconnue" au client — ça ne veut rien
      // dire pour quelqu'un qui vient d'arriver sur la page d'accueil.
      const link = RoomStore.resolveSession(payload?.sessionId ?? "");
      if (!link) return;
      const engine = engineFor(io, link.roomCode);
      if (!engine) return;

      const result = engine.reconnectPlayer(link.playerId, socket.id);
      if (!result.ok) return;

      data.sessionId = payload.sessionId;
      data.roomCode = link.roomCode;
      data.playerId = link.playerId;
      socket.join(link.roomCode);

      socket.emit(ServerEvents.JOINED, { playerId: link.playerId, sessionId: payload.sessionId, roomCode: link.roomCode } satisfies JoinedPayload);
      if (result.value) socket.emit(ServerEvents.ROLE_SECRET, result.value);
      socket.emit(ServerEvents.ROOM_STATE, engine.getPublicState());
    });

    socket.on(
      ClientEvents.LEAVE_ROOM,
      withEngine((engine, playerId) => {
        engine.leaveRoom(playerId);
        if (data.sessionId) RoomStore.unlinkSession(data.sessionId);
        data.roomCode = null;
        data.playerId = null;
      })
    );

    socket.on("disconnect", () => {
      if (!data.roomCode || !data.playerId) return;
      const engine = engineFor(io, data.roomCode);
      engine?.disconnectPlayer(data.playerId);
    });

    // ---- Actions en room : toutes vérifient data.roomCode/playerId --------

    function withEngine(handler: (engine: GameEngine, playerId: string) => void) {
      return (payload: unknown) => {
        if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
        const engine = engineFor(io, data.roomCode);
        if (!engine) return fail(socket, "Cette salle n'existe plus.");
        handler(engine, data.playerId);
      };
    }

    socket.on(ClientEvents.SET_READY, (payload: { ready: boolean }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      engine?.setReady(data.playerId, !!payload?.ready);
    });

    socket.on(ClientEvents.UPDATE_SETTINGS, (payload: Partial<RoomSettings>) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.updateSettings(data.playerId, payload);
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(ClientEvents.ADD_CUSTOM_THEME, (payload: { civilTheme: string; undercoverTheme: string }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.addCustomThemePair(data.playerId, payload.civilTheme, payload.undercoverTheme);
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(
      ClientEvents.START_GAME,
      withEngine((engine, playerId) => {
        const result = engine.startGame(playerId);
        if (!result.ok) fail(socket, result.error);
      })
    );

    socket.on(
      ClientEvents.ACK_ROLE_REVEAL,
      withEngine((engine, playerId) => {
        engine.ackRoleReveal(playerId);
      })
    );

    socket.on(
      ClientEvents.REQUEST_SECRET,
      withEngine((engine, playerId) => {
        // Auto-réparation : le client a détecté que son thème ne
        // correspond pas à la manche en cours (message initial perdu) et
        // en redemande un frais, adressé uniquement à lui.
        const secret = engine.requestSecret(playerId);
        if (secret) socket.emit(ServerEvents.ROLE_SECRET, secret);
      })
    );

    socket.on(ClientEvents.SUBMIT_MUSIC_URL, async (payload: { url: string }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      await engine?.submitMusicUrl(data.playerId, payload.url ?? "");
    });

    socket.on(ClientEvents.SEND_PLAYBACK_CONTROL, (payload: { action: "play" | "pause"; positionSeconds: number }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.sendPlaybackControl(data.playerId, payload?.action, Number(payload?.positionSeconds) || 0);
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(
      ClientEvents.SKIP_CLUE_PLAYBACK,
      withEngine((engine, playerId) => {
        const result = engine.skipCluePlayback(playerId);
        if (!result.ok) fail(socket, result.error);
      })
    );

    socket.on(ClientEvents.SEND_REACTION, (payload: { emoji: string }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.sendReaction(data.playerId, String(payload?.emoji ?? ""));
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(ClientEvents.SEND_CHAT_MESSAGE, (payload: { text: string }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.sendChatMessage(data.playerId, String(payload?.text ?? ""));
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(ClientEvents.SUBMIT_MRWHITE_GUESS, (payload: { guess: string }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.submitMrWhiteGuess(data.playerId, String(payload?.guess ?? ""));
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(ClientEvents.HOST_VALIDATE_MRWHITE_GUESS, (payload: { correct: boolean }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.hostValidateMrWhiteGuess(data.playerId, !!payload?.correct);
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(ClientEvents.SUBMIT_VOTE, (payload: { targetId: string }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.submitVote(data.playerId, String(payload?.targetId ?? ""));
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(
      ClientEvents.DISCUSSION_READY,
      withEngine((engine, playerId) => {
        engine.markDiscussionReady(playerId);
      })
    );

    socket.on(
      ClientEvents.HOST_ADVANCE_DISCUSSION,
      withEngine((engine, playerId) => {
        const result = engine.hostAdvanceFromDiscussion(playerId);
        if (!result.ok) fail(socket, result.error);
      })
    );

    socket.on(
      ClientEvents.HOST_FORCE_NEXT_PHASE,
      withEngine((engine, playerId) => {
        const result = engine.hostForceNextPhase(playerId);
        if (!result.ok) fail(socket, result.error);
      })
    );

    socket.on(ClientEvents.HOST_REMOVE_PLAYER, (payload: { targetId: string }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.hostRemovePlayer(data.playerId, payload.targetId);
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(ClientEvents.HOST_PAUSE, (payload: { paused: boolean }) => {
      if (!data.roomCode || !data.playerId) return fail(socket, "Tu n'es pas dans une salle.");
      const engine = engineFor(io, data.roomCode);
      const result = engine?.hostPause(data.playerId, !!payload.paused);
      if (result && !result.ok) fail(socket, result.error);
    });

    socket.on(
      ClientEvents.REMATCH,
      withEngine((engine, playerId) => {
        const result = engine.rematch(playerId);
        if (!result.ok) fail(socket, result.error);
      })
    );
  });

  // Nettoyage périodique des rooms abandonnées (section 48 : reconnexion
  // possible, mais pas indéfiniment si plus personne ne revient).
  setInterval(() => RoomStore.sweepStaleRooms(2 * 60 * 60 * 1000), 10 * 60 * 1000);
}
