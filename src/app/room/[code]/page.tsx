"use client";

import { useState, type MouseEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Eye, EyeOff, Check } from "lucide-react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Avatar } from "@/components/Avatar";
import { PlayerList } from "@/components/PlayerList";
import { PhaseShell } from "@/components/PhaseShell";
import { CountdownRing } from "@/components/CountdownRing";
import { ClueMedia } from "@/components/ClueMedia";
import { QuitButton } from "@/components/QuitButton";
import { useGameSocket } from "@/lib/socket/client";
import { mockDemoLinks } from "@/lib/music/MockMusicProvider";
import type { MusicClue, PrivatePlayerSecret, Role } from "@/types";

const STREAMER_MODE_KEY = "music-undercover:streamerMode";
const ROLE_LABEL: Record<Role, string> = { civil: "Civil", undercover: "Infiltré", mrwhite: "Mr White" };

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const socket = useGameSocket();
  const { state, playerId, connected, errorMessage, mySecret, leaveRoom } = socket;

  function handleQuit() {
    leaveRoom();
    router.push("/");
  }

  // Si on arrive directement sur /room/XXXX (lien partagé) sans être encore
  // dans la salle, on redirige simplement vers l'accueil pour saisir un
  // pseudo — la logique de "join direct par URL" n'est pas dans le MVP,
  // mais l'UX ne casse pas pour autant.
  const joinedThisRoom = state?.code === params.code;

  if (!connected || !joinedThisRoom || !state || !playerId) {
    return (
      <>
        <QuitButton onQuit={handleQuit} />
        <PhaseShell title="Connexion à la salle…" subtitle={errorMessage ?? "Un instant."}>
          {errorMessage && (
            <a href="/" className="mt-4 inline-block text-wave underline">
              Retour à l&apos;accueil
            </a>
          )}
        </PhaseShell>
      </>
    );
  }

  // Le thème reste affiché tout au long de la partie (demande explicite) —
  // sauf pendant l'écran de révélation lui-même (qui l'affiche déjà en
  // grand) et hors partie (lobby / fin de match, où le récap prend le relais).
  const showThemeBadge = state.status === "in_progress" && state.phase !== "role_reveal" && !!mySecret;

  return (
    <>
      <QuitButton onQuit={handleQuit} />
      {showThemeBadge && <MyThemeBadge secret={mySecret!} />}
      <RoomByPhase key={state.phase} {...socket} state={state} playerId={playerId} />
    </>
  );
}

type Props = ReturnType<typeof useGameSocket> & { state: NonNullable<ReturnType<typeof useGameSocket>["state"]>; playerId: string };

function RoomByPhase(props: Props) {
  const { state } = props;
  switch (state.phase) {
    case "lobby":
      return <PhaseLobby {...props} />;
    case "role_reveal":
      return <PhaseRoleReveal {...props} />;
    case "round_start":
      return <PhaseRoundStart {...props} />;
    case "waiting_for_music":
      return <PhaseWaitingForMusic {...props} />;
    case "clue_playback":
      return <PhaseCluePlayback {...props} />;
    case "next_player":
      return <PhaseNextPlayer {...props} />;
    case "discussion":
      return <PhaseDiscussion {...props} />;
    case "voting":
      return <PhaseVoting {...props} />;
    case "vote_result":
      return <PhaseVoteResult {...props} />;
    case "elimination":
      return <PhaseElimination {...props} />;
    case "round_result":
      return <PhaseRoundResult {...props} />;
    case "game_over":
      return <PhaseGameOver {...props} />;
    default:
      return <PhaseShell title="…">{null}</PhaseShell>;
  }
}

