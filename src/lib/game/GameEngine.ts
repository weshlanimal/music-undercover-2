import type {
  MusicClue,
  PrivatePlayerSecret,
  PublicPlayer,
  PublicRoomState,
  ResolvedTrack,
  Role,
  RoomReveal,
  RoomSettings,
  ThemePair,
  VoteTally
} from "@/types";
import { DEFAULT_ROOM_SETTINGS } from "@/types";
import { createEmptyRoom, type ServerPlayer, type ServerRoom } from "./types";
import { OFFICIAL_THEMES, pickRandomTheme } from "./themes";
import { GameRules } from "./GameRules";
import { MusicResolver } from "@/lib/music/MusicResolver";
import { createId, createRoomCode, randomAvatar, shuffle } from "@/lib/utils";
import { RoomStore } from "./RoomStore";

// ---------------------------------------------------------------------------
// Toute la logique de règles vit ici. La couche socket (src/lib/socket) ne
// fait QUE traduire des événements réseau en appels de méthodes ci-dessous,
// et republier `getPublicState()` / les messages privés retournés.
//
// Un MATCH enchaîne plusieurs MANCHES (thème + rôles neufs à chaque fois,
// tout le monde revit) jusqu'à ce qu'un·e joueur·se atteigne le score cible
// configuré par l'hôte. Rôles configurables (nombre d'infiltrés, Mr White),
// et le vote de fin de manche peut éliminer plusieurs joueurs à la fois.
// ---------------------------------------------------------------------------

const MIN_PLAYERS_TO_START = 3;
const NEXT_PLAYER_PAUSE_MS = 1_800;
const ROUND_RESULT_PAUSE_MS = 4_000;
const NEXT_ROUND_PAUSE_MS = 2_500;

export type EngineResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

export interface EngineBus {
  /** Diffuse l'état public à toute la room (y compris les joueurs déconnectés, pour la reconnexion). */
  broadcastState(room: ServerRoom): void;
  /** Envoie un message privé (secret de rôle, statut de résolution musicale, etc.) à un seul joueur. */
  sendToPlayer(playerId: string, event: string, payload: unknown): void;
}

function trackKey(track: Pick<ResolvedTrack, "provider" | "providerTrackId">): string {
  return `${track.provider}:${track.providerTrackId}`;
}

/**
 * Construit le secret envoyé à UN joueur pour son propre rôle : uniquement
 * son thème (ou `null` pour Mr White, qui n'en a structurellement aucun).
 * Civil et infiltré reçoivent tous les deux exactement la même forme de
 * message, donc rien dans le payload réseau ne permet de deviner lequel des
 * deux on est.
 */
function buildPrivateSecret(player: ServerPlayer): PrivatePlayerSecret | null {
  if (!player.role) return null;
  return { playerId: player.id, theme: player.theme };
}

export class GameEngine {
  constructor(
    private room: ServerRoom,
    private bus: EngineBus
  ) {}

  // ---- Création / cycle de vie de room -----------------------------------

  static createRoom(hostNickname: string, sessionId: string, settingsOverride?: Partial<RoomSettings>): ServerRoom {
    let code = createRoomCode();
    while (RoomStore.has(code)) code = createRoomCode();

    const hostId = createId("player");
    const room = createEmptyRoom(code, hostId, { ...DEFAULT_ROOM_SETTINGS, ...settingsOverride });

    const host: ServerPlayer = {
      id: hostId,
      sessionId,
      nickname: hostNickname.slice(0, 24) || "Host",
      avatar: randomAvatar(),
      isHost: true,
      isAlive: true,
      isReady: true,
      connected: true,
      socketId: null,
      role: null,
      theme: null,
      usedTrackKeys: new Set(),
      hasPlayedThisRound: false,
      score: 0
    };
    room.players.set(hostId, host);
    RoomStore.linkSession(sessionId, code, hostId);
    RoomStore.set(room);
    return room;
  }

  addPlayer(sessionId: string, nickname: string): EngineResult<string> {
    const room = this.room;
    if (room.status !== "lobby") return { ok: false, error: "La partie a déjà commencé." };
    if (room.players.size >= room.settings.maxPlayers) return { ok: false, error: "Salle complète." };

    const id = createId("player");
    const player: ServerPlayer = {
      id,
      sessionId,
      nickname: nickname.slice(0, 24) || "Joueur",
      avatar: randomAvatar(),
      isHost: false,
      isAlive: true,
      isReady: false,
      connected: true,
      socketId: null,
      role: null,
      theme: null,
      usedTrackKeys: new Set(),
      hasPlayedThisRound: false,
      score: 0
    };
    room.players.set(id, player);
    RoomStore.linkSession(sessionId, room.code, id);
    this.bus.broadcastState(room);
    return { ok: true, value: id };
  }

