# Music Undercover — Guide de démarrage (zéro connaissance requise)

Ce guide part du principe que tu n'as **jamais programmé**. Suis les parties dans l'ordre. Chaque étape te dit : sur quel site aller, où cliquer, quoi créer, quelle valeur récupérer, où la coller, quelle commande lancer, et comment vérifier que ça a marché.

**Bonne nouvelle : le jeu utilise YouTube pour les musiques, et YouTube ne demande aucune clé API.** Contrairement aux versions précédentes de ce projet, il n'y a plus de compte Spotify/Apple Music à créer — dès la Partie 2, de vrais liens YouTube fonctionnent directement.

```
Partie 1 — Installer les outils (une seule fois)
Partie 2 — Faire tourner le jeu chez toi et y jouer entre amis en Wi-Fi     ✅ suffisant pour tester, avec de vrais liens YouTube
Partie 3 — Mettre le site en ligne, accessible à tout le monde             ✅ pour jouer à distance
Partie 4 — (Optionnel) Nom de domaine personnalisé
Partie 5 — Dépannage
```

---

## Partie 1 — Installer les outils de base

Tu as besoin d'un seul programme : **Node.js**.

1. **Sur quel site aller** : https://nodejs.org
2. **Où cliquer** : le gros bouton qui propose la version **"LTS"** (pas "Current"). Le site détecte normalement ton système (Windows/Mac) tout seul.
3. **Quoi faire** : lance le fichier téléchargé et clique "Suivant" partout (installation par défaut, rien à changer).
4. **Comment vérifier que ça fonctionne** :
   - **Windows** : appuie sur la touche Windows, tape `PowerShell`, ouvre-le.
   - **Mac** : appuie sur `Cmd + Espace`, tape `Terminal`, ouvre-le.
   - Tape cette commande et appuie sur Entrée :
     ```
     node -v
     ```
   - Si tu vois s'afficher quelque chose comme `v20.x.x` ou `v22.x.x`, c'est bon. Si tu vois "commande introuvable", redémarre ton ordinateur et réessaie.

C'est la seule installation obligatoire. Garde cette fenêtre "Terminal"/"PowerShell" — tu vas t'en resservir pour coller des commandes (jamais les inventer toi-même, toujours celles données ici).

---

## Partie 2 — Faire tourner le jeu chez toi

### 2.1 — Récupérer les fichiers du projet

1. Télécharge le fichier `.zip` que je t'ai fourni.
2. Décompresse-le (clic droit → "Extraire tout..." sur Windows, double-clic sur Mac) dans un endroit simple, par exemple directement sur le Bureau. Tu obtiens un dossier `music-undercover`.

### 2.2 — Ouvrir un terminal dans ce dossier

