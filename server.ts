// Serveur Node custom.
//
// Pourquoi pas juste `next dev`/Vercel serverless (comme suggéré en section
// 42) ? Le temps réel authoritative de ce jeu (section 41) a besoin d'un
// process Node qui vit en continu et garde l'état des rooms en mémoire
// (RoomStore) ainsi que des connexions WebSocket ouvertes. Les fonctions
// serverless de Vercel sont conçues pour être stateless et de courte durée :
// elles ne peuvent pas tenir une connexion Socket.io ouverte ni partager un
// Map() en mémoire entre deux requêtes. On héberge donc Next.js et Socket.io
// ensemble dans un seul serveur Node classique (Railway, Render, Fly.io, un
// VPS...). Voir README > "Déploiement" pour le détail et l'alternative
// Supabase Realtime si tu veux rester 100% Vercel plus tard.
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { attachSocketServer } from "./src/lib/socket/server";

const port = Number(process.env.PORT) || 3000;
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: process.env.CLIENT_ORIGIN || "*" }
  });

  attachSocketServer(io);

  httpServer.listen(port, () => {
    console.log(`\n🎵 Music Undercover prêt sur http://localhost:${port}`);
    console.log(dev ? "   (mode dev — colle un vrai lien YouTube, aucune clé requise)\n" : "\n");
  });
});
