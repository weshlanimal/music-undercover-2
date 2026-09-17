import type {
  GamePhase,
  MusicClue,
  PrivatePlayerSecret,
  PublicPlayer,
  PublicRoomState,
  ResolvedTrack,
  Role,
  RoomReveal,
  RoomSettings,
  ThemePair,
  VoteReveal,
  VoteTally
} from "@/types";
import { DEFAULT_ROOM_SETTINGS } from "@/types";
import { createEmptyRoom, type ServerPlayer, type ServerRoom } from "./types";
import { OFFICIAL_THEMES, pickRandomTheme } from "./themes";
import { assignMissionsForRound } from "./missions";
import { GameRules } from "./GameRules";
import { isValidReactionEmoji } from "@/lib/reactions";
import { MusicResolver } from "@/lib/music/MusicResolver";
import { createId, createRoomCode, guessMatchesTheme, randomAvatar, shuffle } from "@/lib/utils";
import { RoomStore } from "./RoomStore";

// ---------------------------------------------------------------------------
// Toute la logique de règles vit ici. La couche socket (src/lib/socket) ne
// fait QUE traduire des événements réseau en appels de méthodes ci-dessous,
// et republier `getPublicState()` / les messages privés retournés.
//
// Un MATCH enchaîne plusieurs MANCHES (thème + rôles neufs à chaque fois,
// tout le monde revit) jusqu'à ce qu'un·e joueur·se atteigne le score cible
// configuré par l'hôte. Toujours EXACTEMENT UN infiltré ; Mr White optionnel.
// Le vote de fin de manche se déroule en DEUX tours à cible unique (jamais
// plusieurs suspects à la fois) : d'abord qui est l'infiltré, puis (si Mr
// White est activé) qui est Mr White — sans rien révéler entre les deux tours.
// ---------------------------------------------------------------------------

const MIN_PLAYERS_TO_START = 3;
const NEXT_PLAYER_PAUSE_MS = 1_800;
const MR_WHITE_GUESS_TIMEOUT_MS = 45_000;

export type EngineResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

export interface EngineBus {
  /** Diffuse l'état public à toute la room (y compris les joueurs déconnectés, pour la reconnexion). */
  broadcastState(room: ServerRoom): void;
  /** Envoie un message privé (secret de rôle, statut de résolution musicale, etc.) à un seul joueur. */
  sendToPlayer(playerId: string, event: string, payload: unknown): void;
  /** Diffuse un événement ponctuel (pas l'état complet) à toute la room — utilisé pour la synchro lecture "watch2gether". */
  broadcastToRoom(event: string, payload: unknown): void;
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
function buildPrivateSecret(player: ServerPlayer, roundNumber: number): PrivatePlayerSecret | null {
  if (!player.role) return null;
  return { playerId: player.id, theme: player.theme, mission: player.mission, roundNumber };
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
      mission: null,
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
      mission: null,
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
    return { ok: true, value: buildPrivateSecret(player, this.room.roundNumber) };
  }

  /**
   * Auto-réparation : le client redemande son secret lui-même s'il détecte
   * que celui qu'il a ne correspond pas à la manche en cours (message
   * initial perdu lors d'une micro-coupure réseau, onglet mis en veille…).
   * Pas besoin de F5 : la prochaine mise à jour d'état déclenche cette
   * requête et corrige tout en un aller-retour.
   */
  requestSecret(playerId: string): PrivatePlayerSecret | null {
    const player = this.room.players.get(playerId);
    if (!player) return null;
    return buildPrivateSecret(player, this.room.roundNumber);
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
    room.lastRoundTheme = null;
    room.mrWhiteGuessPlayerId = null;
    room.mrWhiteGuessResult = null;
    this.sendAllSecrets();
    this.bus.broadcastState(room);
    // Pas de délai automatique ici (demande explicite) : la manche n'avance
    // que lorsque tout le monde a cliqué "J'ai compris", ou si l'hôte force
    // manuellement la suite (host:force_next_phase) en cas de blocage.
  }

