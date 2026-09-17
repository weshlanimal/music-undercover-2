"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Music2, Users, MessagesSquare, Vote, Trophy, Sparkles } from "lucide-react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useGameSocket } from "@/lib/socket/client";

type Mode = "home" | "create" | "join";

const STEPS = [
  {
    icon: Sparkles,
    title: "Chacun reçoit un thème",
    body: "En secret. Civils et infiltré ont un thème proche mais différent — personne ne sait de quel côté il est."
  },
  {
    icon: Music2,
    title: "X choisit une chanson",
    body: "Chacun son tour, un lien qui colle à SON thème. Tout le monde écoute ensemble, en direct."
  },
  {
    icon: MessagesSquare,
    title: "Discutez pour trouver l'infiltré",
    body: "Comparez les choix de chacun. Qui a un thème qui sonne un peu différent des autres ?"
  },
  {
    icon: Vote,
    title: "Votez",
    body: "Qui est l'infiltré ? Qui est Mr White, s'il est activé ? Le résultat tombe une fois les deux votes clos."
  },
  {
    icon: Trophy,
    title: "Les points tombent",
    body: "Chacun gagne selon son propre sort, manche après manche, jusqu'au score cible."
  }
];

export default function HomePage() {
  const router = useRouter();
  const { connected, roomCode, createRoom, joinRoom, errorMessage } = useGameSocket();
  const [mode, setMode] = useState<Mode>("home");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (roomCode) router.push(`/room/${roomCode}`);
  }, [roomCode, router]);

  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-10">
      <ThemeToggle floating />

      <div className="flex flex-1 flex-col justify-center py-6">
        <div className="mb-10 text-center">
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-b from-signal-soft to-signal text-3xl shadow-glow">
            🎧
          </div>
          <h1 className="font-display text-4xl font-medium tracking-tight">
            Music <span className="text-gradient">Undercover</span>
          </h1>
          <p className="mt-3 text-paper-muted">
            Un indice, une musique. Trouvez qui n&apos;a pas le même thème que vous.
          </p>
        </div>

        {mode === "home" && (
          <div className="flex flex-col gap-3">
            <Button fullWidth onClick={() => setMode("create")}>
              Créer une partie
            </Button>
            <Button fullWidth variant="secondary" onClick={() => setMode("join")}>
              Rejoindre une partie
            </Button>
          </div>
        )}

        {mode === "create" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (nickname.trim()) createRoom(nickname.trim());
            }}
          >
            <TextField
              label="Ton pseudo"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Mehdi"
              maxLength={24}
              autoFocus
            />
            <Button type="submit" fullWidth disabled={!connected || !nickname.trim()}>
              {connected ? "Créer la salle" : "Connexion…"}
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={() => setMode("home")}>
              Retour
            </Button>
          </form>
        )}

        {mode === "join" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (nickname.trim() && code.trim()) joinRoom(code.trim(), nickname.trim());
            }}
          >
            <TextField
              label="Code de la salle"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AB3XZ"
              maxLength={5}
              autoFocus
              className="text-center font-display text-xl tracking-[0.3em]"
            />
            <TextField label="Ton pseudo" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Sarah" maxLength={24} />
            <Button type="submit" fullWidth disabled={!connected || !nickname.trim() || !code.trim()}>
              {connected ? "Rejoindre" : "Connexion…"}
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={() => setMode("home")}>
              Retour
            </Button>
          </form>
        )}

        {errorMessage && <p className="mt-4 text-center text-sm text-signal">{errorMessage}</p>}
      </div>

      <section className="mt-10 border-t border-ink-border pt-8">
        <p className="mb-5 flex items-center justify-center gap-2 text-center text-xs font-medium uppercase tracking-[0.14em] text-paper-faint">
          <Users size={13} /> Comment ça se joue
        </p>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3.5 rounded-2xl border border-ink-border bg-ink-elevated/60 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-raised text-wave">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-paper">
                    <span className="mr-1.5 text-paper-faint">{i + 1}.</span>
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-paper-muted">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-center text-xs text-paper-faint">
          3 à 16 joueurs · liens YouTube · aucune application à installer
        </p>
      </section>
    </main>
  );
}
