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
  let lastError = null;
  let lastControl = null;
  let errorCount = 0;

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
    lastError = p.message;
    errorCount += 1;
    console.error(`❌ [${nickname}] erreur serveur:`, p.message);
  });
  socket.on("clue:control", (p) => {
    lastControl = p;
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
    },
    get lastError() {
      return lastError;
    },
    get lastControl() {
      return lastControl;
    },
    get errorCount() {
      return errorCount;
    },
    clearError() {
      lastError = null;
    },
    clearControl() {
      lastControl = null;
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

let anyFailed = false;
let scenarioFailed = false;
function assert(cond, message) {
  if (!cond) {
    scenarioFailed = true;
    anyFailed = true;
    console.error(`❌ ÉCHEC: ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

/** Identifie qui a quel thème SANS jamais lire un champ "rôle" — uniquement en comparant les thèmes reçus. */
function groupByTheme(players) {
  const groups = new Map();
  for (const p of players) {
    const key = p.secret.theme; // null pour Mr White
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  return groups;
}

async function playOneRound(players, host) {
  const aliveCount = host.state.turnOrder.length;
  for (let i = 0; i < aliveCount; i++) {
    const currentId = host.state.currentTurnPlayerId;
    const current = players.find((p) => p.playerId === currentId);
    current.socket.emit("music:submit_url", { url: "mock://demo-0" + ((i % 8) + 1) });
    await Promise.all(players.map((p) => waitForPhase(p, "clue_playback", 5000)));
    if (i < aliveCount - 1) {
      await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 10_000)));
    } else {
      await Promise.all(players.map((p) => waitForPhase(p, "discussion", 10_000)));
    }
  }
}

/** Isole chaque scénario : un blocage ou une erreur dans l'un n'empêche pas de voir les autres. */
async function runScenario(name, fn, timeoutMs = 20_000) {
  console.log(`\n🧪 ${name}\n` + "─".repeat(50));
  scenarioFailed = false;
  let timer;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout du scénario (${timeoutMs}ms)`)), timeoutMs);
      })
    ]);
    console.log(scenarioFailed ? `\n❌ ${name} : au moins un échec.\n` : `\n✅ ${name} : tout est passé.\n`);
  } catch (err) {
    anyFailed = true;
    console.error(`\n❌ ${name} a levé une erreur : ${err.message}\n`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Scénario 1 : match complet, Mr White désactivé (un seul tour de vote).
// ---------------------------------------------------------------------------
async function scenarioMainMatch() {
  const alex = makeClient("Alex");
  const sarah = makeClient("Sarah");
  const lucas = makeClient("Lucas");
  const players = [alex, sarah, lucas];
  await wait(400);

  // Score cible à 1 : dès qu'une manche est remportée, le match se termine
  // immédiatement — pratique pour un test rapide et déterministe.
  alex.socket.emit("room:create", {
    nickname: "Alex",
    settings: { timers: { enabled: false }, mrWhiteEnabled: false, targetScore: 1 }
  });
  await waitFor(() => alex.roomCode, "Alex a créé la salle");
  assert(alex.state.settings.maxPlayers === 16, "Le nombre de joueurs max par défaut est bien passé à 16");
  assert(!("undercoverCount" in alex.state.settings), "Le nombre d'infiltrés n'est plus un réglage — toujours exactement un seul");

  sarah.socket.emit("room:join", { code: alex.roomCode, nickname: "Sarah" });
  lucas.socket.emit("room:join", { code: alex.roomCode, nickname: "Lucas" });
  await waitFor(() => sarah.playerId && lucas.playerId, "Sarah et Lucas ont rejoint");
  await waitFor(() => alex.state?.players.length === 3, "3 joueurs dans le lobby");

  alex.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  await waitFor(() => alex.secret && sarah.secret && lucas.secret, "Chaque joueur a reçu son secret privé");
  assert(alex.state.roundNumber === 1, "La manche 1 commence bien");

  const groups = groupByTheme(players);
  assert(groups.size === 2, "Deux thèmes distincts circulent (exactement un infiltré, pas de Mr White)");
  const civilGroup = [...groups.values()].find((g) => g.length === 2);
  const undercoverGroup = [...groups.values()].find((g) => g.length === 1);
  assert(!!civilGroup && !!undercoverGroup, "Répartition 2 civils / 1 infiltré");

  // --- La manche n'avance QUE quand tout le monde a cliqué "J'ai compris" ---
  sarah.socket.emit("role:ack", {});
  lucas.socket.emit("role:ack", {});
  await wait(300);
  assert(alex.state.phase === "role_reveal", "La manche ne démarre pas tant qu'il manque un joueur non prêt (Alex n'a pas encore acquitté)");
  alex.socket.emit("role:ack", {});
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));
  assert(true, "La manche démarre dès que tout le monde a acquitté son thème");

  await playOneRound(players, alex);
  assert(true, "Les 3 joueurs ont envoyé leur musique, la manche passe en discussion");

  // --- La discussion n'avance QUE quand tout le monde a cliqué "Passer au vote" ---
  const undercoverPlayer = undercoverGroup[0];
  const [civilA, civilB] = civilGroup;
  civilA.socket.emit("discussion:ready", {});
  await wait(300);
  assert(alex.state.phase === "discussion", "Le vote ne démarre pas tant que tout le monde n'a pas cliqué 'Passer au vote'");
  assert(alex.state.discussionReadyCount === 1, "Le compteur de joueurs prêts progresse en direct (1/3)");
  civilB.socket.emit("discussion:ready", {});
  undercoverPlayer.socket.emit("discussion:ready", {});
  await Promise.all(players.map((p) => waitForPhase(p, "voting_undercover", 5000)));
  assert(true, "Le tour de vote pour l'infiltré démarre dès que tout le monde est prêt");

  // --- Un seul suspect par bulletin (cible unique, pas de tableau) ---
  civilA.socket.emit("vote:submit", { targetId: undercoverPlayer.playerId });
  await waitFor(() => alex.state.votesSubmittedCount === 1, "Un vote à cible unique est bien pris en compte");
  assert(alex.state.voteReveal === null, "Aucun résultat n'est exposé pendant le vote lui-même");
  civilB.socket.emit("vote:submit", { targetId: undercoverPlayer.playerId });
  undercoverPlayer.socket.emit("vote:submit", { targetId: civilA.playerId });

  // Mr White désactivé : un seul tour de vote, on va directement à la révélation.
  await Promise.all(players.map((p) => waitForPhase(p, "elimination", 8000)));
  assert(alex.state.voteReveal !== null, "La révélation apparaît dès que le(s) tour(s) de vote sont clos");
  assert(alex.state.voteReveal.undercoverAccusedId === undercoverPlayer.playerId, "L'infiltré (2 votes sur 3) est bien désigné par le premier tour");
  assert(alex.state.voteReveal.mrWhiteTally === null, "Aucun tour Mr White n'a eu lieu (désactivé) — le tally correspondant est null");
  assert(
    alex.state.lastEliminatedPlayerIds.includes(undercoverPlayer.playerId) &&
      !alex.state.lastEliminatedPlayerIds.includes(civilA.playerId) &&
      !alex.state.lastEliminatedPlayerIds.includes(civilB.playerId),
    "Seul l'infiltré désigné est éliminé"
  );
  assert(alex.state.lastEliminatedRoles[undercoverPlayer.playerId] === "undercover", "Le rôle révélé à l'élimination est bien 'undercover'");

  await waitForPhase(alex, "round_result", 6000);
  assert(
    alex.state.lastRoundRoles[undercoverPlayer.playerId] === "undercover" && alex.state.lastRoundRoles[civilA.playerId] === "civil",
    "Tous les rôles de la manche sont révélés au moment du résultat (plus personne n'a besoin de les cacher)"
  );
  const civilScore = alex.state.players.find((p) => p.id === civilA.playerId).score;
  const undercoverScore = alex.state.players.find((p) => p.id === undercoverPlayer.playerId).score;
  assert(civilScore === 1, `Le civil survivant gagne +1 point individuellement (score=${civilScore})`);
  assert(undercoverScore === 0, `L'infiltré éliminé gagne 0 point (score=${undercoverScore})`);

  // --- Score cible = 1 : le match doit se terminer immédiatement ---
  await waitForPhase(alex, "game_over", 8000);
  assert(alex.state.status === "finished", "Le match se termine dès qu'un score cible est atteint");
  assert(
    alex.state.matchWinnerIds.includes(civilA.playerId) && alex.state.matchWinnerIds.includes(civilB.playerId),
    "Les deux civils (ceux qui ont atteint le score cible) sont déclarés champions du match"
  );

  players.forEach((p) => p.socket.disconnect());
}

