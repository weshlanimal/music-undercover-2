// Diagnostic convivial pour quelqu'un qui n'est pas développeur : vérifie
// Node.js et les pistes de secours du mode démo hors-ligne.
// Usage : npm run check-setup

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("\n🎧 Music Undercover — diagnostic\n" + "─".repeat(40));

// 1) Version de Node
const [major] = process.versions.node.split(".").map(Number);
if (major >= 18) {
  console.log(`✅ Node.js ${process.version} (OK, il faut 18 ou plus)`);
} else {
  console.log(`❌ Node.js ${process.version} — il faut au moins la version 18. Va sur https://nodejs.org et installe la version "LTS".`);
}

// 2) Fichiers audio de démo (mode hors-ligne)
const mockAudioDir = join(root, "public", "mock-audio");
if (existsSync(mockAudioDir)) {
  console.log("✅ Pistes de secours présentes (mode démo hors-ligne prêt à l'emploi)");
} else {
  console.log('❌ Pistes de secours manquantes — lance "npm install" (elles sont générées automatiquement), ou "node scripts/generate-mock-audio.mjs".');
}

console.log("ℹ️  YouTube ne demande aucune clé API : de vrais liens fonctionnent directement, rien à configurer.");

console.log("─".repeat(40));
console.log("Pour jouer dès maintenant : npm run dev, puis ouvre http://localhost:3000\n");
