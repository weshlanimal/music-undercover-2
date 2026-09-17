# Music Undercover

Party game social-deduction inspiré d'Undercover : au lieu d'un mot, l'indice de chaque joueur est une **musique** (lien YouTube). Titre et artiste sont visibles par tous dès l'envoi — la découverte musicale fait partie du jeu, pas de cachette d'indices. Ce qui reste secret, c'est le **rôle** : personne ne sait jamais qui est civil, infiltré, ou Mr White.

Un **match** enchaîne plusieurs **manches** (thème neuf, rôles neufs à chaque fois, tout le monde revit) jusqu'à ce qu'un·e joueur·se atteigne le score cible fixé par l'hôte. Chaque manche : tour de musique (parfois avec une mission — une contrainte de genre musical en plus du thème), discussion (5 min max, chat textuel disponible), vote (un ou deux tours selon Mr White), révélation, résultat, points — la fin de manche avance au clic de l'hôte, pas toute seule, le temps que tout le monde lise.

**Tu n'es pas développeur ?** Lis plutôt [`GUIDE-DEMARRAGE.md`](./GUIDE-DEMARRAGE.md) — ce README est la référence technique.

## Démarrage rapide

```bash
npm install          # installe les dépendances + génère les pistes de secours (postinstall)
npm run dev           # démarre le serveur (Next.js + Socket.io) sur http://localhost:3000
npm run check-setup   # diagnostic (Node, pistes de secours)
npm test               # tests unitaires (Vitest)
node scripts/e2e-smoke-test.mjs   # tests end-to-end (nécessite le serveur démarré à côté)
```

Fonctionne immédiatement avec de vrais liens **YouTube** — aucune clé API n'est nécessaire (métadonnées via l'endpoint public oEmbed, lecture via le lecteur officiel embarqué). Un mode démo hors-ligne (`mock://demo-01` etc.) reste disponible pour tester sans réseau.

## Règles du jeu (résumé)

