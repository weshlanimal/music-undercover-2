"use client";

import { useState, type MouseEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Avatar } from "@/components/Avatar";
import { PlayerList } from "@/components/PlayerList";
import { PhaseShell } from "@/components/PhaseShell";
import { CountdownRing } from "@/components/CountdownRing";
import { ClueMedia } from "@/components/ClueMedia";
import { QuitButton } from "@/components/QuitButton";
import { RestartMatchButton } from "@/components/RestartMatchButton";
import { ReactionOverlay } from "@/components/ReactionOverlay";
import { ReactionPicker } from "@/components/ReactionPicker";
import { useGameSocket } from "@/lib/socket/client";
import { mockDemoLinks } from "@/lib/music/MockMusicProvider";
import type { MusicClue, PrivatePlayerSecret, Role } from "@/types";

const STREAMER_MODE_KEY = "music-undercover:streamerMode";
const ROLE_LABEL: Record<Role, string> = { civil: "Civil", undercover: "Infiltré", mrwhite: "Mr White" };

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const socket = useGameSocket();
  const { state, playerId, connected, errorMessage, mySecret, leaveRoom, reactions, removeReaction, rematch } = socket;

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
        <ReactionOverlay reactions={reactions} onExpire={removeReaction} />
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
  // "Recommencer" en cours de partie : réservé à l'hôte, inutile en lobby
  // (rien à recommencer) ou une fois finie (le bouton "Revanche" de l'écran
  // de fin fait déjà exactement ça).
  const showRestartButton = state.status === "in_progress" && state.hostPlayerId === playerId;

  return (
    <>
      <QuitButton onQuit={handleQuit} />
      {showRestartButton && <RestartMatchButton onRestart={rematch} />}
      <ReactionOverlay reactions={reactions} onExpire={removeReaction} />
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
    case "voting_undercover":
    case "voting_mrwhite":
      return <PhaseVoting {...props} />;
    case "elimination":
      return <PhaseElimination {...props} />;
    case "mrwhite_guess":
      return <PhaseMrWhiteGuess {...props} />;
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
// LECTURE DE L'INDICE — démarre automatiquement, sans clic. Watch2gether :
// la personne qui vient d'envoyer l'indice contrôle lecture/pause/défilement
// pour tout le monde ; les autres suivent en lecture seule.
// ---------------------------------------------------------------------------
function PhaseCluePlayback({ state, playerId, sendPlaybackControl, playbackControl, skipCluePlayback, sendReaction }: Props) {
  const clue = state.clues[state.clues.length - 1];
  const owner = state.players.find((p) => p.id === clue?.playerId);
  const isController = !!clue && clue.playerId === playerId;
  const [skipped, setSkipped] = useState(false);
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
        isController={isController}
        remoteControl={isController ? null : playbackControl}
        onControl={isController ? (action, positionSeconds) => sendPlaybackControl(action, positionSeconds) : undefined}
      />
      {isController ? (
        <button
          onClick={() => {
            if (skipped) return;
            setSkipped(true);
            skipCluePlayback();
          }}
          disabled={skipped}
          className="mt-3 w-full rounded-xl border border-ink-border py-2.5 text-center text-xs text-paper-muted hover:border-signal hover:text-signal disabled:opacity-50"
        >
          {skipped ? "Passage en cours…" : "Passer (bug ou musique horrible)"}
        </button>
      ) : (
        <p className="mt-3 text-center text-xs text-paper-faint">{owner?.nickname ?? "Le joueur"} contrôle la lecture pour tout le monde.</p>
      )}
      <div className="mt-5">
        <ReactionPicker onSend={sendReaction} />
      </div>
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
                  interactive
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
// VOTE — deux tours à cible UNIQUE (jamais plusieurs suspects à la fois,
// pour éviter le n'importe quoi) : d'abord qui est l'infiltré, puis (si Mr
// White est activé) qui est Mr White. Rien n'est révélé entre les deux tours
// — le résultat combiné n'apparaît qu'à la phase suivante (elimination).
// ---------------------------------------------------------------------------
function PhaseVoting({ state, playerId, submitVote }: Props) {
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [voteSent, setVoteSent] = useState(false);
  const alive = state.players.filter((p) => p.isAlive);
  const eligible = alive.filter((p) => p.id !== playerId);
  const isMrWhiteRound = state.phase === "voting_mrwhite";

  function castVote() {
    if (!votedFor || voteSent) return;
    submitVote(votedFor);
    setVoteSent(true);
  }

  return (
    <PhaseShell
      eyebrow={isMrWhiteRound ? "Vote — 2/2 : Mr White" : "Vote — 1/2 : l'infiltré"}
      title={voteSent ? "Vote envoyé ✓" : isMrWhiteRound ? "Qui est Mr White ?" : "Qui est l'infiltré ?"}
      subtitle={voteSent ? undefined : "Un seul suspect. Le résultat ne sera révélé qu'à la toute fin."}
      footer={
        <Button fullWidth disabled={!votedFor || voteSent} onClick={castVote}>
          {voteSent ? "Vote enregistré ✓" : "Voter"}
        </Button>
      }
    >
      {state.phaseDeadline && (
        <div className="mb-4 flex justify-center">
          <CountdownRing deadline={state.phaseDeadline} totalMs={state.settings.timers.voteSeconds * 1000} />
        </div>
      )}
      <div className={`flex flex-col gap-2 ${voteSent ? "pointer-events-none opacity-50" : ""}`}>
        {eligible.map((p) => (
          <button
            key={p.id}
            onClick={() => !voteSent && setVotedFor(p.id)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
              votedFor === p.id ? "border-signal bg-signal-dim/40" : "border-ink-border bg-ink-elevated"
            }`}
          >
            <Avatar emoji={p.avatar} size="sm" />
            <span className="flex-1 text-sm">{p.nickname}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-paper-faint">
        Votes reçus : {state.votesSubmittedCount} / {alive.length}
      </p>
      {voteSent && <p className="mt-2 text-center text-sm text-wave">En attente des autres joueurs…</p>}
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// Rappel du thème — affiché sur les écrans de fin de manche pour que tout le
// monde se souvienne de quoi on parlait (demande explicite).
// ---------------------------------------------------------------------------
function ThemeReminder({ theme }: { theme: { civilTheme: string; undercoverTheme: string } | null }) {
  if (!theme) return null;
  return (
    <div className="mb-5 rounded-2xl border border-ink-border bg-ink-elevated p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-paper-faint">Rappel du thème</p>
      <p className="mt-2 text-sm text-paper">
        <span className="text-paper-muted">Civils —</span> {theme.civilTheme}
      </p>
      <p className="mt-1 text-sm text-paper">
        <span className="text-paper-muted">Infiltré —</span> {theme.undercoverTheme}
      </p>
    </div>
  );
}

/**
 * Pied de page commun aux écrans de fin de manche : un clic de l'hôte fait
 * avancer tout le monde (demande explicite — plus de minuteur automatique
 * ici, le temps de lire ce qui vient de se passer).
 */
function HostContinueFooter({ isHost, onContinue, label = "Continuer" }: { isHost: boolean; onContinue: () => void; label?: string }) {
  const [clicked, setClicked] = useState(false);
  if (!isHost) {
    return <p className="text-center text-xs text-paper-faint">En attente de l&apos;hôte pour continuer…</p>;
  }
  return (
    <Button
      fullWidth
      disabled={clicked}
      onClick={() => {
        setClicked(true);
        onContinue();
      }}
    >
      {clicked ? "…" : label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// RÉVÉLATION — combine les deux tours de vote (jamais montrée avant que les
// deux soient clos) : qui a été accusé d'être l'infiltré, qui a été accusé
// d'être Mr White, si c'était juste ou faux, puis le rôle réel des
// éliminé·e·s. L'hôte clique pour continuer quand tout le monde a eu le
// temps de lire.
// ---------------------------------------------------------------------------
function PhaseElimination({ state, playerId, hostForceNextPhase }: Props) {
  const reveal = state.voteReveal;
  const eliminated = state.players.filter((p) => state.lastEliminatedPlayerIds.includes(p.id));
  const isHost = state.hostPlayerId === playerId;

  return (
    <PhaseShell title="Résultat du vote" footer={<HostContinueFooter isHost={isHost} onContinue={hostForceNextPhase} />}>
      <ThemeReminder theme={state.lastRoundTheme} />
      {reveal && (
        <div className="mb-6 flex flex-col gap-4">
          <VoteRoundResult
            label="Tour 1 — désigné comme infiltré"
            tally={reveal.undercoverTally}
            accusedId={reveal.undercoverAccusedId}
            players={state.players}
            correct={reveal.undercoverAccusedId ? state.lastEliminatedRoles[reveal.undercoverAccusedId] === "undercover" : null}
          />
          {reveal.mrWhiteTally && (
            <VoteRoundResult
              label="Tour 2 — désigné comme Mr White"
              tally={reveal.mrWhiteTally}
              accusedId={reveal.mrWhiteAccusedId}
              players={state.players}
              correct={reveal.mrWhiteAccusedId ? state.lastEliminatedRoles[reveal.mrWhiteAccusedId] === "mrwhite" : null}
            />
          )}
        </div>
      )}

      {eliminated.length === 0 ? (
        <p className="text-center text-paper-muted">Personne n&apos;est éliminé ce tour-ci.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {eliminated.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1.5 rounded-2xl border border-ink-border bg-ink-elevated p-5 text-center">
              <Avatar emoji={p.avatar} size="lg" dimmed />
              <p className="mt-1 text-sm text-paper">{p.nickname}</p>
              <p className="text-xs text-paper-muted">était réellement…</p>
              <p className="font-display text-xl text-signal">{ROLE_LABEL[state.lastEliminatedRoles[p.id]!]?.toUpperCase() ?? "…"}</p>
            </div>
          ))}
        </div>
      )}
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// DERNIÈRE CHANCE DE MR WHITE — démasqué, il peut encore s'en sortir en
// devinant le thème des civils. Réponse correcte = traité comme survivant
// pour le score de la manche, malgré l'élimination.
// ---------------------------------------------------------------------------
function PhaseMrWhiteGuess({ state, playerId, submitMrWhiteGuess, hostValidateMrWhiteGuess }: Props) {
  const isGuesser = state.mrWhiteGuessPlayerId === playerId;
  const isHost = state.hostPlayerId === playerId;
  const [guess, setGuess] = useState("");
  const [sent, setSent] = useState(false);

  if (isGuesser) {
    return (
      <PhaseShell
        eyebrow="Tu es démasqué"
        title="Dernière chance : devine le thème des civils"
        footer={
          <Button
            fullWidth
            disabled={!guess.trim() || sent}
            onClick={() => {
              setSent(true);
              submitMrWhiteGuess(guess.trim());
            }}
          >
            {sent ? "Réponse envoyée…" : "Valider ma réponse"}
          </Button>
        }
      >
        {state.phaseDeadline && (
          <div className="mb-4 flex justify-center">
            <CountdownRing deadline={state.phaseDeadline} totalMs={45_000} />
          </div>
        )}
        <TextField
          label="Quel était le thème des civils ?"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Écris le thème tel que tu penses qu'il était"
          autoFocus
          disabled={sent}
        />
        <p className="mt-4 text-center text-xs text-paper-faint">Si tu trouves, tu comptes comme si tu n&apos;avais jamais été démasqué.</p>
      </PhaseShell>
    );
  }

  const guesser = state.players.find((p) => p.id === state.mrWhiteGuessPlayerId);
  return (
    <PhaseShell eyebrow="Dernière chance" title={`${guesser?.nickname ?? "Mr White"} tente de deviner le thème`}>
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <Avatar emoji={guesser?.avatar ?? "🎭"} size="lg" pulsing ringColor="signal" />
        <p className="text-paper-muted">Démasqué, {guesser?.nickname ?? "il/elle"} a une dernière chance de s&apos;en sortir en devinant votre thème.</p>
      </div>
      {isHost && (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-ink-border bg-ink-elevated p-4">
          <p className="text-center text-xs text-paper-faint">Outil hôte — si la réponse est annoncée à voix haute plutôt que tapée :</p>
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => hostValidateMrWhiteGuess(false)}>
              Réponse fausse
            </Button>
            <Button fullWidth onClick={() => hostValidateMrWhiteGuess(true)}>
              Réponse correcte
            </Button>
          </div>
        </div>
      )}
    </PhaseShell>
  );
}

function VoteRoundResult({
  label,
  tally,
  accusedId,
  players,
  correct
}: {
  label: string;
  tally: Record<string, number>;
  accusedId: string | null;
  players: Props["state"]["players"];
  correct: boolean | null;
}) {
  const max = Math.max(1, ...Object.values(tally));
  const accused = players.find((p) => p.id === accusedId);

  return (
    <div className="rounded-2xl border border-ink-border bg-ink-elevated p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-paper-faint">{label}</p>
      {!accused ? (
        <p className="text-sm text-paper-muted">Égalité — personne n&apos;a été désigné.</p>
      ) : (
        <div className="mb-3 flex items-center gap-2">
          <Avatar emoji={accused.avatar} size="sm" />
          <span className="text-sm text-paper">{accused.nickname}</span>
          <span className={`text-xs font-medium ${correct ? "text-wave" : "text-signal"}`}>{correct ? "✓ juste" : "✗ faux"}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {players
          .filter((p) => (tally[p.id] ?? 0) > 0)
          .map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-16 truncate text-xs text-paper-muted">{p.nickname}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-border">
                <div className="h-full rounded-full bg-wave" style={{ width: `${((tally[p.id] ?? 0) / max) * 100}%` }} />
              </div>
              <span className="w-3 text-right text-xs text-paper-faint">{tally[p.id]}</span>
            </div>
          ))}
      </div>
    </div>
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
function PhaseRoundResult({ state, playerId, hostForceNextPhase }: Props) {
  const roles = state.lastRoundRoles ?? {};
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const guessResult = state.mrWhiteGuessResult;
  const guesser = state.players.find((p) => roles[p.id] === "mrwhite");
  const isHost = state.hostPlayerId === playerId;
  const matchWillEnd = state.players.some((p) => p.score >= state.settings.targetScore);

  return (
    <PhaseShell
      eyebrow={`Manche ${state.roundNumber} terminée`}
      title="Résultat de la manche"
      footer={
        <HostContinueFooter
          isHost={isHost}
          onContinue={hostForceNextPhase}
          label={matchWillEnd ? "Voir le classement final" : "Manche suivante"}
        />
      }
    >
      <ThemeReminder theme={state.lastRoundTheme} />
      {guessResult && (
        <div
          className={`mb-4 rounded-2xl border p-4 text-center ${
            guessResult.correct ? "border-wave/50 bg-wave/10" : "border-signal/50 bg-signal-dim/30"
          }`}
        >
          <p className="text-sm text-paper">
            🎭 {guesser?.nickname ?? "Mr White"} a deviné « {guessResult.guess || "…"} »
          </p>
          <p className={`mt-1 font-display text-lg ${guessResult.correct ? "text-wave" : "text-signal"}`}>
            {guessResult.correct ? "Correct — il s'en sort malgré tout !" : "Faux — il reste éliminé."}
          </p>
        </div>
      )}
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