// ---------------------------------------------------------------------------
// Scénario 2 : Mr White activé — deux tours de vote, rien révélé entre les deux.
// ---------------------------------------------------------------------------
async function scenarioTwoVoteRounds() {
  const p1 = makeClient("Malo");
  const p2 = makeClient("Chloe");
  const p3 = makeClient("Adam");
  const p4 = makeClient("Zoe");
  const players = [p1, p2, p3, p4];
  await wait(400);

  p1.socket.emit("room:create", {
    nickname: "Malo",
    settings: { timers: { enabled: false }, mrWhiteEnabled: true, targetScore: 100 }
  });
  await waitFor(() => p1.roomCode, "Malo a créé une salle avec Mr White activé");
  p2.socket.emit("room:join", { code: p1.roomCode, nickname: "Chloe" });
  p3.socket.emit("room:join", { code: p1.roomCode, nickname: "Adam" });
  p4.socket.emit("room:join", { code: p1.roomCode, nickname: "Zoe" });
  await waitFor(() => p2.playerId && p3.playerId && p4.playerId, "Les 3 invités ont rejoint");

  p1.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  await waitFor(() => players.every((p) => p.secret), "Les 4 joueurs ont reçu leur secret");

  const withTheme = players.filter((p) => p.secret.theme !== null);
  const withoutTheme = players.filter((p) => p.secret.theme === null);
  assert(withoutTheme.length === 1, "Exactement un joueur reçoit 'aucun thème' (Mr White)");
  assert(withTheme.length === 3, "Les 3 autres joueurs (civils + infiltré) reçoivent bien un thème");
  const mrWhitePlayer = withoutTheme[0];
  const groups = groupByTheme(withTheme);
  const civilGroup = [...groups.values()].find((g) => g.length === 2);
  const undercoverGroup = [...groups.values()].find((g) => g.length === 1);
  const undercoverPlayer = undercoverGroup[0];

  players.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));
  await playOneRound(players, p1);
  players.forEach((p) => p.socket.emit("discussion:ready", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "voting_undercover", 5000)));

  // Tour 1 : tout le monde vote juste pour l'infiltré.
  const votersRound1 = players.filter((p) => p !== undercoverPlayer);
  votersRound1.forEach((p) => p.socket.emit("vote:submit", { targetId: undercoverPlayer.playerId }));
  undercoverPlayer.socket.emit("vote:submit", { targetId: civilGroup[0].playerId });

  // Le second tour démarre SANS rien révéler du premier.
  await Promise.all(players.map((p) => waitForPhase(p, "voting_mrwhite", 8000)));
  assert(players.every((p) => p.state.voteReveal === null), "Le résultat du 1er tour (infiltré) n'est révélé à PERSONNE avant la fin du 2e tour");
  assert(players.every((p) => p.state.votesSubmittedCount === 0), "Le compteur de votes repart bien à 0 pour le second tour");

  // Tour 2 : tout le monde vote juste pour Mr White.
  const votersRound2 = players.filter((p) => p !== mrWhitePlayer);
  votersRound2.forEach((p) => p.socket.emit("vote:submit", { targetId: mrWhitePlayer.playerId }));
  mrWhitePlayer.socket.emit("vote:submit", { targetId: civilGroup[1].playerId });

  await Promise.all(players.map((p) => waitForPhase(p, "elimination", 8000)));
  assert(!!players[0].state.voteReveal, "La révélation combinée apparaît une fois les DEUX tours clos");
  assert(
    players[0].state.voteReveal.undercoverAccusedId === undercoverPlayer.playerId,
    "Le résultat du tour 1 (infiltré), gardé caché jusque-là, est maintenant révélé correctement"
  );
  assert(
    players[0].state.voteReveal.mrWhiteAccusedId === mrWhitePlayer.playerId,
    "Le résultat du tour 2 (Mr White) est également révélé correctement"
  );
  assert(
    players[0].state.lastEliminatedPlayerIds.length === 2 &&
      players[0].state.lastEliminatedPlayerIds.includes(undercoverPlayer.playerId) &&
      players[0].state.lastEliminatedPlayerIds.includes(mrWhitePlayer.playerId),
    "L'infiltré ET Mr White sont éliminés ensemble (deux personnes désignées par les deux tours)"
  );

  players.forEach((p) => p.socket.disconnect());
}