  /** Toujours exactement un infiltré ; Mr White optionnel ; le reste civils. */
  private assignRolesAndThemes(): void {
    const room = this.room;
    const pool = room.settings.themeSource === "custom" && room.customThemePairs.length > 0 ? room.customThemePairs : OFFICIAL_THEMES;
    const theme: ThemePair = pickRandomTheme(pool);
    room.themePair = theme;

    const players = shuffle([...room.players.values()]);
    const mrWhiteCount = room.settings.mrWhiteEnabled ? 1 : 0;

    const roles: Role[] = ["undercover", ...Array(mrWhiteCount).fill("mrwhite" as const)];
    while (roles.length < players.length) roles.push("civil");

    const shuffledRoles = shuffle(roles);
    // Mission privée par joueur pour toute la manche (pas par tour) — voir
    // assignMissionsForRound : indépendante du thème/rôle, connue du seul
    // joueur concerné, révélée en même temps que son thème.
    const missions = assignMissionsForRound(players.length);
    players.forEach((player, index) => {
      const role = shuffledRoles[index]!;
      player.role = role;
      player.theme = role === "civil" ? theme.civilTheme : role === "undercover" ? theme.undercoverTheme : null;
      player.mission = missions[index] ?? null;
      player.isAlive = true;
      player.isReady = false;
      player.usedTrackKeys = new Set();
    });
  }

  private sendAllSecrets(): void {
    for (const player of this.room.players.values()) {
      const secret = buildPrivateSecret(player, this.room.roundNumber);
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
    room.chatMessages = []; // fil de discussion neuf à chaque manche
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
    this.scheduleTimeout(clipSeconds * 1000 + 400, () => this.advanceToNextTurnOrDiscussion());
  }

  /**
   * Watch2gether : seule la personne qui vient d'envoyer l'indice de la
   * manche en cours peut contrôler la lecture (lire/pause/déplacer) — son
   * geste est diffusé à toute la room pour que tout le monde reste
   * synchronisé sur le même instant.
   */
  sendPlaybackControl(playerId: string, action: "play" | "pause", positionSeconds: number): EngineResult {
    const room = this.room;
    if (room.phase !== "clue_playback") return { ok: false, error: "Pas de lecture en cours." };
    const clue = room.currentRoundClues[room.currentRoundClues.length - 1];
    if (!clue || clue.playerId !== playerId) {
      return { ok: false, error: "Seule la personne qui a envoyé cet indice peut contrôler la lecture." };
    }
    this.bus.broadcastToRoom("clue:control", {
      action,
      positionSeconds: Math.max(0, positionSeconds),
      serverTime: Date.now()
    });
    return { ok: true, value: undefined };
  }

  /**
   * Bouton "Passer" : réservé à la personne qui vient d'envoyer l'indice en
   * cours de lecture (le "maître du lecteur"), pour les cas de bug ou de
   * musique vraiment ratée — évite d'attendre la fin du minuteur.
   */
  skipCluePlayback(playerId: string): EngineResult {
    const room = this.room;
    if (room.phase !== "clue_playback") return { ok: false, error: "Pas de lecture en cours." };
    const clue = room.currentRoundClues[room.currentRoundClues.length - 1];
    if (!clue || clue.playerId !== playerId) {
      return { ok: false, error: "Seule la personne qui a envoyé cet indice peut le passer." };
    }
    this.clearTimer();
    this.advanceToNextTurnOrDiscussion();
    return { ok: true, value: undefined };
  }

  /**
   * Réaction emoji éphémère façon "emote spam" Twitch, pendant l'écoute
   * uniquement. Aucun texte libre (liste fermée validée côté serveur, pas
   * seulement côté client), et rien n'est conservé dans l'état de la room —
   * c'est un pur événement diffusé, pas une donnée de jeu.
   */
  sendReaction(playerId: string, emoji: string): EngineResult {
    const room = this.room;
    if (room.phase !== "clue_playback") return { ok: false, error: "Les réactions ne sont possibles que pendant l'écoute." };
    if (!room.players.get(playerId)) return { ok: false, error: "Joueur introuvable." };
    if (!isValidReactionEmoji(emoji)) return { ok: false, error: "Cet emoji n'est pas autorisé." };
    this.bus.broadcastToRoom("reaction:receive", { id: createId("reaction"), emoji });
    return { ok: true, value: undefined };
  }

  /**
   * Chat textuel — actif seulement pendant l'écoute (clue_playback) et le
   * débat (discussion), pour permettre de jouer sans discussion vocale.
   * Contrairement aux réactions emoji, les messages sont conservés dans
   * l'état de la room (pas purement éphémères) pour qu'un joueur qui
   * rejoint en retard voie l'historique de la manche — mais remis à zéro à
   * chaque nouvelle manche (voir beginTurnOrder).
   */
  sendChatMessage(playerId: string, text: string): EngineResult {
    const room = this.room;
    if (room.phase !== "clue_playback" && room.phase !== "discussion") {
      return { ok: false, error: "Le chat n'est ouvert que pendant l'écoute et la discussion." };
    }
    if (!room.players.get(playerId)) return { ok: false, error: "Joueur introuvable." };
    const trimmed = text.trim().slice(0, 300);
    if (!trimmed) return { ok: false, error: "Message vide." };

    room.chatMessages.push({ id: createId("chat"), playerId, text: trimmed, sentAt: Date.now() });
    // Garde-fou anti-débordement pour une manche qui traînerait en longueur.
    if (room.chatMessages.length > 200) room.chatMessages = room.chatMessages.slice(-200);

    this.bus.broadcastState(room);
    return { ok: true, value: undefined };
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
    this.scheduleDeadline(room.phaseDeadline, () => this.beginVotingUndercover());
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
      this.beginVotingUndercover();
    }
  }