- **Windows** : ouvre le dossier `music-undercover` dans l'explorateur de fichiers, clique dans la barre d'adresse en haut (là où c'est écrit le chemin du dossier), tape `powershell` et appuie sur Entrée. Un terminal s'ouvre, déjà positionné dans le bon dossier.
- **Mac** : ouvre le dossier dans le Finder, clic droit dessus → "Nouveau terminal au dossier" (ou ouvre Terminal puis tape `cd ` suivi d'un glisser-déposer du dossier dans la fenêtre, puis Entrée).

### 2.3 — Installer et lancer (deux commandes, entièrement automatique)

Colle cette commande puis Entrée :

```
npm install
```

Attends qu'elle se termine (30 secondes à 2 minutes selon ta connexion). Elle télécharge les briques du projet et génère quelques pistes audio de secours pour le mode démo hors-ligne.

Puis colle :

```
npm run dev
```

**Comment vérifier que ça fonctionne** : le terminal doit afficher `Music Undercover prêt sur http://localhost:3000`. Ouvre ton navigateur (Chrome, Safari...) et va sur **http://localhost:3000** — tu dois voir la page d'accueil du jeu. Crée une partie et colle un vrai lien YouTube à ton tour : ça doit marcher immédiatement, sans rien configurer.

Pour tout arrêter plus tard : reviens dans le terminal, appuie sur `Ctrl + C`.

> 💡 À chaque fois que tu veux rejouer plus tard, il te suffit de refaire l'étape 2.2 puis `npm run dev` (plus besoin de refaire `npm install`, sauf si je t'envoie une nouvelle version du projet).

### 2.4 — Vérifier que TOUT fonctionne vraiment (optionnel mais recommandé)

Dans le même terminal (ouvres-en un deuxième avec les mêmes étapes que 2.2 si `npm run dev` tourne déjà dans le premier), tape :

```
npm run check-setup
```

Ça t'affiche un petit diagnostic en français : version de Node, pistes de secours présentes ou non.

### 2.5 — Jouer entre amis, dans la même pièce, sans rien déployer

Tant que vous êtes sur le **même Wi-Fi**, vous pouvez déjà jouer à plusieurs sans rien mettre en ligne :

1. Sur l'ordinateur qui fait tourner `npm run dev`, trouve son adresse IP locale :
   - **Windows** : dans PowerShell, tape `ipconfig`, cherche la ligne "Adresse IPv4" (ex. `192.168.1.23`).
   - **Mac** : Réglages Système → Wi-Fi → clique sur le réseau connecté → l'adresse IP s'affiche (ex. `192.168.1.23`).
2. Sur les téléphones/ordinateurs des amis connectés au **même Wi-Fi**, ouvre le navigateur et va sur `http://192.168.1.23:3000` (remplace par la vraie adresse trouvée à l'étape précédente).
3. **Vérification** : si la page d'accueil du jeu s'affiche sur le téléphone d'un ami, c'est gagné — vous pouvez créer une partie et jouer avec de vrais liens YouTube dès maintenant.

---

## Partie 3 — Mettre le site en ligne pour de vrai

Jusqu'ici, le jeu ne tourne que sur ton ordinateur. Pour que tes amis y jouent **de n'importe où** (pas seulement sur ton Wi-Fi), il faut l'héberger. On utilise **Render**, qui propose un vrai palier gratuit (aucune carte bancaire requise) et qui gère bien le temps réel dont ce jeu a besoin.

> ℹ️ Sur le plan gratuit, le site "s'endort" après 15 minutes sans visite, et met 30-50 secondes à se réveiller au prochain visiteur — parfait pour un jeu entre amis occasionnel. Si ça te gêne, Render propose un plan payant "toujours actif" à partir de 7 $/mois (à activer plus tard, uniquement si tu veux, dans les réglages du service).

### 3.1 — Créer un compte GitHub (dépôt de code, gratuit)

1. **Sur quel site aller** : https://github.com
2. **Où cliquer** : "Sign up" en haut à droite.
3. **Quoi créer** : un compte (email, mot de passe, nom d'utilisateur).
4. **Comment vérifier** : tu arrives sur ton tableau de bord GitHub après confirmation de ton email.

### 3.2 — Installer GitHub Desktop (pour envoyer le projet sans taper de commandes Git)

1. **Sur quel site aller** : https://desktop.github.com
2. **Où cliquer** : le bouton de téléchargement pour ton système.
3. **Quoi faire** : installe-le, ouvre-le, clique **"Sign in to GitHub.com"** et connecte-toi avec le compte créé en 3.1.

### 3.3 — Envoyer le projet sur GitHub

1. Dans GitHub Desktop : menu **File** → **Add local repository...**
2. Clique **"Choose..."** et sélectionne ton dossier `music-undercover`.
3. GitHub Desktop va dire que ce dossier n'est pas encore un dépôt Git → clique **"create a repository"** (lien bleu proposé).
4. Laisse les options par défaut, clique **"Create Repository"**.
5. En bas à gauche, un résumé des fichiers apparaît → clique **"Commit to main"**.
6. En haut, clique **"Publish repository"**.
   - **Décoche** la case "Keep this code private" seulement si ça ne te dérange pas que le code soit public. Sinon laisse-la cochée, c'est gratuit aussi chez GitHub.
   - Clique **"Publish Repository"**.
7. **Comment vérifier que ça fonctionne** : va sur https://github.com/TON_NOM_UTILISATEUR — tu dois voir un dépôt `music-undercover` avec tous les fichiers du projet.

### 3.4 — Déployer sur Render

1. **Sur quel site aller** : https://render.com
2. **Où cliquer** : "Get Started" → connecte-toi avec **"GitHub"** (le plus simple, ça relie directement les deux comptes) → autorise l'accès quand GitHub te le demande.
3. **Quoi créer** : sur le tableau de bord Render, clique **"New +"** en haut à droite → **"Blueprint"**.
   - Sélectionne ton dépôt `music-undercover` dans la liste (si tu ne le vois pas, clique "Configure account" et autorise Render à voir ce dépôt).
   - Render détecte automatiquement le fichier `render.yaml` déjà présent dans le projet et te propose de créer le service tout seul. Aucune variable secrète à remplir — le jeu n'en a pas besoin.
   - Clique **"Apply"** / **"Deploy"**.
4. Render installe et démarre le site tout seul (regarde les logs défiler — ça prend 2 à 5 minutes la première fois).
5. **Quelle valeur récupérer** : une fois le déploiement terminé (statut **"Live"** en vert), Render affiche l'URL publique de ton site en haut de la page du service, du genre `https://music-undercover.onrender.com`.
6. **Rien à coller nulle part** ni de commande à lancer ici — c'est justement l'intérêt du fichier `render.yaml` déjà présent dans le projet : Render s'en sert pour tout configurer automatiquement (build, démarrage, port).
7. **Comment vérifier que ça fonctionne** : ouvre l'URL `https://xxxxx.onrender.com` dans ton navigateur — tu dois voir la page d'accueil du jeu. Partage ce lien à tes amis, où qu'ils soient, et testez une vraie partie à plusieurs avec de vrais liens YouTube.

> Si tu préfères ne pas utiliser GitHub du tout, une alternative existe : l'hébergeur **Railway** (https://railway.app) permet de déployer directement depuis ton dossier avec sa "CLI" (un outil en ligne de commande), sans passer par un dépôt Git — mais Railway est payant dès le départ (~5 $/mois, pas de palier gratuit permanent). Le fichier `railway.json` déjà présent dans le projet est prêt pour ça si tu choisis cette option ; demande-moi si tu veux le détail des commandes.

---

## Partie 4 — (Optionnel) Nom de domaine personnalisé

Si tu veux que le jeu réponde à `www.mon-jeu.fr` plutôt qu'à `xxxxx.onrender.com` :

1. **Sur quel site aller** : un registrar de domaine, ex. https://www.ovh.com ou https://www.namecheap.com.
2. **Où cliquer** : recherche le nom de domaine voulu, ajoute-le au panier, paye (en général 8 à 15 €/an).
3. **Quoi créer** : rien de plus à ce stade, juste posséder le domaine.
4. **Quelle valeur récupérer** : retourne sur Render → ton service → onglet **"Settings"** → section **"Custom Domains"** → clique **"Add Custom Domain"**, tape ton domaine. Render t'affiche alors une valeur technique à copier (un enregistrement **CNAME**, du genre `xxxxx.onrender.com`).
5. **Où la coller** : va dans l'interface de gestion DNS de ton registrar (OVH/Namecheap...), section "Zone DNS" ou "DNS Management", ajoute un enregistrement de type **CNAME** avec la valeur donnée par Render.
6. **Rien à commander** ici, tout se fait par formulaires web.
7. **Comment vérifier que ça fonctionne** : ça peut prendre de quelques minutes à quelques heures (propagation DNS). Render affichera "Verified ✅" à côté du domaine une fois que c'est actif. Teste ensuite `https://www.mon-jeu.fr` dans un navigateur.

---

## Partie 5 — Dépannage rapide

| Problème | Solution |
|---|---|
| `npm install` échoue avec plein de texte rouge | Vérifie `node -v` (il faut 18 ou plus). Sinon, réinstalle Node.js (Partie 1). |
| La page ne s'affiche pas sur http://localhost:3000 | Vérifie que le terminal affiche bien "prêt sur http://localhost:3000" et qu'aucune erreur rouge n'est apparue juste avant. |
| Un ami sur le même Wi-Fi n'arrive pas à se connecter | Vérifie que vous êtes vraiment sur le **même réseau Wi-Fi** (pas l'un en 4G). Certains routeurs bloquent les connexions entre appareils ("isolation AP") — essaie de la désactiver dans les réglages du routeur, ou passe directement à la Partie 3 (mise en ligne). |
| "Le propriétaire de cette vidéo a désactivé la lecture intégrée" | Normal pour certaines vidéos YouTube (leur propriétaire a bloqué l'intégration ailleurs que sur YouTube). Essaie une autre vidéo. |
| "Vidéo introuvable" | Le lien est invalide, ou la vidéo est privée/supprimée. Vérifie le lien collé. |
| Le site Render met du temps à s'afficher la première fois | Normal sur le plan gratuit (le service "dormait"). Patiente 30-50 secondes, ça ne se reproduit pas tant que le site reste visité. |
| Je veux tout remettre à zéro en local | Supprime le dossier `node_modules` et le fichier `package-lock.json`, relance `npm install`. |

Si un problème persiste, dis-moi exactement le message d'erreur affiché (copie-colle le texte du terminal) — je pourrai te dire précisément quoi faire.