// ---------------------------------------------------------------------------
// Scénario 3 : enchaînement automatique des manches (score cible non atteint).
// ---------------------------------------------------------------------------
async function scenarioRoundContinuation() {
  const a2 = makeClient("Nora");
  const b2 = makeClient("Yanis");
  const c2 = makeClient("Ines");
  const trio2 = [a2, b2, c2];
  await wait(400);

  a2.socket.emit("room:create", {
    nickname: "Nora",
    settings: { timers: { enabled: false }, mrWhiteEnabled: false, targetScore: 100 }
  });
  await waitFor(() => a2.roomCode, "Nora a créé une salle avec un score cible élevé (100)");
  b2.socket.emit("room:join", { code: a2.roomCode, nickname: "Yanis" });
  c2.socket.emit("room:join", { code: a2.roomCode, nickname: "Ines" });
  await waitFor(() => b2.playerId && c2.playerId, "Yanis et Ines ont rejoint");

  a2.socket.emit("host:start_game", {});
  await Promise.all(trio2.map((p) => waitForPhase(p, "role_reveal")));
  await waitFor(() => a2.secret && b2.secret && c2.secret, "Secrets reçus pour la manche 1");
  trio2.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(trio2.map((p) => waitForPhase(p, "waiting_for_music", 8000)));

  await playOneRound(trio2, a2);
  trio2.forEach((p) => p.socket.emit("discussion:ready", {}));
  await Promise.all(trio2.map((p) => waitForPhase(p, "voting_undercover", 5000)));
  // Égalité : chacun vote pour un joueur différent -> personne n'est désigné.
  const [pA, pB, pC] = trio2;
  pA.socket.emit("vote:submit", { targetId: pB.playerId });
  pB.socket.emit("vote:submit", { targetId: pC.playerId });
  pC.socket.emit("vote:submit", { targetId: pA.playerId });

  await waitForPhase(a2, "round_result", 8000);
  assert(a2.state.lastEliminatedPlayerIds.length === 0, "Égalité au premier tour : personne n'est désigné, personne n'est éliminé");
  const totalScore = a2.state.players.reduce((sum, p) => sum + p.score, 0);
  // Score individuel : personne n'étant éliminé, TOUT LE MONDE survit et gagne
  // selon son propre rôle (2 civils +1 chacun, 1 infiltré +2) = 4.
  assert(totalScore === 4, `Chaque joueur gagne ses points individuellement selon son propre rôle (total=${totalScore}, attendu 4)`);
  assert(a2.state.status === "in_progress", "Le match continue (score cible à 100, personne ne l'a atteint)");

  await waitForPhase(a2, "role_reveal", 8000);
  assert(a2.state.roundNumber === 2, "Une nouvelle manche démarre automatiquement (thème et rôles neufs), sans repasser par le lobby");
  await waitFor(() => a2.secret && b2.secret && c2.secret, "De nouveaux secrets sont bien distribués pour la manche 2");

  trio2.forEach((p) => p.socket.disconnect());
}

