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
  let receivedReactions = [];

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
  socket.on("reaction:receive", (p) => {
    receivedReactions.push(p);
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
    get receivedReactions() {
      return receivedReactions;
    },
    clearError() {
      lastError = null;
    },
    clearControl() {
      lastControl = null;
    },
    clearReactions() {
      receivedReactions = [];
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

  // Plus d'enchaînement automatique (demande explicite) : la phase ne bouge
  // pas toute seule, et seul l'hôte peut la faire avancer.
  await wait(1500);
  assert(alex.state.phase === "elimination", "La révélation reste affichée tant que l'hôte n'a pas cliqué pour continuer (plus de minuteur automatique)");
  // sarah/lucas ont rejoint via room:join — jamais l'hôte, quel que soit le
  // rôle que le tirage leur a donné (contrairement à civilA/civilB, qui
  // pourraient être Alex lui-même selon le tirage).
  sarah.clearError();
  sarah.socket.emit("host:force_next_phase", {});
  await waitFor(() => sarah.lastError, "Un joueur qui n'est pas l'hôte ne peut pas faire avancer la révélation");
  alex.socket.emit("host:force_next_phase", {});
  await waitForPhase(alex, "round_result", 6000);
  assert(
    alex.state.lastRoundTheme?.civilTheme && alex.state.lastRoundTheme?.undercoverTheme,
    "Le thème de la manche (civils ET infiltré) est rappelé au résultat"
  );
  assert(
    alex.state.lastRoundRoles[undercoverPlayer.playerId] === "undercover" && alex.state.lastRoundRoles[civilA.playerId] === "civil",
    "Tous les rôles de la manche sont révélés au moment du résultat (plus personne n'a besoin de les cacher)"
  );
  const civilScore = alex.state.players.find((p) => p.id === civilA.playerId).score;
  const undercoverScore = alex.state.players.find((p) => p.id === undercoverPlayer.playerId).score;
  assert(civilScore === 1, `Le civil survivant gagne +1 point individuellement (score=${civilScore})`);
  assert(undercoverScore === 0, `L'infiltré éliminé gagne 0 point (score=${undercoverScore})`);

  // --- Score cible = 1 : le match doit se terminer une fois l'hôte a cliqué pour continuer ---
  alex.socket.emit("host:force_next_phase", {});
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
// Scénario : dernière chance de Mr White (démasqué, il devine le thème des
// civils). Correct = compte comme survivant (mêmes points) ; faux = reste
// éliminé. Scindé en deux scénarios (au lieu d'un seul) pour laisser à
// chacun un budget de temps réaliste — une manche complète en mode démo
// prend déjà 15-20s à elle seule.
// ---------------------------------------------------------------------------
async function scenarioMrWhiteLastChance() {
  // --- Cas 1 : Mr White devine juste -> il s'en sort, gagne ses points ---
  const p1 = makeClient("Nora");
  const p2 = makeClient("Yanis");
  const p3 = makeClient("Ines");
  const p4 = makeClient("Sofia");
  const players = [p1, p2, p3, p4];
  await wait(400);

  p1.socket.emit("room:create", {
    nickname: "Nora",
    settings: { timers: { enabled: false }, mrWhiteEnabled: true, targetScore: 100 }
  });
  await waitFor(() => p1.roomCode, "Nora a créé une salle avec Mr White activé");
  p2.socket.emit("room:join", { code: p1.roomCode, nickname: "Yanis" });
  p3.socket.emit("room:join", { code: p1.roomCode, nickname: "Ines" });
  p4.socket.emit("room:join", { code: p1.roomCode, nickname: "Sofia" });
  await waitFor(() => p2.playerId && p3.playerId && p4.playerId, "Les 3 invités ont rejoint");

  p1.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  await waitFor(() => players.every((p) => p.secret), "Secrets reçus");

  const withTheme = players.filter((p) => p.secret.theme !== null);
  const mrWhitePlayer = players.find((p) => p.secret.theme === null);
  const groups = groupByTheme(withTheme);
  const civilGroup = [...groups.values()].find((g) => g.length === 2);
  const undercoverPlayer = [...groups.values()].find((g) => g.length === 1)[0];
  const civilTheme = civilGroup[0].secret.theme;

  players.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));
  await playOneRound(players, p1);
  players.forEach((p) => p.socket.emit("discussion:ready", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "voting_undercover", 5000)));

  players.filter((p) => p !== undercoverPlayer).forEach((p) => p.socket.emit("vote:submit", { targetId: undercoverPlayer.playerId }));
  undercoverPlayer.socket.emit("vote:submit", { targetId: civilGroup[0].playerId });
  await Promise.all(players.map((p) => waitForPhase(p, "voting_mrwhite", 8000)));

  players.filter((p) => p !== mrWhitePlayer).forEach((p) => p.socket.emit("vote:submit", { targetId: mrWhitePlayer.playerId }));
  mrWhitePlayer.socket.emit("vote:submit", { targetId: civilGroup[1].playerId });

  await Promise.all(players.map((p) => waitForPhase(p, "elimination", 8000)));
  p1.socket.emit("host:force_next_phase", {});
  await Promise.all(players.map((p) => waitForPhase(p, "mrwhite_guess", 10_000)));
  assert(p1.state.mrWhiteGuessPlayerId === mrWhitePlayer.playerId, "La dernière chance est bien proposée à Mr White, démasqué par le vote");

  // Guess incorrect refusé par le serveur lui-même (pas juste par le joueur qui s'est trompé).
  mrWhitePlayer.socket.emit("mrwhite:submit_guess", { guess: "n'importe quoi qui ne colle évidemment pas" });
  await waitForPhase(p1, "round_result", 8000);
  assert(p1.state.mrWhiteGuessResult.correct === false, "Une mauvaise réponse est bien jugée incorrecte");
  assert(p1.state.lastEliminatedPlayerIds.includes(mrWhitePlayer.playerId), "Mr White reste éliminé après une mauvaise réponse");
  const scoreAfterWrongGuess = p1.state.players.find((pl) => pl.id === mrWhitePlayer.playerId).score;
  assert(scoreAfterWrongGuess === 0, `Mr White éliminé (mauvaise réponse) gagne 0 point (score=${scoreAfterWrongGuess})`);

  players.forEach((p) => p.socket.disconnect());
}

