import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ThemePair } from "@/types";

// ---------------------------------------------------------------------------
// La base de thèmes officiels est lue directement depuis data/themes.csv au
// démarrage du serveur — PAS d'étape de compilation séparée. C'est un choix
// délibéré : la version précédente générait un fichier TypeScript à partir
// du CSV via un script à lancer manuellement, et il était trop facile
// d'éditer le CSV (notamment via l'éditeur web de GitHub) sans relancer ce
// script, ce qui laissait le jeu tourner avec d'anciens thèmes sans aucun
// message d'erreur. Ici, éditer data/themes.csv puis pousser sur GitHub
// suffit : le prochain déploiement (qui redémarre le serveur) relit le
// fichier tel quel, sans étape supplémentaire à retenir.
//
// Ce module n'est importé que côté serveur (par GameEngine.ts, lui-même
// utilisé uniquement par server.ts) — jamais par un composant client — donc
// l'usage de `fs` ici ne pose aucun problème de bundle navigateur.
// ---------------------------------------------------------------------------

const CSV_PATH = join(process.cwd(), "data", "themes.csv");

/** Parseur CSV minimal mais conforme RFC4180 (champs entre guillemets, guillemets échappés en ""). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM UTF-8 éventuel

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function loadThemesFromCsv(): ThemePair[] {
  let csvText: string;
  try {
    csvText = readFileSync(CSV_PATH, "utf-8");
  } catch (err) {
    throw new Error(`Impossible de lire data/themes.csv (${CSV_PATH}) : ${(err as Error).message}`);
  }

  const [header, ...rows] = parseCsv(csvText);
  if (!header) throw new Error("data/themes.csv est vide.");
  const trimmedHeader = header.map((h) => h.trim());

  const idIndex = trimmedHeader.indexOf("id");
  const civilIndex = trimmedHeader.indexOf("theme_a");
  const undercoverIndex = trimmedHeader.indexOf("theme_b");
  const categoryIndex = trimmedHeader.indexOf("category");
  const indices: Record<string, number> = { id: idIndex, theme_a: civilIndex, theme_b: undercoverIndex, category: categoryIndex };
  for (const [name, index] of Object.entries(indices)) {
    if (index === -1) throw new Error(`Colonne manquante dans data/themes.csv : "${name}".`);
  }

  const pairs: ThemePair[] = [];
  let skipped = 0;
  for (const r of rows) {
    const rawId = r[idIndex]?.trim();
    const civilTheme = r[civilIndex]?.trim();
    const undercoverTheme = r[undercoverIndex]?.trim();
    const category = r[categoryIndex]?.trim();
    // Ligne mal formée (thème vide, id manquant...) : on l'ignore plutôt que
    // de faire planter tout le serveur pour une virgule mal placée dans un
    // CSV édité à la main.
    if (!rawId || !civilTheme || !undercoverTheme || !category) {
      skipped++;
      continue;
    }
    pairs.push({ id: `t${rawId.padStart(3, "0")}`, civilTheme, undercoverTheme, category, custom: false });
  }

  if (skipped > 0) {
    console.warn(`⚠️  data/themes.csv : ${skipped} ligne(s) ignorée(s) (thème ou id manquant).`);
  }
  if (pairs.length === 0) {
    throw new Error("data/themes.csv ne contient aucun thème valide.");
  }
  return pairs;
}

// Lu une seule fois au démarrage du process (le module Node est mis en
// cache) — pas besoin de relire le fichier à chaque manche.
export const OFFICIAL_THEMES: ThemePair[] = loadThemesFromCsv();

export function pickRandomTheme(pool: ThemePair[]): ThemePair {
  const index = Math.floor(Math.random() * pool.length);
  const theme = pool[index];
  if (!theme) throw new Error("Aucun thème disponible dans le pool fourni.");
  return theme;
}