// ---------------------------------------------------------------------------
// Scénario 4 : contrôle de lecture watch2gether + bouton "Passer".
// ---------------------------------------------------------------------------
async function scenarioPlaybackControlAndSkip() {
  const alex = makeClient("Alex");
  const sarah = makeClient("Sarah");
  const lucas = makeClient("Lucas");
  const players = [alex, sarah, lucas];
  await wait(400);

  alex.socket.emit("room:create", {
    nickname: "Alex",
    settings: { timers: { enabled: false }, mrWhiteEnabled: false, targetScore: 100 }
  });
  await waitFor(() => alex.roomCode, "Alex a créé la salle");
  sarah.socket.emit("room:join", { code: alex.roomCode, nickname: "Sarah" });
  lucas.socket.emit("room:join", { code: alex.roomCode, nickname: "Lucas" });
  await waitFor(() => sarah.playerId && lucas.playerId, "Sarah et Lucas ont rejoint");

  alex.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  players.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));

  const currentId = alex.state.currentTurnPlayerId;
  const presenter = players.find((p) => p.playerId === currentId);
  const others = players.filter((p) => p !== presenter);

  presenter.socket.emit("music:submit_url", { url: "mock://demo-01" });
  await Promise.all(players.map((p) => waitForPhase(p, "clue_playback", 5000)));

  // Un joueur qui n'a PAS envoyé cet indice ne doit pas pouvoir piloter la lecture pour les autres.
  others[0].clearError();
  others[0].socket.emit("clue:control_send", { action: "pause", positionSeconds: 1 });
  await waitFor(() => others[0].lastError, "Le serveur refuse une commande de lecture venant d'un non-présentateur");

  // Le présentateur peut piloter, et ça se diffuse à TOUT le monde.
  players.forEach((p) => p.clearControl());
  presenter.socket.emit("clue:control_send", { action: "pause", positionSeconds: 2.5 });
  await Promise.all(players.map((p) => waitFor(() => p.lastControl, `${p.nickname} reçoit bien l'ordre de lecture diffusé`)));
  assert(
    players.every((p) => p.lastControl.action === "pause" && Math.abs(p.lastControl.positionSeconds - 2.5) < 0.01),
    "La commande diffusée (pause à 2.5s) est identique pour tout le monde, y compris le présentateur lui-même"
  );

  // --- Bouton "Passer" : réservé au présentateur ---
  others[1].clearError();
  others[1].socket.emit("clue:skip", {});
  await waitFor(() => others[1].lastError, "Un non-présentateur ne peut pas utiliser le bouton 'Passer'");
  assert(alex.state.phase === "clue_playback", "La phase n'a pas bougé suite à la tentative refusée");

  const skipStart = Date.now();
  presenter.socket.emit("clue:skip", {});
  await Promise.all(players.map((p) => waitFor(() => p.state.phase !== "clue_playback", `${p.nickname} quitte bien clue_playback après le skip`)));
  const elapsed = Date.now() - skipStart;
  assert(elapsed < 3000, `Le skip fait avancer la partie quasi immédiatement, sans attendre le minuteur complet (${elapsed}ms)`);

  players.forEach((p) => p.socket.disconnect());
}