async function scenarioMrWhiteLastChanceCorrectGuess() {
  // --- Cas 2 : bonne réponse (avec accents/casse différents) -> il s'en sort ---
  const q1 = makeClient("Malo2");
  const q2 = makeClient("Chloe2");
  const q3 = makeClient("Adam2");
  const q4 = makeClient("Zoe2");
  const players2 = [q1, q2, q3, q4];
  await wait(300);

  q1.socket.emit("room:create", {
    nickname: "Malo2",
    settings: { timers: { enabled: false }, mrWhiteEnabled: true, targetScore: 100 }
  });
  await waitFor(() => q1.roomCode, "Deuxième salle créée");
  q2.socket.emit("room:join", { code: q1.roomCode, nickname: "Chloe2" });
  q3.socket.emit("room:join", { code: q1.roomCode, nickname: "Adam2" });
  q4.socket.emit("room:join", { code: q1.roomCode, nickname: "Zoe2" });
  await waitFor(() => q2.playerId && q3.playerId && q4.playerId, "Les 3 invités ont rejoint (2e salle)");

  q1.socket.emit("host:start_game", {});
  await Promise.all(players2.map((p) => waitForPhase(p, "role_reveal")));
  await waitFor(() => players2.every((p) => p.secret), "Secrets reçus (2e salle)");

  const withTheme2 = players2.filter((p) => p.secret.theme !== null);
  const mrWhite2 = players2.find((p) => p.secret.theme === null);
  const groups2 = groupByTheme(withTheme2);
  const civilGroup2 = [...groups2.values()].find((g) => g.length === 2);
  const undercover2 = [...groups2.values()].find((g) => g.length === 1)[0];
  const civilTheme2 = civilGroup2[0].secret.theme;

  players2.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players2.map((p) => waitForPhase(p, "waiting_for_music", 8000)));
  await playOneRound(players2, q1);
  players2.forEach((p) => p.socket.emit("discussion:ready", {}));
  await Promise.all(players2.map((p) => waitForPhase(p, "voting_undercover", 5000)));

  players2.filter((p) => p !== undercover2).forEach((p) => p.socket.emit("vote:submit", { targetId: undercover2.playerId }));
  undercover2.socket.emit("vote:submit", { targetId: civilGroup2[0].playerId });
  await Promise.all(players2.map((p) => waitForPhase(p, "voting_mrwhite", 8000)));

  players2.filter((p) => p !== mrWhite2).forEach((p) => p.socket.emit("vote:submit", { targetId: mrWhite2.playerId }));
  mrWhite2.socket.emit("vote:submit", { targetId: civilGroup2[1].playerId });
  await Promise.all(players2.map((p) => waitForPhase(p, "elimination", 8000)));
  q1.socket.emit("host:force_next_phase", {});
  await Promise.all(players2.map((p) => waitForPhase(p, "mrwhite_guess", 10_000)));

  // Réponse correcte mais volontairement mal casée/accentuée/espacée : la
  // comparaison doit être normalisée (insensible casse/accents/espaces).
  const messyGuess = "  " + civilTheme2.toUpperCase().replace(/É/g, "e").replace(/È/g, "e") + "  ";
  mrWhite2.socket.emit("mrwhite:submit_guess", { guess: messyGuess });
  await waitForPhase(q1, "round_result", 8000);
  assert(q1.state.mrWhiteGuessResult.correct === true, "Une bonne réponse est reconnue même avec casse/accents/espaces différents");
  assert(!q1.state.lastEliminatedPlayerIds.includes(mrWhite2.playerId), "Mr White n'est plus considéré comme éliminé après une bonne réponse");
  const scoreAfterCorrectGuess = q1.state.players.find((pl) => pl.id === mrWhite2.playerId).score;
  assert(scoreAfterCorrectGuess === 2, `Mr White qui devine juste gagne ses points comme s'il avait survécu (score=${scoreAfterCorrectGuess})`);

  players2.forEach((p) => p.socket.disconnect());
}