  hostAdvanceFromDiscussion(hostId: string): EngineResult {
    if (this.room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut passer cette phase." };
    if (this.room.phase !== "discussion") return { ok: false, error: "Pas en phase de discussion." };
    this.clearTimer();
    this.beginVotingUndercover();
    return { ok: true, value: undefined };
  }

  // ---- Vote — deux tours à cible unique : d'abord l'infiltré, puis Mr White
  // (si activé), sans rien révéler entre les deux. Un seul suspect par
  // bulletin, pour éviter le n'importe quoi. -------------------------------

  private beginVotingUndercover(): void {
    const room = this.room;
    room.votes = new Map();
    room.undercoverAccusedId = null;
    room.undercoverTally = null;
    room.mrWhiteAccusedId = null;
    room.mrWhiteTally = null;
    room.phase = "voting_undercover";
    room.phaseDeadline = room.settings.timers.enabled ? Date.now() + room.settings.timers.voteSeconds * 1000 : null;
    this.bus.broadcastState(room);
    this.scheduleDeadline(room.phaseDeadline, () => this.resolveCurrentVote());
  }

  private beginVotingMrWhite(): void {
    const room = this.room;
    room.votes = new Map();
    room.phase = "voting_mrwhite";
    room.phaseDeadline = room.settings.timers.enabled ? Date.now() + room.settings.timers.voteSeconds * 1000 : null;
    this.bus.broadcastState(room);
    this.scheduleDeadline(room.phaseDeadline, () => this.resolveCurrentVote());
  }

  /** @param targetId Un seul suspect — jamais plusieurs à la fois. */
  submitVote(voterId: string, targetId: string): EngineResult {
    const room = this.room;
    if (room.phase !== "voting_undercover" && room.phase !== "voting_mrwhite") {
      return { ok: false, error: "Ce n'est pas le moment de voter." };
    }
    const voter = room.players.get(voterId);
    if (!voter || !voter.isAlive) return { ok: false, error: "Tu ne peux pas voter." };
    if (voterId === targetId) return { ok: false, error: "Impossible de voter pour toi-même." };
    const target = room.players.get(targetId);
    if (!target || !target.isAlive) return { ok: false, error: "Cible invalide." };

    room.votes.set(voterId, targetId);
    // Le NOMBRE de bulletins reçus est public en direct (votesSubmittedCount),
    // mais jamais le détail (qui a voté pour qui) avant la révélation finale
    // — qui n'arrive qu'après les DEUX tours (voir finalizeVotingResults).
    this.bus.broadcastState(room);

    const aliveCount = [...room.players.values()].filter((p) => p.isAlive).length;
    if (room.votes.size >= aliveCount) {
      this.clearTimer();
      this.resolveCurrentVote();
    }
    return { ok: true, value: undefined };
  }

  private tallyCurrentVotes(): VoteTally {
    const tally: VoteTally = {};
    for (const targetId of this.room.votes.values()) {
      tally[targetId] = (tally[targetId] ?? 0) + 1;
    }
    return tally;
  }

  private resolveCurrentVote(): void {
    const room = this.room;
    const tally = this.tallyCurrentVotes();
    const accusedId = GameRules.resolvePluralityWinner(tally);

    if (room.phase === "voting_undercover") {
      room.undercoverTally = tally;
      room.undercoverAccusedId = accusedId;
      // Résultat gardé strictement côté serveur : on enchaîne directement
      // sur le second tour (ou la révélation s'il n'y en a pas) sans jamais
      // exposer `undercoverTally`/`undercoverAccusedId` au client ici.
      if (room.settings.mrWhiteEnabled) {
        this.beginVotingMrWhite();
      } else {
        this.finalizeVotingResults();
      }
      return;
    }

    // room.phase === "voting_mrwhite"
    room.mrWhiteTally = tally;
    room.mrWhiteAccusedId = accusedId;
    this.finalizeVotingResults();
  }

  /** Révélation combinée des deux tours — jamais avant que les deux soient clos. */
  private finalizeVotingResults(): void {
    const room = this.room;
    const eliminatedIds = [...new Set([room.undercoverAccusedId, room.mrWhiteAccusedId].filter((id): id is string => !!id))];

    room.lastEliminatedPlayerIds = eliminatedIds;
    room.lastEliminatedRoles = {};
    for (const id of eliminatedIds) {
      const player = room.players.get(id);
      if (player) {
        player.isAlive = false;
        room.lastEliminatedRoles[id] = player.role!;
      }
    }
    // Le thème est rappelé dès la révélation (demande explicite) — tout le
    // monde a de quoi comprendre le vote qui vient de tomber, pas seulement
    // au résultat de la manche.
    room.lastRoundTheme = room.themePair ? { civilTheme: room.themePair.civilTheme, undercoverTheme: room.themePair.undercoverTheme } : null;

    room.phase = "elimination";
    this.bus.broadcastState(room);
    // Pas de délai automatique : on attend que l'hôte clique pour continuer
    // (demande explicite — le temps de lire, pas juste 4 secondes qui filent).
  }

  /** Si Mr White vient d'être démasqué, il a droit à une dernière chance avant de conclure la manche. */
  private afterElimination(): void {
    const room = this.room;
    const mrWhite = [...room.players.values()].find((p) => p.role === "mrwhite");
    if (mrWhite && room.lastEliminatedPlayerIds.includes(mrWhite.id)) {
      this.beginMrWhiteGuess(mrWhite.id);
      return;
    }
    this.concludeRound();
  }

  // ---- Dernière chance de Mr White — deviner le thème des civils pour s'en
  // sortir malgré tout, même une fois démasqué. --------------------------------

  private beginMrWhiteGuess(playerId: string): void {
    const room = this.room;
    room.mrWhiteGuessPlayerId = playerId;
    room.mrWhiteGuessResult = null;
    room.phase = "mrwhite_guess";
    room.phaseDeadline = Date.now() + MR_WHITE_GUESS_TIMEOUT_MS;
    this.bus.broadcastState(room);
    this.scheduleTimeout(MR_WHITE_GUESS_TIMEOUT_MS, () => this.resolveMrWhiteGuess(playerId, null));
  }

  /** Mr White soumet lui-même sa réponse. */
  submitMrWhiteGuess(playerId: string, guess: string): EngineResult {
    const room = this.room;
    if (room.phase !== "mrwhite_guess" || room.mrWhiteGuessPlayerId !== playerId) {
      return { ok: false, error: "Ce n'est pas à toi de deviner." };
    }
    this.clearTimer();
    this.resolveMrWhiteGuess(playerId, guess);
    return { ok: true, value: undefined };
  }

  /**
   * Validation manuelle par l'hôte — utile si Mr White annonce sa réponse à
   * voix haute plutôt que de la taper, ou en cas de désaccord sur une
   * réponse limite que la comparaison automatique aurait refusée.
   */
  hostValidateMrWhiteGuess(hostId: string, correct: boolean): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut valider." };
    if (room.phase !== "mrwhite_guess" || !room.mrWhiteGuessPlayerId) {
      return { ok: false, error: "Aucune devinette en attente." };
    }
    const playerId = room.mrWhiteGuessPlayerId;
    this.clearTimer();
    this.finishMrWhiteGuess(playerId, "(validé par l'hôte)", correct);
    return { ok: true, value: undefined };
  }

