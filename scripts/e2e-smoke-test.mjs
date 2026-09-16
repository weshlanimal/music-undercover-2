import { io } from "socket.io-client";

const URL = "http://localhost:3000";

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeClient(nickname) {
  const socket = io(URL, { path: "/socket.io" });
  let state = null;
  let secret = null;
  let playerId = null;
  let roomCode = null;

  socket.on("connect_error", (err) => console.error(`❌ [${nickname}] connect_error:`, err.message));
  socket.on("room:state", (s) => {
    state = s;
  });
  socket.on("role:secret", (s) => {
    secret = s;
  });
  socket.on("session:joined", (p) => {
    playerId = p.playerId;
    roomCode = p.roomCode;
  });
  socket.on("room:error", (p) => {
    console.error(`❌ [${nickname}] erreur serveur:`, p.message);
  });

  return {
    socket,
    nickname,
    get state() {
      return state;
    },
    get secret() {
      return secret;
    },
    get playerId() {
      return playerId;
    },
    get roomCode() {
      return roomCode;
    }
  };
}

async function waitForPhase(client, phase, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (client.state?.phase === phase) return true;
    await wait(50);
  }
  throw new Error(`Timeout en attendant la phase "${phase}" pour ${client.nickname} (phase actuelle: ${client.state?.phase})`);
}

async function waitFor(fn, description, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await wait(50);
  }
  throw new Error(`Timeout: ${description}`);
}