- **Toujours exactement un infiltré.** Mr White est optionnel (activable par l'hôte) — il n'a aucun thème du tout et doit bluffer. Le reste des joueurs est civil.
- **Dernière chance de Mr White.** S'il est démasqué par le second tour de vote, il a une chance de deviner le thème des civils avant que la manche ne se conclue. S'il trouve, il compte comme s'il n'avait jamais été éliminé (mêmes points que s'il avait survécu) ; sinon il reste éliminé. L'hôte peut aussi valider manuellement (utile si la réponse est annoncée à voix haute plutôt que tapée).
- **Personne ne connaît son propre rôle**, à part Mr White qui le devine forcément puisqu'il ne reçoit aucun thème (impossible de cacher une absence totale d'information à celui qui la reçoit). Civil et infiltré reçoivent exactement le même type de message — un thème, sans étiquette.
- **Le thème se répare tout seul si son envoi rate.** Micro-coupure réseau, onglet mis en veille sur mobile… si le message initial ne passe pas, le client s'en aperçoit tout seul (le thème qu'il a en mémoire ne correspond plus à la manche affichée) et en redemande un frais automatiquement. Plus besoin de F5 pour un joueur resté bloqué sur le thème de la manche précédente.
- **Une manche = un thème, un tour de musique par joueur, une discussion (5 min max, tout le monde doit cliquer "Passer au vote"), puis le vote.**
- **La fin de manche avance au clic de l'hôte, pas automatiquement.** Une fois le vote clos, l'écran de révélation (qui a été accusé, rôle réel, et le thème rappelé — civil ET infiltré) reste affiché tant que l'hôte n'a pas cliqué "Continuer" ; pareil pour l'écran de résultat de manche ("Manche suivante" ou "Voir le classement final"). Plus de minuteur qui file en quelques secondes sans que personne n'ait eu le temps de lire.
- **Le vote se déroule en un ou deux tours à cible UNIQUE** (jamais plusieurs suspects à la fois, pour éviter le n'importe quoi) : d'abord "qui est l'infiltré ?", puis — si Mr White est activé — "qui est Mr White ?", **sans rien révéler du premier tour avant la fin du second**. Le résultat des deux tours n'apparaît qu'une fois combiné, à la toute fin.
- **Lecture synchronisée façon Watch2gether** : la personne qui vient d'envoyer son indice contrôle lecture/pause/défilement pour tout le monde — les autres joueurs regardent en lecture seule, synchronisés en direct. Elle peut aussi passer directement à la suite ("Passer") en cas de bug ou de musique ratée. **Le volume, lui, reste toujours personnel** : chaque joueur règle le sien indépendamment, y compris les spectateurs dont la vidéo est par ailleurs verrouillée.
- **Réactions emoji en direct pendant l'écoute** (façon "emote spam" Twitch) : n'importe quel joueur peut taper un emoji parmi une liste fermée, qui monte et disparaît sur l'écran de tout le monde.
- **Chat textuel pendant l'écoute et la discussion** : permet de jouer sans discussion vocale à côté. Bulle flottante, ouverte à la demande ; l'historique de la manche est visible par tout le monde (y compris un joueur qui vient de rejoindre en retard) et repart à zéro à chaque nouvelle manche. Fermé pendant le vote et les autres phases.
- **Missions aléatoires** : à certains tours (environ 1 sur 5 — la grande majorité des tours n'en ont aucune), une contrainte de genre musical s'ajoute au thème du joueur ("Rap français", "Générique d'anime", "Musique sans parole"…). Affichée publiquement, pas vérifiée automatiquement (pas de métadonnée de genre fiable sur YouTube) — une règle de bonne foi entre joueurs, comme au Jackbox. La liste vit dans `data/missions.csv`, éditable exactement comme les thèmes.
- **Points strictement individuels** : infiltré et Mr White ne forment PAS une équipe entre eux. Chaque joueur qui survit au(x) vote(s) gagne des points selon son propre rôle (civil : +1, infiltré ou Mr White : +2) ; un joueur démasqué gagne 0, peu importe le sort de l'autre "méchant".
- **Score cible configurable** (3 par défaut) : dès qu'un·e joueur·se l'atteint, le match se termine et le classement final s'affiche. Sinon, une nouvelle manche démarre automatiquement (thème et rôles neufs).
- **Bouton "Recommencer"** (hôte uniquement) : remet tout à zéro pour toute la salle, retour au lobby — utilisable à tout moment en cours de match, pas seulement une fois terminé.
- **Jusqu'à 16 joueurs** par salle.
- **La base de thèmes vit dans `data/themes.csv`**, lue directement par le serveur à chaque démarrage — éditer ce fichier (même juste sur GitHub) et redéployer suffit, aucune étape supplémentaire. Même principe pour `data/missions.csv`.
- **Thème visuel sombre par défaut, clair en option** (bouton dédié, mémorisé) — palette et identité propres au jeu plutôt que l'esthétique par défaut d'une interface générée par IA.

## Architecture

```
server.ts                      Serveur Node custom : Next.js + Socket.io sur le même port
data/
  themes.csv                    Base de thèmes officiels — lue directement au démarrage du serveur
  missions.csv                  Base de missions (contraintes de genre musical) — même principe
src/
  app/
    page.tsx                   Accueil (créer/rejoindre)
    room/[code]/page.tsx       Routeur de phases — tout l'affichage du jeu
  lib/
    csv.ts                     Parseur CSV partagé (thèmes, missions)
    game/
      GameEngine.ts            Machine à états centralisée (LOBBY → ... → GAME_OVER)
      GameRules.ts             Points individuels, gagnant à la pluralité (cible unique)
      RoomStore.ts             Store en mémoire (rooms + sessions)
      themes.ts                Lit et parse data/themes.csv au démarrage du serveur (voir ci-dessous)
      missions.ts              Lit data/missions.csv, tire une mission (~1 tour sur 5) ou aucune
      types.ts                 Types SERVEUR uniquement (contiennent les rôles)
    music/
      MusicProvider.ts         Interface commune
      MockMusicProvider.ts     Fournisseur de test hors-ligne (fonctionne sans réseau)
      YouTubeProvider.ts       Fournisseur réel — oEmbed public, aucune clé requise
      MusicResolver.ts         Orchestration (détection du provider, résolution)
    socket/
      events.ts                Constantes d'événements + payloads
      server.ts                Câblage Socket.io ↔ GameEngine
      client.ts                Hook React côté client (useGameSocket)
  types/index.ts                Types PUBLICS partagés client/serveur
  components/
    ClueMedia.tsx                Lecteur d'indice — vidéo YouTube intégrée (lecture auto) ou piste de démo
    ChatPanel.tsx                Chat textuel flottant (écoute + discussion)
    ThemeToggle.tsx              Bascule thème clair/sombre
    ...                          Autres composants UI réutilisables
scripts/
  generate-mock-audio.mjs       Génère les pistes de secours synthétiques (postinstall)
  check-setup.mjs               Diagnostic convivial
  e2e-smoke-test.mjs            Tests d'intégration : parties complètes simulées via Socket.io
tests/                          Tests unitaires Vitest (règles, resolver, thèmes, missions, utils)
```

### Ajouter ou modifier des thèmes ou des missions

La base de thèmes vit dans `data/themes.csv` (colonnes : `id,theme_a,theme_b,difficulty,category,reversible`) et celle des missions dans `data/missions.csv` (colonnes : `id,label`) — **ce sont les seules sources de vérité**, lues et parsées directement au démarrage du serveur (`src/lib/game/themes.ts` et `missions.ts`), aucun fichier généré à tenir synchronisé.

Pour en ajouter ou en modifier : édite le CSV concerné (même directement sur GitHub, pas besoin d'être en local), commit, push. Le prochain déploiement (qui redémarre le serveur) relit le fichier tel quel — rien d'autre à faire, aucun script à lancer. Une ligne mal formée (id, thème ou libellé vide) est simplement ignorée avec un avertissement dans les logs du serveur plutôt que de faire planter le jeu.

## Décisions d'architecture assumées (et pourquoi)

- **Recoloration + thème clair/sombre sans toucher un seul composant.** Toutes les couleurs (`tailwind.config.ts`) référencent des variables CSS définies dans `globals.css` en triplets "R G B" (pour que les modificateurs d'opacité Tailwind comme `/40` marchent). Basculer `data-theme` sur `<html>` change donc l'identité visuelle ENTIÈRE et le mode clair/sombre sans renommer une seule classe `bg-ink-elevated`/`text-signal` dans les ~15 fichiers qui les utilisent — l'alternative (renommer tous les tokens) aurait multiplié le risque de régression pour un gain nul. Police serif pour les titres (`ui-serif` système, toujours pas de police téléchargée) plutôt qu'un sans-serif générique : c'est souvent ce détail-là, plus que la couleur, qui fait reconnaître un site "généré par IA".
- **Missions non vérifiées automatiquement — une règle de bonne foi, pas une contrainte technique.** Il n'existe aucune métadonnée de genre musical fiable sur un lien YouTube (l'API oEmbed publique ne renvoie que titre/auteur/miniature). Plutôt que de construire une détection de genre peu fiable (et probablement frustrante quand elle se trompe), la mission est juste affichée publiquement et laissée à l'honnêteté du groupe — comme la plupart des contraintes dans les party games façon Jackbox.
- **Chat textuel conservé dans l'état de la room, pas éphémère comme les réactions emoji.** Les réactions emoji sont un pur événement transitoire (`broadcastToRoom`, jamais stocké) parce que leur seule fonction est l'animation à l'instant T. Les messages de chat, eux, sont ajoutés à `room.chatMessages` et transitent par `broadcastState` : un joueur qui rejoint en retard (ou qui rouvre le panneau après l'avoir fermé) voit l'historique complet de la manche, pas seulement les messages arrivés pendant qu'il regardait. Remis à zéro à chaque nouvelle manche pour ne pas accumuler indéfiniment.
- **Rôle jamais révélé à son propriétaire (sauf Mr White, par construction).** Civil et infiltré reçoivent tous les deux exactement la même forme de message réseau (`{ playerId, theme }`) : rien — même en inspectant le trafic réseau — ne permet de deviner lequel des deux on est.
- **Auto-réparation du secret plutôt qu'un simple envoi et on espère.** Le thème est poussé une fois au début de chaque manche (`sendToPlayer`, ciblé sur le socket du joueur) — si ce message ne part pas (le joueur était momentanément déconnecté au mauvais moment, onglet en veille…), rien ne le renvoyait auparavant, laissant le joueur bloqué sur le thème de la manche précédente jusqu'à un F5 manuel. Chaque secret porte maintenant le numéro de sa manche (`PrivatePlayerSecret.roundNumber`) ; à chaque état reçu, le client compare ce numéro à celui de la manche en cours et redemande un secret frais (`role:request_secret`) en cas de décalage — silencieusement, sans action de l'utilisateur. Le secret en mémoire est aussi vidé au retour en lobby (après "Recommencer"/"Revanche") pour qu'un secret de manche 1 d'un match précédent ne soit jamais confondu avec celui de la manche 1 du nouveau match.
- **Vote en deux tours à cible unique, résultat combiné révélé à la fin seulement.** Avec exactement un infiltré et un Mr White optionnel, un seul suspect par bulletin suffit à chaque tour (pas de cases à cocher). Le second tour démarre immédiatement après le premier SANS jamais exposer son résultat au client entre les deux (`voteReveal` reste `null` côté état public tant que les deux tours ne sont pas clos) — sinon voir qui a été accusé au tour 1 orienterait le vote du tour 2. En cas d'égalité au sommet d'un tour, personne n'est désigné pour ce tour-là (pas de second tour de rattrapage, volontairement, pour éviter le n'importe quoi).
- **Points individuels, pas d'équipe.** Un infiltré ou Mr White démasqué gagne 0 point même si l'autre "méchant" survit à côté de lui — chacun est jugé sur sa propre survie, pas sur le sort collectif d'un camp.
- **Dernière chance de Mr White = flip de survie, pas de court-circuit du match.** Une réponse correcte ne met pas fin au match instantanément (ça casserait tout le système de score cible/manches enchaînées) : elle fait juste repasser Mr White du côté "survivant" pour le calcul des points de CETTE manche (`isAlive` remis à `true`, retiré de `lastEliminatedPlayerIds`) — il gagne donc ses +2 comme s'il n'avait jamais été pris. La comparaison de la réponse est normalisée (`normalizeGuess` — insensible à la casse, aux accents, aux espaces superflus) pour ne pas pénaliser une faute de frappe anodine ; l'hôte a aussi une validation manuelle en secours.
- **Base de thèmes lue directement depuis le CSV au démarrage, sans étape de build séparée.** Une version antérieure générait un fichier TypeScript à partir du CSV via un script à lancer manuellement — piège classique pour un non-développeur éditant le CSV depuis l'éditeur web de GitHub : le fichier généré restait périmé sans aucun message d'erreur. `themes.ts` parse maintenant `data/themes.csv` lui-même à l'import (mis en cache par Node pour la durée du process) ; éditer le CSV et redéployer suffit.
- **Rôles de la manche révélés à tous une fois le résultat connu (phase elimination).** La manche est terminée : plus de raison stratégique de cacher qui avait quel rôle. C'est aussi ce qui permet à chacun de comprendre pourquoi son score vient de changer, alors qu'il ne connaissait pas son propre rôle avant cet instant.
- **Fin de manche pilotée par des clics de l'hôte, pas des minuteurs.** Les écrans de révélation du vote et de résultat de manche n'avancent plus tout seuls après quelques secondes fixes (4 puis 6,5 secondes dans une version antérieure — trop rapide pour vraiment lire qui a été démasqué et pourquoi) : c'est maintenant l'hôte qui clique "Continuer" à son rythme (`host:force_next_phase`, réutilisé pour ces deux nouvelles étapes plutôt que d'inventer un événement dédié). Le thème de la manche (civil et infiltré) est rappelé sur ces deux écrans pour que tout le monde se souvienne de quoi il retournait.
- **Envoi automatique de l'indice musical.** Coller un lien et cliquer "Analyser" suffit : dès que la résolution réussit, l'indice est immédiatement diffusé à toute la room (pas d'étape de confirmation séparée), et la lecture démarre sans clic supplémentaire.
- **Lecture synchronisée (façon Watch2gether) via l'API JS YouTube plutôt que l'URL d'intégration seule.** La personne qui vient d'envoyer l'indice a de vrais contrôles YouTube (`YT.Player`, pas un simple `<iframe src>`) ; chaque lecture/pause de sa part est diffusée à toute la room via un événement Socket.io dédié (`clue:control`), et les autres clients rejouent l'action sur leur propre lecteur (`playVideo()`/`pauseVideo()`/`seekTo()`), avec un petit rattrapage de délai réseau basé sur l'horodatage serveur. Les spectateurs ont un lecteur verrouillé (pas de contrôles, pas d'interaction) pour éviter que quelqu'un desynchronise tout le monde par erreur — **sauf le volume**, qui n'est jamais diffusé et reste réglable localement par tout le monde en permanence (`setVolume()`/`mute()`, mémorisé en `localStorage`, appliqué au montage de chaque nouveau lecteur) : couper le son ou le remonter pour soi-même ne doit jamais dépendre du présentateur. Un bouton "Passer" (réservé au présentateur) permet aussi de passer directement à la suite en cas de bug ou de musique ratée, sans attendre le minuteur. Limite assumée : si l'autoplay avec son est bloqué par le navigateur d'un spectateur (ça arrive, un événement réseau n'est pas un vrai clic aux yeux du navigateur), un bouton "Rejoindre la lecture" apparaît — un clic suffit à débloquer. La réécoute libre pendant la discussion n'est PAS synchronisée (chacun rembobine ce qu'il veut individuellement) : la synchro ne s'applique qu'à l'écran "tout le monde écoute ensemble".
- **Réactions emoji éphémères, liste fermée validée aussi côté serveur.** N'importe quel joueur (pas seulement le présentateur) peut envoyer un emoji parmi une liste fixe (`src/lib/reactions.ts`, partagée entre le bouton client et la validation serveur pour ne jamais diverger) pendant `clue_playback` uniquement. Le serveur ne fait que relayer l'événement à toute la room (`broadcastToRoom`, le même mécanisme que watch2gether) — rien n'est stocké dans l'état de la room, ce n'est pas une donnée de jeu mais un pur événement transitoire. Volontairement pas de texte libre : évite toute modération à prévoir, et garde l'esprit "réaction instantanée façon Twitch" plutôt qu'un chat. Chaque réaction reçue est animée côté client (montée + disparition, position/rotation aléatoires) puis retirée de l'état local une fois son animation terminée.
- **La reconnexion automatique reste toujours silencieuse.** Le client tente de se rattacher à sa session à chaque connexion (y compris la toute première visite, où il n'y a évidemment aucune session à retrouver) — le serveur ne renvoie donc jamais d'erreur visible pour un échec de cette reconnexion en tâche de fond ; ce n'en est pas une pour l'utilisateur.
- **YouTube plutôt que Spotify/Apple Music.** Spotify ne garantit plus d'extrait audio pour tous les morceaux depuis fin 2024, et Apple Music demande un compte développeur payant (99 $/an). YouTube n'a ni l'un ni l'autre problème : le lecteur officiel embarqué (`youtube.com/embed/ID`) et l'endpoint public `oEmbed` (métadonnées) ne demandent aucune authentification. L'extrait diffusé est plafonné (60s par défaut, réglable par l'hôte) via les paramètres `start`/`end` de l'URL d'intégration.
- **Store en mémoire plutôt que Postgres/Supabase.** Une room de party game est éphémère (quelques dizaines de minutes) ; un `Map()` en process donne le temps réel le plus simple à développer et opérer pour un MVP. Limite explicite : un redémarrage du process perd les parties en cours, et ça ne scale pas horizontalement sans ajouter une couche partagée (Redis, ou brancher Postgres/Supabase derrière `RoomStore` — l'interface est déjà isolée pour ça).
- **Serveur Node custom plutôt que Vercel serverless.** Le temps réel authoritative (Socket.io + état en mémoire) a besoin d'un process qui vit en continu ; les fonctions serverless de Vercel sont stateless et de courte durée. D'où Render/Railway plutôt que Vercel dans le guide de déploiement.
- **Polices système plutôt que Google Fonts.** `next/font/google` téléchargerait les polices à la compilation — une dépendance réseau fragile au moment du build (échoue sur un réseau restreint/hors-ligne). Pile de polices système à la place, zéro appel réseau requis pour builder.

## Sécurité des vulnérabilités npm connues

`npm audit` signale des vulnérabilités restantes toutes liées au fait que Next.js est en version 14.x (la 16.x les corrige mais introduit des changements non-rétrocompatibles, hors budget de cette version). Pour un jeu auto-hébergé entre amis, le risque réel est faible ; une migration vers Next 16 est un axe d'amélioration futur si le projet grandit. Les vulnérabilités corrigeables sans breaking change (socket.io, nanoid, postcss, esbuild/vitest) ont déjà été mises à jour.

## Tests

- `npm test` — points individuels par rôle/survie, résolution à la pluralité (cible unique), résolution mock, extraction d'ID YouTube, intégrité de la base de thèmes ET de missions (pas de doublon, pas de vide, plusieurs catégories) lues en direct depuis leurs CSV, probabilité de tirage d'une mission (largement minoritaire, jamais nulle).
- `node scripts/e2e-smoke-test.mjs` (serveur démarré en parallèle) — 11 scénarios indépendants via Socket.io :
  - un match complet (secret de rôle vérifié indiscernable, un seul infiltré, vote à cible unique, élimination, **score individuel vérifié explicitement — pas d'équipe**, fin de match) ;
  - **les deux tours de vote avec Mr White activé — vérifie explicitement que rien n'est révélé entre les deux tours, puis que la révélation combinée est correcte** ;
  - l'enchaînement automatique d'une manche à l'autre sans repasser par le lobby ;
  - **la dernière chance de Mr White, dans les deux cas : mauvaise réponse (reste éliminé, 0 point) et bonne réponse même avec casse/accents/espaces différents (compte comme survivant, gagne ses points)** ;
  - **le contrôle de lecture watch2gether (autorisation refusée à un non-présentateur, diffusion identique à tout le monde) et le bouton "Passer" (réservé au présentateur, avance quasi immédiatement)** ;
  - **les réactions emoji (n'importe quel joueur peut réagir, mais seulement pendant l'écoute ; un emoji hors liste fermée est refusé ; la réaction est diffusée identique à tout le monde)** ;
  - **la reconnexion silencieuse au premier chargement (plus d'erreur "Session inconnue")** ;
  - **l'auto-réparation du thème : une redemande explicite du secret renvoie bien celui de la manche en cours, jamais un ancien, y compris après un changement de manche** ;
  - **le chat textuel (ouvert seulement pendant l'écoute et la discussion, refusé en lobby/vote, diffusé à tout le monde) et le champ mission bien exposé dans l'état public** ;
  - **le bouton "Recommencer" utilisable en cours de partie, pas seulement une fois le match terminé — réservé à l'hôte** ;
  - le bouton "Quitter" en lobby.

## Prochaines étapes possibles (hors MVP)

Recherche musicale intégrée (au lieu de coller un lien), comptes persistants, historique/statistiques entre matchs, migration vers Postgres/Supabase pour la persistance, migration Next 16.