  reconnectPlayer(playerId: string, socketId: string): EngineResult<PrivatePlayerSecret | null> {
    const player = this.room.players.get(playerId);
    if (!player) return { ok: false, error: "Joueur introuvable." };
    player.connected = true;
    player.socketId = socketId;
    this.bus.broadcastState(this.room);
    return { ok: true, value: buildPrivateSecret(player) };
  }

  disconnectPlayer(playerId: string): void {
    const player = this.room.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    this.bus.broadcastState(this.room);
  }

  setReady(playerId: string, ready: boolean): void {
    const player = this.room.players.get(playerId);
    if (!player || this.room.status !== "lobby") return;
    player.isReady = ready;
    this.bus.broadcastState(this.room);
  }

  updateSettings(hostId: string, patch: Partial<RoomSettings>): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut modifier les paramètres." };
    if (room.status !== "lobby") return { ok: false, error: "Impossible de modifier les paramètres en cours de partie." };
    room.settings = { ...room.settings, ...patch, timers: { ...room.settings.timers, ...(patch.timers ?? {}) } };
    // Bornes de sécurité, appliquées immédiatement pour que le lobby affiche des valeurs cohérentes.
    room.settings.maxPlayers = Math.min(16, Math.max(3, Math.round(room.settings.maxPlayers)));
    room.settings.undercoverCount = Math.max(1, Math.round(room.settings.undercoverCount));
    room.settings.targetScore = Math.max(1, Math.round(room.settings.targetScore));
    this.bus.broadcastState(room);
    return { ok: true, value: undefined };
  }

  addCustomThemePair(hostId: string, civilTheme: string, undercoverTheme: string): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut ajouter un thème." };
    const civil = civilTheme.trim();
    const undercover = undercoverTheme.trim();
    if (!civil || !undercover) return { ok: false, error: "Les deux thèmes sont requis." };
    room.customThemePairs.push({
      id: createId("theme"),
      civilTheme: civil,
      undercoverTheme: undercover,
      category: "Personnalisé",
      custom: true,
      ownerRoomCode: room.code
    });
    this.bus.broadcastState(room);
    return { ok: true, value: undefined };
  }

  // ---- Démarrage du match -------------------------------------------------

  startGame(hostId: string): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut lancer la partie." };
    if (room.status !== "lobby") return { ok: false, error: "La partie a déjà commencé." };
    const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
    if (connectedPlayers.length < MIN_PLAYERS_TO_START) {
      return { ok: false, error: `Il faut au moins ${MIN_PLAYERS_TO_START} joueurs connectés.` };
    }

    room.status = "in_progress";
    for (const player of room.players.values()) player.score = 0;
    room.roundNumber = 0;
    this.beginNewRound();
    return { ok: true, value: undefined };
  }

  /** Démarre une nouvelle manche : thème et rôles neufs, tout le monde revit. */
  private beginNewRound(): void {
    const room = this.room;
    room.roundNumber += 1;
    this.assignRolesAndThemes();
    room.phase = "role_reveal";
    room.lastEliminatedPlayerIds = [];
    room.lastEliminatedRoles = {};
    this.sendAllSecrets();
    this.bus.broadcastState(room);
    // Pas de délai automatique ici (demande explicite) : la manche n'avance
    // que lorsque tout le monde a cliqué "J'ai compris", ou si l'hôte force
    // manuellement la suite (host:force_next_phase) en cas de blocage.
  }

  /** Un seul infiltré par défaut, configurable ; Mr White optionnel ; le reste civils. */
  private assignRolesAndThemes(): void {
    const room = this.room;
    const pool = room.settings.themeSource === "custom" && room.customThemePairs.length > 0 ? room.customThemePairs : OFFICIAL_THEMES;
    const theme: ThemePair = pickRandomTheme(pool);
    room.themePair = theme;

    const players = shuffle([...room.players.values()]);
    const mrWhiteCount = room.settings.mrWhiteEnabled ? 1 : 0;
    const maxBad = Math.max(1, players.length - 1); // laisse au moins 1 civil quand c'est possible
    let undercoverCount = Math.max(1, room.settings.undercoverCount);
    if (undercoverCount + mrWhiteCount > maxBad) {
      undercoverCount = Math.max(1, maxBad - mrWhiteCount);
    }

    const roles: Role[] = [
      ...Array(undercoverCount).fill("undercover" as const),
      ...Array(mrWhiteCount).fill("mrwhite" as const)
    ];
    while (roles.length < players.length) roles.push("civil");

    const shuffledRoles = shuffle(roles);
    players.forEach((player, index) => {
      const role = shuffledRoles[index]!;
      player.role = role;
      player.theme = role === "civil" ? theme.civilTheme : role === "undercover" ? theme.undercoverTheme : null;
      player.isAlive = true;
      player.isReady = false;
      player.usedTrackKeys = new Set();
    });
  }

  private sendAllSecrets(): void {
    for (const player of this.room.players.values()) {
      const secret = buildPrivateSecret(player);
      if (!secret) continue;
      this.bus.sendToPlayer(player.id, "role:secret", secret);
    }
  }

  ackRoleReveal(playerId: string): void {
    // La manche n'avance QUE lorsque tout le monde a acquitté son écran de
    // thème (demande explicite) — le seul déblocage possible en cas de
    // joueur bloqué/déconnecté est l'intervention manuelle de l'hôte
    // (host:force_next_phase).
    const room = this.room;
    if (room.phase !== "role_reveal") return;
    const player = room.players.get(playerId);
    if (player) player.isReady = true;
    this.bus.broadcastState(room);
    const alivePlayers = [...room.players.values()].filter((p) => p.isAlive && p.connected);
    if (alivePlayers.every((p) => p.isReady)) {
      this.beginTurnOrder();
    }
  }

  // ---- Ordre de passage -------------------------------------------

  private beginTurnOrder(): void {
    const room = this.room;
    const alivePlayers = [...room.players.values()].filter((p) => p.isAlive);
    for (const p of alivePlayers) p.hasPlayedThisRound = false;
    room.turnOrder = shuffle(alivePlayers.map((p) => p.id));
    room.currentTurnIndex = 0;
    room.currentRoundClues = [];
    room.phase = "round_start";
    this.bus.broadcastState(room);
    this.scheduleTimeout(2_500, () => this.beginTurn());
  }

  private beginTurn(): void {
    const room = this.room;
    room.phase = "waiting_for_music";
    room.phaseDeadline = room.settings.timers.enabled ? Date.now() + room.settings.timers.musicSeconds * 1000 : null;
    this.bus.broadcastState(room);
    this.scheduleDeadline(room.phaseDeadline, () => this.forceSkipCurrentTurn());
  }

  private get currentTurnPlayerId(): string | null {
    return this.room.turnOrder[this.room.currentTurnIndex] ?? null;
  }

  private forceSkipCurrentTurn(): void {
    // Le joueur au tour n'a rien envoyé dans les temps : on l'enregistre
    // comme "n'a pas joué" pour cette manche et on passe au suivant, plutôt
    // que de bloquer toute la table indéfiniment.
    this.advanceToNextTurnOrDiscussion();
  }

  // ---- Envoi de musique — automatique dès que l'analyse réussit -------------

  async submitMusicUrl(playerId: string, url: string): Promise<void> {
    const room = this.room;
    if (room.phase !== "waiting_for_music" || this.currentTurnPlayerId !== playerId) {
      this.bus.sendToPlayer(playerId, "music:resolve_error", { reason: "not_your_turn" });
      return;
    }

    if (!MusicResolver.isRecognizedLink(url)) {
      this.bus.sendToPlayer(playerId, "music:resolve_error", { reason: "unrecognized_link" });
      return;
    }

    this.bus.sendToPlayer(playerId, "music:resolving", {});
    const outcome = await MusicResolver.resolve(url);

    if (!outcome.ok) {
      this.bus.sendToPlayer(playerId, "music:resolve_error", { reason: outcome.reason });
      return;
    }

    const player = room.players.get(playerId);
    if (!player) return;

    const key = trackKey(outcome.track);
    if (player.usedTrackKeys.has(key)) {
      this.bus.sendToPlayer(playerId, "music:resolve_error", { reason: "duplicate_track" });
      return;
    }

    // Le tour a pu changer pendant l'appel réseau à YouTube (timeout écoulé
    // entre-temps) : on revérifie avant de finaliser quoi que ce soit.
    if (room.phase !== "waiting_for_music" || this.currentTurnPlayerId !== playerId) {
      this.bus.sendToPlayer(playerId, "music:resolve_error", { reason: "not_your_turn" });
      return;
    }

    this.finalizeClue(player, outcome.track);
  }

  private finalizeClue(player: ServerPlayer, track: ResolvedTrack): void {
    const room = this.room;
    player.usedTrackKeys.add(trackKey(track));

    const clueId = createId("clue");
    const clipSeconds = Math.min(
      room.settings.clipSeconds,
      track.provider === "mock" ? Math.round(track.durationMs / 1000) : room.settings.clipSeconds
    );
    const clue: MusicClue = {
      id: clueId,
      playerId: player.id,
      order: room.currentRoundClues.length,
      provider: track.provider,
      videoId: track.videoId,
      audioUrl: track.previewUrl,
      title: track.title,
      artist: track.artist,
      thumbnailUrl: track.artworkUrl,
      originalUrl: track.originalUrl,
      clipSeconds
    };
    room.currentRoundClues.push(clue);
    player.hasPlayedThisRound = true;

    room.phase = "clue_playback";
    room.phaseDeadline = Date.now() + clipSeconds * 1000 + 400;
    this.bus.broadcastState(room);
    this.bus.sendToPlayer(player.id, "clue:playback_started", {
      clueId,
      serverStartedAt: Date.now()
    });
    this.scheduleTimeout(clipSeconds * 1000 + 400, () => this.advanceToNextTurnOrDiscussion());
  }

  private advanceToNextTurnOrDiscussion(): void {
    const room = this.room;
    room.currentTurnIndex += 1;
    if (room.currentTurnIndex >= room.turnOrder.length) {
      this.beginDiscussion();
      return;
    }
    room.phase = "next_player";
    this.bus.broadcastState(room);
    this.scheduleTimeout(NEXT_PLAYER_PAUSE_MS, () => this.beginTurn());
  }

  // ---- Discussion — tout le monde doit valider pour lancer le vote -----------

  private beginDiscussion(): void {
    const room = this.room;
    for (const p of room.players.values()) p.isReady = false;
    room.phase = "discussion";
    room.phaseDeadline = room.settings.timers.enabled ? Date.now() + room.settings.timers.discussionSeconds * 1000 : null;
    this.bus.broadcastState(room);
    // Plafond dur à 5 minutes (ou la valeur configurée) : filet de sécurité
    // si tout le monde ne clique pas "Passer au vote".
    this.scheduleDeadline(room.phaseDeadline, () => this.beginVoting());
  }

  /** Chaque joueur clique "Passer au vote" ; le vote démarre dès que tout le monde vivant l'a fait. */
  markDiscussionReady(playerId: string): void {
    const room = this.room;
    if (room.phase !== "discussion") return;
    const player = room.players.get(playerId);
    if (player) player.isReady = true;
    this.bus.broadcastState(room);
    const alivePlayers = [...room.players.values()].filter((p) => p.isAlive && p.connected);
    if (alivePlayers.every((p) => p.isReady)) {
      this.clearTimer();
      this.beginVoting();
    }
  }

  hostAdvanceFromDiscussion(hostId: string): EngineResult {
    if (this.room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut passer cette phase." };
    if (this.room.phase !== "discussion") return { ok: false, error: "Pas en phase de discussion." };
    this.clearTimer();
    this.beginVoting();
    return { ok: true, value: undefined };
  }

  // ---- Vote — plusieurs suspects possibles, plusieurs éliminations possibles --

  private beginVoting(): void {
    const room = this.room;
    room.votes = new Map();
    room.phase = "voting";
    room.phaseDeadline = room.settings.timers.enabled ? Date.now() + room.settings.timers.voteSeconds * 1000 : null;
    this.bus.broadcastState(room);
    this.scheduleDeadline(room.phaseDeadline, () => this.resolveVotes());
  }

  /** @param targetIds Un ou plusieurs suspects cochés ; tableau vide autorisé (abstention). */
  submitVote(voterId: string, targetIds: string[]): EngineResult {
    const room = this.room;
    if (room.phase !== "voting") return { ok: false, error: "Ce n'est pas le moment de voter." };
    const voter = room.players.get(voterId);
    if (!voter || !voter.isAlive) return { ok: false, error: "Tu ne peux pas voter." };

    const uniqueTargets = new Set(targetIds);
    if (uniqueTargets.has(voterId)) return { ok: false, error: "Impossible de voter pour toi-même." };
    for (const targetId of uniqueTargets) {
      const target = room.players.get(targetId);
      if (!target || !target.isAlive) return { ok: false, error: "Cible invalide." };
    }

    room.votes.set(voterId, uniqueTargets);
    // Le NOMBRE de bulletins reçus est public en direct (votesSubmittedCount),
    // mais jamais le détail (qui a voté pour qui) avant la résolution.
    this.bus.broadcastState(room);

    const aliveCount = [...room.players.values()].filter((p) => p.isAlive).length;
    if (room.votes.size >= aliveCount) {
      this.clearTimer();
      this.resolveVotes();
    }
    return { ok: true, value: undefined };
  }

  private resolveVotes(): void {
    const room = this.room;
    const tally: VoteTally = {};
    for (const targets of room.votes.values()) {
      for (const targetId of targets) {
        tally[targetId] = (tally[targetId] ?? 0) + 1;
      }
    }
    room.lastVoteTally = tally;

    const aliveCount = [...room.players.values()].filter((p) => p.isAlive).length;
    const eliminatedIds = GameRules.resolveMajority(tally, aliveCount);

    room.lastEliminatedPlayerIds = eliminatedIds;
    room.lastEliminatedRoles = {};
    for (const id of eliminatedIds) {
      const player = room.players.get(id);
      if (player) {
        player.isAlive = false;
        room.lastEliminatedRoles[id] = player.role!;
      }
    }

    room.phase = "vote_result";
    this.bus.broadcastState(room);
    this.scheduleTimeout(3_000, () => this.showElimination());
  }

  private showElimination(): void {
    const room = this.room;
    room.phase = "elimination";
    this.bus.broadcastState(room);
    this.scheduleTimeout(2_500, () => this.concludeRound());
  }

  // ---- Fin de manche — score, puis manche suivante ou fin du match -----------

  private concludeRound(): void {
    const room = this.room;

    // Points strictement individuels : infiltré(s) et Mr White ne forment
    // pas une équipe. Chaque joueur gagne selon SA PROPRE survie au vote,
    // pas selon le sort des autres joueurs de son rôle. La manche est
    // terminée : plus aucune raison stratégique de cacher qui avait quel
    // rôle — on le révèle à tout le monde en même temps que le résultat,
    // ce qui permet à chacun de comprendre pourquoi son score vient de
    // changer (lui-même ne connaissait pas son propre rôle avant cet instant).
    room.lastRoundRoles = {};
    for (const player of room.players.values()) {
      if (!player.role) continue;
      room.lastRoundRoles[player.id] = player.role;
      player.score += GameRules.pointsFor(player.role, player.isAlive);
    }

    room.phase = "round_result";
    this.bus.broadcastState(room);

    const champions = [...room.players.values()].filter((p) => p.score >= room.settings.targetScore);
    if (champions.length > 0) {
      this.scheduleTimeout(ROUND_RESULT_PAUSE_MS, () => this.concludeMatch(champions.map((c) => c.id)));
    } else {
      this.scheduleTimeout(ROUND_RESULT_PAUSE_MS + NEXT_ROUND_PAUSE_MS, () => this.beginNewRound());
    }
  }

  private concludeMatch(matchWinnerIds: string[]): void {
    const room = this.room;
    room.matchWinnerIds = matchWinnerIds;
    room.status = "finished";
    room.phase = "game_over";
    this.bus.broadcastState(room);
  }

  // ---- Quitter la salle (bouton "Quitter") -----------------------------------

  /**
   * Initié par le joueur lui-même (pas besoin de permission host). En lobby,
   * on le retire réellement de la salle (et on réattribue l'hôte si besoin).
   * En cours de partie, retirer un joueur casserait l'ordre des tours et le
   * décompte des votes — on le traite donc comme une déconnexion normale :
   * il peut revenir plus tard via le même lien.
   */
  leaveRoom(playerId: string): void {
    const room = this.room;
    const player = room.players.get(playerId);
    if (!player) return;

    if (room.status === "lobby") {
      room.players.delete(playerId);
      if (room.players.size === 0) {
        RoomStore.delete(room.code);
        return;
      }
      if (room.hostPlayerId === playerId) {
        const next = [...room.players.values()][0]!;
        next.isHost = true;
        room.hostPlayerId = next.id;
      }
      this.bus.broadcastState(room);
      return;
    }

    player.connected = false;
    player.socketId = null;
    this.bus.broadcastState(room);
  }

  // ---- Host tools -----------------------------------

  hostForceNextPhase(hostId: string): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut forcer la suite." };
    this.clearTimer();
    switch (room.phase) {
      case "role_reveal":
        this.beginTurnOrder();
        break;
      case "waiting_for_music":
        this.forceSkipCurrentTurn();
        break;
      case "clue_playback":
        this.advanceToNextTurnOrDiscussion();
        break;
      case "discussion":
        this.beginVoting();
        break;
      case "voting":
        this.resolveVotes();
        break;
      default:
        return { ok: false, error: "Cette phase ne peut pas être forcée." };
    }
    return { ok: true, value: undefined };
  }

  hostRemovePlayer(hostId: string, targetId: string): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut retirer un joueur." };
    if (targetId === hostId) return { ok: false, error: "L'hôte ne peut pas se retirer lui-même." };
    room.players.delete(targetId);
    if (room.status === "in_progress") {
      room.turnOrder = room.turnOrder.filter((id) => id !== targetId);
    }
    this.bus.broadcastState(room);
    return { ok: true, value: undefined };
  }

  hostPause(hostId: string, paused: boolean): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut mettre en pause." };
    room.paused = paused;
    this.bus.broadcastState(room);
    return { ok: true, value: undefined };
  }

  // ---- Revanche — nouveau match complet, scores remis à zéro ------------------

  rematch(hostId: string): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut relancer." };
    if (room.status !== "finished") return { ok: false, error: "La partie n'est pas terminée." };

    for (const player of room.players.values()) {
      player.isAlive = true;
      player.isReady = false;
      player.role = null;
      player.theme = null;
      player.usedTrackKeys = new Set();
      player.score = 0;
    }
    room.status = "lobby";
    room.phase = "lobby";
    room.roundNumber = 0;
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.currentRoundClues = [];
    room.votes = new Map();
    room.lastVoteTally = null;
    room.lastEliminatedPlayerIds = [];
    room.lastEliminatedRoles = {};
    room.matchWinnerIds = null;
    room.phaseDeadline = null;
    room.themePair = null;
    this.bus.broadcastState(room);
    return { ok: true, value: undefined };
  }

  // ---- Timers internes ---------------------------------------------------

  private clearTimer(): void {
    if (this.room.phaseTimer) {
      clearTimeout(this.room.phaseTimer);
      this.room.phaseTimer = null;
    }
  }

  private scheduleTimeout(ms: number, fn: () => void): void {
    this.clearTimer();
    this.room.phaseTimer = setTimeout(() => {
      if (this.room.paused) return; // le Host peut mettre en pause
      fn();
    }, ms);
  }

  private scheduleDeadline(deadline: number | null, fn: () => void): void {
    if (deadline === null) return; // timers désactivés : avance uniquement via actions joueurs / host
    this.scheduleTimeout(Math.max(0, deadline - Date.now()), fn);
  }

  // ---- Sérialisation publique ----------------------------------------------

  getPublicState(): PublicRoomState {
    const room = this.room;
    const players: PublicPlayer[] = [...room.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      isHost: p.isHost,
      isAlive: p.isAlive,
      isReady: p.isReady,
      isConnected: p.connected,
      hasPlayedThisRound: room.turnOrder.slice(0, room.currentTurnIndex).includes(p.id),
      score: p.score
    }));

    let reveal: RoomReveal | null = null;
    if (room.status === "finished") {
      const roles: RoomReveal["roles"] = {};
      for (const p of room.players.values()) {
        roles[p.id] = { role: p.role ?? "civil", theme: p.theme };
      }
      reveal = { roles, clues: room.currentRoundClues };
    }

    const alivePlayers = [...room.players.values()].filter((p) => p.isAlive && p.connected);
    const discussionReadyCount = room.phase === "discussion" ? alivePlayers.filter((p) => p.isReady).length : 0;

    return {
      code: room.code,
      status: room.status,
      phase: room.phase,
      hostPlayerId: room.hostPlayerId,
      settings: room.settings,
      players,
      roundNumber: room.roundNumber,
      turnOrder: room.turnOrder,
      currentTurnPlayerId: this.currentTurnPlayerId,
      clues: room.currentRoundClues,
      phaseDeadline: room.phaseDeadline,
      lastEliminatedPlayerIds: room.lastEliminatedPlayerIds,
      lastEliminatedRoles: room.lastEliminatedRoles,
      lastVoteTally: room.phase === "vote_result" || room.phase === "elimination" || room.phase === "round_result" || room.status === "finished" ? room.lastVoteTally : null,
      votesSubmittedCount: room.votes.size,
      discussionReadyCount,
      lastRoundRoles: room.lastRoundRoles,
      matchWinnerIds: room.matchWinnerIds,
      reveal
    };
  }
}
