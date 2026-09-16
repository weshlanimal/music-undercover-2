"use client";

import { useState } from "react";
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
import { useGameSocket } from "@/lib/socket/client";
import { mockDemoLinks } from "@/lib/music/MockMusicProvider";
import type { MusicClue } from "@/types";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const socket = useGameSocket();
  const { state, playerId, connected, errorMessage, leaveRoom } = socket;

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

  return (
    <>
      <QuitButton onQuit={handleQuit} />
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
    case "game_over":
      return <PhaseGameOver {...props} />;
    default:
      return <PhaseShell title="…">{null}</PhaseShell>;
  }
}

// ---------------------------------------------------------------------------
// LOBBY (sections 4/5)
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
// Règle : seul Mr White connaît son propre rôle. Un civil et un infiltré
// voient tous les deux uniquement leur thème, sans jamais savoir s'ils ont
// le thème majoritaire ou minoritaire.
//
// Affiché en clair en permanence (pas de "maintenir appuyé") : personne
// d'autre ne regarde ton écran. Le "mode streamer" reste disponible pour
// celles et ceux qui diffusent leur écran en direct — il floute le contenu
// jusqu'à ce qu'il soit désactivé, et la préférence est mémorisée pour les
// prochaines parties.
// ---------------------------------------------------------------------------
const STREAMER_MODE_KEY = "music-undercover:streamerMode";