let failed = false;
function assert(cond, message) {
  if (!cond) {
    failed = true;
    console.error(`❌ ÉCHEC: ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

async function main() {
  console.log("\n🧪 Test end-to-end — partie complète à 3 joueurs\n" + "─".repeat(50));

  const alex = makeClient("Alex");
  const sarah = makeClient("Sarah");
  const lucas = makeClient("Lucas");
  const players = [alex, sarah, lucas];

  await wait(500);

  // 1) Création de la salle par Alex
  alex.socket.emit("room:create", { nickname: "Alex", settings: { timers: { enabled: false } } });
  await waitFor(() => alex.roomCode, "Alex a créé la salle");
  assert(!!alex.roomCode, `Salle créée avec le code ${alex.roomCode}`);

  // 2) Sarah et Lucas rejoignent
  sarah.socket.emit("room:join", { code: alex.roomCode, nickname: "Sarah" });
  lucas.socket.emit("room:join", { code: alex.roomCode, nickname: "Lucas" });
  await waitFor(() => sarah.playerId && lucas.playerId, "Sarah et Lucas ont rejoint");
  await waitFor(() => alex.state?.players.length === 3, "Alex voit bien 3 joueurs dans le lobby");
  assert(alex.state.players.length === 3, "3 joueurs dans le lobby (temps réel synchronisé)");

  // 3) Lancement de la partie
  alex.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  assert(true, "Tous les clients sont passés en phase role_reveal");

  await waitFor(() => alex.secret && sarah.secret && lucas.secret, "Chaque joueur a reçu son secret privé");

  // --- Vérification : personne ne connaît son propre rôle (Mr White retiré,
  // la règle "personne ne sait" s'applique maintenant à tout le monde) ---
  assert(
    players.every((p) => typeof p.secret.theme === "string" && p.secret.theme.length > 0),
    "Tous les joueurs reçoivent un thème (civil ET infiltré, structure identique)"
  );
  assert(
    players.every((p) => !("role" in p.secret) && !("kind" in p.secret) && !("isUndercover" in p.secret)),
    "Le payload réseau du secret ne contient AUCUN champ permettant de déduire le rôle civil/infiltré"
  );

  // On identifie qui est qui SANS jamais lire un champ "rôle" — uniquement en
  // comparant les thèmes reçus : 2 joueurs partagent un thème (les civils),
  // 1 joueur a un thème différent (l'infiltré, un seul par partie).
  const themeGroups = new Map();
  for (const p of players) {
    const list = themeGroups.get(p.secret.theme) ?? [];
    list.push(p);
    themeGroups.set(p.secret.theme, list);
  }
  const groups = [...themeGroups.values()];
  assert(groups.length === 2, "Deux thèmes distincts circulent parmi les 3 joueurs");
  const civilPlayers = groups.find((g) => g.length === 2);
  const undercoverPlayer = groups.find((g) => g.length === 1)?.[0];
  assert(!!civilPlayers && !!undercoverPlayer, "Répartition 2 joueurs / 1 joueur entre les deux thèmes (un seul infiltré)");

  // 4) Acquittement du rôle par tout le monde -> ROUND_START -> WAITING_FOR_MUSIC
  players.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));
  assert(true, "La partie démarre, en attente du premier joueur");

  // 5) Chaque joueur envoie un lien mock à son tour — ENVOI AUTOMATIQUE :
  // plus d'étape de confirmation séparée, "analyser" envoie directement.
  for (let i = 0; i < 3; i++) {
    const currentId = alex.state.currentTurnPlayerId;
    const current = players.find((p) => p.playerId === currentId);
    assert(!!current, `Tour ${i + 1}: joueur courant identifié (${current?.nickname})`);

    current.socket.emit("music:submit_url", { url: "mock://demo-0" + (i + 1) });
    await Promise.all(players.map((p) => waitForPhase(p, "clue_playback", 5000)));

    // Titre/artiste doivent être visibles par TOUS immédiatement, sans
    // étape de confirmation intermédiaire (envoi automatique).
    const publicClue = alex.state.clues[alex.state.clues.length - 1];
    assert(publicClue.playerId === current.playerId, "L'indice diffusé correspond bien au joueur qui vient d'envoyer un lien");
    assert(
      typeof publicClue.title === "string" && publicClue.title.length > 0,
      "Le titre du morceau est visible par tous immédiatement (envoi automatique, sans confirmation manuelle)"
    );
    assert(typeof publicClue.artist === "string" && publicClue.artist.length > 0, "L'artiste est visible par tous immédiatement");
    assert(publicClue.provider === "mock" && publicClue.audioUrl?.startsWith("/mock-audio/"), "Le clue mode démo pointe vers le fichier audio local");
    assert(typeof publicClue.clipSeconds === "number" && publicClue.clipSeconds > 0, "L'extrait a une durée plafonnée définie");

    if (i < 2) {
      await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 10_000)));
    } else {
      await Promise.all(players.map((p) => waitForPhase(p, "discussion", 10_000)));
    }
  }

  assert(true, "Les 3 joueurs ont envoyé leur musique automatiquement, la partie passe en discussion");

  // 6) Vote — on vérifie EN DIRECT que le compteur de votes progresse
  // (c'était le bug signalé : le compteur restait bloqué à 0 pendant tout
  // le vote alors que les votes étaient bien pris en compte côté serveur).
  alex.socket.emit("host:advance_discussion", {});
  await Promise.all(players.map((p) => waitForPhase(p, "voting", 5000)));
  assert(alex.state.votesSubmittedCount === 0, "Le compteur de votes démarre à 0");

  const targetId = undercoverPlayer.playerId;
  const [firstVoter, secondVoter] = players.filter((p) => p.playerId !== targetId);

  firstVoter.socket.emit("vote:submit", { targetId });
  await waitFor(() => alex.state.votesSubmittedCount === 1, "Le compteur de votes passe bien à 1 après le premier vote (correction du bug)");
  assert(alex.state.votesSubmittedCount === 1, "votesSubmittedCount reflète le vote en temps réel, sans attendre la fin du vote");

  secondVoter.socket.emit("vote:submit", { targetId });
  await waitFor(() => alex.state.votesSubmittedCount === 2, "Le compteur de votes passe à 2 après le second vote");

  // L'infiltré vote pour un civil au hasard (ne doit pas pouvoir changer l'issue à 2 contre 1).
  const aCivil = civilPlayers[0].playerId;
  undercoverPlayer.socket.emit("vote:submit", { targetId: aCivil });

  await Promise.all(players.map((p) => waitForPhase(p, "elimination", 6000)));
  assert(alex.state.lastEliminatedPlayerId === targetId, "Le joueur infiltré est bien celui éliminé par le vote majoritaire");
  assert(alex.state.lastEliminatedRole === "undercover", "Le rôle révélé à l'élimination (à tout le monde) est bien 'undercover'");

  // 7) Fin de partie immédiate : une seule manche de vote suffit, pas de
  // "manche suivante" sur le même thème.
  await waitForPhase(alex, "game_over", 6000);
  assert(alex.state.winner === "civil", `Les civils gagnent bien la partie en une seule manche (winner=${alex.state.winner})`);
  assert(!!alex.state.reveal, "La révélation complète (rôles + musiques) est fournie en fin de partie");
  assert(
    Object.keys(alex.state.reveal.roles).length === 3 && Object.values(alex.state.reveal.roles).every((r) => typeof r.theme === "string"),
    "Le récapitulatif final donne le rôle et le thème de chaque joueur"
  );
  assert(alex.state.reveal.clues.length === 3, "Le récapitulatif final liste bien les 3 musiques jouées (liste à plat, plus de regroupement par manche)");
  assert(
    alex.state.reveal.clues.every((c) => players.some((p) => p.playerId === c.playerId)),
    "Chaque musique du récapitulatif est bien associée à un joueur identifiable par son nom"
  );

  console.log("─".repeat(50));
  if (failed) {
    console.error("\n❌ Au moins un test a échoué. Voir ci-dessus.\n");
    process.exitCode = 1;
  } else {
    console.log("\n✅ Tous les tests end-to-end sont passés — le moteur de jeu fonctionne réellement de bout en bout.\n");
  }

  players.forEach((p) => p.socket.disconnect());

  // --- Scénario additionnel : bouton "Quitter" en lobby ---------------------
  console.log("\n🧪 Scénario additionnel — quitter la salle en lobby\n" + "─".repeat(50));

  const host2 = makeClient("Nora");
  const guest2a = makeClient("Yanis");
  const guest2b = makeClient("Ines");
  const trio = [host2, guest2a, guest2b];

  host2.socket.emit("room:create", { nickname: "Nora" });
  await waitFor(() => host2.roomCode, "Nora a créé une deuxième salle");
  guest2a.socket.emit("room:join", { code: host2.roomCode, nickname: "Yanis" });
  guest2b.socket.emit("room:join", { code: host2.roomCode, nickname: "Ines" });
  await waitFor(() => guest2a.playerId && guest2b.playerId, "Yanis et Ines ont rejoint");
  await waitFor(() => host2.state?.players.length === 3, "3 joueurs dans le lobby de la deuxième salle");

  const hostIdBefore = host2.state.hostPlayerId;
  host2.socket.emit("player:leave", {});
  await waitFor(() => guest2a.state?.players.length === 2, "Après le départ de l'hôte, il ne reste plus que 2 joueurs (vu par Yanis)");
  assert(guest2a.state.players.length === 2, "Le joueur qui quitte est bien retiré de la liste (pas juste marqué déconnecté)");
  assert(
    !guest2a.state.players.some((p) => p.id === hostIdBefore),
    "L'ancien hôte n'apparaît plus du tout dans la liste des joueurs"
  );
  assert(
    guest2a.state.hostPlayerId !== hostIdBefore && guest2a.state.players.some((p) => p.id === guest2a.state.hostPlayerId),
    "Le statut d'hôte a été réattribué automatiquement à un joueur restant"
  );

  trio.forEach((p) => p.socket.disconnect());
}

main()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((err) => {
    console.error("\n❌ Erreur pendant le test:", err.message);
    process.exit(1);
  });

setTimeout(() => {
  console.error("\n❌ Timeout global du test (45s) — le process est forcé de s'arrêter.");
  process.exit(1);
}, 45_000);
