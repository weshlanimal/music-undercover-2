"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useGameSocket } from "@/lib/socket/client";

type Mode = "home" | "create" | "join";

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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-12 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-signal/15 text-3xl">🎧</div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Music Undercover</h1>
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
    </main>
  );
}