// ---------------------------------------------------------------------------
// Scénario 5 : le bug "session inconnue" ne se produit plus au premier chargement.
// ---------------------------------------------------------------------------
async function scenarioSilentRejoin() {
  const fresh = makeClient("NouveauVisiteur");
  await wait(400);

  // Simule exactement ce que fait un tout nouveau visiteur : une session
  // jamais liée à aucune salle. Avant le correctif, ceci déclenchait un
  // message d'erreur visible ("Session inconnue.") dès l'arrivée sur la page.
  fresh.socket.emit("session:rejoin", { sessionId: "session-jamais-vue-" + Date.now() });
  await wait(1500);

  assert(fresh.errorCount === 0, "Aucune erreur n'est remontée pour une session inconnue lors du premier chargement");
  assert(fresh.lastError === null, "Le message 'Session inconnue' n'apparaît plus jamais côté client");

  fresh.socket.disconnect();
}

// ---------------------------------------------------------------------------
// Scénario 6 : bouton "Quitter" en lobby.
// ---------------------------------------------------------------------------
async function scenarioLeaveRoom() {
  const host2 = makeClient("Yasmine");
  const guest2a = makeClient("Kevin");
  const guest2b = makeClient("Lea");
  const trio3 = [host2, guest2a, guest2b];
  await wait(400);

  host2.socket.emit("room:create", { nickname: "Yasmine" });
  await waitFor(() => host2.roomCode, "Yasmine a créé une salle");
  guest2a.socket.emit("room:join", { code: host2.roomCode, nickname: "Kevin" });
  guest2b.socket.emit("room:join", { code: host2.roomCode, nickname: "Lea" });
  await waitFor(() => guest2a.playerId && guest2b.playerId, "Kevin et Lea ont rejoint");
  await waitFor(() => host2.state?.players.length === 3, "3 joueurs dans le lobby");

  const hostIdBefore = host2.state.hostPlayerId;
  host2.socket.emit("player:leave", {});
  await waitFor(() => guest2a.state?.players.length === 2, "Après le départ de l'hôte, il ne reste plus que 2 joueurs");
  assert(guest2a.state.players.length === 2, "Le joueur qui quitte est bien retiré de la liste");
  assert(!guest2a.state.players.some((p) => p.id === hostIdBefore), "L'ancien hôte n'apparaît plus dans la liste");
  assert(
    guest2a.state.hostPlayerId !== hostIdBefore && guest2a.state.players.some((p) => p.id === guest2a.state.hostPlayerId),
    "Le statut d'hôte est réattribué automatiquement"
  );

  trio3.forEach((p) => p.socket.disconnect());
}

