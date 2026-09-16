# Music Undercover

Party game social-deduction inspiré d'Undercover : au lieu d'un mot, l'indice de chaque joueur est une **musique** (lien YouTube). Titre et artiste sont visibles par tous dès l'envoi — la découverte musicale fait partie du jeu, pas de cachette d'indices. Ce qui reste secret, c'est le **rôle** : personne ne sait jamais qui est civil, infiltré, ou Mr White.

Un **match** enchaîne plusieurs **manches** (thème neuf, rôles neufs à chaque fois, tout le monde revit) jusqu'à ce qu'un·e joueur·se atteigne le score cible fixé par l'hôte. Chaque manche : tour de musique, discussion (5 min max), vote à choix multiples, résultat, points.

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

- **Rôles configurables par l'hôte** : nombre d'infiltrés (1 par défaut, ajustable), Mr White activable (aucun thème du tout — doit bluffer). Le reste des joueurs est civil.
- **Personne ne connaît son propre rôle**, à part Mr White qui le devine forcément puisqu'il ne reçoit aucun thème (impossible de cacher une absence totale d'information à celui qui la reçoit). Civil et infiltré reçoivent exactement le même type de message — un thème, sans étiquette.
- **Une manche = un thème, un tour de musique par joueur, une discussion (5 min max, tout le monde doit cliquer "Passer au vote"), un vote.**
- **Le vote est à choix multiples** : chaque joueur coche autant de suspects qu'il veut ; quiconque reçoit la majorité absolue des votes est éliminé — plusieurs éliminations possibles en une seule salve, adapté à un nombre variable d'infiltrés/Mr White.
- **Points strictement individuels** : infiltré(s) et Mr White ne forment PAS une équipe entre eux. Chaque joueur qui survit au vote gagne des points selon son propre rôle (civil : +1, infiltré ou Mr White : +2) ; un joueur éliminé gagne 0, peu importe le sort des autres joueurs de son "camp".
- **Score cible configurable** (3 par défaut) : dès qu'un·e joueur·se l'atteint, le match se termine et le classement final s'affiche. Sinon, une nouvelle manche démarre automatiquement (thème et rôles neufs).
- **Jusqu'à 16 joueurs** par salle.
- **500 thèmes officiels**, répartis en 19 catégories (voir `data/themes.csv`).

## Architecture

```
server.ts                      Serveur Node custom : Next.js + Socket.io sur le même port
data/
  themes.csv                    Source éditable des 500 thèmes officiels
src/
  app/
    page.tsx                   Accueil (créer/rejoindre)
    room/[code]/page.tsx       Routeur de phases — tout l'affichage du jeu
  lib/
    game/
      GameEngine.ts            Machine à états centralisée (LOBBY → ... → GAME_OVER)
      GameRules.ts             Points individuels, résolution de majorité au vote
      RoomStore.ts             Store en mémoire (rooms + sessions)
      themes.ts / themes-data.ts   500 thèmes officiels (themes-data.ts est généré, voir ci-dessous)
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
    ...                          Autres composants UI réutilisables
scripts/
  generate-mock-audio.mjs       Génère les pistes de secours synthétiques (postinstall)
  build-themes.mjs              Régénère themes-data.ts depuis data/themes.csv
  check-setup.mjs               Diagnostic convivial
  e2e-smoke-test.mjs            Tests d'intégration : parties complètes simulées via Socket.io
tests/                          Tests unitaires Vitest (règles, resolver, thèmes)
```

### Ajouter ou modifier des thèmes

La base de 500 thèmes vit dans `data/themes.csv` (colonnes : `id,theme_a,theme_b,difficulty,category,reversible`). Pour en ajouter :

1. Édite `data/themes.csv` (ajoute des lignes, un id unique par ligne).
2. Régénère le fichier de données :
   ```bash
   node scripts/build-themes.mjs
   ```
   Ça réécrit `src/lib/game/themes-data.ts` — ne modifie jamais ce fichier à la main, il est écrasé à chaque régénération.

## Décisions d'architecture assumées (et pourquoi)