// ---------------------------------------------------------------------------
// Scénario : enchaînement automatique des manches (score cible non atteint).
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

  await waitForPhase(a2, "elimination", 8000);
  assert(a2.state.lastEliminatedPlayerIds.length === 0, "Égalité au premier tour : personne n'est désigné, personne n'est éliminé");
  a2.socket.emit("host:force_next_phase", {});

  await waitForPhase(a2, "round_result", 8000);
  const totalScore = a2.state.players.reduce((sum, p) => sum + p.score, 0);
  // Score individuel : personne n'étant éliminé, TOUT LE MONDE survit et gagne
  // selon son propre rôle (2 civils +1 chacun, 1 infiltré +2) = 4.
  assert(totalScore === 4, `Chaque joueur gagne ses points individuellement selon son propre rôle (total=${totalScore}, attendu 4)`);
  assert(a2.state.status === "in_progress", "Le match continue (score cible à 100, personne ne l'a atteint)");
  a2.socket.emit("host:force_next_phase", {});

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
// ---------------------------------------------------------------------------
// Scénario 5 : réactions emoji — diffusées à tout le monde pendant l'écoute
// uniquement, liste fermée validée côté serveur (pas de texte libre).
// ---------------------------------------------------------------------------
async function scenarioReactions() {
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

  // --- Hors phase d'écoute (encore dans le lobby) : une réaction est refusée ---
  sarah.clearError();
  sarah.socket.emit("reaction:send", { emoji: "🔥" });
  await waitFor(() => sarah.lastError, "Une réaction envoyée hors de l'écoute (ici : en lobby) est refusée");

  alex.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  players.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));

  const currentId = alex.state.currentTurnPlayerId;
  const presenter = players.find((p) => p.playerId === currentId);
  const viewer = players.find((p) => p.playerId !== currentId);

  presenter.socket.emit("music:submit_url", { url: "mock://demo-01" });
  await Promise.all(players.map((p) => waitForPhase(p, "clue_playback", 5000)));

  // --- Un emoji hors liste fermée est refusé (pas de texte libre) ---
  viewer.clearError();
  viewer.socket.emit("reaction:send", { emoji: "coucou" });
  await waitFor(() => viewer.lastError, "Un texte libre (hors liste fermée d'emojis) est refusé");

  // --- Un emoji valide, envoyé par n'IMPORTE QUEL joueur (pas que le présentateur), est diffusé à TOUT LE MONDE ---
  players.forEach((p) => p.clearReactions());
  viewer.socket.emit("reaction:send", { emoji: "😂" });
  await Promise.all(players.map((p) => waitFor(() => p.receivedReactions.length === 1, `${p.nickname} reçoit bien la réaction`)));
  assert(
    players.every((p) => p.receivedReactions[0].emoji === "😂"),
    "La réaction diffusée est identique pour tout le monde, y compris son propre émetteur"
  );
  assert(
    players.every((p) => typeof p.receivedReactions[0].id === "string" && p.receivedReactions[0].id.length > 0),
    "Chaque réaction a un identifiant unique (pour que l'UI puisse l'animer puis la retirer)"
  );

  players.forEach((p) => p.socket.disconnect());
}

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
// ---------------------------------------------------------------------------
// Bouton "Recommencer" : réservé à l'hôte, utilisable EN COURS de partie
// (pas seulement à la toute fin comme "Revanche") — remet tout à zéro pour
// toute la salle, retour au lobby.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Auto-réparation du thème : un joueur qui redemande son secret (simulateur
// d'un message initial perdu — micro-coupure réseau, onglet en veille…)
// reçoit bien le thème de LA MANCHE EN COURS, jamais un ancien.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Chat textuel : n'est ouvert QUE pendant l'écoute et la discussion, jamais
// ailleurs (lobby, vote…) ; diffusé à tout le monde via l'état public.
// ---------------------------------------------------------------------------
async function scenarioChatRestrictedToPhases() {
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

  // Hors partie (lobby) : le chat est refusé.
  sarah.clearError();
  sarah.socket.emit("chat:send", { text: "Coucou avant la partie" });
  await waitFor(() => sarah.lastError, "Le chat est refusé en dehors de l'écoute/discussion (ici : lobby)");

  alex.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  players.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));

  const currentId = alex.state.currentTurnPlayerId;
  const presenter = players.find((p) => p.playerId === currentId);
  const viewer = players.find((p) => p.playerId !== currentId);
  assert(
    !("currentMission" in alex.state),
    "Aucune trace de mission dans l'état public — ce n'est plus un champ partagé, seulement privé"
  );
  players.forEach((p) => {
    assert(
      p.secret.mission === null || typeof p.secret.mission.label === "string",
      `${p.nickname} reçoit bien son propre champ mission dans son secret privé (null ou {id,label})`
    );
  });
  assert(
    players.some((p) => p.secret.mission !== null),
    "Au moins un joueur de la manche a bien une mission (garantie minimum 1 par manche)"
  );

  presenter.socket.emit("music:submit_url", { url: "mock://demo-01" });
  await Promise.all(players.map((p) => waitForPhase(p, "clue_playback", 5000)));

  // Pendant l'écoute : n'importe quel joueur peut écrire, diffusé à tous.
  viewer.socket.emit("chat:send", { text: "Ce son est tellement bizarre 😂" });
  await waitFor(() => alex.state.chatMessages.length === 1, "Le message envoyé pendant l'écoute apparaît bien dans l'état de tous les joueurs");
  assert(
    alex.state.chatMessages[0].text === "Ce son est tellement bizarre 😂" && alex.state.chatMessages[0].playerId === viewer.playerId,
    "Le message diffusé porte bien le bon texte et le bon auteur"
  );

  // Les tours restants de la manche (le premier a déjà été joué ci-dessus).
  const remainingTurns = alex.state.turnOrder.length - 1;
  for (let i = 0; i < remainingTurns; i++) {
    await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 10_000)));
    const nextId = alex.state.currentTurnPlayerId;
    const nextPlayer = players.find((p) => p.playerId === nextId);
    nextPlayer.socket.emit("music:submit_url", { url: "mock://demo-0" + ((i % 8) + 2) });
    await Promise.all(players.map((p) => waitForPhase(p, "clue_playback", 5000)));
  }
  await Promise.all(players.map((p) => waitForPhase(p, "discussion", 10_000)));

  // Pendant la discussion : toujours ouvert.
  alex.socket.emit("chat:send", { text: "Je pense que c'est Lucas" });
  await waitFor(() => alex.state.chatMessages.length === 2, "Le chat reste ouvert pendant la discussion");

  players.forEach((p) => p.socket.emit("discussion:ready", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "voting_undercover", 5000)));

  // Pendant le vote : refusé à nouveau.
  alex.clearError();
  alex.socket.emit("chat:send", { text: "Message pendant le vote" });
  await waitFor(() => alex.lastError, "Le chat est refusé pendant le vote");

  players.forEach((p) => p.socket.disconnect());
}

