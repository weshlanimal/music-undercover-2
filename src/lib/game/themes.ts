import type { ThemePair } from "@/types";
import { OFFICIAL_THEMES } from "./themes-data";

// La base de 500 thèmes vit dans themes-data.ts, généré depuis data/themes.csv
// par scripts/build-themes.mjs (voir ce fichier pour comment en ajouter).
export { OFFICIAL_THEMES };

export function pickRandomTheme(pool: ThemePair[]): ThemePair {
  const index = Math.floor(Math.random() * pool.length);
  const theme = pool[index];
  if (!theme) throw new Error("Aucun thème disponible dans le pool fourni.");
  return theme;
}