- **Rôle jamais révélé à son propriétaire (sauf Mr White, par construction).** Civil et infiltré reçoivent tous les deux exactement la même forme de message réseau (`{ playerId, theme }`) : rien — même en inspectant le trafic réseau — ne permet de deviner lequel des deux on est.
- **Vote à choix multiples + majorité absolue plutôt qu'un vote à égalité/second tour.** Avec un nombre configurable d'infiltrés et Mr White, une seule cible par vote ne suffit plus à démasquer tout le monde en une manche. Le seuil de majorité absolue (`⌊vivants/2⌋ + 1`) permet d'éliminer zéro, une, ou plusieurs personnes en une seule salve, sans second tour de rattrapage.
- **Points individuels, pas d'équipe.** Un infiltré ou un Mr White démasqué gagne 0 point même si un autre "méchant" survit à côté de lui — chacun est jugé sur sa propre survie, pas sur le sort collectif d'un camp.
- **Rôles de la manche révélés à tous une fois le résultat connu (round_result).** La manche est terminée : plus de raison stratégique de cacher qui avait quel rôle. C'est aussi ce qui permet à chacun de comprendre pourquoi son score vient de changer, alors qu'il ne connaissait pas son propre rôle avant cet instant.
- **Envoi automatique de l'indice musical.** Coller un lien et cliquer "Analyser" suffit : dès que la résolution réussit, l'indice est immédiatement diffusé à toute la room (pas d'étape de confirmation séparée), et la lecture démarre sans clic supplémentaire.
- **YouTube plutôt que Spotify/Apple Music.** Spotify ne garantit plus d'extrait audio pour tous les morceaux depuis fin 2024, et Apple Music demande un compte développeur payant (99 $/an). YouTube n'a ni l'un ni l'autre problème : le lecteur officiel embarqué (`youtube.com/embed/ID`) et l'endpoint public `oEmbed` (métadonnées) ne demandent aucune authentification. L'extrait diffusé est plafonné (60s par défaut, réglable par l'hôte) via les paramètres `start`/`end` de l'URL d'intégration.
- **Store en mémoire plutôt que Postgres/Supabase.** Une room de party game est éphémère (quelques dizaines de minutes) ; un `Map()` en process donne le temps réel le plus simple à développer et opérer pour un MVP. Limite explicite : un redémarrage du process perd les parties en cours, et ça ne scale pas horizontalement sans ajouter une couche partagée (Redis, ou brancher Postgres/Supabase derrière `RoomStore` — l'interface est déjà isolée pour ça).
- **Serveur Node custom plutôt que Vercel serverless.** Le temps réel authoritative (Socket.io + état en mémoire) a besoin d'un process qui vit en continu ; les fonctions serverless de Vercel sont stateless et de courte durée. D'où Render/Railway plutôt que Vercel dans le guide de déploiement.
- **Polices système plutôt que Google Fonts.** `next/font/google` téléchargerait les polices à la compilation — une dépendance réseau fragile au moment du build (échoue sur un réseau restreint/hors-ligne). Pile de polices système à la place, zéro appel réseau requis pour builder.

## Sécurité des vulnérabilités npm connues

`npm audit` signale des vulnérabilités restantes toutes liées au fait que Next.js est en version 14.x (la 16.x les corrige mais introduit des changements non-rétrocompatibles, hors budget de cette version). Pour un jeu auto-hébergé entre amis, le risque réel est faible ; une migration vers Next 16 est un axe d'amélioration futur si le projet grandit. Les vulnérabilités corrigeables sans breaking change (socket.io, nanoid, postcss, esbuild/vitest) ont déjà été mises à jour.

## Tests

- `npm test` — points individuels par rôle/survie, résolution de majorité au vote, résolution mock, extraction d'ID YouTube, intégrité de la base de 500 thèmes (pas de doublon, pas de thème vide).
- `node scripts/e2e-smoke-test.mjs` (serveur démarré en parallèle) — 4 scénarios indépendants via Socket.io : un match complet (rôles configurables, secret de rôle vérifié indiscernable, vote multiple, élimination, **score individuel vérifié explicitement — pas d'équipe**, fin de match), l'enchaînement automatique d'une manche à l'autre sans repasser par le lobby, la distribution correcte de Mr White (aucun thème), et le bouton "Quitter" en lobby.

## Prochaines étapes possibles (hors MVP)

Recherche musicale intégrée (au lieu de coller un lien), comptes persistants, historique/statistiques entre matchs, migration vers Postgres/Supabase pour la persistance, migration Next 16.