async function scenarioSecretSelfHeal() {
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
  await waitFor(() => players.every((p) => p.secret), "Chaque joueur a reçu son secret initial");
  assert(
    players.every((p) => p.secret.roundNumber === 1),
    "Le secret initial porte bien le numéro de la manche 1"
  );
  const themeRound1 = sarah.secret.theme;

  // Un joueur redemande son secret explicitement (ce que le client fait
  // tout seul s'il détecte un décalage) : il doit récupérer EXACTEMENT le
  // même thème que celui déjà reçu, pas un thème différent ou vide.
  sarah.socket.emit("role:request_secret", {});
  await wait(300);
  assert(sarah.secret.theme === themeRound1, "Redemander son secret renvoie bien le même thème que celui de la manche en cours");
  assert(sarah.secret.roundNumber === 1, "Le secret redemandé porte le bon numéro de manche");

  players.forEach((p) => p.socket.emit("role:ack", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "waiting_for_music", 8000)));
  await playOneRound(players, alex);
  players.forEach((p) => p.socket.emit("discussion:ready", {}));
  await Promise.all(players.map((p) => waitForPhase(p, "voting_undercover", 5000)));
  const [pA, pB, pC] = players;
  pA.socket.emit("vote:submit", { targetId: pB.playerId });
  pB.socket.emit("vote:submit", { targetId: pC.playerId });
  pC.socket.emit("vote:submit", { targetId: pA.playerId });
  await waitForPhase(alex, "elimination", 8000);
  alex.socket.emit("host:force_next_phase", {});
  await waitForPhase(alex, "round_result", 8000);
  alex.socket.emit("host:force_next_phase", {});

  // Manche 2 : un secret encore en mémoire pour la manche 1 doit être perçu
  // comme périmé (c'est exactement le bug rapporté — sinon un joueur reste
  // bloqué sur le thème précédent). On simule ça en redemandant le secret
  // et en vérifiant qu'il correspond bien à LA NOUVELLE manche.
  await waitForPhase(alex, "role_reveal", 8000);
  await waitFor(() => alex.state.roundNumber === 2, "La manche 2 a bien commencé");
  await waitFor(() => players.every((p) => p.secret.roundNumber === 2), "Tout le monde a reçu un secret à jour pour la manche 2, sans action manuelle");

  lucas.socket.emit("role:request_secret", {});
  await wait(300);
  assert(lucas.secret.roundNumber === 2, "Une redemande explicite en manche 2 renvoie bien le secret de la manche 2, jamais celui de la manche 1");

  players.forEach((p) => p.socket.disconnect());
}