function PhaseRoleReveal({ mySecret, ackRoleReveal }: Props) {
  const [acked, setAcked] = useState(false);
  const [streamerMode, setStreamerMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STREAMER_MODE_KEY) === "1";
  });

  function toggleStreamerMode() {
    setStreamerMode((prev) => {
      const next = !prev;
      window.localStorage.setItem(STREAMER_MODE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <PhaseShell
      eyebrow="Ton thème secret"
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
          <p className="text-xl text-paper">{mySecret?.theme ?? ""}</p>
          <p className="mt-4 max-w-xs text-sm text-paper-faint">
            Tu ne sais pas si c&apos;est le thème majoritaire ou minoritaire — personne ne te le dira.
          </p>
        </div>

        {streamerMode && <p className="mt-4 text-xs text-paper-faint">Contenu masqué — touche &laquo;&nbsp;Mode streamer&nbsp;&raquo; pour le révéler.</p>}
      </div>
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// ORDRE DE JEU (section 7)
// ---------------------------------------------------------------------------
function PhaseRoundStart({ state }: Props) {
  return (
    <PhaseShell eyebrow="La partie commence" title="Ordre de passage">
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
// LECTURE DE L'INDICE — titre/artiste visibles dès l'envoi (pas d'anonymisation)
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
// DISCUSSION + RÉÉCOUTE — titres et artistes visibles, ça fait partie du jeu
// ---------------------------------------------------------------------------
function PhaseDiscussion({ state, playerId, hostAdvanceDiscussion }: Props) {
  const isHost = state.hostPlayerId === playerId;
  return (
    <PhaseShell
      wide
      eyebrow="Discussion"
      title="Qui a un thème différent ?"
      subtitle="Réécoutez les indices et discutez à voix haute."
      footer={
        isHost ? (
          <Button fullWidth variant="secondary" onClick={() => hostAdvanceDiscussion()}>
            Passer au vote
          </Button>
        ) : (
          state.phaseDeadline && (
            <div className="flex justify-center">
              <CountdownRing deadline={state.phaseDeadline} totalMs={state.settings.timers.discussionSeconds * 1000} />
            </div>
          )
        )
      }
    >
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
// VOTE — corrigé : le compteur "votes reçus" utilisait un champ qui ne se
// mettait à jour qu'après coup (state.lastVoteTally), donc il restait bloqué
// à 0 pendant toute la phase de vote, même quand les votes étaient bien pris
// en compte côté serveur. On utilise maintenant votesSubmittedCount, mis à
// jour en direct, et on affiche une confirmation explicite une fois voté.
// ---------------------------------------------------------------------------
function PhaseVoting({ state, playerId, submitVote }: Props) {
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [voteSent, setVoteSent] = useState(false);
  const alive = state.players.filter((p) => p.isAlive);
  const eligible = state.pendingTieBreak?.length
    ? alive.filter((p) => state.pendingTieBreak!.includes(p.id))
    : alive.filter((p) => p.id !== playerId);

  function castVote() {
    if (!votedFor || voteSent) return;
    submitVote(votedFor);
    setVoteSent(true);
  }

  return (
    <PhaseShell
      eyebrow={state.pendingTieBreak ? "Égalité — second tour" : "Vote"}
      title={voteSent ? "Vote envoyé ✓" : "Qui veux-tu éliminer ?"}
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
            onClick={() => setVotedFor(p.id)}
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

function PhaseVoteResult({ state }: Props) {
  const tally = state.lastVoteTally ?? {};
  const max = Math.max(1, ...Object.values(tally));
  return (
    <PhaseShell eyebrow="Résultat" title={state.lastEliminatedPlayerId ? "Le vote tombe…" : "Personne n'est éliminé"}>
      <div className="flex flex-col gap-3">
        {state.players
          .filter((p) => p.isAlive)
          .map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <Avatar emoji={p.avatar} size="sm" />
              <span className="w-20 truncate text-sm">{p.nickname}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-border">
                <div
                  className="h-full rounded-full bg-signal transition-all duration-500"
                  style={{ width: `${((tally[p.id] ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className="w-4 text-right text-sm text-paper-muted">{tally[p.id] ?? 0}</span>
            </div>
          ))}
      </div>
    </PhaseShell>
  );
}

function PhaseElimination({ state }: Props) {
  const eliminated = state.players.find((p) => p.id === state.lastEliminatedPlayerId);
  const roleLabel: Record<string, string> = { civil: "CIVIL", undercover: "INFILTRÉ" };
  return (
    <PhaseShell title={`${eliminated?.nickname ?? "?"} est éliminé`}>
      <div className="flex flex-col items-center gap-4 py-10">
        <Avatar emoji={eliminated?.avatar ?? "💀"} size="lg" dimmed />
        <p className="text-paper-muted">était…</p>
        <p className="font-display text-2xl text-signal">{state.lastEliminatedRole ? roleLabel[state.lastEliminatedRole] : "…"}</p>
      </div>
    </PhaseShell>
  );
}

// ---------------------------------------------------------------------------
// FIN DE PARTIE + RÉVÉLATION + REVANCHE
//
// Récapitulatif : le nom de chaque joueur est la première information
// affichée, aussi bien pour les rôles que pour l'historique des musiques
// (plutôt qu'un détail secondaire à côté du titre du morceau).
// ---------------------------------------------------------------------------
function PhaseGameOver({ state, playerId, rematch }: Props) {
  const isHost = state.hostPlayerId === playerId;
  const winnerLabel = { civil: "LES CIVILS GAGNENT", undercover: "L'INFILTRÉ GAGNE" };
  const roleLabel: Record<string, string> = { civil: "Civil", undercover: "Infiltré" };

  return (
    <PhaseShell
      eyebrow="Partie terminée"
      title={state.winner ? winnerLabel[state.winner] : "Fin de partie"}
      footer={
        isHost && (
          <Button fullWidth onClick={() => rematch()}>
            Rejouer
          </Button>
        )
      }
    >
      <div className="mb-8 flex flex-col gap-2">
        {state.players.map((p) => {
          const info = state.reveal?.roles[p.id];
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-ink-elevated px-3 py-2.5">
              <Avatar emoji={p.avatar} size="sm" />
              <span className="flex-1 text-sm font-medium text-paper">{p.nickname}</span>
              <span className={`text-xs font-medium uppercase ${info?.role === "undercover" ? "text-signal" : "text-wave"}`}>
                {info ? roleLabel[info.role] : ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <p className="mb-1 text-sm font-medium text-paper-muted">Les musiques de la partie</p>
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