  private resolveMrWhiteGuess(playerId: string, guess: string | null): void {
    const room = this.room;
    const civilTheme = room.themePair?.civilTheme ?? "";
    const correct = guess !== null && guessMatchesTheme(guess, civilTheme);
    this.finishMrWhiteGuess(playerId, guess ?? "", correct);
  }

  private finishMrWhiteGuess(playerId: string, guess: string, correct: boolean): void {
    const room = this.room;
    room.mrWhiteGuessResult = { guess, correct };
    room.mrWhiteGuessPlayerId = null;

    if (correct) {
      // Démasqué, mais il devine le thème : il s'en sort malgré tout — on
      // annule son élimination, il compte comme survivant pour le score de
      // cette manche (mêmes points que s'il n'avait jamais été pris).
      const player = room.players.get(playerId);
      if (player) player.isAlive = true;
      room.lastEliminatedPlayerIds = room.lastEliminatedPlayerIds.filter((id) => id !== playerId);
    }

    this.concludeRound();
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
    // Là aussi, pas de délai automatique : l'hôte clique pour passer à la
    // manche suivante (ou voir le classement final) quand tout le monde a
    // eu le temps de lire — voir proceedFromRoundResult().
  }

  /** Appelé par l'hôte depuis l'écran de résultat de manche — manche suivante, ou fin du match si le score cible est atteint. */
  private proceedFromRoundResult(): void {
    const room = this.room;
    const champions = [...room.players.values()].filter((p) => p.score >= room.settings.targetScore);
    if (champions.length > 0) {
      this.concludeMatch(champions.map((c) => c.id));
    } else {
      this.beginNewRound();
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
        this.beginVotingUndercover();
        break;
      case "voting_undercover":
      case "voting_mrwhite":
        this.resolveCurrentVote();
        break;
      case "mrwhite_guess":
        if (room.mrWhiteGuessPlayerId) this.resolveMrWhiteGuess(room.mrWhiteGuessPlayerId, null);
        break;
      case "elimination":
        this.afterElimination();
        break;
      case "round_result":
        this.proceedFromRoundResult();
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

  // ---- Recommencer — nouveau match complet, scores remis à zéro. Utilisable
  // aussi bien depuis l'écran de fin ("Revanche") qu'en cours de partie
  // ("Recommencer"), jamais depuis le lobby (rien à recommencer). ------------

  rematch(hostId: string): EngineResult {
    const room = this.room;
    if (room.hostPlayerId !== hostId) return { ok: false, error: "Seul l'hôte peut relancer." };
    if (room.status === "lobby") return { ok: false, error: "La partie n'a pas encore commencé." };

    for (const player of room.players.values()) {
      player.isAlive = true;
      player.isReady = false;
      player.role = null;
      player.theme = null;
      player.mission = null;
      player.usedTrackKeys = new Set();
      player.score = 0;
    }
    room.status = "lobby";
    room.phase = "lobby";
    room.roundNumber = 0;
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.currentRoundClues = [];
    room.chatMessages = [];
    room.votes = new Map();
    room.undercoverAccusedId = null;
    room.undercoverTally = null;
    room.mrWhiteAccusedId = null;
    room.mrWhiteTally = null;
    room.lastEliminatedPlayerIds = [];
    room.lastEliminatedRoles = {};
    room.lastRoundTheme = null;
    room.mrWhiteGuessPlayerId = null;
    room.mrWhiteGuessResult = null;
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

    // La révélation du vote ne sort JAMAIS avant que les deux tours soient
    // clos (phase "elimination" ou plus tard) — jamais pendant les votes
    // eux-mêmes, même si le 1er tour est déjà résolu côté serveur.
    const votingPhases: GamePhase[] = ["voting_undercover", "voting_mrwhite"];
    const canRevealVotes = !votingPhases.includes(room.phase) && room.phase !== "discussion" && room.phase !== "round_start";
    const voteReveal: VoteReveal | null =
      canRevealVotes && room.undercoverTally
        ? {
            undercoverAccusedId: room.undercoverAccusedId,
            undercoverTally: room.undercoverTally,
            mrWhiteAccusedId: room.mrWhiteAccusedId,
            mrWhiteTally: room.mrWhiteTally
          }
        : null;

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
      chatMessages: room.chatMessages,
      phaseDeadline: room.phaseDeadline,
      lastEliminatedPlayerIds: room.lastEliminatedPlayerIds,
      lastEliminatedRoles: room.lastEliminatedRoles,
      voteReveal,
      mrWhiteGuessPlayerId: room.mrWhiteGuessPlayerId,
      mrWhiteGuessResult: room.mrWhiteGuessResult,
      votesSubmittedCount: room.votes.size,
      discussionReadyCount,
      lastRoundRoles: room.lastRoundRoles,
      lastRoundTheme: room.lastRoundTheme,
      matchWinnerIds: room.matchWinnerIds,
      reveal
    };
  }
}
