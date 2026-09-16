# Music Undercover

Party game social-deduction inspiré d'Undercover : au lieu d'un mot, l'indice de chaque joueur est une **musique** (lien YouTube). Titre et artiste sont visibles par tous dès l'envoi — la découverte musicale fait partie du jeu, pas de cachette d'indices. Ce qui reste secret, c'est le **rôle** : personne — ni les civils, ni l'infiltré — ne sait jamais qui est qui. Une partie = un thème, un seul infiltré, une seule manche de vote.

**Tu n'es pas développeur ?** Lis plutôt [`GUIDE-DEMARRAGE.md`](./GUIDE-DEMARRAGE.md) — ce README est la référence technique.

## Démarrage rapide

```bash
npm install          # installe les dépendances + génère les pistes de secours (postinstall)
npm run dev           # démarre le serveur (Next.js + Socket.io) sur http://localhost:3000
npm run check-setup   # diagnostic (Node, pistes de secours)
npm test               # tests unitaires (Vitest)
node scripts/e2e-smoke-test.mjs   # test end-to-end (nécessite le serveur démarré à côté)
```

Fonctionne immédiatement avec de vrais liens **YouTube** — aucune clé API n'est nécessaire (métadonnées via l'endpoint public oEmbed, lecture via le lecteur officiel embarqué). Un mode démo hors-ligne (`mock://demo-01` etc.) reste disponible pour tester sans réseau.

## Architecture

```
server.ts                      Serveur Node custom : Next.js + Socket.io sur le même port
src/
  app/
    page.tsx                   Accueil (créer/rejoindre)
    room/[code]/page.tsx       Routeur de phases — tout l'affichage du jeu
  lib/
    game/
      GameEngine.ts            Machine à états centralisée (LOBBY → ... → GAME_OVER)
      GameRules.ts             Conditions de victoire, résolution d'égalité
      RoomStore.ts             Store en mémoire (rooms + sessions)
      themes.ts                32 paires de thèmes officiels
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
    ClueMedia.tsx                Lecteur d'indice — vidéo YouTube intégrée ou piste de démo
    ...                          Autres composants UI réutilisables
scripts/
  generate-mock-audio.mjs       Génère les pistes de secours synthétiques (postinstall)
  check-setup.mjs               Diagnostic convivial
  e2e-smoke-test.mjs            Test d'intégration : partie complète simulée via Socket.io
tests/                          Tests unitaires Vitest (règles, resolver, normalisation)
```

## Décisions d'architecture assumées (et pourquoi)

- **Un seul infiltré, une seule manche de vote.** Une partie = un thème, un infiltré, tout le monde envoie sa musique une fois, discussion, vote, résultat, fin de partie. On ne rejoue pas une manche supplémentaire sur le même thème (répétitif) : "Rejouer" démarre une toute nouvelle partie avec thème et rôles neufs. Pas de Mr White ni de troisième rôle — retiré du jeu.
- **Rôle jamais révélé à son propriétaire.** Civil et infiltré reçoivent tous les deux exactement la même forme de message réseau (`{ playerId, theme }`) : rien — même en inspectant le trafic réseau — ne permet de deviner lequel des deux on est. À l'inverse, dès qu'un indice musical est envoyé, titre/artiste/vignette sont diffusés à toute la room : il n'y a pas de distinction "métadonnées publiques vs privées" pour la musique, `MusicClue` est un type entièrement public.
- **Envoi automatique de l'indice.** Coller un lien et cliquer "Analyser" suffit : dès que la résolution réussit, l'indice est immédiatement diffusé à toute la room (pas d'étape de confirmation séparée).
- **YouTube plutôt que Spotify/Apple Music.** Spotify ne garantit plus d'extrait audio pour tous les morceaux depuis fin 2024, et Apple Music demande un compte développeur payant (99 $/an). YouTube n'a ni l'un ni l'autre problème : le lecteur officiel embarqué (`youtube.com/embed/ID`) et l'endpoint public `oEmbed` (métadonnées) ne demandent aucune authentification. L'extrait diffusé est plafonné (60s par défaut, réglable par l'hôte) via les paramètres `start`/`end` de l'URL d'intégration.
- **Store en mémoire plutôt que Postgres/Supabase.** Une room de party game est éphémère (quelques dizaines de minutes) ; un `Map()` en process donne le temps réel le plus simple à développer et opérer pour un MVP. Limite explicite : un redémarrage du process perd les parties en cours, et ça ne scale pas horizontalement sans ajouter une couche partagée (Redis, ou brancher Postgres/Supabase derrière `RoomStore` — l'interface est déjà isolée pour ça).
- **Serveur Node custom plutôt que Vercel serverless.** Le temps réel authoritative (Socket.io + état en mémoire) a besoin d'un process qui vit en continu ; les fonctions serverless de Vercel sont stateless et de courte durée. D'où Render/Railway plutôt que Vercel dans le guide de déploiement.
- **Polices système plutôt que Google Fonts.** `next/font/google` téléchargerait les polices à la compilation — une dépendance réseau fragile au moment du build (échoue sur un réseau restreint/hors-ligne). Pile de polices système à la place, zéro appel réseau requis pour builder.

## Sécurité des vulnérabilités npm connues

`npm audit` signale des vulnérabilités restantes toutes liées au fait que Next.js est en version 14.x (la 16.x les corrige mais introduit des changements non-rétrocompatibles, hors budget de cette version). Pour un jeu auto-hébergé entre amis, le risque réel est faible ; une migration vers Next 16 est un axe d'amélioration futur si le projet grandit. Les vulnérabilités corrigeables sans breaking change (socket.io, nanoid, postcss, esbuild/vitest) ont déjà été mises à jour.

## Tests

- `npm test` — résolution de la partie (victoire civils/infiltré), résolution d'égalité, résolution mock, extraction d'ID YouTube.
- `node scripts/e2e-smoke-test.mjs` (serveur démarré en parallèle) — simule 3 joueurs réels via Socket.io sur une partie complète : création de salle, **secret de rôle vérifié indiscernable entre civil et infiltré**, tours de musique envoyés automatiquement, **titre/artiste vérifiés visibles par tous dès l'envoi**, vote, élimination avec révélation de rôle, victoire, révélation finale.

## Prochaines étapes possibles (hors MVP)

Recherche musicale intégrée (au lieu de coller un lien), comptes persistants, plusieurs infiltrés, historique/statistiques entre parties, migration vers Postgres/Supabase pour la persistance, migration Next 16.
