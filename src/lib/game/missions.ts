import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mission } from "@/types";
import { parseCsv } from "@/lib/csv";

// ---------------------------------------------------------------------------
// Même principe que themes.ts : data/missions.csv est lu directement au
// démarrage du serveur, éditable (même depuis GitHub) sans étape de build.
// ---------------------------------------------------------------------------

const CSV_PATH = join(process.cwd(), "data", "missions.csv");

/** Probabilité qu'UN tour donné tire une mission — le reste du temps (80% par défaut), aucune contrainte. */
const MISSION_CHANCE = 0.2;

function loadMissionsFromCsv(): Mission[] {
  let csvText: string;
  try {
    csvText = readFileSync(CSV_PATH, "utf-8");
  } catch (err) {
    throw new Error(`Impossible de lire data/missions.csv (${CSV_PATH}) : ${(err as Error).message}`);
  }

  const [header, ...rows] = parseCsv(csvText);
  if (!header) throw new Error("data/missions.csv est vide.");
  const trimmedHeader = header.map((h) => h.trim());
  const idIndex = trimmedHeader.indexOf("id");
  const labelIndex = trimmedHeader.indexOf("label");
  if (idIndex === -1) throw new Error('Colonne manquante dans data/missions.csv : "id".');
  if (labelIndex === -1) throw new Error('Colonne manquante dans data/missions.csv : "label".');

  const missions: Mission[] = [];
  let skipped = 0;
  for (const r of rows) {
    const rawId = r[idIndex]?.trim();
    const label = r[labelIndex]?.trim();
    if (!rawId || !label) {
      skipped++;
      continue;
    }
    missions.push({ id: `m${rawId.padStart(3, "0")}`, label });
  }

  if (skipped > 0) {
    console.warn(`⚠️  data/missions.csv : ${skipped} ligne(s) ignorée(s) (id ou libellé manquant).`);
  }
  return missions; // une base vide est tolérée : maybePickMission() ne tire jamais rien dans ce cas
}

export const OFFICIAL_MISSIONS: Mission[] = loadMissionsFromCsv();

/**
 * Tirée à chaque tour. La plupart du temps, renvoie `null` (pas de
 * contrainte) — c'est le comportement demandé : la mission reste
 * l'exception, pas la norme.
 */
export function maybePickMission(): Mission | null {
  if (OFFICIAL_MISSIONS.length === 0) return null;
  if (Math.random() >= MISSION_CHANCE) return null;
  const index = Math.floor(Math.random() * OFFICIAL_MISSIONS.length);
  return OFFICIAL_MISSIONS[index] ?? null;
}