async function scenarioRestartMidGame() {
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
  assert(alex.state.status === "in_progress", "La partie est bien en cours (pas encore terminée)");

  // Un joueur non-hôte ne peut pas recommencer la partie pour tout le monde.
  sarah.clearError();
  sarah.socket.emit("host:rematch", {});
  await waitFor(() => sarah.lastError, "Un non-hôte ne peut pas recommencer la partie");

  // L'hôte, lui, peut recommencer alors que la partie est encore EN COURS
  // (pas seulement une fois terminée) — c'est tout le point du bouton.
  alex.socket.emit("host:rematch", {});
  await Promise.all(players.map((p) => waitForPhase(p, "lobby", 5000)));
  assert(alex.state.status === "lobby", "La partie repasse bien en statut lobby");
  assert(
    alex.state.players.every((p) => p.score === 0),
    "Les scores sont remis à zéro"
  );
  assert(alex.state.roundNumber === 0, "Le numéro de manche est remis à zéro");

  players.forEach((p) => p.socket.disconnect());
}

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
  await runScenario("Dernière chance de Mr White — mauvaise réponse", scenarioMrWhiteLastChance, 45_000);
  await runScenario("Dernière chance de Mr White — bonne réponse", scenarioMrWhiteLastChanceCorrectGuess, 45_000);
  await runScenario("Contrôle de lecture watch2gether + bouton Passer", scenarioPlaybackControlAndSkip, 20_000);
  await runScenario("Réactions emoji (emote spam pendant l'écoute)", scenarioReactions, 20_000);
  await runScenario("Reconnexion silencieuse (bug session inconnue)", scenarioSilentRejoin, 10_000);
  await runScenario("Chat restreint à l'écoute et la discussion", scenarioChatRestrictedToPhases, 45_000);
  await runScenario("Auto-réparation du thème (plus besoin de F5)", scenarioSecretSelfHeal, 45_000);
  await runScenario("Recommencer en cours de partie (pas seulement à la fin)", scenarioRestartMidGame, 15_000);
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
  console.error("\n❌ Timeout global absolu (280s) — le process est forcé de s'arrêter.");
  process.exit(1);
}, 280_000);
