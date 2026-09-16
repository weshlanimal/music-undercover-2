// Régénère src/lib/game/themes-data.ts à partir de data/themes.csv.
//
// Pour ajouter/modifier des thèmes : édite data/themes.csv (colonnes :
// id,theme_a,theme_b,difficulty,category,reversible), puis relance :
//   node scripts/build-themes.mjs
//
// theme_a / theme_b sont marqués "reversible" dans le CSV fourni : l'ordre
// n'a pas d'importance, ils sont assignés arbitrairement à
// civilTheme/undercoverTheme (le tirage du rôle infiltré reste aléatoire
// indépendamment de ça).
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, "..", "data", "themes.csv");
const outPath = join(__dirname, "..", "src", "lib", "game", "themes-data.ts");

/** Parseur CSV minimal mais conforme RFC4180 (champs entre guillemets, guillemets échappés en ""). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Retire le BOM UTF-8 éventuel en tête de fichier.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

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

const csvText = readFileSync(csvPath, "utf-8");
const [header, ...rows] = parseCsv(csvText);
const columns = Object.fromEntries(header.map((name, i) => [name.trim(), i]));

for (const required of ["id", "theme_a", "theme_b", "category"]) {
  if (!(required in columns)) {
    throw new Error(`Colonne manquante dans data/themes.csv : "${required}"`);
  }
}

const pairs = rows.map((r) => {
  const id = r[columns.id].trim();
  const civilTheme = r[columns.theme_a].trim();
  const undercoverTheme = r[columns.theme_b].trim();
  const category = r[columns.category].trim();
  return { id: `t${id.padStart(3, "0")}`, civilTheme, undercoverTheme, category, custom: false };
});

const invalid = pairs.filter((p) => !p.civilTheme || !p.undercoverTheme || !p.id);
if (invalid.length > 0) {
  throw new Error(`${invalid.length} ligne(s) invalide(s) dans data/themes.csv (thème vide ou id manquant).`);
}

const fileContent = `// ---------------------------------------------------------------------------
// Généré automatiquement depuis data/themes.csv par scripts/build-themes.mjs.
// NE PAS ÉDITER À LA MAIN — modifie le CSV puis relance le script.
// ---------------------------------------------------------------------------
import type { ThemePair } from "@/types";

export const OFFICIAL_THEMES: ThemePair[] = ${JSON.stringify(pairs, null, 2)};
`;

writeFileSync(outPath, fileContent, "utf-8");
console.log(`✓ ${pairs.length} thèmes écrits dans src/lib/game/themes-data.ts`);

const categoryCounts = new Map();
for (const p of pairs) categoryCounts.set(p.category, (categoryCounts.get(p.category) ?? 0) + 1);
console.log(`  ${categoryCounts.size} catégories : ${[...categoryCounts.entries()].map(([c, n]) => `${c} (${n})`).join(", ")}`);
