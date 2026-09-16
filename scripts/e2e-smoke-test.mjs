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

async function scenarioMainMatch() {
  const alex = makeClient("Alex");
  const sarah = makeClient("Sarah");
  const lucas = makeClient("Lucas");
  const players = [alex, sarah, lucas];
  await wait(400);

  // Score cible à 1 : dès qu'une manche est remportée par un camp, le match
  // se termine immédiatement — pratique pour un test rapide et déterministe.
  alex.socket.emit("room:create", {
    nickname: "Alex",
    settings: { timers: { enabled: false }, undercoverCount: 1, mrWhiteEnabled: false, targetScore: 1 }
  });
  await waitFor(() => alex.roomCode, "Alex a créé la salle");
  assert(alex.state.settings.maxPlayers === 16, "Le nombre de joueurs max par défaut est bien passé à 16");

  sarah.socket.emit("room:join", { code: alex.roomCode, nickname: "Sarah" });
  lucas.socket.emit("room:join", { code: alex.roomCode, nickname: "Lucas" });
  await waitFor(() => sarah.playerId && lucas.playerId, "Sarah et Lucas ont rejoint");
  await waitFor(() => alex.state?.players.length === 3, "3 joueurs dans le lobby");

  alex.socket.emit("host:start_game", {});
  await Promise.all(players.map((p) => waitForPhase(p, "role_reveal")));
  await waitFor(() => alex.secret && sarah.secret && lucas.secret, "Chaque joueur a reçu son secret privé");
  assert(alex.state.roundNumber === 1, "La manche 1 commence bien");

  const groups = groupByTheme(players);
  assert(groups.size === 2, "Deux thèmes distincts circulent (1 infiltré configuré, pas de Mr White)");
  const civilGroup = [...groups.values()].find((g) => g.length === 2);
  const undercoverGroup = [...groups.values()].find((g) => g.length === 1);
  assert(!!civilGroup && !!undercoverGroup, "Répartition 2 civils / 1 infiltré, comme configuré dans le lobby");

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
  await Promise.all(players.map((p) => waitForPhase(p, "voting", 5000)));
  assert(true, "Le vote démarre dès que tout le monde est prêt");

  // --- Vote multiple : chaque joueur peut cocher plusieurs suspects ---
  civilA.socket.emit("vote:submit", { targetIds: [undercoverPlayer.playerId, civilB.playerId] });
  await waitFor(() => alex.state.votesSubmittedCount === 1, "Un vote à plusieurs cibles est bien pris en compte");
  civilB.socket.emit("vote:submit", { targetIds: [undercoverPlayer.playerId] });
  undercoverPlayer.socket.emit("vote:submit", { targetIds: [civilA.playerId] });

  await Promise.all(players.map((p) => waitForPhase(p, "elimination", 8000)));
  assert(
    alex.state.lastEliminatedPlayerIds.includes(undercoverPlayer.playerId),
    "L'infiltré (2 votes sur 3, majorité absolue) est bien éliminé"
  );
  assert(
    !alex.state.lastEliminatedPlayerIds.includes(civilA.playerId) && !alex.state.lastEliminatedPlayerIds.includes(civilB.playerId),
    "Les civils, qui n'ont reçu qu'un seul vote chacun, ne sont PAS éliminés (majorité absolue non atteinte)"
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
  assert(undercoverScore === 0, `L'infiltré éliminé gagne 0 point, peu importe le sort des autres (score=${undercoverScore})`);

  // --- Score cible = 1 : le match doit se terminer immédiatement ---
  await waitForPhase(alex, "game_over", 8000);
  assert(alex.state.status === "finished", "Le match se termine dès qu'un score cible est atteint");
  assert(
    alex.state.matchWinnerIds.includes(civilA.playerId) && alex.state.matchWinnerIds.includes(civilB.playerId),
    "Les deux civils (ceux qui ont atteint le score cible) sont déclarés champions du match"
  );

  players.forEach((p) => p.socket.disconnect());
}

async function scenarioRoundContinuation() {
  const a2 = makeClient("Nora");
  const b2 = makeClient("Yanis");
  const c2 = makeClient("Ines");
  const trio2 = [a2, b2, c2];
  await wait(400);

  a2.socket.emit("room:create", {
    nickname: "Nora",
    settings: { timers: { enabled: false }, undercoverCount: 1, mrWhiteEnabled: false, targetScore: 100 }
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
  await Promise.all(trio2.map((p) => waitForPhase(p, "voting", 5000)));
  // Personne ne vote pour personne : le camp méchant gagne automatiquement la manche.
  trio2.forEach((p) => p.socket.emit("vote:submit", { targetIds: [] }));

  await waitForPhase(a2, "round_result", 8000);
  assert(
    a2.state.lastEliminatedPlayerIds.length === 0,
    "Personne n'est éliminé (personne n'a voté pour personne)"
  );
  const totalScore = a2.state.players.reduce((sum, p) => sum + p.score, 0);
  // Score individuel : personne n'étant éliminé, TOUT LE MONDE gagne selon
  // son propre rôle (2 civils +1 chacun, 1 infiltré +2) = 4, et non pas
  // seulement l'infiltré comme dans une logique d'équipe (qui aurait donné 2).
  assert(totalScore === 4, `Chaque joueur gagne ses points individuellement selon son propre rôle, pas en équipe (total=${totalScore}, attendu 4)`);
  assert(a2.state.status === "in_progress", "Le match continue (score cible à 100, personne ne l'a atteint)");

  await waitForPhase(a2, "role_reveal", 8000);
  assert(a2.state.roundNumber === 2, "Une nouvelle manche démarre automatiquement (thème et rôles neufs), sans repasser par le lobby");
  await waitFor(() => a2.secret && b2.secret && c2.secret, "De nouveaux secrets sont bien distribués pour la manche 2");

  trio2.forEach((p) => p.socket.disconnect());
}

async function scenarioMrWhite() {
  const p1 = makeClient("Malo");
  const p2 = makeClient("Chloe");
  const p3 = makeClient("Adam");
  const p4 = makeClient("Zoe");
  const quatuor = [p1, p2, p3, p4];
  await wait(400);

  p1.socket.emit("room:create", {
    nickname: "Malo",
    settings: { timers: { enabled: false }, undercoverCount: 1, mrWhiteEnabled: true, targetScore: 1 }
  });
  await waitFor(() => p1.roomCode, "Malo a créé une salle avec Mr White activé");
  p2.socket.emit("room:join", { code: p1.roomCode, nickname: "Chloe" });
  p3.socket.emit("room:join", { code: p1.roomCode, nickname: "Adam" });
  p4.socket.emit("room:join", { code: p1.roomCode, nickname: "Zoe" });
  await waitFor(() => p2.playerId && p3.playerId && p4.playerId, "Les 3 invités ont rejoint");

  p1.socket.emit("host:start_game", {});
  await Promise.all(quatuor.map((p) => waitForPhase(p, "role_reveal")));
  await waitFor(() => quatuor.every((p) => p.secret), "Les 4 joueurs ont reçu leur secret");

  const withTheme = quatuor.filter((p) => p.secret.theme !== null);
  const withoutTheme = quatuor.filter((p) => p.secret.theme === null);
  assert(withoutTheme.length === 1, "Exactement un joueur reçoit 'aucun thème' (Mr White)");
  assert(withTheme.length === 3, "Les 3 autres joueurs (civils + infiltré) reçoivent bien un thème");

  quatuor.forEach((p) => p.socket.disconnect());
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

  await runScenario("Match principal (rôles configurables, vote multiple, points)", scenarioMainMatch, 45_000);
  await runScenario("Enchaînement automatique des manches", scenarioRoundContinuation, 55_000);
  await runScenario("Mr White (aucun thème)", scenarioMrWhite, 15_000);
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
  console.error("\n❌ Timeout global absolu (180s) — le process est forcé de s'arrêter.");
  process.exit(1);
}, 180_000);