async function main() {
  console.log("🧪 Test end-to-end — Music Undercover\n" + "═".repeat(50));

  await runScenario("Match principal (un seul infiltré, vote à cible unique)", scenarioMainMatch, 45_000);
  await runScenario("Deux tours de vote (Mr White) sans rien révéler entre les deux", scenarioTwoVoteRounds, 45_000);
  await runScenario("Enchaînement automatique des manches", scenarioRoundContinuation, 45_000);
  await runScenario("Contrôle de lecture watch2gether + bouton Passer", scenarioPlaybackControlAndSkip, 20_000);
  await runScenario("Reconnexion silencieuse (bug session inconnue)", scenarioSilentRejoin, 10_000);
  await runScenario("Quitter la salle en lobby", scenarioLeaveRoom, 15_000);

  console.log("\n" + "═".repeat(50));
  if (anyFailed) {
    console.error("❌ Au moins un scénario a échoué. Voir le détail ci-dessus.\n");
  } else {
    console.log("✅ Tous les scénarios end-to-end sont passés.\n");
  }
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error("\n❌ Erreur fatale pendant le test:", err.message, err.stack);
  process.exit(1);
});

setTimeout(() => {
  console.error("\n❌ Timeout global absolu (200s) — le process est forcé de s'arrêter.");
  process.exit(1);
}, 200_000);