// ---------------------------------------------------------------------------
// Badge persistant "mon thème" — visible tout au long de la partie (demande
// explicite), avec un mode streamer pour le flouter à la demande.
// ---------------------------------------------------------------------------
function MyThemeBadge({ secret }: { secret: PrivatePlayerSecret }) {
  const [open, setOpen] = useState(false);
  const [streamerMode, setStreamerMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STREAMER_MODE_KEY) === "1";
  });

  function toggleStreamerMode(e: MouseEvent) {
    e.stopPropagation();
    setStreamerMode((prev) => {
      const next = !prev;
      window.localStorage.setItem(STREAMER_MODE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const label = secret.theme ?? "Mr White — aucun thème";

  return (
    <div className="fixed right-4 top-4 z-50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-ink-border bg-ink-elevated/90 px-3 py-2 text-xs text-paper-muted shadow-lg backdrop-blur-md hover:text-paper"
      >
        🎧 Mon thème
      </button>
      {open && (
        <div className="mt-2 w-56 rounded-2xl border border-ink-border bg-ink-elevated/95 p-3 text-right shadow-lg backdrop-blur-md">
          <button
            onClick={toggleStreamerMode}
            className="mb-2 inline-flex items-center gap-1 text-[11px] text-paper-faint hover:text-paper"
          >
            {streamerMode ? <EyeOff size={11} /> : <Eye size={11} />}
            Mode streamer
          </button>
          <p className={streamerMode ? "select-none text-sm text-paper blur-sm" : "text-sm text-paper"}>{label}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOBBY — rôles configurables (nombre d'infiltrés, Mr White), score cible,
// nombre de joueurs (jusqu'à 16).
// ---------------------------------------------------------------------------
function PhaseLobby({ state, playerId, setReady, updateSettings, startGame, hostRemovePlayer }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const isHost = state.hostPlayerId === playerId;
  const [copied, setCopied] = useState(false);
  const maxBadRoles = Math.max(1, state.players.length - 1);

  return (
    <PhaseShell
      eyebrow="Lobby"
      title={state.code}
      subtitle={`${state.players.length} joueur${state.players.length > 1 ? "s" : ""} dans la salle`}
      footer={
        isHost ? (
          <Button
            fullWidth
            disabled={state.players.filter((p) => p.isConnected).length < 3}
            onClick={() => startGame()}
          >
            Lancer la partie
          </Button>
        ) : (
          <Button fullWidth variant={me?.isReady ? "secondary" : "primary"} onClick={() => setReady(!me?.isReady)}>
            {me?.isReady ? "Prêt ✓" : "Je suis prêt"}
          </Button>
        )
      }
    >
      <button
        onClick={() => {
          navigator.clipboard.writeText(state.code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mb-6 w-full rounded-2xl border border-dashed border-ink-border bg-ink-elevated py-3 text-sm text-paper-muted"
      >
        {copied ? "Code copié ✓" : "Toucher pour copier le code de la salle"}
      </button>

      <PlayerList players={state.players} showReady hostId={state.hostPlayerId} meId={playerId} />

      {isHost && (
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-ink-border bg-ink-elevated p-4">
          <p className="text-sm font-medium text-paper">Paramètres de l&apos;hôte</p>

          <label className="flex items-center justify-between text-sm">
            <span>Nombre d&apos;infiltrés</span>
            <select
              value={Math.min(state.settings.undercoverCount, maxBadRoles)}
              onChange={(e) => updateSettings({ undercoverCount: Number(e.target.value) })}
              className="rounded-lg border border-ink-border bg-ink-raised px-2 py-1 text-sm text-paper"
            >
              {Array.from({ length: maxBadRoles }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Mr White</span>
            <input
              type="checkbox"
              checked={state.settings.mrWhiteEnabled}
              onChange={(e) => updateSettings({ mrWhiteEnabled: e.target.checked })}
              className="h-5 w-5 accent-signal"
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Score pour gagner le match</span>
            <select
              value={state.settings.targetScore}
              onChange={(e) => updateSettings({ targetScore: Number(e.target.value) })}
              className="rounded-lg border border-ink-border bg-ink-raised px-2 py-1 text-sm text-paper"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} pt{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Joueurs max</span>
            <select
              value={state.settings.maxPlayers}
              onChange={(e) => updateSettings({ maxPlayers: Number(e.target.value) })}
              className="rounded-lg border border-ink-border bg-ink-raised px-2 py-1 text-sm text-paper"
            >
              {[6, 8, 10, 12, 14, 16].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Timers activés</span>
            <input
              type="checkbox"
              checked={state.settings.timers.enabled}
              onChange={(e) => updateSettings({ timers: { ...state.settings.timers, enabled: e.target.checked } })}
              className="h-5 w-5 accent-signal"
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Durée de l&apos;extrait</span>
            <select
              value={state.settings.clipSeconds}
              onChange={(e) => updateSettings({ clipSeconds: Number(e.target.value) })}
              className="rounded-lg border border-ink-border bg-ink-raised px-2 py-1 text-sm text-paper"
            >
              <option value={30}>30s</option>
              <option value={45}>45s</option>
              <option value={60}>60s</option>
              <option value={90}>90s</option>
            </select>
          </label>

          {state.players.length > 3 && (
            <div className="border-t border-ink-border pt-3">
              <p className="mb-2 text-xs text-paper-faint">Retirer un joueur</p>
              <div className="flex flex-wrap gap-2">
                {state.players
                  .filter((p) => p.id !== playerId)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => hostRemovePlayer(p.id)}
                      className="rounded-full border border-ink-border px-3 py-1 text-xs text-paper-muted hover:border-signal hover:text-signal"
                    >
                      {p.nickname} ✕
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {state.players.filter((p) => p.isConnected).length < 3 && (
        <p className="mt-4 text-center text-sm text-paper-faint">Il faut au moins 3 joueurs pour lancer.</p>
      )}
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// RÉVÉLATION DE RÔLE
//
// Affiché en clair en permanence (pas de "maintenir appuyé") : personne
// d'autre ne regarde ton écran. Un civil et un infiltré voient tous les
// deux uniquement leur thème, sans jamais savoir lequel des deux ils sont.
// Mr White (si activé) n'a structurellement aucun thème — c'est en soi son
// information. La manche n'avance que lorsque tout le monde a cliqué
// "J'ai compris" (demande explicite) ; seul l'hôte peut forcer la suite en
// cas de blocage.
// ---------------------------------------------------------------------------
function PhaseRoleReveal({ mySecret, ackRoleReveal }: Props) {
  const [acked, setAcked] = useState(false);
  const [streamerMode, setStreamerMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STREAMER_MODE_KEY) === "1";
  });
  const isMrWhite = mySecret?.theme === null;

  function toggleStreamerMode() {
    setStreamerMode((prev) => {
      const next = !prev;
      window.localStorage.setItem(STREAMER_MODE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <PhaseShell
      eyebrow={isMrWhite ? "Tu es Mr White" : "Ton thème secret"}
      title="Personne d'autre ne voit cet écran"
      footer={
        <Button
          fullWidth
          disabled={acked}
          onClick={() => {
            setAcked(true);
            ackRoleReveal();
          }}
        >
          {acked ? "En attente des autres joueurs…" : "J'ai compris"}
        </Button>
      }
    >
      <div className="relative flex min-h-[16rem] flex-col items-center justify-center rounded-3xl border border-ink-border bg-ink-elevated p-8 text-center">
        <button
          onClick={toggleStreamerMode}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-ink-border bg-ink-raised px-2.5 py-1.5 text-xs text-paper-muted hover:text-paper"
        >
          {streamerMode ? <EyeOff size={13} /> : <Eye size={13} />}
          Mode streamer
        </button>

        <div className={streamerMode ? "select-none blur-md" : undefined}>
          {isMrWhite ? (
            <>
              <p className="font-display text-2xl font-medium text-alert">MR WHITE</p>
              <p className="mt-4 max-w-xs text-paper-muted">
                Tu n&apos;as aucun thème. Observe les musiques des autres pour deviner le leur, et bluffe.
              </p>
            </>
          ) : (
            <>
              <p className="text-xl text-paper">{mySecret?.theme ?? ""}</p>
              <p className="mt-4 max-w-xs text-sm text-paper-faint">
                Tu ne sais pas si c&apos;est le thème majoritaire ou minoritaire — personne ne te le dira.
              </p>
            </>
          )}
        </div>

        {streamerMode && <p className="mt-4 text-xs text-paper-faint">Contenu masqué — touche &laquo;&nbsp;Mode streamer&nbsp;&raquo; pour le révéler.</p>}
      </div>
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// ORDRE DE JEU
// ---------------------------------------------------------------------------
function PhaseRoundStart({ state }: Props) {
  return (
    <PhaseShell eyebrow={`Manche ${state.roundNumber}`} title="Ordre de passage">
      <ol className="flex flex-col gap-2">
        {state.turnOrder.map((id, i) => {
          const p = state.players.find((pl) => pl.id === id);
          if (!p) return null;
          return (
            <li key={id} className="flex items-center gap-3 rounded-xl bg-ink-elevated px-3 py-2.5">
              <span className="font-display text-sm text-paper-faint">{i + 1}</span>
              <Avatar emoji={p.avatar} size="sm" />
              <span className="text-sm">{p.nickname}</span>
            </li>
          );
        })}
      </ol>
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// ENVOI DE MUSIQUE — analyser = envoyer, automatiquement
// ---------------------------------------------------------------------------
function PhaseWaitingForMusic({ state, playerId, submitMusicUrl, musicResolution }: Props) {
  const isMyTurn = state.currentTurnPlayerId === playerId;
  const currentPlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
  const [url, setUrl] = useState("");
  const resolving = musicResolution.state === "resolving";

  if (!isMyTurn) {
    return (
      <PhaseShell title={`Au tour de ${currentPlayer?.nickname ?? "…"}`}>
        <div className="flex flex-col items-center gap-6 py-8">
          {state.phaseDeadline && <CountdownRing deadline={state.phaseDeadline} totalMs={state.settings.timers.musicSeconds * 1000} size={72} />}
          <Avatar emoji={currentPlayer?.avatar ?? "🎵"} size="lg" pulsing ringColor="signal" />
          <p className="text-center text-paper-muted">En train de choisir sa musique…</p>
        </div>
        <TurnProgress state={state} />
      </PhaseShell>
    );
  }

  return (
    <PhaseShell eyebrow="Ton tour" title="Trouve une musique" subtitle="Colle le lien : il est envoyé automatiquement dès qu'on le reconnaît.">
      {state.phaseDeadline && (
        <div className="mb-4 flex justify-center">
          <CountdownRing deadline={state.phaseDeadline} totalMs={state.settings.timers.musicSeconds * 1000} />
        </div>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && !resolving) submitMusicUrl(url.trim());
        }}
      >
        <TextField
          label="Lien YouTube"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          autoFocus
          disabled={resolving}
        />
        <Button type="submit" fullWidth disabled={!url.trim() || resolving}>
          {resolving ? "Envoi en cours…" : "Analyser et envoyer"}
        </Button>
      </form>

      {musicResolution.state === "error" && <ResolveErrorMessage reason={musicResolution.reason} />}

      <details className="mt-6 rounded-xl border border-ink-border bg-ink-elevated/60 p-4 text-sm text-paper-muted">
        <summary className="cursor-pointer text-paper">Pas de lien sous la main ?</summary>
        <p className="mb-2 mt-3">Utilise un lien de démo (mode test, hors-ligne) :</p>
        <div className="flex flex-col gap-1.5">
          {mockDemoLinks().map((l) => (
            <button
              key={l.url}
              type="button"
              disabled={resolving}
              onClick={() => {
                setUrl(l.url);
                submitMusicUrl(l.url);
              }}
              className="rounded-lg bg-ink-raised px-3 py-2 text-left text-xs hover:bg-ink-border disabled:opacity-50"
            >
              {l.label}
            </button>
          ))}
        </div>
      </details>
    </PhaseShell>
  );
}

function ResolveErrorMessage({ reason }: { reason: string }) {
  const messages: Record<string, string> = {
    unrecognized_link: "Ce lien n'est pas reconnu. Colle un lien YouTube, ou un lien de démo.",
    not_found: "Vidéo introuvable (privée, supprimée, ou lien invalide).",
    embedding_disabled: "Le propriétaire de cette vidéo a désactivé la lecture intégrée ailleurs que sur YouTube. Essaie une autre vidéo.",
    provider_error: "YouTube n'a pas répondu. Réessaie dans un instant.",
    duplicate_track: "Tu as déjà utilisé cette vidéo dans cette partie. Choisis-en une autre.",
    not_your_turn: "Ce n'est plus ton tour."
  };
  return <p className="mt-3 text-center text-sm text-signal">{messages[reason] ?? "Une erreur est survenue."}</p>;
}

function TurnProgress({ state }: { state: Props["state"] }) {
  return (
    <ol className="mt-4 flex flex-col gap-1.5">
      {state.turnOrder.map((id, i) => {
        const p = state.players.find((pl) => pl.id === id);
        if (!p) return null;
        const played = i < state.turnOrder.indexOf(state.currentTurnPlayerId ?? "");
        const isCurrent = id === state.currentTurnPlayerId;
        return (
          <li key={id} className="flex items-center gap-2 text-sm">
            <span className="w-4 text-center">{played ? "✓" : isCurrent ? "→" : ""}</span>
            <span className={isCurrent ? "text-signal" : played ? "text-paper-faint" : "text-paper-muted"}>{p.nickname}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// LECTURE DE L'INDICE — démarre automatiquement, sans clic (demande explicite)
// ---------------------------------------------------------------------------
function PhaseCluePlayback({ state }: Props) {
  const clue = state.clues[state.clues.length - 1];
  const owner = state.players.find((p) => p.id === clue?.playerId);
  if (!clue) return <PhaseShell title="…" />;

  return (
    <PhaseShell wide title={`Indice de ${owner?.nickname ?? "?"}`}>
      <ClueMedia
        provider={clue.provider}
        videoId={clue.videoId}
        audioUrl={clue.audioUrl}
        title={clue.title}
        artist={clue.artist}
        thumbnailUrl={clue.thumbnailUrl}
        clipSeconds={clue.clipSeconds}
        autoPlay
      />
    </PhaseShell>
  );
}

function PhaseNextPlayer({ state }: Props) {
  const next = state.players.find((p) => p.id === state.currentTurnPlayerId);
  return (
    <PhaseShell title="Prochain joueur">
      <div className="flex flex-col items-center gap-4 py-12">
        <Avatar emoji={next?.avatar ?? "🎵"} size="lg" pulsing ringColor="wave" />
        <p className="font-display text-2xl">{next?.nickname ?? "…"}</p>
      </div>
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// DISCUSSION — plafonnée à 5 minutes ; tout le monde doit cliquer "Passer
// au vote" pour lancer le vote (demande explicite), l'hôte garde un
// raccourci pour forcer en cas de blocage.
// ---------------------------------------------------------------------------
function PhaseDiscussion({ state, playerId, markDiscussionReady, hostAdvanceDiscussion }: Props) {
  const [readySent, setReadySent] = useState(false);
  const isHost = state.hostPlayerId === playerId;
  const alive = state.players.filter((p) => p.isAlive);

  function handleReady() {
    if (readySent) return;
    markDiscussionReady();
    setReadySent(true);
  }

  return (
    <PhaseShell
      wide
      eyebrow={`Manche ${state.roundNumber} — Discussion`}
      title={readySent ? "En attente des autres…" : "Qui a un thème différent ?"}
      subtitle="Réécoutez les indices et discutez à voix haute."
      footer={
        <div className="flex flex-col gap-2">
          <Button fullWidth variant={readySent ? "secondary" : "primary"} disabled={readySent} onClick={handleReady}>
            {readySent ? "Prêt à voter ✓" : "Passer au vote"}
          </Button>
          {isHost && (
            <button onClick={() => hostAdvanceDiscussion()} className="text-center text-xs text-paper-faint hover:text-paper-muted">
              Forcer le vote maintenant (outil hôte)
            </button>
          )}
        </div>
      }
    >
      {state.phaseDeadline && (
        <div className="mb-4 flex justify-center">
          <CountdownRing deadline={state.phaseDeadline} totalMs={state.settings.timers.discussionSeconds * 1000} />
        </div>
      )}
      <p className="mb-4 text-center text-sm text-paper-faint">
        Prêts à voter : {state.discussionReadyCount} / {alive.length}
      </p>
      <CluesReplayList state={state} />
    </PhaseShell>
  );
}

function CluesReplayList({ state }: { state: Props["state"] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {state.clues.map((clue: MusicClue) => {
        const owner = state.players.find((p) => p.id === clue.playerId);
        const isOpen = openId === clue.id;
        return (
          <div key={clue.id} className="overflow-hidden rounded-xl border border-ink-border bg-ink-elevated">
            <button
              onClick={() => setOpenId(isOpen ? null : clue.id)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <Avatar emoji={owner?.avatar ?? "🎵"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-paper">{clue.title}</p>
                <p className="truncate text-xs text-paper-faint">
                  {clue.artist} · {owner?.nickname}
                </p>
              </div>
              <span className="shrink-0 text-xs text-wave">{isOpen ? "Fermer" : "Écouter"}</span>
            </button>
            {isOpen && (
              <div className="p-3 pt-0">
                <ClueMedia
                  provider={clue.provider}
                  videoId={clue.videoId}
                  audioUrl={clue.audioUrl}
                  title={clue.title}
                  artist={clue.artist}
                  thumbnailUrl={clue.thumbnailUrl}
                  clipSeconds={clue.clipSeconds}
                  autoPlay
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VOTE — plusieurs suspects possibles, plusieurs éliminations possibles.
// Toute personne recevant la majorité absolue des votes est éliminée : plus
// de second tour d'égalité, une seule salve de votes suffit même avec
// plusieurs "méchants" en jeu.
// ---------------------------------------------------------------------------
function PhaseVoting({ state, playerId, submitVote }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [voteSent, setVoteSent] = useState(false);
  const alive = state.players.filter((p) => p.isAlive);
  const eligible = alive.filter((p) => p.id !== playerId);

  function toggle(id: string) {
    if (voteSent) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function castVote() {
    if (voteSent) return;
    submitVote([...selected]);
    setVoteSent(true);
  }

  return (
    <PhaseShell
      eyebrow="Vote"
      title={voteSent ? "Vote envoyé ✓" : "Qui soupçonnes-tu ?"}
      subtitle={voteSent ? undefined : "Coche un ou plusieurs suspects. La majorité absolue élimine."}
      footer={
        <Button fullWidth disabled={voteSent} onClick={castVote}>
          {voteSent ? "Vote enregistré ✓" : selected.size === 0 ? "Voter pour personne" : `Voter (${selected.size})`}
        </Button>
      }
    >
      {state.phaseDeadline && (
        <div className="mb-4 flex justify-center">
          <CountdownRing deadline={state.phaseDeadline} totalMs={state.settings.timers.voteSeconds * 1000} />
        </div>
      )}
      <div className={`flex flex-col gap-2 ${voteSent ? "pointer-events-none opacity-50" : ""}`}>
        {eligible.map((p) => {
          const checked = selected.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                checked ? "border-signal bg-signal-dim/40" : "border-ink-border bg-ink-elevated"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  checked ? "border-signal bg-signal text-white" : "border-ink-border"
                }`}
              >
                {checked && <Check size={14} />}
              </span>
              <Avatar emoji={p.avatar} size="sm" />
              <span className="flex-1 text-sm">{p.nickname}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm text-paper-faint">
        Votes reçus : {state.votesSubmittedCount} / {alive.length}
      </p>
      {voteSent && <p className="mt-2 text-center text-sm text-wave">En attente des autres joueurs…</p>}
    </PhaseShell>
  );
}

function PhaseVoteResult({ state }: Props) {
  const tally = state.lastVoteTally ?? {};
  const max = Math.max(1, ...Object.values(tally));
  const eliminatedCount = state.lastEliminatedPlayerIds.length;
  const shown = state.players.filter((p) => p.isAlive || state.lastEliminatedPlayerIds.includes(p.id));

  return (
    <PhaseShell eyebrow="Résultat" title={eliminatedCount > 0 ? "Le vote tombe…" : "Personne n'est éliminé"}>
      <div className="flex flex-col gap-3">
        {shown.map((p) => {
          const eliminated = state.lastEliminatedPlayerIds.includes(p.id);
          return (
            <div key={p.id} className="flex items-center gap-3">
              <Avatar emoji={p.avatar} size="sm" dimmed={eliminated} />
              <span className="w-20 truncate text-sm">{p.nickname}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-border">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${eliminated ? "bg-signal" : "bg-wave"}`}
                  style={{ width: `${((tally[p.id] ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className="w-4 text-right text-sm text-paper-muted">{tally[p.id] ?? 0}</span>
            </div>
          );
        })}
      </div>
    </PhaseShell>
  );
}

function PhaseElimination({ state }: Props) {
  const eliminated = state.players.filter((p) => state.lastEliminatedPlayerIds.includes(p.id));

  if (eliminated.length === 0) {
    return (
      <PhaseShell title="Personne n'est éliminé">
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-paper-muted">Le camp adverse s&apos;en sort cette manche.</p>
        </div>
      </PhaseShell>
    );
  }

  return (
    <PhaseShell title={eliminated.length === 1 ? `${eliminated[0]!.nickname} est éliminé` : `${eliminated.length} joueurs sont éliminés`}>
      <div className="flex flex-col gap-3">
        {eliminated.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-1.5 rounded-2xl border border-ink-border bg-ink-elevated p-5 text-center">
            <Avatar emoji={p.avatar} size="lg" dimmed />
            <p className="mt-1 text-sm text-paper">{p.nickname}</p>
            <p className="text-xs text-paper-muted">était…</p>
            <p className="font-display text-xl text-signal">{ROLE_LABEL[state.lastEliminatedRoles[p.id]!]?.toUpperCase() ?? "…"}</p>
          </div>
        ))}
      </div>
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// RÉSULTAT DE LA MANCHE — points distribués individuellement. Infiltré(s) et
// Mr White ne forment pas une équipe entre eux : chacun gagne selon SA
// PROPRE survie au vote, pas selon le sort des autres joueurs de son rôle.
// Les rôles de toute la manche sont révélés ici (elle est terminée) : c'est
// ce qui permet à chacun de comprendre pourquoi son score a changé, alors
// que personne ne connaissait son propre rôle avant cet instant.
// ---------------------------------------------------------------------------
function PhaseRoundResult({ state }: Props) {
  const roles = state.lastRoundRoles ?? {};
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <PhaseShell
      eyebrow={`Manche ${state.roundNumber} terminée`}
      title="Résultat de la manche"
      subtitle="La manche suivante démarre automatiquement…"
    >
      <div className="flex flex-col gap-2">
        {sorted.map((p) => {
          const role = roles[p.id];
          const survived = !state.lastEliminatedPlayerIds.includes(p.id);
          const earned = role && survived ? (role === "civil" ? 1 : 2) : 0;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-ink-elevated px-3 py-2.5">
              <Avatar emoji={p.avatar} size="sm" dimmed={!survived} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-paper">{p.nickname}</p>
                <p className="text-xs text-paper-faint">
                  {role ? ROLE_LABEL[role] : ""} · {survived ? "a survécu" : "éliminé"}
                </p>
              </div>
              {earned > 0 && <span className="text-sm font-medium text-wave">+{earned}</span>}
              <span className="w-10 text-right font-display text-sm text-paper">{p.score} pt{p.score !== 1 ? "s" : ""}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-paper-faint">Score à atteindre pour gagner le match : {state.settings.targetScore}</p>
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// FIN DE MATCH + RÉVÉLATION + REVANCHE
// ---------------------------------------------------------------------------
function PhaseGameOver({ state, playerId, rematch }: Props) {
  const isHost = state.hostPlayerId === playerId;
  const champions = new Set(state.matchWinnerIds ?? []);
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const championNames = state.players.filter((p) => champions.has(p.id)).map((p) => p.nickname);

  return (
    <PhaseShell
      eyebrow="Match terminé"
      title={championNames.length === 1 ? `${championNames[0]} remporte le match` : `${championNames.join(", ")} remportent le match`}
      footer={
        isHost && (
          <Button fullWidth onClick={() => rematch()}>
            Revanche
          </Button>
        )
      }
    >
      <div className="mb-8 flex flex-col gap-2">
        {sorted.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${champions.has(p.id) ? "border border-signal/50 bg-signal-dim/30" : "bg-ink-elevated"}`}
          >
            <Avatar emoji={p.avatar} size="sm" />
            <span className="flex-1 text-sm font-medium text-paper">{p.nickname}</span>
            {champions.has(p.id) && <span className="text-sm">🏆</span>}
            <span className="font-display text-sm text-paper">{p.score} pt{p.score !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="mb-1 text-sm font-medium text-paper-muted">Musiques de la dernière manche</p>
        {(state.reveal?.clues ?? []).map((clue) => {
          const owner = state.players.find((p) => p.id === clue.playerId);
          return (
            <a
              key={clue.id}
              href={clue.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink-elevated p-3"
            >
              {clue.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clue.thumbnailUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink-raised text-lg">🎵</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-paper">{owner?.nickname ?? "?"}</p>
                <p className="truncate text-xs text-paper-muted">
                  {clue.title} · {clue.artist}
                </p>
              </div>
              <span className="shrink-0 text-xs text-wave">Ouvrir ↗</span>
            </a>
          );
        })}
      </div>
    </PhaseShell>
  );
}
